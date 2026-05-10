# PMO Agent — 技术设计

> 状态：Draft v0.1 · 2026-05-01
> 目标读者：WithJP 工程团队
> 关联里程碑：「运营工作流研发 — Creator Guild OS」(target 2026-10-31)

---

## 1. 设计原则

1. **PMO 的记忆 = 用户在网站的全部操作行为**。不是只读对话历史，而是「事件流 + 当前状态 + 对话」三层 context。
2. **事件流与业务模块解耦**。事件层是中立的，PMO 是它的第一个消费者，未来运营/财务 Agent 也消费同一套事件。
3. **多实例 PMO**。系统支持配置多个 PMO 实例（如「公司全局 PMO」「日本团队 PMO」「财务 PMO」），实例间通过 `filter_config` 划分关注边界，事件本身不打 scope tag。
4. **写路径零侵入优先**。事件捕获以 Postgres trigger 为兜底，应用层只补充意图/上下文。
5. **按时间归档**。热数据 7 天，超过则按 entity + 时间窗折叠成摘要。

---

## 2. 数据模型

### 2.1 `activity_events` — 重事件流（变更 + 对话）

完整保留 before/after diff 与原文，PMO 可直接 SQL 查询近 7 天。

```sql
create type activity_actor_type as enum ('user', 'agent', 'system');
create type activity_action as enum (
  'create', 'update', 'delete', 'status_change', 'execute',
  'message_sent', 'message_received'
);
create type activity_entity as enum (
  'creator', 'task', 'milestone', 'finance', 'device',
  'conversation', 'broadcast_account', 'user', 'knowledge', 'agent'
);

create table activity_events (
  id            uuid primary key default uuid_generate_v4(),
  actor_type    activity_actor_type not null,
  actor_user_id uuid references users(id) on delete set null,
  actor_agent_id uuid references agents(id) on delete set null,

  entity_type   activity_entity not null,
  entity_id     uuid not null,
  action        activity_action not null,

  before        jsonb,           -- update/delete 时填
  after         jsonb,           -- create/update 时填
  diff          jsonb,           -- 仅记变化字段，加速 PMO 检索
  content       text,            -- message_sent / message_received 原文

  context       jsonb not null default '{}',
                -- { route, ip_country, triggered_by_milestone_id, parent_event_id }

  created_at    timestamptz not null default now(),
  archived_at   timestamptz   -- null = 热数据；非 null = 已归档（数据保留以备审计）
);

create index idx_events_entity            on activity_events(entity_type, entity_id, created_at desc);
create index idx_events_actor_user        on activity_events(actor_user_id, created_at desc);
create index idx_events_action_created    on activity_events(action, created_at desc);
create index idx_events_hot               on activity_events(created_at desc) where archived_at is null;
```

### 2.2 `view_sessions` — 轻事件流（只读行为聚合）

按用户 × 30 分钟无操作切割 session，session 内对同一 entity 的多次 view 折叠成计数。

```sql
create table view_sessions (
  id           uuid primary key default uuid_generate_v4(),
  user_id      uuid not null references users(id) on delete cascade,
  started_at   timestamptz not null,
  ended_at     timestamptz not null,
  views        jsonb not null default '{}',
                -- { "creator": { "<id>": 3, "<id>": 1 }, "milestone": { "<id>": 2 } }
  routes       text[] not null default '{}',
                -- ['/creators', '/creators/abc', '/timeline']
  created_at   timestamptz not null default now()
);

create index idx_view_sessions_user_time on view_sessions(user_id, started_at desc);
```

### 2.3 `activity_summaries` — 归档摘要

热数据滚动归档的目标表。PMO 远期查询走这里。

