# 工时任务 ⇄ 业务分工事项 关联设计

- 日期:2026-07-21
- 范围:任务中心「工时任务」(`work_tasks`) 与 业务分工「事项」(`task_items`) 的强关联
- 状态:设计已确认,待写实现计划

## 背景

代码库当前存在三套互不相干的「任务」概念,彼此无外键、无代码引用:

| 概念 | 表 | 迁移 | 页面 |
|---|---|---|---|
| 业务分工任务 / 事项 (WBS) | `business_tasks` / `task_items` | 041_org_structure.sql | `team/org` |
| 任务中心 · AI 任务 | `tasks` | 001_initial_schema.sql | `/tasks` Tab A |
| 任务中心 · 工时任务 | `work_tasks` | 012 / 024 | `/tasks` Tab B |

产品判断:任务中心的工时任务代表「已下发、明确要执行」的活,其最小执行单元应当来源于业务分工的 WBS。因此工时任务要**强制关联**到业务分工的最小单元——**事项**(`task_items`),不再允许脱离 WBS 自由创建。

## 目标与非目标

**目标**
- 工时任务(`work_tasks`)在交互上必须关联一个业务分工事项(`task_items`)。
- 关联为一对多:一个事项可下发成多条工时任务(重复任务、分日期多次派)。
- 从事项创建工时任务时,预填负责人/部门/标题,允许用户修改。
- 保留下发时的事项名快照,使历史工时/薪资账不受上游改名或删除影响。

**非目标(本期不做)**
- 反向视图(在业务分工事项上展示「已下发 N 条工时任务」)——放二期。
- AI 任务(`tasks`)的关联——本期不涉及,保持原样。
- 将 `business_task_item_id` 收紧为 `NOT NULL`——留待数据铺全后单独迁移。

## 关键决策(已确认)

1. 关联层级 = **事项**(`task_items`),WBS 最小单元。
2. 仅约束 **工时任务**(`work_tasks`);AI 任务不变。
3. 约束强度 = **B**:DB 层 `business_task_item_id` 可空(nullable),UI 层强制必选;后续再单独收紧为 NOT NULL。
4. 字段继承 = **A**:选中事项后预填负责人/部门/标题,用户可改。事项是「来源模板」,工时任务是「这一次的实际安排」。
5. 存**事项名快照**。
6. 反向视图 **二期**。

## 数据模型

`work_tasks` 新增两列(迁移 `042_work_task_org_link.sql`):

```sql
ALTER TABLE work_tasks
  ADD COLUMN business_task_item_id uuid NULL
    REFERENCES task_items(id) ON DELETE SET NULL,
  ADD COLUMN business_task_item_name text NULL;  -- 下发时的事项名快照

CREATE INDEX idx_work_tasks_business_task_item_id
  ON work_tasks(business_task_item_id);
```

- **可空**:决策 3。历史 `work_tasks` 两列均为 NULL,不迁移、不回填。
- **`ON DELETE SET NULL`**:业务分工删除事项时,历史工时任务不连带删除,仅断开关联;`business_task_item_name` 快照保留,仍可显示「当初派的是什么」。
- **快照写入时机**:创建 / 更新工时任务并设置 `business_task_item_id` 时,同步写入当时的事项名到 `business_task_item_name`。之后事项改名不回写(快照即历史)。

TS 类型 `WorkTask`(`src/lib/types/index.ts`)新增:
- `business_task_item_id: string | null`
- `business_task_item_name: string | null`

## 创建 / 编辑流程(UI 手动)

新建工时任务表单,第一步改为「选事项」:

1. **选事项**(必填):级联选择器,从 WBS 树选 业务 → 任务 → **事项**。业务、任务仅作导航层,只有事项可被选中。
2. 选中后**自动预填**(可改):
   - **负责人** ← 事项的 `owner_user_id`。若事项负责人是主播(`owner_member_type` 指向 `creators`),则不预填 `owner_user_id`,提示用户手动指定 user(工时任务负责人是 `users`)。
   - **部门 `department`** ← 由事项所属岗位/业务映射到 `agent_role` 枚举(bd/ops/finance/content/growth/legal)。映射不确定时留空,让用户选。
   - **标题 `title`** ← 事项名。
   - 同步记录 `business_task_item_name` 快照。
3. 其余字段(`task_date`、`effort_hours`、`executor_ids`、`reviewer_user_id`、`repeat_interval` 等)照常填写。

编辑已有工时任务时,可更换关联事项;更换后按上述规则刷新快照,预填值不强制覆盖用户已改动的字段。

## 自然语言意图解析路径

`src/lib/intent/*` 解析出的工时任务:

- 若能明确匹配到某个事项,则设置 `business_task_item_id` + 快照。
- 若匹配不到,按决策 3 允许 `business_task_item_id` 为空先落库,但在返回结果与任务中心列表以醒目标签标记「未关联事项」,提示用户补选。不阻断创建,也不静默漏过。

匹配策略细节留待实现计划(可先做按事项名模糊匹配,匹配到唯一项才自动关联,否则留空标记)。

## API 影响

- `POST /api/work-tasks`、`PATCH /api/work-tasks/[id]`:接受并校验 `business_task_item_id`;写入时解析并存入 `business_task_item_name` 快照。
- `GET /api/work-tasks`:返回中带上 `business_task_item_id` 与 `business_task_item_name`(以及必要时 join 出的当前事项名,用于对比快照与现值)。
- `POST /api/work-tasks/[id]/duplicate`:复制时保留 `business_task_item_id` 与快照。
- 意图执行器 `createWorkTaskFromIntent`(`src/lib/work-tasks/service.ts`):支持解析/透传关联字段。
- payload schema(`src/lib/intent/schema.ts` 的 `WorkTaskCreatePayloadSchema`):新增可选 `business_task_item_id`。

## 灰度与回滚

- 迁移 042 仅加列 + 外键 + 索引,向后兼容,历史数据不受影响。
- UI 上线即强制必选;意图解析路径按「可空 + 标记」过渡。
- 待业务分工事项数据铺全、历史工时任务处理完,再出单独迁移收紧 `business_task_item_id` 为 `NOT NULL`(或加 CHECK)。
- 回滚:删列即可,不影响 `task_items`。

## 测试要点

- 迁移:加列后既有 `work_tasks` 读写正常;删除关联事项后工时任务保留且 `business_task_item_id` 置空、快照仍在。
- Service:从事项创建工时任务时预填规则正确(主播负责人不预填 user;部门映射);快照在创建/换绑时写入,事项改名后快照不变。
- API:创建/更新/复制均正确持久化关联与快照;GET 返回字段完整。
- 意图解析:匹配到唯一事项自动关联;匹配不到时留空并标记。
- UI:选事项为必填;级联选择器只允许选事项层;预填值可改不被强制覆盖。

## 二期(记录,不在本期实现)

- 反向视图:业务分工事项上展示「已下发 N 条工时任务」角标与列表,形成 WBS 定义 → 执行落地闭环。
- 将 `business_task_item_id` 收紧为 NOT NULL。
