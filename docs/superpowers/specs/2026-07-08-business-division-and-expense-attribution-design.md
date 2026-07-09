# 公会业务分工 + 开支归属 — 设计（v2）

- 日期：2026-07-08
- 状态：模型经多轮对话确认，待 spec 复核
- 作者：PMO（Claude）

> v2 说明：本设计相比 v1 有**结构性变化**。v1 曾用"部门(6职能) → 岗位 → 配人"的扁平结构；经确认作废，改为下述"岗位枚举 + 公司→业务→任务→事项 WBS"双维度模型。

## 背景与目标

公会（团播业务）要两件事：

1. **业务分工**：用一套 **公司 → 业务 → 任务 → 事项** 的层级把工作拆开，并明确每一层谁负责；岗位作为正交的角色维度。
2. **开支归属**：把每笔支出归到对应的**业务**，看每条业务花了多少钱。

**分两期**：P1 = 业务分工（本 spec 主体）；P2 = 开支归属（末尾概述，另立 plan）。

## 模型总览

两个**正交维度**：

### 维度 A：岗位（角色，固定枚举 10 个）

人所属的角色。

| 岗位 | 说明 |
|---|---|
| 主播 | 团播成员（出镜） |
| 主持人（MC） | 团播现场调度 |
| 主播经纪人 | 招募、管理、汰换主播 |
| 团播运营 | 团播现场运营、调度、策划 |
| 化妆师 | 团播主播造型 |
| 舞蹈培训师 | 舞蹈培训 |
| 短视频剪辑 | 短视频剪辑 |
| 摄影师 | 摄影 |
| 公会长 | 公会负责人 |
| 财税师 | 财务 / 税务 |

### 维度 B：人

内部员工（`UserProfile`）或主播（`Creator`）。每个人挂一个岗位。

### 层级（WBS）+ 关联规则

| 层级 | 来源 | 关联 |
|---|---|---|
| **公司** | 根（单例） | — |
| **业务** | 固定枚举（4） | **唯一 1 个负责人（人）** |
| **任务** | 初始 seed，可增删 | **多个岗位**（具体的人从岗位成员里出） |
| **事项**（最小单位） | 用户自由增删 | **唯一 1 个负责人（人）** |

要点：
- "任务关联多人"最终通过"任务→多个岗位→岗位成员"实现，任务本身挂的是**岗位**，人员变动不必改任务。
- 业务、事项的负责人是**具体的人**（员工/主播）。

## 决策记录（对话确认）

| 决策 | 结论 |
|---|---|
| 层级 | 公司 → 业务 → 任务 → 事项（4 层，无"部门"层） |
| 业务 | 固定枚举，4 条；各 1 个唯一负责人 |
| 任务 | 归属业务；关联**多个岗位**；初始 seed + 可增删 |
| 事项 | 归属任务；唯一 1 负责人；用户自由增删 |
| 岗位 | 固定枚举，10 个（正交维度） |
| 人 | 员工（`UserProfile`）+ 主播（`Creator`）两类 |
| 括号里的角色 | 是**岗位**，不是具体人 |
| 与现有系统 | 全新表；AI 代理 `tasks`、真人 `work_tasks` 均不动，并存 |
| 推进 | 先 P1（分工）再 P2（开支归属） |

---

## P1 设计：业务分工

### 数据模型（新表，迁移下一个编号 041）

命名避开现有 `tasks` / `work_tasks`。所有新表按 `038_enable_rls_all_tables.sql` 约定启用 RLS，策略与现有业务表一致（登录可读；写入/管理按现有 `canEdit`/`canManage` 判断来源对齐，实现 plan 中确定）。

统一"人引用"形态（多处复用）：`member_type ('user'|'creator') + user_id | creator_id`，CHECK 约束保证二选一。

1. **`positions`（岗位）** — 固定枚举
   - `id` uuid pk、`key` text unique（稳定标识，如 `streamer`/`mc`…）、`name` text、`description` text、`sort_order` int
   - seed：上表 10 个

2. **`position_members`（岗位配人）**
   - `id`、`position_id` fk→positions(on delete cascade)、`member_type`、`user_id` fk、`creator_id` fk、`created_at`
   - 唯一：(position_id, user_id) / (position_id, creator_id) 去重
   - seed：无（由用户配）

3. **`businesses`（业务）** — 固定枚举
   - `id`、`key` unique、`name`、`sort_order`
   - `owner_member_type` / `owner_user_id` / `owner_creator_id`（唯一负责人，可空=未指定）
   - seed：直播运营 / 主播运营 / 公司管理 / 线下运营（owner 留空待指定）

4. **`business_tasks`（任务）**
   - `id`、`business_id` fk→businesses(on delete cascade)、`name`、`sort_order`、`created_at`、`updated_at`
   - seed：见附录（11 条）

5. **`business_task_positions`（任务↔岗位，多对多）**
   - `id`、`task_id` fk→business_tasks(cascade)、`position_id` fk→positions
   - 唯一：(task_id, position_id)
   - seed：见附录

6. **`task_items`（事项，最小单位）**
   - `id`、`task_id` fk→business_tasks(cascade)、`name`、`owner_member_type`/`owner_user_id`/`owner_creator_id`（唯一负责人，可空）、`sort_order`、`created_at`、`updated_at`
   - seed：无（用户自建）

### 页面 / 交互

左侧「团队（AI 代理）」分组下新增子菜单 **「业务分工」** → 路由 `/team/org`。（分组现有子项：AI 代理、任务分配；新增第 3 项。）

页面结构：