```sql
create table activity_summaries (
  id            uuid primary key default uuid_generate_v4(),
  entity_type   activity_entity not null,
  entity_id     uuid not null,
  window_start  timestamptz not null,
  window_end    timestamptz not null,
                -- 按周窗口聚合
  event_count   integer not null default 0,
  actions       jsonb not null default '{}',
                -- { "update": 5, "status_change": 2, "message_sent": 12 }
  actors        jsonb not null default '{}',
                -- { "<user_id>": 7, "<agent_id>": 3 }
  highlights    text,
                -- LLM 生成的自然语言摘要：「本周该 milestone 状态从 active→at_risk，BD agent 触发 3 次任务」
  created_at    timestamptz not null default now(),
  unique (entity_type, entity_id, window_start)
);

create index idx_summaries_entity_window
  on activity_summaries(entity_type, entity_id, window_start desc);
```

### 2.4 `pmo_instances` — 多实例配置

```sql
create table pmo_instances (
  id              uuid primary key default uuid_generate_v4(),
  name            text not null,                  -- e.g. '公司全局 PMO', '日本团队 PMO'
  description     text,
  agent_id        uuid not null references agents(id) on delete cascade,
                -- 复用现有 agents 表，role 新增 'pmo'
  filter_config   jsonb not null default '{}',
                -- {
                --   entity_types: ['milestone','task','creator'],
                --   creator_ids: [...],            // 可选白名单
                --   milestone_levels: ['company'], // 可选
                --   exclude_actors: [...]
                -- }
  reminder_config jsonb not null default '{}',
                -- {
                --   stale_task_days: 3,
                --   at_risk_no_activity_days: 7,
                --   cron: '0 9 * * *'
                -- }
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
```

需要在 `agent_role` enum 增加 `'pmo'`：

```sql
alter type agent_role add value if not exists 'pmo';
```

---

## 3. 事件捕获策略（写路径）

**两层并用**，trigger 兜底 + 应用层补 context。

### 3.1 Trigger 层（保证完整性）

对所有业务表（`creators` `tasks` `milestones` `finance` `devices` `broadcast_accounts` `knowledge` `agents` `users`）挂统一的 `record_activity()` trigger function。详见 [migration 010](../supabase/migrations/010_pmo_activity_events.sql)。

trigger 通过 **`auth.uid()`** 解析 actor —— 这是 Supabase 标准模式：当请求带用户 JWT 时返回真实 user_id，否则返回 NULL（fallback 到 `system` actor）。

### 3.2 当前限制：service-role 调用没有 actor 归属

现状：所有 `/api/*` 路由用的是 [src/lib/supabase/server.ts](../src/lib/supabase/server.ts) 的 service-role 客户端，PostgREST 不会注入用户 JWT，所以 `auth.uid()` 在 trigger 里也返回 NULL，actor_type 落到 `system`。

**Phase 1.5 计划**：把 mutation 类 API 路由迁到 auth-aware 客户端（[auth-server.ts](../src/lib/supabase/auth-server.ts)），让 `auth.uid()` 拿到真实 user_id。这是机械式改造，不影响业务逻辑。

不受影响的路径：
- `conversation_messages` 的 actor 直接来自 row 自身的 `sender_type` + `agent_id`，不依赖 `auth.uid()`。
- `view_sessions` 的 actor 由 API 层显式写入 `user_id`，不依赖 trigger。

所以 Phase 1 即使没做迁移，对话和阅读行为的归属仍然准确，只有变更事件的 actor 暂时是 `system`。

### 3.3 应用层（补充意图）

API handler 在写完业务数据后，可以追加一条 `activity_events` 仅写 `context`，例如：

```ts
// 当 milestone auto-tasks 触发批量 task 创建时
await db.from('activity_events').insert({
  actor_type: 'agent',
  actor_agent_id: pmoAgent.id,
  entity_type: 'milestone',
  entity_id: milestone.id,
  action: 'execute',
  context: { triggered_tasks: taskIds, reason: 'milestone_auto_dispatch' },
})
```

### 3.4 对话事件

`conversation_messages` 表挂同样 trigger，`action` 映射到 `message_sent` / `message_received`，`content` 字段直接拷贝消息原文。

### 3.5 只读事件

前端通过一个轻量埋点 hook 上报，后端聚合成 session：

