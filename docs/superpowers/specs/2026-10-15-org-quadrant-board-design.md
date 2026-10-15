# 业务分工「四象限」视图 —— 设计

## 1. 背景与目标

「业务分工」页（`/team/org`，`OrgView`）目前是 业务 → 任务 → 事项 的纵向清单。事项（`task_items`）只有名称和负责人，没有重要程度、截止日和状态，页面上看不出先做什么、什么快到期、什么已经做完。截至 2026-10-15，库里有 4 个业务、10 个任务、33 个事项，所有事项的 `updated_at` 都停在建表当天，没有再维护过。

本设计给事项补上三个字段，并新增「四象限」视图作为页面默认视图：

- **重要**：人工标记，只分「是 / 否」两档；没标的算「待评估」。
- **紧急**：不让人标，按截止日自动算（7 天内到期或已逾期）。
- 两条轴交叉成四格，事项落在哪一格由数据决定，时间推移时会自己从「排进计划」移到「立即做」。

**目标**

1. 打开页面第一眼看到四个象限各有多少事项、哪些逾期或卡住。
2. 能按负责人筛选，看某个人身上压着什么。
3. 手机上先看四格统计，再点进某一格看列表。
4. 管理员在详情面板里改重要、截止日、状态、负责人，改完立即生效。

**不做**

- 不做拖拽。横向拖（改紧急）在这个模型里没有意义，紧急由日期决定；纵向拖（改重要）在详情面板里点一下就能完成。
- 不做手动标「紧急」。
- 不做 P0 / P1 / P2 之类的多档优先级；同一格内按截止日排序。
- 不开放给非管理员写入（沿用现有「只有管理员可写」）。负责人改自己事项的状态另起一期。
- 不在详情面板展示关联的工时任务（快照里没有这份数据，另起一期）。
- 不做紧急门槛的设置页；7 天写成常数。
- 不做到期提醒、通知。
- 不改「结构」视图（现有清单）的任何行为。

## 2. 口径

### 2.1 象限判定

| 条件（按顺序判断，命中即停） | 归入 |
| --- | --- |
| `status = 'done'` | 已完成（不进象限） |
| `is_important is null` | 待评估（不进象限） |
| `is_important = true` 且 紧急 | ① 立即做 |
| `is_important = true` 且 不紧急 | ② 排进计划 |
| `is_important = false` 且 紧急 | ③ 速办或转交 |
| `is_important = false` 且 不紧急 | ④ 放一放 |

### 2.2 紧急

| 项 | 约定 |
| --- | --- |
| 定义 | `due_date` 不为空，且 `due_date − 今天 ≤ 7` 天。含当天到期、含已逾期（差值为负） |
| 边界 | 差值恰好为 7 天算紧急；8 天不算 |
| 没有截止日 | 永远不紧急 |
| 「今天」 | 东京业务日（`Asia/Tokyo`），与 `src/lib/milestones/completion.ts` 的 `BUSINESS_ZONE` 同一约定。团队分处日本、国内、北美，不按浏览器时区取 |
| 计算方式 | `due_date` 是 `date` 列，读出来是 `'YYYY-MM-DD'` 字符串；今天也取成同格式字符串，两者都按 UTC 零点解析后相减，全程不经过本地时区 |
| 门槛 | 常数 `URGENT_WITHIN_DAYS = 7`，放在 `src/lib/org/quadrant.ts` |

### 2.3 截止日的展示

| 情况 | 卡片上显示 | 色调 |
| --- | --- | --- |
| 已逾期 | 「逾期 N 天」 | danger |
| 当天到期 | 「今天到期」 | warning |
| 1–3 天内 | 「MM-DD · 剩 N 天」 | warning |
| 其余 | 「MM-DD」 | muted |
| 没有截止日 | 不显示 | — |
| 已完成 | 不显示 | — |

### 2.4 排序

同一格内：`due_date` 升序，没有截止日的排最后；相同时按 业务 `sort_order` → 任务 `sort_order` → 事项 `sort_order`，保证顺序稳定。

