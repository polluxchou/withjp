# 公会业务分工 + 开支归属 — 设计

- 日期：2026-07-08
- 状态：设计已在对话中确认，待 spec 复核
- 作者：PMO（Claude）

## 背景与目标

公会（团播业务）需要两件事：

1. **业务分工**：把公会业务按"部门 → 岗位"两层拆分，明确每个岗位的**职责**，并把**具体的人**配到岗位上（哪些事归谁负责）。
2. **开支归属**：把每一笔支出归到对应的业务（部门，可细到岗位），从而能看"每块业务花了多少钱"。

经确认，本设计**分两步交付**：

- **P1（本 spec 主体）业务分工**：岗位 + 职责 + 配人。
- **P2（本 spec 末尾概述，另立 plan）开支归属**：支出增加业务字段 + 录入/列表/筛选/汇总。

## 关键现状（复用，不重造）

- **部门维度已存在**：`AgentRole = 'bd' | 'ops' | 'finance' | 'content' | 'growth' | 'legal'`（商务/运营/财务/内容/增长/法务），贯穿 `UserProfile.role`、`Agent.role`、`WorkTask.department`、里程碑等。→ 部门直接复用，不新建。
- **岗位这一层不存在**：现有系统只有"部门"，没有"岗位"。→ 岗位是本次**新增**的一层。
- **人的来源已有实体**：内部员工 = `UserProfile`；主播 = `Creator`（创作者/主播，`creators` 表；且已带 `operator_user` 经纪人链接）。
- **任务级分工已有**：`/tasks` 的「工作量」tab 是 `WorkTask`（带 department + 负责人 + 工时/薪资）。本设计不改它；"业务分工"是**岗位/职责/配人**这一组织层，与任务级正交。

## 决策记录（对话确认）

| 决策 | 结论 |
|---|---|
| 业务维度用哪套 | 复用现有 6 部门（`AgentRole`） |
| 岗位如何定位 | 作为部门下的**子层**（部门 → 岗位，两层） |
| 分工做到多深 | 岗位 + 职责 + **配人** |
| "配人"里的人 | 内部员工（`UserProfile`）与主播（`Creator`）**两类分开**，关联表都支持 |
| 推进方式 | 分两步：先 P1 再 P2 |

初始岗位（「运营」部门下，seed）：

| 岗位 | 职责 |
|---|---|
| 主播（团播成员） | 团播内容产出、出镜 |
| 主持人 | 团播现场调度 |
| 主播经纪人 | 招募、管理、汰换主播 |
| 团播运营 | 团播现场运营、调度、策划 |

---

## P1 设计：业务分工

### 数据模型

两张新表，命名与迁移风格沿用现有 `supabase/migrations/*`（下一个编号 **041**）。所有新表按 `038_enable_rls_all_tables.sql` 的约定**启用 RLS**，策略与现有业务表一致（登录用户可读；写入按现有权限约定，管理操作限管理员/相应角色——具体策略在实现 plan 中对齐现有表）。

**表 1：`positions`（岗位）**

| 列 | 类型 | 说明 |
|---|---|---|
| `id` | uuid pk | |
| `department` | text (AgentRole 枚举，check 约束 6 值) | 所属部门 |
| `name` | text not null | 岗位名（如"主播"） |
| `responsibility` | text | 职责描述 |
| `sort_order` | int default 0 | 部门内排序 |
| `created_at` / `updated_at` | timestamptz | |

**表 2：`position_members`（岗位配人）**

| 列 | 类型 | 说明 |
|---|---|---|
| `id` | uuid pk | |
| `position_id` | uuid fk → positions(id) on delete cascade | |
| `member_type` | text check in ('user','creator') | 员工 / 主播 |
| `user_id` | uuid fk → user_profiles(id) nullable | member_type='user' 时填 |
| `creator_id` | uuid fk → creators(id) nullable | member_type='creator' 时填 |
| `created_at` | timestamptz | |

约束：`member_type='user'` 时 `user_id` 非空且 `creator_id` 空；`='creator'` 反之（CHECK 约束保证二选一）。同一 (position_id, user_id) / (position_id, creator_id) 唯一，防重复配人。

关系：岗位 1—N 配人；一个岗位可挂多人，一人可跨多岗（无唯一人-岗约束，除上面的去重）。

### 岗位来源与 P2 的关系

`position_members` 只承载"谁在这个岗位"。它**不改**现有 `UserProfile`/`Creator` 表结构。主播已有的 `operator_user`（经纪人）关系保持不变，与本表并存（本表是"组织岗位配置"，`operator_user` 是"某主播的直属经纪人"，语义不同）。