```ts
// 客户端
useViewTracker({ entity_type: 'creator', entity_id: id })
// → POST /api/views { entity_type, entity_id, route }

// 服务端 /api/views
// 找到当前 user 最近一条 view_session
// if (now - session.ended_at < 30min) → 累计到现有 session
// else → 开新 session
```

---

## 4. PMO Context 装载（读路径）

### 4.1 三层 Context

每次 PMO 被调用（聊天 / 巡检 / 提醒）时，按以下顺序拼装 prompt context：

```
[Layer 1 — 当前状态快照]
  根据 pmo_instances.filter_config 拉取：
  - 活跃 milestones（status in active/at_risk）
  - open tasks（status in pending/running）
  - 最近 status_change 的 creators

[Layer 2 — 近期事件流（热数据）]
  activity_events where archived_at is null
    and matches filter_config
    and created_at > now() - 7 days
  按时间倒序 + 按 entity 折叠（同 entity 多次 update 折叠成「N 次更新」）

[Layer 3 — 远期摘要（如需要）]
  activity_summaries where matches filter_config
  仅在用户提问涉及历史时拉取

[Layer 4 — 当前对话历史]
  最近 20 条 conversation_messages
```

### 4.2 Token 预算

- Layer 1: ≤ 1500 tokens（结构化表格化）
- Layer 2: ≤ 3000 tokens（按 entity 折叠后摘要）
- Layer 3: 按需，≤ 2000 tokens
- Layer 4: ≤ 2000 tokens

总 context ≤ 8500 tokens，留足模型推理空间。

### 4.3 复用现有 chat-executor

新增 `pmo` 角色的 system prompt + context loader，executor 主体不动。

```ts
// src/lib/conversation/chat-executor.ts 扩展
const CHAT_SYSTEM_PROMPT.pmo = `You are the PMO Agent...`

// 在 executeChatMessage 内，若 agent.role === 'pmo'：
//   1. 找到关联的 pmo_instances 行
//   2. 调用 loadPmoContext(instance) 拼装四层 context
//   3. 把 context 注入 system prompt 后调 LLM
```

---

## 5. 主动巡检与提醒

PMO 不止被动回答，还要主动发现风险。

### 5.1 巡检任务

定时（默认每天 09:00）扫描每个 active pmo_instance：

| 触发条件 | 动作 |
|---|---|
| Task 处于 `pending` 超过 `stale_task_days` | 给 owner 发提醒（生成 conversation_messages 或 Line push） |
| Milestone 进入 `at_risk` 但近 N 天无相关事件 | 通知 owner_agent + 创建跟进 task |
| Creator 状态变更后未生成下游 task | 自动调用现有 `STATUS_TASK_TITLE` 派发 |

### 5.2 实现方式

短期：扩展 [src/app/api/milestones/route.ts:8](../src/app/api/milestones/route.ts) 的 `syncStatusByTime`，从 milestone-only 改为通用巡检。
中期：用 Supabase pg_cron 或外部 cron 调用 `/api/pmo/[instanceId]/sweep`。

---

## 6. 归档机制

### 6.1 归档 cron（每日 03:00）

```sql
-- 1. 找出 7 天前的事件，按 entity + 周窗口聚合
with windows as (
  select
    entity_type, entity_id,
    date_trunc('week', created_at) as window_start,
    date_trunc('week', created_at) + interval '7 days' as window_end,
    count(*) as event_count,
    jsonb_object_agg(action, count(*)) as actions,
    array_agg(distinct actor_user_id) as actor_ids
  from activity_events
  where archived_at is null
    and created_at < now() - interval '7 days'
  group by entity_type, entity_id, window_start
)
-- 2. upsert 到 activity_summaries
insert into activity_summaries (...)
select ... from windows
on conflict (entity_type, entity_id, window_start) do update ...;

-- 3. 标记原事件已归档（保留行以备审计）
update activity_events
  set archived_at = now()
  where archived_at is null
    and created_at < now() - interval '7 days';
```

### 6.2 摘要生成