### 2.5 统计口径

| 统计 | 口径 |
| --- | --- |
| 各象限数 | 该象限内的事项数（已完成、待评估不计入四格） |
| 未完成 | `status ≠ 'done'` |
| 逾期 | 未完成且 `due_date < 今天` |
| 卡住 | `status = 'blocked'` |
| 待评估 | 未完成且 `is_important is null` |
| 未指派 | 未完成且没有负责人 |

所有统计都在负责人筛选之后计算：选了某人，数字就只算这个人的。

### 2.6 负责人筛选

- 选项：「全部」+ 至少负责一个事项的人（按姓名排序）+「未指派」（仅当存在未指派事项时出现）。
- 每个选项旁的数字：桌面版与手机首层 = 此人未完成事项数；手机列表层 = 此人在当前这一格里的事项数。
- 单选。筛选值写进 URL 查询参数 `owner`（值为 `user:<id>` / `creator:<id>` / `none`），刷新与分享链接时保留。

## 3. 数据

### 3.1 迁移 `supabase/migrations/YYYYMMDDHHMMSS_task_item_quadrant.sql`

文件名前缀沿用目录惯例（`scripts/check-migrations.mjs`），时间戳用 `TZ=Asia/Tokyo date +%Y%m%d%H%M%S` 生成。

```sql
alter table task_items
  add column if not exists is_important boolean,
  add column if not exists due_date     date,
  add column if not exists status       text not null default 'todo'
    constraint task_items_status_ck check (status in ('todo', 'doing', 'blocked', 'done'));
```

- `is_important` 可空，空 = 待评估。
- 现有事项迁移后全部是 `status = 'todo'`、`is_important = null`，即全部落在「待评估」，由管理员上线后统一分级。
- 表已开 RLS（`authenticated_only`），加列不影响策略；上线前用 `npm run audit:rls` 复核。
- 迁移文件只代表意图：上线前要在生产库实际执行，SQL 先交给 pollux 确认。

### 3.2 类型

`src/lib/types/index.ts` 的 `TaskItem` 增加：

```ts
export type TaskItemStatus = 'todo' | 'doing' | 'blocked' | 'done'

export interface TaskItem {
  // …现有字段
  is_important: boolean | null
  due_date: string | null      // 'YYYY-MM-DD'
  status: TaskItemStatus
}
```

`getOrgSnapshot` 对 `task_items` 已是 `select('*')`，新列自动带出，不改查询。

## 4. 纯函数 `src/lib/org/quadrant.ts`

本仓没有 DOM 测试环境，判定、排序、统计、筛选、写入校验全部放在这里，组件只负责渲染。

```ts
export const URGENT_WITHIN_DAYS = 7
export type Quadrant = 'q1' | 'q2' | 'q3' | 'q4'
export type Bucket = Quadrant | 'unrated' | 'done'

/** 东京业务日 'YYYY-MM-DD'。now 可注入，便于测试。 */
export function tokyoToday(now?: Date): string

/** due − today 的天数差（可为负）。两者都是 'YYYY-MM-DD'。 */
export function daysUntil(due: string, today: string): number

export function bucketOf(item: QuadrantItemInput, today: string): Bucket

/** 卡片上的截止日文案与色调（2.3 节）。 */
export function dueBadge(item: QuadrantItemInput, today: string): { text: string; tone: 'danger' | 'warning' | 'muted' } | null

/** 按负责人筛选后分桶并排序（2.4 节）。 */
export function groupItems(items: QuadrantRow[], today: string, owner: OwnerFilter): Record<Bucket, QuadrantRow[]>

/** 2.5 节的统计。 */
export function quadrantStats(groups: Record<Bucket, QuadrantRow[]>, today: string): QuadrantStats

/** 2.6 节的筛选项与计数。 */
export function ownerOptions(items: QuadrantRow[], scope: Bucket | 'open'): OwnerOption[]

/** PATCH 入参校验：is_important 为 boolean|null；due_date 为合法日历日 'YYYY-MM-DD' 或 null；status 在枚举内。 */
export function validateItemPatch(patch: unknown): { ok: true; value: ItemPatch } | { ok: false; message: string }
```