- **WBS 树**：4 个业务 → 每个业务显示**负责人** → 展开为任务列表 → 每个任务显示其**岗位标签** → 展开为事项列表 → 每个事项显示**负责人**。
- **岗位参考区**（侧栏或页尾）：10 个岗位 + 各自成员（员工/主播）。
- **编辑能力**（canEdit / 管理员）：
  - 业务：指定/更换负责人（唯一）。
  - 任务：增删、改名、增删其关联岗位。
  - 事项：增删、改名、指定/更换负责人（唯一）。
  - 岗位成员：给岗位加/移除人（员工从 `user_profiles`、主播从 `creators`）。
- 无权限者只读。

组件边界：
- 服务端 `page.tsx`：拉 businesses（含 tasks→positions、items、owner join）、positions（含 members）、可选人的候选列表；服务端渲染只读树。
- 客户端岛：`OrgTree`（展开/折叠）、`OwnerPicker`（选唯一负责人）、`TaskPositionEditor`（任务的岗位多选）、`PositionMemberEditor`（岗位配人）。走 API 写库。

### API（沿用 `src/app/api/**` 风格）

- 业务：`PATCH /api/businesses/[id]`（改 owner；业务为固定枚举，不开放增删）
- 任务：`POST /api/businesses/[id]/tasks`、`PATCH /api/tasks/[id]`、`DELETE /api/tasks/[id]`
- 任务↔岗位：`PUT /api/tasks/[id]/positions`（整体覆盖该任务的岗位集合）
- 事项：`POST /api/tasks/[id]/items`、`PATCH /api/items/[id]`、`DELETE /api/items/[id]`
- 岗位配人：`POST /api/positions/[id]/members`、`DELETE /api/positions/[id]/members/[memberId]`
- 写操作校验权限 + 校验人引用二选一 + 校验枚举值

（路由前缀最终名以避免与现有冲突为准，实现 plan 确定。）

### i18n

三语（zh/en/ja）新增 `nav.teamOrg` 与 `team.org.*`（标题/副标题、业务/任务/事项/岗位、负责人、添加/编辑/删除、成员来源员工/主播、空态、确认删除等）。岗位/业务/任务的**具体名称**作为**数据（seed 入库）**，不进 i18n（数据不做多语言，与现有创作者名/物品名一致的处理方式）。过 CI `copy-checks`。

### 安全 / 权限

- 新表启用 RLS，策略对齐现有表。
- 写接口登录 + 权限校验。

### 测试

- 纯函数单测（`node --test`）：WBS 归组（business→tasks→items、task→positions）、人引用二选一校验、去重、唯一负责人约束。
- `tsc --noEmit`、`npm run test:copy`。
- 交互实测受登录拦截，靠单测 + 类型保证（沿用项目既有约束）。

### 变更清单（P1）

- `supabase/migrations/041_org_structure.sql`：6 张表 + RLS + seed（10 岗位、4 业务、11 任务、任务↔岗位关联）。
- `src/lib/types/index.ts`：`Position` / `PositionMember` / `Business` / `BusinessTask` / `TaskItem` 及人引用类型。
- `src/lib/org/*`：归组/校验纯函数 + 单测。
- `src/app/api/**`：上述接口。
- `src/app/[locale]/(app)/team/org/page.tsx` + `src/components/org/*`：页面与编辑组件。
- `src/components/layout/Sidebar.tsx`：团队分组加「业务分工」子项。
- `messages/{zh,en,ja}.json`：i18n。
- `src/lib/changelog/entries.ts`：更新日志。

---

## P2 概述：开支归属（另立 plan）

- **模型**：`expenses` 增加 `business_id`（fk→businesses，业务归属，录入必选）；可选再加 `task_id`（细到任务）。迁移单独编号。
- **录入**：支出表单加「业务」下拉（+可选任务）。
- **列表**：支出列表加「业务」列 + 按业务筛选（沿用现有筛选/KPI 模式）。
- **汇总**：各业务开支合计（支出页 KPI，或在 `/team/org` 每条业务旁显示开支合计，形成"分工 + 花费"闭环）。
- 历史数据：`business_id` 允许空（旧数据未归属），或批量归类；P2 plan 定。

## 非目标（YAGNI）

- 不改 `WorkTask` / 工作量 / 薪资、AI 代理 `tasks`、里程碑。
- 不动主播 `operator_user`（经纪人）既有关系。
- 业务不开放增删（固定 4 条枚举）；如需扩展再议。
- 事项**暂不含**状态 / 截止日 / 优先级（仅名称 + 唯一负责人）；如需再加。
- P1 不含任何开支改动（留 P2）。

## 附录：Seed 明细

**业务 → 任务 → 关联岗位**

- **直播运营**
  - 团播执行 → 主播、主持人(MC)、摄影师
  - 团播策划 → 舞蹈培训师、化妆师
  - 社群管理 → 团播运营
- **主播运营**
  - 短视频运营 → 团播运营
  - 主播招募 → 主播经纪人
  - 主播培训 → 公会长、舞蹈培训师、主持人(MC)
- **公司管理**
  - 场地管理 → 公会长
  - 薪资管理 → 公会长
  - 税务管理 → 财税师
- **线下运营**
  - 商单合作 → 公会长

业务负责人（唯一）与岗位成员（配人）初始为空，由用户在页面指定。「短视频剪辑」岗位目前无任务引用，仍保留在枚举中。

## 待确认 / 已消解

- 层级固定 4 层，无"部门"层。
- 业务固定 4 条，不开放增删。
- 人引用限 `UserProfile` / `Creator` 两类。
- 事项字段最小化（名称 + 唯一负责人），状态/日期为非目标。