`highlights` 字段由后台异步任务调 LLM 生成自然语言摘要，可分批跑避免阻塞归档主流程。

---

## 7. API 表面

| Method | Path | 用途 |
|---|---|---|
| POST | `/api/views` | 前端只读埋点 |
| GET | `/api/pmo` | 列出 pmo_instances |
| POST | `/api/pmo` | 创建 PMO 实例 |
| PATCH | `/api/pmo/[id]` | 编辑 filter_config / reminder_config |
| POST | `/api/pmo/[id]/chat` | 与该 PMO 实例对话（复用 conversations） |
| POST | `/api/pmo/[id]/sweep` | 触发一次巡检（cron 调用） |
| GET | `/api/pmo/[id]/context` | 调试用：返回当前装载的四层 context |
| GET | `/api/activity` | 全站事件查询（debug + admin） |

---

## 8. 与现有模块的关系

| 现有模块 | 改造方式 |
|---|---|
| [creator_activity_logs](../supabase/migrations/006_creator_activity_logs.sql) | 保留，作为 PMO 上线前的过渡日志；migration 011 起停止写入，改由 trigger 写 `activity_events` |
| [lifecycle_transitions](../supabase/migrations/001_initial_schema.sql) | 保留作为审计专表；同时也会被 trigger 记录到 `activity_events` |
| [conversation_messages](../supabase/migrations/003_chat_schema.sql) | 表结构不动，挂 trigger 同步到 `activity_events` |
| [milestones syncStatusByTime](../src/app/api/milestones/route.ts) | 第二阶段抽象成通用巡检 |
| [chat-executor](../src/lib/conversation/chat-executor.ts) | 新增 `pmo` role 分支 + context loader |

---

## 9. 落地阶段

### Phase 1 — 数据管道（1 周）
- [x] migration 010: `activity_events` + `view_sessions` + `activity_summaries` + `pmo_instances` + agent_role 增加 `pmo`
- [x] `record_activity()` trigger function + 挂载到所有业务表（trigger 通过 `auth.uid()` 解析 actor）
- [x] `/api/views` 接口 + 前端埋点 hook
- [ ] 应用 migration 010 到 Supabase 项目（手动执行）

### Phase 1.5 — Actor 归属补全（独立小迭代）
- [ ] 把 mutation 类 API 路由从 `createServerClient`（service role）迁到 `createAuthServerClient`（用户 JWT），让 `auth.uid()` 在 trigger 里返回真实用户

### Phase 2 — PMO MVP（1 周）
- [ ] `pmo_instances` CRUD + UI
- [ ] PMO context loader（四层）
- [ ] chat-executor 扩展 pmo role
- [ ] workspace 页面支持选择 PMO 实例对话

### Phase 3 — 主动能力（1 周）
- [ ] `/api/pmo/[id]/sweep` + 通用巡检逻辑
- [ ] 归档 cron + summary 生成
- [ ] 提醒 → conversation message / Line push（Line 集成另起方案）

### Phase 4 — Line 集成（独立 milestone）
- 主播端通过 Line Official Account 与 PMO 对话
- 由 `/api/line/webhook` 接入，复用 `/api/pmo/[id]/chat` 内核

---

## 10. 待确认 / 风险

1. **Trigger 性能**：高频写入下 trigger + JSONB diff 的开销需压测。备选：异步队列（pg_notify + 独立 worker）。
2. **Service-role 调用的 actor 归属**：详见 §3.2，需 Phase 1.5 把 mutation 路由迁到 auth-aware 客户端。
3. **多实例 PMO 之间是否共享对话**：当前设计每个 PMO 实例独立会话，跨实例信息隔离。如果需要「集团 PMO 看到子 PMO 摘要」，需要再加一层 aggregation。
4. **隐私**：只读埋点对个人浏览行为的记录，需要在团队内对齐边界。
5. **`scripts/seed-pmo.mjs` 硬编码 service_role JWT**：在 PMO 落地前必须先轮换并迁到环境变量。