`QuadrantRow` 由组件从快照拍平得到：事项本身 + 所属业务 / 任务的名称与 `sort_order` + 任务的岗位列表。拍平函数 `flattenItems(snapshot)` 也放在这个文件里。

按仓库约定：相对路径 import 带 `.ts` 后缀，纯类型 import 写 `import type`。

## 5. 写入

### 5.1 `PATCH /api/org/items/[id]`

沿用现有接口，body 增加三个可选字段：

```json
{ "is_important": true, "due_date": "2026-10-20", "status": "doing" }
```

- 每个字段都可单独出现；出现即覆盖，`null` 表示清空（`status` 不能为 `null`）。
- 先过 `validateItemPatch`，失败回 400 和原因。
- 权限不变：`updateItem` 开头的 `requireAdmin` 照旧，非管理员 403。
- `updated_at` 照旧刷新。

### 5.2 `updateItem`（`src/lib/org/service.ts`）

`patch` 类型扩展三个字段，校验后写入。名称、负责人的现有逻辑不动。

### 5.3 前端本地更新

沿用 `OrgView` 现有模式：写入成功后用 `src/lib/org/tree.ts` 新增的 `applyUpdateItemFields(snapshot, itemId, fields)` 就地更新快照，不整表重取。失败时弹出服务端原因（与现有 `api()` 封装一致），快照不变。

## 6. 页面

### 6.1 视图切换

`/team/org` 顶部加 `SegmentedControl`：「四象限 | 结构」，默认四象限。视图写进 URL 查询参数 `view=structure`（缺省即四象限）。「结构」= 现有 `OrgView` 原样，岗位配人区块也只在结构视图里显示。

组件拆分：

| 文件 | 职责 |
| --- | --- |
| `src/components/org/OrgPageView.tsx` | 持有快照与写入封装，渲染视图切换，分发给两个视图 |
| `src/components/org/OrgView.tsx` | 现有结构视图；改为从父组件接收快照与写入函数（行为不变） |
| `src/components/org/QuadrantView.tsx` | 四象限视图：统计、筛选、桌面四格 / 手机两层 |
| `src/components/org/OwnerFilter.tsx` | 负责人筛选条，桌面与手机共用 |
| `src/components/org/ItemDetailPanel.tsx` | 事项详情：≥768px 为右侧抽屉，<768px 为底部面板 |

### 6.2 桌面（≥768px）

自上而下：

1. 统计条（现有 `Stat` 组件）：未完成 / 逾期 / 卡住 / 待评估 / 未指派。
2. 负责人筛选条。
3. 2×2 四格，上方标「紧急 | 不紧急」，左侧标「重要 | 不重要」。每格：色点 + 名称 + 副标（如「重要 · 紧急」）+ 计数，下面是事项行：事项名（单行截断，悬停显示「业务 › 任务」）、负责人姓名（未指派用 warning 色标出）、「卡住」时加状态徽标、截止日徽标。业务不另配颜色（设计 token 里没有按业务区分的色板，首期不加）。格内条目超出时格内滚动，四格高度一致。
4. 待评估区：虚线框，横向列出待评估事项。
5. 已完成：默认收起，只显示条数；展开后列出。

色调：① danger、② info、③ warning、④ muted，全部用现有设计 token，不写裸色值（`check-style-tokens` 零容忍）。

点任一事项行打开 `ItemDetailPanel`。

### 6.3 手机（<768px）

两层，用 URL 查询参数 `q` 区分（`q1`…`q4` / `unrated` / `done`；缺省为首层），系统返回手势能回到首层。切换时用 `window.history.pushState`（Next 14.2 会同步到 `useSearchParams`，不触发服务端重取）。