### 页面 / 交互

在左侧「团队（AI 代理）」分组下**新增子菜单「业务分工」** → 路由 `/team/org`。（分组现有子项：AI 代理、任务分配；新增第 3 项。）

页面结构（`/team/org`）：

- 按 **部门** 分组（6 个部门，空部门也显示，便于加岗位）。
- 每个部门下列出其**岗位卡**：岗位名 + 职责 + 配的人（员工/主播头像或名字 + 类型标识）。
- **编辑能力**（canEdit / 管理员）：
  - 新增 / 重命名 / 删除岗位；编辑职责；调整排序。
  - 给岗位配人 / 移除配人：选人时分两个来源——内部员工（从 `user_profiles` 选）、主播（从 `creators` 选）。
- 无编辑权限者：只读查看。

组件边界：
- 服务端页面 `page.tsx`：拉 positions（含 members join）、user_profiles、creators，按部门归组，服务端渲染只读骨架。
- 客户端岛 `OrgEditor`（或按岗位卡拆 `PositionCard` + `MemberPicker`）：承载增删改与配人弹窗，走 API 路由写库。

### API

RESTful，沿用 `src/app/api/**` 现有风格：

- `POST /api/positions`（建岗位）、`PATCH /api/positions/[id]`（改名/职责/排序）、`DELETE /api/positions/[id]`。
- `POST /api/positions/[id]/members`（配人：body 带 member_type + user_id|creator_id）、`DELETE /api/positions/[id]/members/[memberId]`（移除）。
- 写操作校验权限；`department` 值校验在枚举内。

### i18n

三语（zh/en/ja）新增：
- `nav.teamOrg`（「业务分工」/ "Org & Roles" / "業務分担"）。
- `team.org.*`：页面标题/副标题、部门分组标题（复用 `team.role.*`）、岗位/职责/配人、新增/编辑/删除/添加成员、成员来源（员工/主播）、空态、确认删除等。
- 通过 CI 的 `copy-checks`（key 三语对齐 + 无裸中文）。

### 安全 / 权限

- 新表启用 RLS，策略与现有表一致。
- 写接口做登录 + 权限校验（编辑限管理员或有权限角色，具体对齐现有 `canEdit`/`canManage` 判断来源）。

### 测试

- 纯函数：按部门归组、成员二选一校验（member_type ↔ user_id/creator_id）、去重逻辑 → `node --test` 单测。
- 类型检查 `tsc --noEmit`；`npm run test:copy`。
- 交互实测受登录拦截，行为靠单测 + 类型保证（沿用本项目既有约束）。

### 变更清单（P1）

- `supabase/migrations/041_positions.sql`：两张表 + RLS + seed 运营 4 岗位。
- `src/lib/types/index.ts`：`Position`、`PositionMember` 类型。
- `src/lib/org/*`：归组/校验纯函数 + 单测。
- `src/app/api/positions/**`：CRUD + 配人接口。
- `src/app/[locale]/(app)/team/org/page.tsx` + `src/components/org/*`：页面与编辑组件。
- `src/components/layout/Sidebar.tsx`：团队分组加「业务分工」子项。
- `messages/{zh,en,ja}.json`：i18n。
- `src/lib/changelog/entries.ts`：更新日志。

---

## P2 概述：开支归属（另立 plan，本 spec 不展开实现）

目标：把支出归到业务，看"每块业务花多少钱"。

- **模型**：`expenses` 增加 `department`（AgentRole，业务归属，录入必选）+ `position_id`（可选，细到岗位，fk → positions）。迁移单独编号。
- **录入**：支出表单加「业务/部门」下拉（+可选岗位）。
- **列表**：支出列表加「业务」列 + 按业务筛选（沿用现有筛选/KPI 卡模式）。
- **汇总**：按业务/部门的开支合计（支出页 KPI 或在 `/team/org` 每个部门/岗位旁显示开支合计，形成"分工 + 花费"闭环）。
- 历史数据：`department` 允许为空（旧数据未归属），或提供批量归类；细节在 P2 plan 决定。

## 非目标（YAGNI）

- 不改 `WorkTask`/工作量/薪资系统。
- 不做岗位级的审批流 / 变更历史。
- 不动主播 `operator_user`（经纪人）既有关系。
- P1 不含任何开支相关改动（留给 P2）。

## 待确认 / 已消解的歧义

- 岗位与部门为固定两层（不做多级树）。
- 部门维度固定 6 值，不在本次扩展。
- "配人"人来源限 `UserProfile` 与 `Creator` 两类，不引入自由文本实体。