- **首层**：标题 + 一行摘要（「未完成 N 项 · 逾期 n · 卡住 n」）+ 负责人筛选（横向滚动）+ 2×2 方块。每块：名称、副标、大号计数、「逾期 n · 卡住 n」或「无逾期」。① 用最重的底色。下面两个入口：「待评估 N」「已完成 N」。
- **列表层**：返回按钮「四象限」+ 当前格名称与计数 + 负责人筛选（数字为该格内各人条数）+ 事项卡片列表，排序同 2.4。点卡片打开底部面板。

所有可点区域高度 ≥ 44px。

### 6.4 详情面板 `ItemDetailPanel`

| 区块 | 内容 | 管理员 | 非管理员 |
| --- | --- | --- | --- |
| 路径 | 业务 › 任务 | 只读 | 只读 |
| 名称 | 事项名 | 只读（改名仍在结构视图） | 只读 |
| 重要 | 三段：是 / 否 / 待评估 | 可改 | 禁用 |
| 截止日 | 日期输入 + 「清除」；旁边显示「还剩 N 天 / 已逾期 N 天」 | 可改 | 只读 |
| 紧急 | 只读说明：「按截止日自动判断：7 天内到期算紧急」 | — | — |
| 状态 | 四段：未开始 / 进行中 / 卡住 / 已完成 | 可改 | 禁用 |
| 负责人 | 头像 + 姓名 + 「更换」（复用现有选人弹窗） | 可改 | 只读 |
| 任务岗位 | 岗位标签 | 只读 | 只读 |

每次修改即时提交（不设「保存」按钮），成功后事项可能换到别的象限，面板保持打开并继续显示这个事项。截止日例外：输入框失焦时才提交——浏览器在改年份时会逐键给出 `0002-10-20` 这类合法但荒谬的值，边打边存会写坏数据；服务端也只接受 2000–2099 年。

### 6.5 文案

新增文案全部放在 `messages/{zh,en,ja}.json` 的 `team.org` 命名空间下，三语同步。

## 7. 测试

- `src/lib/org/quadrant.test.ts`（新文件，登记进 `package.json` 的 `test` 脚本）：
  - `bucketOf`：已完成优先于一切；`is_important` 为 null → unrated；四个象限各一例；差值 7 天 → 紧急、8 天 → 不紧急；当天到期、已逾期 → 紧急；没有截止日 → 不紧急。
  - `tokyoToday`：UTC 15:00 前后跨日（东京已是次日）。
  - `daysUntil`：跨月、跨年。
  - `dueBadge`：2.3 节每一行。
  - `groupItems`：排序（含无截止日排最后、同日按业务/任务/事项序）；负责人筛选含「未指派」。
  - `quadrantStats`、`ownerOptions`：筛选后计数；列表层按格计数。
  - `validateItemPatch`：非法日期（`2026-02-30`）、非法枚举、`status: null`、多余字段忽略。
- `src/lib/org/tree.test.ts`：补 `applyUpdateItemFields`。
- 审查时对上述测试做突变探针（在已提交的基线上），交击杀表。
- 视觉验证走生产构建（`next build && next start`），桌面 1440 与手机 375 两个宽度各截一张。

## 8. 上线步骤

1. pollux 确认迁移 SQL → 在生产库执行 → `npm run audit:rls` 复核 → 查 `information_schema.columns` 确认三列存在。
2. 合并 PR，确认 Vercel 生产部署完成且域名别名指向新部署。
3. 线上打开 `/team/org`：默认四象限、33 个事项全部在「待评估」；改一条事项的重要与截止日，确认落入正确象限且刷新后保留。
4. `src/lib/changelog/entries.ts` 补一条更新日志（随 PR 一起提交）。

## 9. 风险与取舍

- **上线当天全部在「待评估」**：四格是空的，第一次使用需要集中分级一次。不做自动猜测，避免错误的初始值。
- **没有截止日的重要事项永远不会进入「立即做」**：这是口径的直接结果。详情面板截止日为空时显示「未设截止日」，提醒补填。
- **紧急门槛固定 7 天**：先跑一段时间，再决定是否需要可配置。
