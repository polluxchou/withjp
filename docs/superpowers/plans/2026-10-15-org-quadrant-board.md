# 业务分工「四象限」视图 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 给 `task_items` 补「重要 / 截止日 / 状态」三列，并在 `/team/org` 新增默认的「四象限」视图（桌面四格 + 手机两层 + 按负责人筛选 + 详情面板）。

**Architecture:** 判定、分组、统计、筛选、写入校验全部是 `src/lib/org/quadrant.ts` 里的纯函数，用 `node --test` 覆盖；组件只渲染。页面状态（快照 + 写入封装 + 选人弹窗）从 `OrgView` 上提到 `OrgPageView`，「结构」与「四象限」两个视图共用同一份快照。写入沿用 `PATCH /api/org/items/[id]`，成功后用 `tree.ts` 的 `apply*` 就地更新快照。

**Tech Stack:** Next.js 14.2（App Router）、React 18、next-intl、Tailwind（设计 token）、Supabase Postgres、`node --test --experimental-strip-types`。

**Spec:** `docs/superpowers/specs/2026-10-15-org-quadrant-board-design.md`

## Global Constraints

- 工作目录：仓库根下 `.claude/worktrees/org-quadrant-board`，分支 `feat/org-quadrant-board`。每次 `git commit` 前先跑 `test "$(git branch --show-current)" = feat/org-quadrant-board`，不等就停下。
- 紧急门槛：`URGENT_WITHIN_DAYS = 7`；差值恰好 7 天算紧急，8 天不算；含当天、含逾期。
- 「今天」= 东京业务日（`Asia/Tokyo`），格式 `'YYYY-MM-DD'`；`due_date` 与今天都按 UTC 零点解析后相减。
- 重要只有 是 / 否 / 待评估（`is_important` = `true` / `false` / `null`）；没有 P0/P1/P2。
- 状态枚举：`todo` / `doing` / `blocked` / `done`。
- 四象限名称（zh）：① 立即做（重要 · 紧急）② 排进计划（重要 · 不紧急）③ 速办或转交（紧急 · 不重要）④ 放一放（不重要 · 不紧急）。色调：① danger ② info ③ warning ④ muted。
- 只有管理员能写（`updateItem` 的 `requireAdmin` 不动）；非管理员能打开详情，但不能改。
- 不做：拖拽、手动标紧急、多档优先级、工时任务展示、门槛设置页、提醒。
- 测试：`node --test --experimental-strip-types`；lib 内相对 import 带 `.ts` 后缀；纯类型 import 写 `import type`；新测试文件必须登记进 `package.json` 的 `test` 脚本，否则 CI 不跑。
- JSX 里不许出现裸汉字（`npm run test:no-bare-han`）：所有界面文案走 `useTranslations('team')` 的 `org.*` 键，`messages/{zh,en,ja}.json` 三语同步（`npm run test:i18n`）。
- 样式只用设计 token（`npm run test:style` 零容忍）：不写裸 hex、不用 gray/slate/zinc/neutral；`*-soft` / `*-border` / `line-*` 这类固定透明度 token 不能加 `/N`，只有 `ink-*` 与 `primary` 能加。注释里不要写 `(#123)` 形式的 PR 号（会被误判成裸 hex），写成 `PR 123`。
- `npm run test:lint`（`--max-warnings=0`）、`npx tsc --noEmit`、`npm test`、`npm run test:migrations` 每个任务结束都要绿。
- 迁移文件名：`<YYYYMMDDHHMMSS>_task_item_quadrant.sql`，时间戳用 `TZ=Asia/Tokyo date +%Y%m%d%H%M%S` 生成（`scripts/check-migrations.mjs` 的约定）。
- Task 1–8 不许对生产库执行任何 SQL；生产迁移只在 Task 9 由主会话在 pollux 确认后执行。
- 提交信息用简体中文 conventional 格式，末尾带 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`。不推送、不开 PR，直到 Task 9。
- 仓库是公开的：代码、注释、文档、测试数据里不写真实人名、内部事项名、本机绝对路径。

## Review Focus

1. **迁移还没在生产库跑，新代码先上线**：快照里没有三个新列（读出来是 `undefined`）→ 页面不能崩，全部事项归「待评估」。Task 2 用 `bucketOf` 的 undefined 用例钉住，Task 3 用 `flattenItems` 的旧数据用例钉住。
2. **日期输入框的半截值**：Chrome 改年份时会逐键给出 `0002-10-20` 这类合法但荒谬的值，Safari 在没填完时给空串 → 不能把半截值写进库、也不能把已有截止日误清空。Task 4 让 `isCalendarDate` 只认 2000–2099 年、`dueInputToPatch('')` 返回 `null`，详情面板只在失焦时提交（Task 6）。
3. **URL 里的筛选值失效**（负责人被转走、链接被手改、`q=q9`）→ 回落到「全部」/ 首层，不白屏。Task 3 的 `parseOwnerFilter` / `parseLevel` 用例钉住。
4. **员工与主播 id 撞号、两个人同名** → 筛选项按「类型:id」区分，是两个选项。Task 3 的 `ownerOptions` 用例钉住。
5. **改完重要/截止日后事项换了象限，详情面板要跟着这个事项，不能跳到格里别的事项或关掉**。组件按 id 查行（Task 7），Task 8 的交互验证逐项点检。

---

## File Structure

| 文件 | 动作 | 职责 |
| --- | --- | --- |
| `supabase/migrations/<ts>_task_item_quadrant.sql` | 新建 | 三个新列 |
| `src/lib/types/index.ts` | 改 | `TaskItemStatus`、`TaskItem` 新字段 |
| `src/lib/org/quadrant.ts` | 新建 | 判定 / 分组 / 统计 / 筛选 / 写入校验（纯函数） |
| `src/lib/org/quadrant.test.ts` | 新建 | 上面全部函数的测试 |
| `src/lib/org/tree.ts` / `tree.test.ts` | 改 | 新建事项默认值；`applyUpdateItemFields` |
| `src/lib/work-tasks/org-link.test.ts` | 改 | `TaskItem` 夹具补新字段（否则 tsc 挂） |
| `src/lib/org/service.ts` | 改 | `updateItem` 接收并校验三个新字段 |
| `src/app/api/org/items/[id]/route.ts` | 改 | 把整个 body 交给 `updateItem` 校验 |
| `src/components/org/useOrgSnapshot.ts` | 新建 | 快照状态 + `/api/org` 写入封装（从 `OrgView` 搬出） |
| `src/components/org/PersonPicker.tsx` | 新建 | 选人弹窗（从 `OrgView` 搬出） |
| `src/components/org/OrgView.tsx` | 改 | 只渲染「结构」视图，快照和动作由父组件传入 |
| `src/components/org/OrgPageView.tsx` | 新建 | 视图切换 + 共享快照 + 选人弹窗 |
| `src/components/org/searchParams.ts` | 新建 | 改 URL 查询参数但不触发服务端重取 |
| `src/components/org/OwnerFilter.tsx` | 新建 | 负责人筛选条 |
| `src/components/org/ItemDetailPanel.tsx` | 新建 | 详情：桌面右侧抽屉 / 手机底部面板 |
| `src/components/org/QuadrantView.tsx` | 新建 | 四象限视图（桌面 + 手机两层） |
| `src/app/[locale]/(app)/team/org/page.tsx` | 改 | 渲染 `OrgPageView`，传入东京今天 |
| `messages/{zh,en,ja}.json` | 改 | `team.org.*` 新文案 |
| `src/lib/changelog/entries.ts` | 改 | 更新日志 |
| `package.json` | 改 | 登记 `quadrant.test.ts` |

---

### Task 1: 数据列与类型

**Files:**
- Create: `supabase/migrations/<ts>_task_item_quadrant.sql`
- Modify: `src/lib/types/index.ts`（`TaskItem` 接口，约 520 行）
- Modify: `src/lib/org/tree.ts`（`applyAddItem`）
- Modify: `src/lib/org/tree.test.ts`（`baseSnapshot` 夹具）
- Modify: `src/lib/work-tasks/org-link.test.ts`（`baseItem` 夹具）

**Interfaces:**
- Produces: `export type TaskItemStatus = 'todo' | 'doing' | 'blocked' | 'done'`；`TaskItem` 新增 `is_important: boolean | null`、`due_date: string | null`、`status: TaskItemStatus`。

- [ ] **Step 1: 写迁移文件**

```bash
TS=$(TZ=Asia/Tokyo date +%Y%m%d%H%M%S); echo "$TS"
```

新建 `supabase/migrations/${TS}_task_item_quadrant.sql`：

```sql
-- ============================================================
-- 业务分工事项：四象限所需的三列
-- is_important：重要（人工标记），null = 待评估
-- due_date：截止日（date，东京业务日口径），决定「紧急」
-- status：未开始 / 进行中 / 卡住 / 已完成
-- 设计见 docs/superpowers/specs/2026-10-15-org-quadrant-board-design.md
-- ============================================================

alter table task_items
  add column if not exists is_important boolean,
  add column if not exists due_date     date,
  add column if not exists status       text not null default 'todo'
    constraint task_items_status_ck check (status in ('todo', 'doing', 'blocked', 'done'));
```

- [ ] **Step 2: 改类型**

`src/lib/types/index.ts`，在 `export interface TaskItem {` 上方加：

```ts
export type TaskItemStatus = 'todo' | 'doing' | 'blocked' | 'done'
```

并在 `TaskItem` 的 `owner_name?: string | null   // joined` 之后加三行：

```ts
  is_important: boolean | null // 重要；null = 待评估
  due_date: string | null      // 截止日 'YYYY-MM-DD'（date 列）
  status: TaskItemStatus
```

- [ ] **Step 3: 跑类型检查，确认三处夹具/构造报错**

Run: `npx tsc --noEmit`
Expected: FAIL，报 `src/lib/org/tree.ts`（`applyAddItem` 的 `const item: TaskItem`）、`src/lib/org/tree.test.ts`、`src/lib/work-tasks/org-link.test.ts` 缺 `is_important` / `due_date` / `status`。

- [ ] **Step 4: 补齐三处**

`src/lib/org/tree.ts` 的 `applyAddItem` 里，把

```ts
    const item: TaskItem = { id: itemId, task_id: taskId, name, sort_order: nextOrder, owner_member_type: null, owner_user_id: null, owner_creator_id: null, owner_name: null }
```

改为

```ts
    const item: TaskItem = {
      id: itemId, task_id: taskId, name, sort_order: nextOrder,
      owner_member_type: null, owner_user_id: null, owner_creator_id: null, owner_name: null,
      is_important: null, due_date: null, status: 'todo',
    }
```

`src/lib/org/tree.test.ts` 的 `baseSnapshot` 里，事项 `i1` 那一行末尾 `owner_name: null }` 改为 `owner_name: null, is_important: null, due_date: null, status: 'todo' }`。

`src/lib/work-tasks/org-link.test.ts` 的 `baseItem` 改为：

```ts
const baseItem = (over: Partial<TaskItem> = {}): TaskItem => ({
  id: 'it1', task_id: 't1', name: '对账', sort_order: 1,
  owner_member_type: null, owner_user_id: null, owner_creator_id: null,
  is_important: null, due_date: null, status: 'todo', ...over,
})
```

并在 `src/lib/org/tree.test.ts` 的用例 `applyAddItem: 在对应任务末尾追加事项（无负责人）` 里，`assert.equal(items[1].owner_name ?? null, null)` 之后补一行（新事项默认待评估、无截止日、未开始）：

```ts
  assert.deepEqual([items[1].is_important, items[1].due_date, items[1].status], [null, null, 'todo'])
```

- [ ] **Step 5: 跑检查**

Run: `npx tsc --noEmit && npm test && npm run test:migrations`
Expected: 全部 PASS。

- [ ] **Step 6: Commit**

```bash
test "$(git branch --show-current)" = feat/org-quadrant-board
git add supabase/migrations/*_task_item_quadrant.sql src/lib/types/index.ts src/lib/org/tree.ts src/lib/org/tree.test.ts src/lib/work-tasks/org-link.test.ts
git commit -m "feat(org): 事项加 重要/截止日/状态 三列（迁移 + 类型）

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: 象限判定

**Files:**
- Create: `src/lib/org/quadrant.ts`
- Create: `src/lib/org/quadrant.test.ts`
- Modify: `package.json`（`test` 脚本）

**Interfaces:**
- Consumes: `TaskItemStatus`（Task 1）
- Produces:
  - `URGENT_WITHIN_DAYS: 7`
  - `type Quadrant = 'q1' | 'q2' | 'q3' | 'q4'`，`type Bucket = Quadrant | 'unrated' | 'done'`，`QUADRANTS: Quadrant[]`
  - `interface QuadrantItemInput { is_important: boolean | null | undefined; due_date: string | null | undefined; status: TaskItemStatus | null | undefined }`
  - `tokyoToday(now?: Date): string`
  - `daysUntil(due: string, today: string): number`
  - `isUrgent(item: QuadrantItemInput, today: string): boolean`
  - `bucketOf(item: QuadrantItemInput, today: string): Bucket`
  - `type DueBadge`；`dueBadge(item: QuadrantItemInput, today: string): DueBadge | null`

- [ ] **Step 1: 写失败的测试**

新建 `src/lib/org/quadrant.test.ts`：

```ts
import assert from 'node:assert/strict'
import test from 'node:test'

import { URGENT_WITHIN_DAYS, bucketOf, daysUntil, dueBadge, tokyoToday } from './quadrant.ts'
import type { QuadrantItemInput } from './quadrant.ts'

const TODAY = '2026-10-15'
const item = (over: Partial<QuadrantItemInput> = {}): QuadrantItemInput => ({
  is_important: true, due_date: null, status: 'todo', ...over,
})

test('tokyoToday: UTC 14:59 仍是东京当天，UTC 15:00 已是东京次日', () => {
  assert.equal(tokyoToday(new Date('2026-10-15T14:59:59Z')), '2026-10-15')
  assert.equal(tokyoToday(new Date('2026-10-15T15:00:00Z')), '2026-10-16')
})

test('daysUntil: 跨月、跨年、当天、负数', () => {
  assert.equal(daysUntil('2026-11-01', '2026-10-31'), 1)
  assert.equal(daysUntil('2027-01-01', '2026-12-31'), 1)
  assert.equal(daysUntil('2026-10-15', '2026-10-15'), 0)
  assert.equal(daysUntil('2026-10-14', '2026-10-15'), -1)
})

test('bucketOf: 已完成优先于一切', () => {
  assert.equal(bucketOf(item({ status: 'done', is_important: null }), TODAY), 'done')
  assert.equal(bucketOf(item({ status: 'done', due_date: '2026-10-01' }), TODAY), 'done')
})

test('bucketOf: is_important 为空 → 待评估，哪怕已逾期', () => {
  assert.equal(bucketOf(item({ is_important: null, due_date: '2026-10-01' }), TODAY), 'unrated')
})

test('bucketOf: 迁移未跑时新列是 undefined → 待评估，不抛错', () => {
  assert.equal(bucketOf({ is_important: undefined, due_date: undefined, status: undefined }, TODAY), 'unrated')
})

test('bucketOf: 四个象限各一例', () => {
  assert.equal(bucketOf(item({ is_important: true, due_date: '2026-10-18' }), TODAY), 'q1')
  assert.equal(bucketOf(item({ is_important: true, due_date: '2026-11-30' }), TODAY), 'q2')
  assert.equal(bucketOf(item({ is_important: false, due_date: '2026-10-18' }), TODAY), 'q3')
  assert.equal(bucketOf(item({ is_important: false, due_date: '2026-11-30' }), TODAY), 'q4')
})

test('bucketOf: 紧急边界 — 差 7 天算紧急，差 8 天不算', () => {
  assert.equal(URGENT_WITHIN_DAYS, 7)
  assert.equal(bucketOf(item({ due_date: '2026-10-22' }), TODAY), 'q1')
  assert.equal(bucketOf(item({ due_date: '2026-10-23' }), TODAY), 'q2')
})

test('bucketOf: 当天到期、已逾期算紧急；没有截止日永远不紧急', () => {
  assert.equal(bucketOf(item({ due_date: TODAY }), TODAY), 'q1')
  assert.equal(bucketOf(item({ due_date: '2026-09-01' }), TODAY), 'q1')
  assert.equal(bucketOf(item({ due_date: null }), TODAY), 'q2')
  assert.equal(bucketOf(item({ is_important: false, due_date: null }), TODAY), 'q4')
})

test('bucketOf: 进行中、卡住不影响象限', () => {
  assert.equal(bucketOf(item({ status: 'doing', due_date: '2026-10-16' }), TODAY), 'q1')
  assert.equal(bucketOf(item({ status: 'blocked', due_date: null }), TODAY), 'q2')
})

test('dueBadge: spec 2.3 每一行', () => {
  assert.deepEqual(dueBadge(item({ due_date: '2026-10-13' }), TODAY), { kind: 'overdue', days: 2, tone: 'danger' })
  assert.deepEqual(dueBadge(item({ due_date: TODAY }), TODAY), { kind: 'today', tone: 'warning' })
  assert.deepEqual(dueBadge(item({ due_date: '2026-10-16' }), TODAY), { kind: 'soon', days: 1, date: '10-16', tone: 'warning' })
  assert.deepEqual(dueBadge(item({ due_date: '2026-10-18' }), TODAY), { kind: 'soon', days: 3, date: '10-18', tone: 'warning' })
  assert.deepEqual(dueBadge(item({ due_date: '2026-10-19' }), TODAY), { kind: 'date', date: '10-19', tone: 'muted' })
  assert.equal(dueBadge(item({ due_date: null }), TODAY), null)
  assert.equal(dueBadge(item({ due_date: '2026-10-01', status: 'done' }), TODAY), null)
})
```

- [ ] **Step 2: 登记测试文件**

`package.json` 的 `test` 脚本里，把 `src/lib/org/tree.test.ts` 替换为 `src/lib/org/tree.test.ts src/lib/org/quadrant.test.ts`。

- [ ] **Step 3: 跑测试确认失败**

Run: `node --test --experimental-strip-types src/lib/org/quadrant.test.ts`
Expected: FAIL，`Cannot find module './quadrant.ts'`。

- [ ] **Step 4: 写实现**

新建 `src/lib/org/quadrant.ts`：

```ts
// src/lib/org/quadrant.ts — 业务分工「四象限」视图的判定、分组、统计与写入校验。
//
// 口径见 docs/superpowers/specs/2026-10-15-org-quadrant-board-design.md 第 2 节。
// 本仓没有 DOM 测试环境，凡是能算的都放在这里，组件只负责渲染。
// 相对路径 + .ts 后缀：node --test 不认 tsconfig 的 @/ 别名。
import type { TaskItemStatus } from '../types/index.ts'

/** 截止日距今天 ≤ 这么多天（含当天、含已逾期）即算紧急。 */
export const URGENT_WITHIN_DAYS = 7

/** 「今天」按东京业务日算，与 src/lib/milestones/completion.ts 同一约定。 */
const BUSINESS_ZONE = 'Asia/Tokyo'

export type Quadrant = 'q1' | 'q2' | 'q3' | 'q4'
export type Bucket = Quadrant | 'unrated' | 'done'
export const QUADRANTS: Quadrant[] = ['q1', 'q2', 'q3', 'q4']

/** 判定只看这三个字段。迁移未跑时快照里没有新列，读出来是 undefined，按「待评估」处理。 */
export interface QuadrantItemInput {
  is_important: boolean | null | undefined
  due_date: string | null | undefined
  status: TaskItemStatus | null | undefined
}

/** 东京业务日 'YYYY-MM-DD'。now 可注入，便于测试。 */
export function tokyoToday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: BUSINESS_ZONE, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(now)
}

function utcMidnight(ymd: string): number {
  const [y, m, d] = ymd.split('-').map(Number)
  return Date.UTC(y, m - 1, d)
}

/** due − today 的天数差（可为负）。两者都是 'YYYY-MM-DD'，按 UTC 零点相减，不经过本地时区。 */
export function daysUntil(due: string, today: string): number {
  return Math.round((utcMidnight(due) - utcMidnight(today)) / 86_400_000)
}

export function isUrgent(item: QuadrantItemInput, today: string): boolean {
  return !!item.due_date && daysUntil(item.due_date, today) <= URGENT_WITHIN_DAYS
}

export function bucketOf(item: QuadrantItemInput, today: string): Bucket {
  if (item.status === 'done') return 'done'
  if (item.is_important === null || item.is_important === undefined) return 'unrated'
  const urgent = isUrgent(item, today)
  if (item.is_important) return urgent ? 'q1' : 'q2'
  return urgent ? 'q3' : 'q4'
}

export type DueBadge =
  | { kind: 'overdue'; days: number; tone: 'danger' }
  | { kind: 'today'; tone: 'warning' }
  | { kind: 'soon'; days: number; date: string; tone: 'warning' }
  | { kind: 'date'; date: string; tone: 'muted' }

/** 卡片上的截止日徽标（spec 2.3）。文案由组件按 i18n 拼；date 为 'MM-DD'。 */
export function dueBadge(item: QuadrantItemInput, today: string): DueBadge | null {
  if (!item.due_date || item.status === 'done') return null
  const d = daysUntil(item.due_date, today)
  const date = item.due_date.slice(5)
  if (d < 0) return { kind: 'overdue', days: -d, tone: 'danger' }
  if (d === 0) return { kind: 'today', tone: 'warning' }
  if (d <= 3) return { kind: 'soon', days: d, date, tone: 'warning' }
  return { kind: 'date', date, tone: 'muted' }
}
```

- [ ] **Step 5: 跑测试确认通过**

Run: `node --test --experimental-strip-types src/lib/org/quadrant.test.ts && npm test && npx tsc --noEmit`
Expected: PASS。

- [ ] **Step 6: Commit**

```bash
test "$(git branch --show-current)" = feat/org-quadrant-board
git add src/lib/org/quadrant.ts src/lib/org/quadrant.test.ts package.json
git commit -m "feat(org): 四象限判定纯函数（东京业务日、7 天紧急门槛）

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: 分组、统计与负责人筛选

**Files:**
- Modify: `src/lib/org/quadrant.ts`
- Modify: `src/lib/org/quadrant.test.ts`

**Interfaces:**
- Consumes: Task 2 全部导出；`OrgSnapshot`、`TaskItemStatus`
- Produces:
  - `type OwnerKey = \`user:${string}\` | \`creator:${string}\` | 'none'`，`type OwnerFilter = OwnerKey | 'all'`
  - `ownerKeyOf(item: { owner_member_type: 'user' | 'creator' | null; owner_user_id: string | null; owner_creator_id: string | null }): OwnerKey`
  - `interface QuadrantRow`（字段见代码）
  - `flattenItems(snapshot: OrgSnapshot): QuadrantRow[]`
  - `type QuadrantGroups = Record<Bucket, QuadrantRow[]>`；`groupItems(rows, today, owner: OwnerFilter): QuadrantGroups`
  - `interface QuadrantStats { open; overdue; blocked; unrated; unassigned }`；`quadrantStats(groups, today): QuadrantStats`
  - `interface OwnerOption { key: OwnerFilter; name: string | null; count: number }`；`ownerOptions(rows, today, scope: Bucket | 'open'): OwnerOption[]`
  - `parseOwnerFilter(raw: string | null, rows: QuadrantRow[]): OwnerFilter`
  - `parseLevel(raw: string | null): Bucket | null`

- [ ] **Step 1: 写失败的测试**

在 `src/lib/org/quadrant.test.ts` 顶部的 import 改为：

```ts
import {
  URGENT_WITHIN_DAYS, bucketOf, daysUntil, dueBadge, flattenItems, groupItems,
  ownerKeyOf, ownerOptions, parseLevel, parseOwnerFilter, quadrantStats, tokyoToday,
} from './quadrant.ts'
import type { QuadrantItemInput, QuadrantRow } from './quadrant.ts'
import type { OrgSnapshot, TaskItem } from '../types/index.ts'
```

文件末尾追加：

```ts
const row = (over: Partial<QuadrantRow> = {}): QuadrantRow => ({
  id: 'r', name: 'r', status: 'todo', is_important: true, due_date: null,
  ownerKey: 'none', ownerName: null, businessName: 'B', taskName: 'T', positionIds: [], order: [1, 1, 1],
  ...over,
})

test('ownerKeyOf: 员工/主播带类型前缀，缺 id 视为未指派', () => {
  assert.equal(ownerKeyOf({ owner_member_type: 'user', owner_user_id: 'u1', owner_creator_id: null }), 'user:u1')
  assert.equal(ownerKeyOf({ owner_member_type: 'creator', owner_user_id: null, owner_creator_id: 'c1' }), 'creator:c1')
  assert.equal(ownerKeyOf({ owner_member_type: 'user', owner_user_id: null, owner_creator_id: null }), 'none')
  assert.equal(ownerKeyOf({ owner_member_type: null, owner_user_id: null, owner_creator_id: null }), 'none')
})

test('flattenItems: 带出业务/任务名、岗位、排序键；旧数据缺新列时兜底为 待评估/未开始/无截止日', () => {
  const legacyItem = {
    id: 'i1', task_id: 't1', name: '事项1', sort_order: 2,
    owner_member_type: 'creator', owner_user_id: null, owner_creator_id: 'c9', owner_name: '主播甲',
  } as unknown as TaskItem
  const snap: OrgSnapshot = {
    people: [], positions: [], canEdit: true,
    businesses: [{
      id: 'b1', key: 'k', name: '业务1', sort_order: 3,
      owner_member_type: null, owner_user_id: null, owner_creator_id: null, owner_name: null,
      tasks: [{ id: 't1', business_id: 'b1', name: '任务1', sort_order: 4, position_ids: ['p1'], items: [legacyItem] }],
    }],
  }
  assert.deepEqual(flattenItems(snap), [{
    id: 'i1', name: '事项1', status: 'todo', is_important: null, due_date: null,
    ownerKey: 'creator:c9', ownerName: '主播甲', businessName: '业务1', taskName: '任务1',
    positionIds: ['p1'], order: [3, 4, 2],
  }])
})

test('groupItems: 同格按截止日升序，无截止日排最后，同日按 业务/任务/事项 顺序', () => {
  const rows = [
    row({ id: 'a', due_date: null, order: [1, 1, 1] }),
    row({ id: 'b', due_date: '2026-11-20', order: [2, 1, 1] }),
    row({ id: 'c', due_date: '2026-11-20', order: [1, 2, 1] }),
    row({ id: 'd', due_date: '2026-11-01', order: [9, 9, 9] }),
  ]
  assert.deepEqual(groupItems(rows, TODAY, 'all').q2.map((r) => r.id), ['d', 'c', 'b', 'a'])
})

test('groupItems: 按负责人筛选，含「未指派」，员工与主播同 id 互不混', () => {
  const rows = [row({ id: 'u', ownerKey: 'user:1' }), row({ id: 'n', ownerKey: 'none' }), row({ id: 'c', ownerKey: 'creator:1' })]
  assert.deepEqual(groupItems(rows, TODAY, 'user:1').q2.map((r) => r.id), ['u'])
  assert.deepEqual(groupItems(rows, TODAY, 'none').q2.map((r) => r.id), ['n'])
  assert.deepEqual(groupItems(rows, TODAY, 'creator:1').q2.map((r) => r.id), ['c'])
  assert.equal(groupItems(rows, TODAY, 'all').q2.length, 3)
})

test('quadrantStats: 未完成/逾期/卡住/待评估/未指派；已完成不计；筛选后重算', () => {
  const rows = [
    row({ id: '1', due_date: '2026-10-10', ownerKey: 'user:1' }),               // q1，逾期
    row({ id: '2', status: 'blocked', ownerKey: 'user:1' }),                    // q2，卡住
    row({ id: '3', is_important: null, ownerKey: 'none' }),                     // 待评估 + 未指派
    row({ id: '4', status: 'done', due_date: '2026-10-01', ownerKey: 'none' }), // 已完成：都不计
  ]
  assert.deepEqual(quadrantStats(groupItems(rows, TODAY, 'all'), TODAY), { open: 3, overdue: 1, blocked: 1, unrated: 1, unassigned: 1 })
  assert.deepEqual(quadrantStats(groupItems(rows, TODAY, 'user:1'), TODAY), { open: 2, overdue: 1, blocked: 1, unrated: 0, unassigned: 0 })
})

test('ownerOptions: 全部在前，人按姓名，未指派在后；同名或同 id 的员工/主播是两个选项', () => {
  const rows = [
    row({ id: '1', ownerKey: 'user:x', ownerName: 'Lee' }),
    row({ id: '2', ownerKey: 'creator:x', ownerName: 'Lee' }),
    row({ id: '3', ownerKey: 'user:y', ownerName: 'Ann', status: 'done' }),
    row({ id: '4', ownerKey: 'none' }),
  ]
  assert.deepEqual(ownerOptions(rows, TODAY, 'open'), [
    { key: 'all', name: null, count: 3 },
    { key: 'user:y', name: 'Ann', count: 0 },
    { key: 'creator:x', name: 'Lee', count: 1 },
    { key: 'user:x', name: 'Lee', count: 1 },
    { key: 'none', name: null, count: 1 },
  ])
})

test('ownerOptions: 列表层按当前格计数；没有未指派事项时不出现「未指派」', () => {
  const rows = [
    row({ id: '1', ownerKey: 'user:x', ownerName: 'Lee', due_date: '2026-10-16' }), // q1
    row({ id: '2', ownerKey: 'user:x', ownerName: 'Lee' }),                         // q2
  ]
  assert.deepEqual(ownerOptions(rows, TODAY, 'q1').map((o) => [o.key, o.count]), [['all', 1], ['user:x', 1]])
})

test('parseOwnerFilter: 失效或乱填的值回落到「全部」', () => {
  const rows = [row({ ownerKey: 'user:1' })]
  assert.equal(parseOwnerFilter(null, rows), 'all')
  assert.equal(parseOwnerFilter('all', rows), 'all')
  assert.equal(parseOwnerFilter('user:1', rows), 'user:1')
  assert.equal(parseOwnerFilter('user:999', rows), 'all')
  assert.equal(parseOwnerFilter('none', rows), 'all')
  assert.equal(parseOwnerFilter('<script>', rows), 'all')
})

test('parseLevel: 只认六个桶，其余回首层', () => {
  assert.equal(parseLevel('q3'), 'q3')
  assert.equal(parseLevel('unrated'), 'unrated')
  assert.equal(parseLevel('done'), 'done')
  assert.equal(parseLevel(null), null)
  assert.equal(parseLevel(''), null)
  assert.equal(parseLevel('q9'), null)
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `node --test --experimental-strip-types src/lib/org/quadrant.test.ts`
Expected: FAIL，`flattenItems` 等未导出。

- [ ] **Step 3: 写实现**

`src/lib/org/quadrant.ts` 顶部 import 改为：

```ts
import type { OrgSnapshot, TaskItemStatus } from '../types/index.ts'
```

文件末尾追加：

```ts
// ── 拍平、分组、统计、筛选 ────────────────────────────────

/** 负责人标识：带类型前缀，员工与主播的 id 各自成域，不会撞。 */
export type OwnerKey = `user:${string}` | `creator:${string}` | 'none'
export type OwnerFilter = OwnerKey | 'all'

export function ownerKeyOf(item: {
  owner_member_type: 'user' | 'creator' | null
  owner_user_id: string | null
  owner_creator_id: string | null
}): OwnerKey {
  if (item.owner_member_type === 'user' && item.owner_user_id) return `user:${item.owner_user_id}`
  if (item.owner_member_type === 'creator' && item.owner_creator_id) return `creator:${item.owner_creator_id}`
  return 'none'
}

/** 拍平后的一行事项：判定字段 + 展示所需的业务/任务信息 + 稳定排序键。 */
export interface QuadrantRow {
  id: string
  name: string
  status: TaskItemStatus
  is_important: boolean | null
  due_date: string | null
  ownerKey: OwnerKey
  ownerName: string | null
  businessName: string
  taskName: string
  positionIds: string[]
  /** [业务 sort_order, 任务 sort_order, 事项 sort_order] */
  order: [number, number, number]
}

export function flattenItems(snapshot: OrgSnapshot): QuadrantRow[] {
  const rows: QuadrantRow[] = []
  for (const b of snapshot.businesses) {
    for (const t of b.tasks) {
      for (const it of t.items) {
        rows.push({
          id: it.id,
          name: it.name,
          // 迁移未跑时新列缺失：按「未开始 / 待评估 / 无截止日」兜底
          status: it.status ?? 'todo',
          is_important: it.is_important ?? null,
          due_date: it.due_date ?? null,
          ownerKey: ownerKeyOf(it),
          ownerName: it.owner_name ?? null,
          businessName: b.name,
          taskName: t.name,
          positionIds: t.position_ids,
          order: [b.sort_order, t.sort_order, it.sort_order],
        })
      }
    }
  }
  return rows
}

function compareRows(a: QuadrantRow, b: QuadrantRow): number {
  if (a.due_date !== b.due_date) {
    if (!a.due_date) return 1
    if (!b.due_date) return -1
    return a.due_date < b.due_date ? -1 : 1
  }
  return a.order[0] - b.order[0] || a.order[1] - b.order[1] || a.order[2] - b.order[2]
}

function matchesOwner(row: QuadrantRow, owner: OwnerFilter): boolean {
  return owner === 'all' || row.ownerKey === owner
}

export type QuadrantGroups = Record<Bucket, QuadrantRow[]>

/** 按负责人筛选后分桶，每桶按 spec 2.4 排序。 */
export function groupItems(rows: QuadrantRow[], today: string, owner: OwnerFilter): QuadrantGroups {
  const groups: QuadrantGroups = { q1: [], q2: [], q3: [], q4: [], unrated: [], done: [] }
  for (const row of rows) {
    if (matchesOwner(row, owner)) groups[bucketOf(row, today)].push(row)
  }
  for (const key of Object.keys(groups) as Bucket[]) groups[key].sort(compareRows)
  return groups
}

export interface QuadrantStats {
  open: number
  overdue: number
  blocked: number
  unrated: number
  unassigned: number
}

/** spec 2.5 的统计；groups 已是筛选后的结果。 */
export function quadrantStats(groups: QuadrantGroups, today: string): QuadrantStats {
  const open = [...QUADRANTS.flatMap((q) => groups[q]), ...groups.unrated]
  return {
    open: open.length,
    overdue: open.filter((r) => !!r.due_date && daysUntil(r.due_date, today) < 0).length,
    blocked: open.filter((r) => r.status === 'blocked').length,
    unrated: groups.unrated.length,
    unassigned: open.filter((r) => r.ownerKey === 'none').length,
  }
}

export interface OwnerOption {
  key: OwnerFilter
  name: string | null
  count: number
}

/**
 * 负责人筛选项（spec 2.6）：「全部」+ 至少负责一个事项的人（按姓名）+「未指派」（有才出现）。
 * scope = 'open' 时计数为未完成事项数；scope 为某个桶时只数这个桶里的。
 */
export function ownerOptions(rows: QuadrantRow[], today: string, scope: Bucket | 'open'): OwnerOption[] {
  const inScope = (r: QuadrantRow) => (scope === 'open' ? r.status !== 'done' : bucketOf(r, today) === scope)
  const people = new Map<OwnerKey, string>()
  let hasUnassigned = false
  for (const r of rows) {
    if (r.ownerKey === 'none') hasUnassigned = true
    else if (!people.has(r.ownerKey)) people.set(r.ownerKey, r.ownerName ?? '')
  }
  const count = (key: OwnerFilter) => rows.filter((r) => inScope(r) && matchesOwner(r, key)).length
  const options: OwnerOption[] = [{ key: 'all', name: null, count: count('all') }]
  const sorted = [...people.entries()].sort((a, b) => a[1].localeCompare(b[1]) || a[0].localeCompare(b[0]))
  for (const [key, name] of sorted) options.push({ key, name, count: count(key) })
  if (hasUnassigned) options.push({ key: 'none', name: null, count: count('none') })
  return options
}

/** URL 的 owner 参数 → 筛选值。格式不对、或这个人已不在任何事项上 → 'all'。 */
export function parseOwnerFilter(raw: string | null, rows: QuadrantRow[]): OwnerFilter {
  if (!raw || raw === 'all') return 'all'
  return rows.some((r) => r.ownerKey === raw) ? (raw as OwnerKey) : 'all'
}

const BUCKETS: Bucket[] = ['q1', 'q2', 'q3', 'q4', 'unrated', 'done']

/** URL 的 q 参数（手机列表层）→ 桶；缺省或非法 → null（首层）。 */
export function parseLevel(raw: string | null): Bucket | null {
  return BUCKETS.includes(raw as Bucket) ? (raw as Bucket) : null
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `node --test --experimental-strip-types src/lib/org/quadrant.test.ts && npx tsc --noEmit && npm run test:lint`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
test "$(git branch --show-current)" = feat/org-quadrant-board
git add src/lib/org/quadrant.ts src/lib/org/quadrant.test.ts
git commit -m "feat(org): 四象限分组、统计与负责人筛选纯函数

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: 写入路径

**Files:**
- Modify: `src/lib/org/quadrant.ts`、`src/lib/org/quadrant.test.ts`
- Modify: `src/lib/org/tree.ts`、`src/lib/org/tree.test.ts`
- Modify: `src/lib/org/service.ts`（`updateItem`，约 157–176 行）
- Modify: `src/app/api/org/items/[id]/route.ts`

**Interfaces:**
- Consumes: `TaskItemStatus`；`mapAllTasks`（`tree.ts` 内部函数）
- Produces:
  - `ITEM_STATUSES: TaskItemStatus[]`
  - `interface ItemPatch { is_important?: boolean | null; due_date?: string | null; status?: TaskItemStatus }`
  - `isCalendarDate(s: string): boolean`
  - `validateItemPatch(input: unknown): { ok: true; value: ItemPatch } | { ok: false; message: string }`
  - `dueInputToPatch(value: string): ItemPatch | null`
  - `applyUpdateItemFields(snapshot: OrgSnapshot, itemId: string, fields: ItemPatch): OrgSnapshot`（`tree.ts`）
  - `updateItem(userId, itemId, patch: { name?; owner?; quadrant?: unknown })`

- [ ] **Step 1: 写失败的测试**

`src/lib/org/quadrant.test.ts` 的 import 列表里加 `dueInputToPatch, isCalendarDate, validateItemPatch`，文件末尾追加：

```ts
test('isCalendarDate: 只认真实存在的 2000–2099 年日历日', () => {
  assert.equal(isCalendarDate('2026-10-20'), true)
  assert.equal(isCalendarDate('2028-02-29'), true)
  assert.equal(isCalendarDate('2026-02-29'), false)
  assert.equal(isCalendarDate('2026-02-30'), false)
  assert.equal(isCalendarDate('0002-10-20'), false)
  assert.equal(isCalendarDate('2026-1-5'), false)
  assert.equal(isCalendarDate(''), false)
})

test('validateItemPatch: 合法输入原样带出，其余键忽略', () => {
  assert.deepEqual(
    validateItemPatch({ is_important: false, due_date: '2026-10-20', status: 'blocked', name: 'x', owner: null }),
    { ok: true, value: { is_important: false, due_date: '2026-10-20', status: 'blocked' } },
  )
  assert.deepEqual(validateItemPatch({ is_important: null, due_date: null }), { ok: true, value: { is_important: null, due_date: null } })
  assert.deepEqual(validateItemPatch({ name: 'only name' }), { ok: true, value: {} })
})

test('validateItemPatch: 拒绝非法值', () => {
  const bad: unknown[] = [
    { is_important: 'yes' }, { is_important: 1 },
    { due_date: '2026-02-30' }, { due_date: '2026/10/20' }, { due_date: '2026-10-20T00:00:00Z' }, { due_date: 20261020 },
    { status: null }, { status: 'cancelled' },
    null, 'x', 42,
  ]
  for (const input of bad) assert.equal(validateItemPatch(input).ok, false, JSON.stringify(input))
})

test('dueInputToPatch: 空串、半截值、荒谬年份都不提交', () => {
  assert.equal(dueInputToPatch(''), null)
  assert.equal(dueInputToPatch('2026-10'), null)
  assert.equal(dueInputToPatch('0002-10-20'), null)
  assert.deepEqual(dueInputToPatch('2026-10-20'), { due_date: '2026-10-20' })
})
```

`src/lib/org/tree.test.ts` 的 import 列表加 `applyUpdateItemFields`，文件末尾追加：

```ts
test('applyUpdateItemFields: 只改指定事项的指定字段，不可变', () => {
  const s = baseSnapshot()
  const next = applyUpdateItemFields(s, 'i1', { is_important: true, due_date: '2026-10-20' })
  const it = next.businesses[0].tasks[0].items[0]
  assert.deepEqual([it.is_important, it.due_date, it.status, it.name], [true, '2026-10-20', 'todo', '事项1'])
  assert.equal(s.businesses[0].tasks[0].items[0].is_important, null)

  const cleared = applyUpdateItemFields(next, 'i1', { due_date: null, status: 'done' })
  const c = cleared.businesses[0].tasks[0].items[0]
  assert.deepEqual([c.is_important, c.due_date, c.status], [true, null, 'done'])

  assert.equal(applyUpdateItemFields(s, 'nope', { status: 'done' }).businesses[0].tasks[0].items[0].status, 'todo')
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npm test`
Expected: FAIL，`isCalendarDate` / `applyUpdateItemFields` 未导出。

- [ ] **Step 3: 写 lib 实现**

`src/lib/org/quadrant.ts` 末尾追加：

```ts
// ── 写入校验 ──────────────────────────────────────────────

export const ITEM_STATUSES: TaskItemStatus[] = ['todo', 'doing', 'blocked', 'done']

export interface ItemPatch {
  is_important?: boolean | null
  due_date?: string | null
  status?: TaskItemStatus
}

/**
 * 'YYYY-MM-DD'，是真实存在的日历日（拒绝 2026-02-30），且年份在 2000–2099。
 * 年份限制挡的是日期框改年份时逐键产生的 0002-10-20 这类合法但荒谬的值。
 */
export function isCalendarDate(s: string): boolean {
  if (!/^20\d{2}-\d{2}-\d{2}$/.test(s)) return false
  return new Date(utcMidnight(s)).toISOString().slice(0, 10) === s
}

/**
 * PATCH 入参里四象限相关的三个字段。只看这三个键，其余键（name/owner 由 updateItem 另行处理）忽略。
 * 出现即覆盖；null 表示清空（status 不可为 null）。
 */
export function validateItemPatch(input: unknown): { ok: true; value: ItemPatch } | { ok: false; message: string } {
  if (typeof input !== 'object' || input === null) return { ok: false, message: 'body must be an object' }
  const src = input as Record<string, unknown>
  const value: ItemPatch = {}
  if ('is_important' in src) {
    if (src.is_important !== null && typeof src.is_important !== 'boolean') {
      return { ok: false, message: 'is_important must be boolean or null' }
    }
    value.is_important = src.is_important as boolean | null
  }
  if ('due_date' in src) {
    if (src.due_date !== null && (typeof src.due_date !== 'string' || !isCalendarDate(src.due_date))) {
      return { ok: false, message: 'due_date must be YYYY-MM-DD or null' }
    }
    value.due_date = src.due_date as string | null
  }
  if ('status' in src) {
    if (!ITEM_STATUSES.includes(src.status as TaskItemStatus)) {
      return { ok: false, message: 'status must be one of todo/doing/blocked/done' }
    }
    value.status = src.status as TaskItemStatus
  }
  return { ok: true, value }
}

/**
 * 日期输入框的值 → 要提交的补丁。没填完（空串）或荒谬年份一律不提交；
 * 清空只走「清除」按钮，避免把已有截止日误清掉。
 */
export function dueInputToPatch(value: string): ItemPatch | null {
  return isCalendarDate(value) ? { due_date: value } : null
}
```

`src/lib/org/tree.ts` 顶部加：

```ts
import type { ItemPatch } from './quadrant.ts'
```

文件末尾追加：

```ts
export function applyUpdateItemFields(snapshot: OrgSnapshot, itemId: string, fields: ItemPatch): OrgSnapshot {
  return mapAllTasks(snapshot, (t) => ({
    ...t,
    items: t.items.map((it) => (it.id === itemId ? { ...it, ...fields } : it)),
  }))
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npm test`
Expected: PASS。

- [ ] **Step 5: 接到 service 与 route**

`src/lib/org/service.ts` 顶部 import 区加：

```ts
import { validateItemPatch } from './quadrant'
```

`updateItem` 改为（签名加 `quadrant?: unknown`，在 owner 处理之后、`db.update` 之前校验）：

```ts
export async function updateItem(
  userId: string, itemId: string,
  patch: {
    name?: string
    owner?: { member_type: MemberType; user_id: string | null; creator_id: string | null } | null
    /** 原始请求体：只取其中 is_important / due_date / status 三个键（见 validateItemPatch）。 */
    quadrant?: unknown
  },
): Promise<ServiceResult<{ id: string }>> {
  const forbidden = await requireAdmin(userId); if (forbidden) return { data: null, error: forbidden }
  const db = createServerClient()
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (patch.name !== undefined) {
    if (!patch.name.trim()) return err('invalid_input', 'name required')
    update.name = patch.name.trim()
  }
  if (patch.owner !== undefined) {
    if (patch.owner && !validatePersonRef(patch.owner)) return err('invalid_input', 'bad person ref')
    update.owner_member_type = patch.owner?.member_type ?? null
    update.owner_user_id     = patch.owner?.user_id ?? null
    update.owner_creator_id  = patch.owner?.creator_id ?? null
  }
  if (patch.quadrant !== undefined) {
    const checked = validateItemPatch(patch.quadrant)
    if (!checked.ok) return err('invalid_input', checked.message)
    Object.assign(update, checked.value)
  }
  const { error } = await db.from('task_items').update(update).eq('id', itemId)
  return error ? err('db_error', error.message) : ok({ id: itemId })
}
```

`src/app/api/org/items/[id]/route.ts` 的 PATCH 改为：

```ts
// PATCH /api/org/items/[id] — body { name?, owner?: {member_type,user_id,creator_id} | null,
//   is_important?: boolean|null, due_date?: 'YYYY-MM-DD'|null, status?: 'todo'|'doing'|'blocked'|'done' }
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await authGuard()
  if (user instanceof NextResponse) return user
  let body: { name?: string; owner?: { member_type: MemberType; user_id: string | null; creator_id: string | null } | null } & Record<string, unknown>
  try { body = await req.json() } catch { return NextResponse.json({ data: null, error: 'Invalid JSON body' }, { status: 400 }) }
  const result = await updateItem(user.id, params.id, { name: body.name, owner: body.owner, quadrant: body })
  if (result.error) return NextResponse.json({ data: null, error: result.error.message }, { status: httpStatusForError(result.error.code) })
  return NextResponse.json({ data: result.data, error: null })
}
```

- [ ] **Step 6: 跑检查**

Run: `npm test && npx tsc --noEmit && npm run test:lint`
Expected: PASS。

- [ ] **Step 7: Commit**

```bash
test "$(git branch --show-current)" = feat/org-quadrant-board
git add src/lib/org/quadrant.ts src/lib/org/quadrant.test.ts src/lib/org/tree.ts src/lib/org/tree.test.ts src/lib/org/service.ts "src/app/api/org/items/[id]/route.ts"
git commit -m "feat(org): 事项 PATCH 支持 重要/截止日/状态，含校验与本地快照更新

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: 页面状态上提（结构视图行为不变）

**Files:**
- Create: `src/components/org/useOrgSnapshot.ts`
- Create: `src/components/org/PersonPicker.tsx`
- Create: `src/components/org/OrgPageView.tsx`
- Modify: `src/components/org/OrgView.tsx`
- Modify: `src/app/[locale]/(app)/team/org/page.tsx`

**Interfaces:**
- Consumes: `applyUpdateItemFields`、`ItemPatch`（Task 4）
- Produces:
  - `useOrgSnapshot(initial: OrgSnapshot): { snapshot: OrgSnapshot; actions: OrgActions }`
  - `interface OrgActions { addTask; deleteTask; addItem; deleteItem; setBusinessOwner; setItemOwner; editTaskPositions; addMember; removeMember; updateItemFields(itemId: string, fields: ItemPatch): Promise<void> }`
  - `interface PickerRequest { title: string; allowClear: boolean; onSelect: (person: PersonOption | null) => void }`；`<PersonPicker request people onClose />`
  - `<OrgView snapshot actions onPick />`
  - `<OrgPageView initial />`（Task 7 再加 `today` 与视图切换）

- [ ] **Step 1: 新建 `useOrgSnapshot.ts`**

把 `OrgView.tsx` 里的 `refOf`、`api`、全部写操作原样搬过来，外加 `updateItemFields`：

```ts
'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import {
  applyAddTask, applyDeleteTask, applyAddItem, applyDeleteItem,
  applySetBusinessOwner, applySetItemOwner,
  applyAddMember, applyRemoveMember, applySetTaskPositions, applyUpdateItemFields,
} from '@/lib/org/tree'
import type { ItemPatch } from '@/lib/org/quadrant'
import type { OrgSnapshot, PersonOption } from '@/lib/types'

function refOf(person: PersonOption | null) {
  if (!person) return null
  return {
    member_type: person.member_type,
    user_id: person.member_type === 'user' ? person.id : null,
    creator_id: person.member_type === 'creator' ? person.id : null,
  }
}

export interface OrgActions {
  addTask: (businessId: string) => Promise<void>
  deleteTask: (taskId: string) => Promise<void>
  addItem: (taskId: string) => Promise<void>
  deleteItem: (itemId: string) => Promise<void>
  setBusinessOwner: (businessId: string, person: PersonOption | null) => Promise<void>
  setItemOwner: (itemId: string, person: PersonOption | null) => Promise<void>
  editTaskPositions: (taskId: string, currentIds: string[]) => void
  addMember: (positionId: string, person: PersonOption) => Promise<void>
  removeMember: (positionId: string, memberId: string) => Promise<void>
  updateItemFields: (itemId: string, fields: ItemPatch) => Promise<void>
}

/** 业务分工页的共享快照与写入封装：「结构」「四象限」两个视图共用，任一视图改完另一个立即可见。 */
export function useOrgSnapshot(initial: OrgSnapshot): { snapshot: OrgSnapshot; actions: OrgActions } {
  const t = useTranslations('team')
  const [snapshot, setSnapshot] = useState<OrgSnapshot>(initial)

  // 写 /api/org/*：成功返回受影响行 { id }；失败（网络异常 / 非 2xx）弹出服务端
  // 原因并返回 null —— 拒绝的写入不会被静默吞掉。调用方拿返回的 id 直接就地更新
  // 本地快照，不再依赖一次可能失败的整表 GET /api/org，从而做到「改完即时可见」。
  const api = async (path: string, method: string, body?: unknown): Promise<{ id: string } | null> => {
    try {
      const res = await fetch(`/api/org${path}`, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
      })
      const json = await res.json().catch(() => null)
      if (!res.ok) {
        console.error('Org write failed:', path, method, res.status, json?.error)
        window.alert(t('org.saveFailed') + (json?.error ? `: ${json.error}` : ` (${res.status})`))
        return null
      }
      return (json?.data as { id: string }) ?? null
    } catch (e) {
      console.error('Org write failed:', path, method, e)
      window.alert(t('org.saveFailed') + `: ${e instanceof Error ? e.message : String(e)}`)
      return null
    }
  }

  const addTask = async (businessId: string) => {
    const name = window.prompt(t('org.addTask'))
    if (!name?.trim()) return
    const res = await api(`/businesses/${businessId}/tasks`, 'POST', { name })
    if (res) setSnapshot((s) => applyAddTask(s, businessId, res.id, name.trim()))
  }
  const deleteTask = async (taskId: string) => {
    if (!window.confirm(t('org.confirmDelete'))) return
    if (await api(`/tasks/${taskId}`, 'DELETE')) setSnapshot((s) => applyDeleteTask(s, taskId))
  }
  const addItem = async (taskId: string) => {
    const name = window.prompt(t('org.addItem'))
    if (!name?.trim()) return
    const res = await api(`/tasks/${taskId}/items`, 'POST', { name })
    if (res) setSnapshot((s) => applyAddItem(s, taskId, res.id, name.trim()))
  }
  const deleteItem = async (itemId: string) => {
    if (!window.confirm(t('org.confirmDelete'))) return
    if (await api(`/items/${itemId}`, 'DELETE')) setSnapshot((s) => applyDeleteItem(s, itemId))
  }
  const setBusinessOwner = async (businessId: string, person: PersonOption | null) => {
    if (await api(`/businesses/${businessId}`, 'PATCH', { owner: refOf(person) })) setSnapshot((s) => applySetBusinessOwner(s, businessId, person))
  }
  const setItemOwner = async (itemId: string, person: PersonOption | null) => {
    if (await api(`/items/${itemId}`, 'PATCH', { owner: refOf(person) })) setSnapshot((s) => applySetItemOwner(s, itemId, person))
  }
  const setTaskPositions = async (taskId: string, positionIds: string[]) => {
    if (await api(`/tasks/${taskId}/positions`, 'PUT', { positionIds })) setSnapshot((s) => applySetTaskPositions(s, taskId, positionIds))
  }
  const editTaskPositions = (taskId: string, currentIds: string[]) => {
    const lines = snapshot.positions.map((p, i) => `${i + 1}. ${p.name}`).join('\n')
    const current = currentIds
      .map((pid) => snapshot.positions.findIndex((p) => p.id === pid) + 1)
      .filter((n) => n > 0)
      .join(',')
    const raw = window.prompt(`${t('org.editPositions')}\n${lines}`, current)
    if (raw === null) return
    const ids = raw
      .split(',')
      .map((s) => Number(s.trim()))
      .filter((n) => n >= 1 && n <= snapshot.positions.length)
      .map((n) => snapshot.positions[n - 1].id)
    setTaskPositions(taskId, ids)
  }
  const addMember = async (positionId: string, person: PersonOption) => {
    const body = refOf(person)
    if (!body) return
    const res = await api(`/positions/${positionId}/members`, 'POST', body)
    if (res) setSnapshot((s) => applyAddMember(s, positionId, res.id, person))
  }
  const removeMember = async (positionId: string, memberId: string) => {
    if (!window.confirm(t('org.confirmDelete'))) return
    if (await api(`/positions/${positionId}/members/${memberId}`, 'DELETE')) setSnapshot((s) => applyRemoveMember(s, positionId, memberId))
  }
  const updateItemFields = async (itemId: string, fields: ItemPatch) => {
    if (await api(`/items/${itemId}`, 'PATCH', fields)) setSnapshot((s) => applyUpdateItemFields(s, itemId, fields))
  }

  return {
    snapshot,
    actions: {
      addTask, deleteTask, addItem, deleteItem, setBusinessOwner, setItemOwner,
      editTaskPositions, addMember, removeMember, updateItemFields,
    },
  }
}
```

- [ ] **Step 2: 新建 `PersonPicker.tsx`**

把 `OrgView.tsx` 末尾 `{picker && ( <Modal …> … </Modal> )}` 整块搬过来：

```tsx
'use client'

import { useTranslations } from 'next-intl'
import Modal from '@/components/ui/Modal'
import Tag from '@/components/ui/Tag'
import type { PersonOption } from '@/lib/types'

export interface PickerRequest {
  title: string
  allowClear: boolean
  onSelect: (person: PersonOption | null) => void
}

export default function PersonPicker({ request, people, onClose }: {
  request: PickerRequest
  people: PersonOption[]
  onClose: () => void
}) {
  const t = useTranslations('team')
  return (
    <Modal open onClose={onClose} title={request.title}>
      <div className="space-y-1.5">
        {request.allowClear && (
          <button
            type="button"
            onClick={() => { request.onSelect(null); onClose() }}
            className="w-full text-left flex items-center px-3 py-2.5 rounded-field border border-line text-sm text-ink-500 hover:bg-line-soft hover:border-line-strong transition-colors"
          >
            {t('org.clearOwner')}
          </button>
        )}
        {people.map((p) => (
          <button
            key={`${p.member_type}:${p.id}`}
            type="button"
            onClick={() => { request.onSelect(p); onClose() }}
            className="w-full text-left flex items-center gap-2 px-3 py-2.5 rounded-field border border-line text-sm text-ink-700 hover:bg-line-soft hover:border-line-strong transition-colors"
          >
            <Tag
              size="sm"
              tone={p.member_type === 'creator' ? 'violet' : 'neutral'}
              label={p.member_type === 'creator' ? t('org.sourceCreator') : t('org.sourceUser')}
            />
            <span className="font-medium text-ink-900">{p.name}</span>
          </button>
        ))}
        {people.length === 0 && (
          <p className="py-6 text-center text-sm text-ink-400">{t('org.empty')}</p>
        )}
      </div>
    </Modal>
  )
}
```

逐字对照 `OrgView.tsx` 原块（第 242–273 行左右），类名与结构必须一致，只把 `picker` → `request`、`setPicker(null)` → `onClose()`、`snapshot.people` → `people`。

- [ ] **Step 3: 改 `OrgView.tsx`**

1. 删掉：`useState` import、`Modal` import、`apply*` import、`PickerState`、`refOf`、组件内的 `useState<OrgSnapshot>`、`picker` state、`api` 和全部写操作函数（`addTask` 到 `removeMember`），以及文件末尾的 `{picker && (<Modal …>…</Modal>)}` 整块。
2. import 区加：

```ts
import type { PickerRequest } from './PersonPicker'
import type { OrgActions } from './useOrgSnapshot'
```

（`import type { OrgSnapshot, PersonOption } from '@/lib/types'` 保留，`PersonOption` 若不再使用就删掉。）
3. 组件签名改为：

```tsx
export default function OrgView({ snapshot, actions, onPick }: {
  snapshot: OrgSnapshot
  actions: OrgActions
  onPick: (request: PickerRequest) => void
}) {
  const t = useTranslations('team')
  const canEdit = snapshot.canEdit
  const posName = (id: string) => snapshot.positions.find((p) => p.id === id)?.name ?? id
```

4. JSX 里逐处替换（只换调用方，不动结构和类名）：
   - `setPicker({` → `onPick({`（3 处：业务负责人、事项负责人、添加成员）
   - `setBusinessOwner(b.id, p)` → `actions.setBusinessOwner(b.id, p)`
   - `setItemOwner(it.id, p)` → `actions.setItemOwner(it.id, p)`
   - `addMember(p.id, person)` → `actions.addMember(p.id, person)`
   - `editTaskPositions(` → `actions.editTaskPositions(`
   - `deleteTask(` → `actions.deleteTask(`、`deleteItem(` → `actions.deleteItem(`
   - `addItem(` → `actions.addItem(`、`addTask(` → `actions.addTask(`
   - `removeMember(` → `actions.removeMember(`

- [ ] **Step 4: 新建 `OrgPageView.tsx`**

```tsx
'use client'

import { useState } from 'react'
import OrgView from './OrgView'
import PersonPicker, { type PickerRequest } from './PersonPicker'
import { useOrgSnapshot } from './useOrgSnapshot'
import type { OrgSnapshot } from '@/lib/types'

/** 业务分工页的客户端根：持有共享快照与选人弹窗，分发给各视图。 */
export default function OrgPageView({ initial }: { initial: OrgSnapshot }) {
  const { snapshot, actions } = useOrgSnapshot(initial)
  const [picker, setPicker] = useState<PickerRequest | null>(null)
  return (
    <>
      <OrgView snapshot={snapshot} actions={actions} onPick={setPicker} />
      {picker && <PersonPicker request={picker} people={snapshot.people} onClose={() => setPicker(null)} />}
    </>
  )
}
```

- [ ] **Step 5: 改 page**

`src/app/[locale]/(app)/team/org/page.tsx`：`import OrgView from '@/components/org/OrgView'` 换成 `import OrgPageView from '@/components/org/OrgPageView'`，`<OrgView initial={snapshot} />` 换成 `<OrgPageView initial={snapshot} />`。

- [ ] **Step 6: 跑检查**

Run: `npx tsc --noEmit && npm test && npm run test:copy`
Expected: PASS（`test:copy` = i18n + no-bare-han + style + lint）。再 `grep -n "useState\|fetch(" src/components/org/OrgView.tsx`，Expected：无输出。

- [ ] **Step 7: Commit**

```bash
test "$(git branch --show-current)" = feat/org-quadrant-board
git add src/components/org "src/app/[locale]/(app)/team/org/page.tsx"
git commit -m "refactor(org): 业务分工页快照与写入上提到 OrgPageView，结构视图行为不变

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: 文案与详情面板

**Files:**
- Modify: `messages/zh.json`、`messages/en.json`、`messages/ja.json`（`team.org`）
- Create: `src/components/org/ItemDetailPanel.tsx`

**Interfaces:**
- Consumes: `QuadrantRow`、`ItemPatch`、`URGENT_WITHIN_DAYS`、`daysUntil`、`isUrgent`、`dueInputToPatch`（Task 2–4）
- Produces: `<ItemDetailPanel row today canEdit positionName onClose onUpdate onPickOwner />`；`team.org.*` 新键（Task 7 也用）

- [ ] **Step 1: 加文案**

在三个文件的 `team.org` 对象里，`"saveFailed"` 之后追加下列键（三语键名完全一致）：

| 键 | zh | en | ja |
| --- | --- | --- | --- |
| `viewLabel` | 视图 | View | 表示 |
| `viewQuadrant` | 四象限 | Quadrants | 四象限 |
| `viewStructure` | 结构 | Structure | 構造 |
| `q1Title` | 立即做 | Do now | 今すぐやる |
| `q1Sub` | 重要 · 紧急 | Important · Urgent | 重要・緊急 |
| `q2Title` | 排进计划 | Schedule | 計画に入れる |
| `q2Sub` | 重要 · 不紧急 | Important · Not urgent | 重要・緊急でない |
| `q3Title` | 速办或转交 | Quick or delegate | すぐ片付けるか任せる |
| `q3Sub` | 紧急 · 不重要 | Urgent · Not important | 緊急・重要でない |
| `q4Title` | 放一放 | Later | 後回し |
| `q4Sub` | 不重要 · 不紧急 | Not important · Not urgent | 重要でない・緊急でない |
| `axisUrgent` | 紧急 | Urgent | 緊急 |
| `axisNotUrgent` | 不紧急 | Not urgent | 緊急でない |
| `axisImportant` | 重要 | Important | 重要 |
| `axisNotImportant` | 不重要 | Not important | 重要でない |
| `unratedTitle` | 待评估 | To assess | 未評価 |
| `unratedHint` | 还没标重要与否，标了才进象限 | Not marked yet — mark importance to place it | 重要かどうか未設定。設定すると象限に入ります |
| `doneTitle` | 已完成 | Done | 完了 |
| `show` | 展开 | Show | 表示 |
| `hide` | 收起 | Hide | 閉じる |
| `statOpen` | 未完成 | Open | 未完了 |
| `statOverdue` | 逾期 | Overdue | 期限切れ |
| `statBlocked` | 卡住 | Blocked | 停滞 |
| `statUnassigned` | 未指派 | Unassigned | 未割当 |
| `filterCountHint` | 数字 = 未完成事项 | Counts = open items | 数字＝未完了の事項 |
| `mobileSummary` | 未完成 {open} 项 · 逾期 {overdue} · 卡住 {blocked} | {open} open · {overdue} overdue · {blocked} blocked | 未完了 {open} 件・期限切れ {overdue}・停滞 {blocked} |
| `alertOverdue` | 逾期 {count} | {count} overdue | 期限切れ {count} |
| `alertBlocked` | 卡住 {count} | {count} blocked | 停滞 {count} |
| `noOverdue` | 无逾期 | Nothing overdue | 期限切れなし |
| `countItems` | {count} 项 | {count} items | {count} 件 |
| `emptyQuadrant` | 这一格没有事项 | Nothing here | この象限には事項がありません |
| `dueOverdue` | 逾期 {days} 天 | {days}d overdue | {days}日超過 |
| `dueToday` | 今天到期 | Due today | 今日まで |
| `dueSoon` | {date} · 剩 {days} 天 | {date} · {days}d left | {date}・残り{days}日 |
| `dueNone` | 未设截止日，不算紧急 | No due date — not urgent | 期限なし（緊急ではない） |
| `dueLeft` | 还剩 {days} 天 | {days} days left | 残り{days}日 |
| `dueOverdueLong` | 已逾期 {days} 天 | {days} days overdue | {days}日超過 |
| `detailTitle` | 事项详情 | Item details | 事項の詳細 |
| `important` | 重要 | Important | 重要 |
| `importantYes` | 是 | Yes | はい |
| `importantNo` | 否 | No | いいえ |
| `dueDate` | 截止日 | Due date | 期限 |
| `clear` | 清除 | Clear | クリア |
| `urgencyRule` | 紧急按截止日自动判断：{days} 天内到期或已逾期算紧急 | Urgency follows the due date: due within {days} days or overdue counts as urgent | 緊急かどうかは期限で自動判定：{days}日以内または期限切れなら緊急 |
| `status` | 状态 | Status | 状態 |
| `statusTodo` | 未开始 | To do | 未着手 |
| `statusDoing` | 进行中 | In progress | 進行中 |
| `statusBlocked` | 卡住 | Blocked | 停滞 |
| `statusDone` | 已完成 | Done | 完了 |
| `change` | 更换 | Change | 変更 |

Run: `npm run test:i18n`
Expected: PASS。

- [ ] **Step 2: 新建 `ItemDetailPanel.tsx`**

```tsx
'use client'

import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useTranslations } from 'next-intl'
import { X } from 'lucide-react'
import SegmentedControl from '@/components/ui/SegmentedControl'
import Tag from '@/components/ui/Tag'
import { lockViewportScroll } from '@/lib/ui/scrollLock'
import { URGENT_WITHIN_DAYS, daysUntil, dueInputToPatch, isUrgent } from '@/lib/org/quadrant'
import type { ItemPatch, QuadrantRow } from '@/lib/org/quadrant'
import type { TaskItemStatus } from '@/lib/types'

type Importance = 'yes' | 'no' | 'unrated'
const toImportance = (v: boolean | null): Importance => (v === null ? 'unrated' : v ? 'yes' : 'no')
const fromImportance = (v: string): boolean | null => (v === 'yes' ? true : v === 'no' ? false : null)
const STATUSES: TaskItemStatus[] = ['todo', 'doing', 'blocked', 'done']

interface Props {
  row: QuadrantRow
  today: string
  canEdit: boolean
  positionName: (id: string) => string
  onClose: () => void
  onUpdate: (fields: ItemPatch) => void
  onPickOwner: () => void
}

// 侧向上下文面板：≥768px 贴右的抽屉，<768px 贴底的面板。层级 z-50 与
// DiscussionPanel / SalaryManager 抽屉同类（选人弹窗 Modal 是 z-60，会盖在上面）。
// 无 aria-modal：没有 Modal.tsx 那套焦点圈定，role="dialog" + aria-label + Escape
// 是不夸大能力的诚实子集（同 DiscussionPanel 的说明）。
export default function ItemDetailPanel({ row, today, canEdit, positionName, onClose, onUpdate, onPickOwner }: Props) {
  const t = useTranslations('team')
  const tCommon = useTranslations('common')

  useEffect(() => lockViewportScroll(), [])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const statusLabel = (s: TaskItemStatus) =>
    s === 'todo' ? t('org.statusTodo') : s === 'doing' ? t('org.statusDoing') : s === 'blocked' ? t('org.statusBlocked') : t('org.statusDone')
  const importanceLabel = (v: Importance) =>
    v === 'yes' ? t('org.importantYes') : v === 'no' ? t('org.importantNo') : t('org.unratedTitle')
  const dueHint = (() => {
    if (!row.due_date) return t('org.dueNone')
    const d = daysUntil(row.due_date, today)
    return d < 0 ? t('org.dueOverdueLong', { days: -d }) : t('org.dueLeft', { days: d })
  })()
  const urgent = row.status !== 'done' && isUrgent(row, today)

  return createPortal(
    <div className="fixed inset-0 z-50">
      <button
        type="button"
        aria-label={tCommon('close')}
        onClick={onClose}
        className="absolute inset-0 w-full h-full bg-ink-900/30 cursor-default"
      />
      <div
        role="dialog"
        aria-label={t('org.detailTitle')}
        className="absolute inset-x-0 bottom-0 max-h-[85vh] overflow-y-auto rounded-t-card bg-surface shadow-pop px-5 pt-3 md:inset-y-0 md:left-auto md:right-0 md:w-[400px] md:max-h-none md:rounded-none md:pt-5"
        style={{ paddingBottom: 'calc(1.5rem + env(safe-area-inset-bottom))' }}
      >
        <span aria-hidden className="block mx-auto mb-3 h-1 w-9 rounded-btn bg-line-strong md:hidden" />
        <div className="flex items-start justify-between gap-3">
          <p className="min-w-0 truncate text-xs text-ink-500">{row.businessName} › {row.taskName}</p>
          <button
            type="button"
            aria-label={tCommon('close')}
            onClick={onClose}
            className="flex-none -mr-2 -mt-2 w-11 h-11 inline-flex items-center justify-center rounded-btn text-ink-500 hover:bg-line-soft focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-ring"
          >
            <X className="w-4 h-4" strokeWidth={1.5} />
          </button>
        </div>
        <h2 className="mt-1 text-lg font-semibold leading-snug text-ink-900">{row.name}</h2>
        {!canEdit && <p className="mt-1 text-xs text-ink-400">{t('org.readonlyHint')}</p>}

        <dl className="mt-5 grid grid-cols-[72px_minmax(0,1fr)] items-center gap-x-3 gap-y-4 text-sm">
          <dt className="text-ink-500">{t('org.important')}</dt>
          <dd>
            {canEdit ? (
              <SegmentedControl
                label={t('org.important')}
                value={toImportance(row.is_important)}
                onChange={(v) => onUpdate({ is_important: fromImportance(v) })}
                items={(['yes', 'no', 'unrated'] as Importance[]).map((v) => ({ value: v, label: importanceLabel(v) }))}
              />
            ) : (
              <span className="text-ink-700">{importanceLabel(toImportance(row.is_important))}</span>
            )}
          </dd>

          <dt className="text-ink-500">{t('org.dueDate')}</dt>
          <dd className="flex flex-wrap items-center gap-2">
            {canEdit ? (
              <>
                {/* 失焦才提交：改年份时浏览器会逐键给出 0002-10-20 这类值，边打边存会写坏数据。
                    key 随 due_date 变，外部清除后输入框跟着重置。 */}
                <input
                  key={row.due_date ?? 'none'}
                  type="date"
                  aria-label={t('org.dueDate')}
                  defaultValue={row.due_date ?? ''}
                  onBlur={(e) => {
                    const patch = dueInputToPatch(e.target.value)
                    if (patch && patch.due_date !== row.due_date) onUpdate(patch)
                  }}
                  className="h-9 px-2.5 rounded-field border border-line bg-surface text-sm text-ink-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-ring"
                />
                {row.due_date && (
                  <button type="button" onClick={() => onUpdate({ due_date: null })} className="text-xs text-primary hover:text-primary-hover">
                    {t('org.clear')}
                  </button>
                )}
              </>
            ) : (
              <span className="tabular-nums text-ink-700">{row.due_date ?? '—'}</span>
            )}
            <span className={`w-full text-xs ${urgent ? 'font-semibold text-danger-text' : 'text-ink-500'}`}>{dueHint}</span>
          </dd>

          <dt className="text-ink-500">{t('org.axisUrgent')}</dt>
          <dd className="text-xs text-ink-500">{t('org.urgencyRule', { days: URGENT_WITHIN_DAYS })}</dd>

          <dt className="text-ink-500">{t('org.status')}</dt>
          <dd>
            {canEdit ? (
              <SegmentedControl
                label={t('org.status')}
                value={row.status}
                onChange={(v) => onUpdate({ status: v as TaskItemStatus })}
                items={STATUSES.map((s) => ({ value: s, label: statusLabel(s) }))}
              />
            ) : (
              <span className="text-ink-700">{statusLabel(row.status)}</span>
            )}
          </dd>

          <dt className="text-ink-500">{t('org.owner')}</dt>
          <dd className="flex items-center gap-2 min-w-0">
            <span className={`truncate ${row.ownerKey === 'none' ? 'font-semibold text-warning-text' : 'text-ink-900'}`}>
              {row.ownerName ?? t('org.statUnassigned')}
            </span>
            {canEdit && (
              <button type="button" onClick={onPickOwner} className="ml-auto flex-none text-xs text-primary hover:text-primary-hover">
                {t('org.change')}
              </button>
            )}
          </dd>

          <dt className="text-ink-500">{t('org.positions')}</dt>
          <dd className="flex flex-wrap gap-1.5">
            {row.positionIds.length === 0
              ? <span className="text-xs text-ink-400">{t('org.empty')}</span>
              : row.positionIds.map((id) => <Tag key={id} size="sm" tone="neutral" label={positionName(id)} />)}
          </dd>
        </dl>
      </div>
    </div>,
    document.body,
  )
}
```

- [ ] **Step 3: 跑检查**

Run: `npx tsc --noEmit && npm run test:copy`
Expected: PASS。面板在 Task 7 才挂进页面，这一步只验编译与门禁。

- [ ] **Step 4: Commit**

```bash
test "$(git branch --show-current)" = feat/org-quadrant-board
git add messages/zh.json messages/en.json messages/ja.json src/components/org/ItemDetailPanel.tsx
git commit -m "feat(org): 四象限文案（中英日）与事项详情面板

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: 四象限视图与视图切换

**Files:**
- Create: `src/components/org/searchParams.ts`
- Create: `src/components/org/OwnerFilter.tsx`
- Create: `src/components/org/QuadrantView.tsx`
- Modify: `src/components/org/OrgPageView.tsx`
- Modify: `src/app/[locale]/(app)/team/org/page.tsx`

**Interfaces:**
- Consumes: Task 2–6 全部导出；`Stat`、`StatBand`（`@/components/ui/Stat`）；`SegmentedControl`
- Produces: `writeSearchParams(next: Record<string, string | null>, mode: 'push' | 'replace'): void`；`<OwnerFilter options value onChange scroll? />`；`<QuadrantView snapshot today onUpdateItem onPickOwner />`；`<OrgPageView initial today />`

- [ ] **Step 1: 新建 `searchParams.ts`**

```ts
// 改 URL 查询参数但不触发服务端重取：Next 14.2 会把 history.pushState / replaceState
// 同步到 useSearchParams。push 留历史（手机层级，系统返回手势能回首层），
// replace 不留（筛选、视图切换，避免点十次筛选要按十次返回）。
export function writeSearchParams(next: Record<string, string | null>, mode: 'push' | 'replace'): void {
  const sp = new URLSearchParams(window.location.search)
  for (const [key, value] of Object.entries(next)) {
    if (value === null) sp.delete(key)
    else sp.set(key, value)
  }
  const qs = sp.toString()
  const url = `${window.location.pathname}${qs ? `?${qs}` : ''}`
  if (mode === 'push') window.history.pushState(null, '', url)
  else window.history.replaceState(null, '', url)
}
```

- [ ] **Step 2: 新建 `OwnerFilter.tsx`**

```tsx
'use client'

import { useTranslations } from 'next-intl'
import type { OwnerFilter as OwnerFilterValue, OwnerOption } from '@/lib/org/quadrant'

/** 负责人筛选条。scroll=true（手机）时单行横滑、按钮高 44px；否则换行排列。 */
export default function OwnerFilter({ options, value, onChange, scroll = false }: {
  options: OwnerOption[]
  value: OwnerFilterValue
  onChange: (value: OwnerFilterValue) => void
  scroll?: boolean
}) {
  const t = useTranslations('team')
  const tCommon = useTranslations('common')
  const label = (o: OwnerOption) =>
    o.key === 'all' ? tCommon('all') : o.key === 'none' ? t('org.statUnassigned') : (o.name || '—')

  return (
    <div
      role="group"
      aria-label={t('org.owner')}
      className={scroll ? '-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1' : 'flex flex-wrap items-center gap-1.5'}
    >
      {options.map((o) => {
        const on = o.key === value
        return (
          <button
            key={o.key}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(o.key)}
            className={`flex-none inline-flex items-center gap-1.5 rounded-btn border text-xs transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-ring ${
              scroll ? 'h-11 px-3.5' : 'h-8 px-3'
            } ${on ? 'border-primary-border bg-primary-soft text-primary-hover' : 'border-line bg-surface text-ink-700 hover:border-line-strong'}`}
          >
            {label(o)}
            <span className="font-semibold tabular-nums opacity-70">{o.count}</span>
          </button>
        )
      })}
    </div>
  )
}
```

- [ ] **Step 3: 新建 `QuadrantView.tsx`**

```tsx
'use client'

import { useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Stat, StatBand } from '@/components/ui/Stat'
import ItemDetailPanel from './ItemDetailPanel'
import OwnerFilter from './OwnerFilter'
import { writeSearchParams } from './searchParams'
import {
  QUADRANTS, URGENT_WITHIN_DAYS, dueBadge, flattenItems, groupItems, ownerOptions,
  parseLevel, parseOwnerFilter, quadrantStats,
} from '@/lib/org/quadrant'
import type { Bucket, DueBadge, ItemPatch, OwnerFilter as OwnerFilterValue, Quadrant, QuadrantRow } from '@/lib/org/quadrant'
import type { OrgSnapshot } from '@/lib/types'

// 四格色调：① danger ② info ③ warning ④ muted（spec 6.2）。整串类名写死，Tailwind 才扫得到。
const TONE: Record<Quadrant, { dot: string; text: string; tile: string }> = {
  q1: { dot: 'bg-danger-dot', text: 'text-danger-text', tile: 'border-danger-border bg-danger-soft' },
  q2: { dot: 'bg-info-dot', text: 'text-info-text', tile: 'border-info-border bg-info-soft' },
  q3: { dot: 'bg-warning-dot', text: 'text-warning-text', tile: 'border-warning-border bg-surface' },
  q4: { dot: 'bg-muted-dot', text: 'text-muted-text', tile: 'border-line bg-surface' },
}
const BADGE_TONE: Record<DueBadge['tone'], string> = {
  danger: 'bg-danger-soft text-danger-text',
  warning: 'bg-warning-soft text-warning-text',
  muted: 'bg-muted-soft text-muted-text',
}
const FOCUS = 'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-ring'

interface Props {
  snapshot: OrgSnapshot
  today: string
  onUpdateItem: (itemId: string, fields: ItemPatch) => void
  onPickOwner: (itemId: string) => void
}

export default function QuadrantView({ snapshot, today, onUpdateItem, onPickOwner }: Props) {
  const t = useTranslations('team')
  const params = useSearchParams()
  const rows = useMemo(() => flattenItems(snapshot), [snapshot])
  const owner = parseOwnerFilter(params.get('owner'), rows)
  const level = parseLevel(params.get('q'))
  const groups = useMemo(() => groupItems(rows, today, owner), [rows, today, owner])
  const stats = quadrantStats(groups, today)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [doneOpen, setDoneOpen] = useState(false)
  // 本页内从首层点进来的才用 history.back()；直接打开带 ?q= 的链接时，返回要留在本页。
  const pushedLevel = useRef(false)
  // 按 id 找、不按格内位置找：改完重要/截止日后事项会换格，面板跟着这个事项走。
  const selected = selectedId ? rows.find((r) => r.id === selectedId) ?? null : null
  const positionName = (id: string) => snapshot.positions.find((p) => p.id === id)?.name ?? id

  const setOwner = (v: OwnerFilterValue) => writeSearchParams({ owner: v === 'all' ? null : v }, 'replace')
  const openLevel = (b: Bucket) => { pushedLevel.current = true; writeSearchParams({ q: b }, 'push') }
  const backHome = () => {
    if (pushedLevel.current) { pushedLevel.current = false; window.history.back() }
    else writeSearchParams({ q: null }, 'replace')
  }

  const title = (b: Bucket) =>
    b === 'q1' ? t('org.q1Title') : b === 'q2' ? t('org.q2Title') : b === 'q3' ? t('org.q3Title')
      : b === 'q4' ? t('org.q4Title') : b === 'unrated' ? t('org.unratedTitle') : t('org.doneTitle')
  const sub = (q: Quadrant) =>
    q === 'q1' ? t('org.q1Sub') : q === 'q2' ? t('org.q2Sub') : q === 'q3' ? t('org.q3Sub') : t('org.q4Sub')
  const dueText = (b: DueBadge) =>
    b.kind === 'overdue' ? t('org.dueOverdue', { days: b.days })
      : b.kind === 'today' ? t('org.dueToday')
        : b.kind === 'soon' ? t('org.dueSoon', { date: b.date, days: b.days })
          : b.date
  const ownerLabel = (row: QuadrantRow) => row.ownerName ?? t('org.statUnassigned')

  const badges = (row: QuadrantRow) => {
    const due = dueBadge(row, today)
    return (
      <span className="inline-flex flex-none items-center gap-1">
        {row.status === 'blocked' && (
          <span className="rounded-btn bg-danger-soft px-1.5 py-px text-micro font-semibold text-danger-text">{t('org.statusBlocked')}</span>
        )}
        {due && (
          <span className={`whitespace-nowrap rounded-btn px-1.5 py-px text-micro font-semibold tabular-nums ${BADGE_TONE[due.tone]}`}>{dueText(due)}</span>
        )}
      </span>
    )
  }

  // ── 桌面 ────────────────────────────────────────────────
  const desktopRow = (row: QuadrantRow) => (
    <li key={row.id}>
      <button
        type="button"
        onClick={() => setSelectedId(row.id)}
        title={`${row.businessName} › ${row.taskName}`}
        className={`flex w-full items-center gap-2.5 rounded-field px-2 py-2 text-left text-sm hover:bg-row-hover ${FOCUS}`}
      >
        <span className={`min-w-0 flex-1 truncate ${row.status === 'done' ? 'text-ink-500 line-through' : 'text-ink-900'}`}>{row.name}</span>
        <span className={`max-w-[7rem] flex-none truncate text-xs ${row.ownerKey === 'none' ? 'font-semibold text-warning-text' : 'text-ink-500'}`}>{ownerLabel(row)}</span>
        {badges(row)}
      </button>
    </li>
  )

  const quadrantCard = (q: Quadrant) => (
    <section key={q} aria-label={title(q)} className="flex h-[420px] min-h-0 flex-col rounded-card border border-line bg-surface shadow-card">
      <header className="flex items-center gap-2 border-b border-line-soft px-4 py-3">
        <span aria-hidden className={`h-2 w-2 rounded-full ${TONE[q].dot}`} />
        <h3 className={`text-md font-semibold ${TONE[q].text}`}>{title(q)}</h3>
        <span className="text-xs text-ink-500">{sub(q)}</span>
        <span className="ml-auto rounded-btn bg-line-soft px-2 py-px text-xs font-semibold tabular-nums text-ink-700">{groups[q].length}</span>
      </header>
      {groups[q].length === 0
        ? <p className="m-auto text-xs text-ink-400">{t('org.emptyQuadrant')}</p>
        : <ul className="min-h-0 flex-1 overflow-y-auto p-2">{groups[q].map(desktopRow)}</ul>}
    </section>
  )

  const desktop = (
    <div className="hidden flex-col gap-4 md:flex">
      <StatBand>
        <Stat label={t('org.statOpen')} value={stats.open} />
        <Stat label={t('org.statOverdue')} value={stats.overdue} tone={stats.overdue ? 'danger' : 'default'} />
        <Stat label={t('org.statBlocked')} value={stats.blocked} tone={stats.blocked ? 'danger' : 'default'} />
        <Stat label={t('org.unratedTitle')} value={stats.unrated} />
        <Stat label={t('org.statUnassigned')} value={stats.unassigned} />
      </StatBand>

      <div className="flex flex-wrap items-center gap-3 rounded-card border border-line bg-surface px-4 py-3">
        <span className="text-xs text-ink-500">{t('org.owner')}</span>
        <OwnerFilter options={ownerOptions(rows, today, 'open')} value={owner} onChange={setOwner} />
        <span className="ml-auto text-xs text-ink-400">{t('org.filterCountHint')}</span>
      </div>

      <div className="grid grid-cols-[1.5rem_minmax(0,1fr)_minmax(0,1fr)] gap-3">
        <span />
        <span className="text-center text-xs font-semibold text-ink-700">{t('org.axisUrgent')}</span>
        <span className="text-center text-xs font-semibold text-ink-500">{t('org.axisNotUrgent')}</span>
        <span className="self-center justify-self-center text-xs font-semibold tracking-widest text-ink-700 [writing-mode:vertical-rl]">{t('org.axisImportant')}</span>
        {quadrantCard('q1')}
        {quadrantCard('q2')}
        <span className="self-center justify-self-center text-xs font-semibold tracking-widest text-ink-500 [writing-mode:vertical-rl]">{t('org.axisNotImportant')}</span>
        {quadrantCard('q3')}
        {quadrantCard('q4')}
      </div>

      <section aria-label={t('org.unratedTitle')} className="rounded-card border border-dashed border-line-strong bg-surface p-4">
        <div className="flex flex-wrap items-baseline gap-2">
          <h3 className="text-sm font-semibold text-ink-900">{t('org.unratedTitle')} <span className="tabular-nums">{groups.unrated.length}</span></h3>
          <span className="text-xs text-ink-500">{t('org.unratedHint')}</span>
        </div>
        {groups.unrated.length > 0 && (
          <ul className="mt-3 flex flex-wrap gap-2">
            {groups.unrated.map((row) => (
              <li key={row.id}>
                <button
                  type="button"
                  onClick={() => setSelectedId(row.id)}
                  className={`inline-flex h-8 items-center gap-1.5 rounded-btn bg-line-soft px-3 text-xs text-ink-900 hover:bg-row-hover ${FOCUS}`}
                >
                  <span className="max-w-[16rem] truncate">{row.name}</span>
                  <span className={row.ownerKey === 'none' ? 'font-semibold text-warning-text' : 'text-ink-500'}>{ownerLabel(row)}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-label={t('org.doneTitle')} className="rounded-card border border-line bg-surface">
        <button
          type="button"
          aria-expanded={doneOpen}
          onClick={() => setDoneOpen((v) => !v)}
          className={`flex w-full items-center gap-2 rounded-card px-4 py-3 text-left text-sm ${FOCUS}`}
        >
          <span aria-hidden className="h-2 w-2 rounded-full bg-success-dot" />
          <span className="font-semibold text-ink-900">{t('org.doneTitle')}</span>
          <span className="font-semibold tabular-nums text-success-text">{groups.done.length}</span>
          <span className="ml-auto text-xs text-primary">{doneOpen ? t('org.hide') : t('org.show')}</span>
        </button>
        {doneOpen && groups.done.length > 0 && <ul className="px-2 pb-2">{groups.done.map(desktopRow)}</ul>}
      </section>
    </div>
  )

  // ── 手机 ────────────────────────────────────────────────
  const tile = (q: Quadrant) => {
    const list = groups[q]
    const late = list.filter((r) => dueBadge(r, today)?.kind === 'overdue').length
    const blocked = list.filter((r) => r.status === 'blocked').length
    const alerts = [
      late ? t('org.alertOverdue', { count: late }) : null,
      blocked ? t('org.alertBlocked', { count: blocked }) : null,
    ].filter(Boolean).join(' · ')
    return (
      <button
        key={q}
        type="button"
        onClick={() => openLevel(q)}
        aria-label={`${title(q)} ${sub(q)} ${t('org.countItems', { count: list.length })}`}
        className={`flex min-h-[168px] flex-col items-start gap-1.5 rounded-card border p-3.5 text-left ${TONE[q].tile} ${FOCUS}`}
      >
        <span className="flex w-full items-center gap-1.5">
          <span aria-hidden className={`h-2 w-2 rounded-full ${TONE[q].dot}`} />
          <span className={`text-lg font-bold ${TONE[q].text}`}>{title(q)}</span>
          <ChevronRight aria-hidden className="ml-auto h-3.5 w-3.5 text-ink-400" strokeWidth={1.5} />
        </span>
        <span className="text-xs text-ink-500">{sub(q)}</span>
        <span className={`mt-auto text-[40px] font-semibold leading-none tabular-nums ${TONE[q].text}`}>{list.length}</span>
        <span className={`text-xs ${alerts ? 'font-semibold text-danger-text' : 'text-ink-500'}`}>{alerts || t('org.noOverdue')}</span>
      </button>
    )
  }

  const mobileCard = (row: QuadrantRow) => (
    <li key={row.id}>
      <button
        type="button"
        onClick={() => setSelectedId(row.id)}
        className={`flex w-full flex-col gap-2 rounded-card border border-line bg-surface p-3.5 text-left shadow-card ${FOCUS}`}
      >
        <span className="w-full truncate text-xs text-ink-500">{row.businessName} › {row.taskName}</span>
        <span className={`text-md font-medium leading-snug ${row.status === 'done' ? 'text-ink-500 line-through' : 'text-ink-900'}`}>{row.name}</span>
        <span className="flex w-full items-center justify-between gap-2">
          <span className={`truncate text-xs ${row.ownerKey === 'none' ? 'font-semibold text-warning-text' : 'text-ink-700'}`}>{ownerLabel(row)}</span>
          {badges(row)}
        </span>
      </button>
    </li>
  )

  const mobileHome = (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-ink-500">{t('org.mobileSummary', { open: stats.open, overdue: stats.overdue, blocked: stats.blocked })}</p>
      <OwnerFilter options={ownerOptions(rows, today, 'open')} value={owner} onChange={setOwner} scroll />
      <div className="grid grid-cols-2 gap-2.5">
        <span className="text-center text-xs font-semibold text-ink-700">{t('org.axisUrgent')}</span>
        <span className="text-center text-xs font-semibold text-ink-500">{t('org.axisNotUrgent')}</span>
        {QUADRANTS.map(tile)}
      </div>
      <button
        type="button"
        onClick={() => openLevel('unrated')}
        className={`flex min-h-[56px] items-center gap-2.5 rounded-card border border-dashed border-line-strong bg-surface px-3.5 text-left ${FOCUS}`}
      >
        <span aria-hidden className="h-2 w-2 rounded-full bg-muted-dot" />
        <span className="flex flex-col">
          <span className="text-md font-semibold text-ink-900">{t('org.unratedTitle')}</span>
          <span className="text-xs text-ink-500">{t('org.unratedHint')}</span>
        </span>
        <span className="ml-auto text-xl font-semibold tabular-nums text-ink-700">{groups.unrated.length}</span>
        <ChevronRight aria-hidden className="h-3.5 w-3.5 text-ink-400" strokeWidth={1.5} />
      </button>
      <button
        type="button"
        onClick={() => openLevel('done')}
        className={`flex min-h-[48px] items-center gap-2.5 rounded-card px-3.5 text-left ${FOCUS}`}
      >
        <span aria-hidden className="h-2 w-2 rounded-full bg-success-dot" />
        <span className="text-md text-ink-700">{t('org.doneTitle')}</span>
        <span className="ml-auto text-md font-semibold tabular-nums text-success-text">{groups.done.length}</span>
        <ChevronRight aria-hidden className="h-3.5 w-3.5 text-ink-400" strokeWidth={1.5} />
      </button>
      <p className="text-xs leading-relaxed text-ink-500">{t('org.urgencyRule', { days: URGENT_WITHIN_DAYS })}</p>
    </div>
  )

  const mobileList = level && (
    <div className="flex flex-col gap-3">
      <button
        type="button"
        onClick={backHome}
        className={`-ml-2 inline-flex h-11 items-center gap-0.5 self-start rounded-field px-2 text-md text-primary hover:bg-primary-soft ${FOCUS}`}
      >
        <ChevronLeft aria-hidden className="h-4 w-4" strokeWidth={1.5} />
        {t('org.viewQuadrant')}
      </button>
      <div className="flex items-center gap-2">
        <h2 className={`text-xl font-semibold ${level === 'unrated' ? 'text-ink-900' : level === 'done' ? 'text-success-text' : TONE[level].text}`}>
          {title(level)}
        </h2>
        {level !== 'unrated' && level !== 'done' && <span className="text-sm text-ink-500">{sub(level)}</span>}
        <span className="ml-auto rounded-btn bg-line-soft px-2.5 py-0.5 text-sm font-semibold tabular-nums text-ink-700">
          {t('org.countItems', { count: groups[level].length })}
        </span>
      </div>
      <OwnerFilter options={ownerOptions(rows, today, level)} value={owner} onChange={setOwner} scroll />
      {groups[level].length === 0
        ? <p className="py-10 text-center text-sm text-ink-500">{t('org.emptyQuadrant')}</p>
        : <ul className="flex flex-col gap-2.5">{groups[level].map(mobileCard)}</ul>}
    </div>
  )

  return (
    <div>
      {desktop}
      <div className="md:hidden">{level ? mobileList : mobileHome}</div>
      {selected && (
        <ItemDetailPanel
          row={selected}
          today={today}
          canEdit={snapshot.canEdit}
          positionName={positionName}
          onClose={() => setSelectedId(null)}
          onUpdate={(fields) => onUpdateItem(selected.id, fields)}
          onPickOwner={() => onPickOwner(selected.id)}
        />
      )}
    </div>
  )
}
```

- [ ] **Step 4: `OrgPageView.tsx` 加视图切换**

整文件替换为：

```tsx
'use client'

import { useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import SegmentedControl from '@/components/ui/SegmentedControl'
import OrgView from './OrgView'
import QuadrantView from './QuadrantView'
import PersonPicker, { type PickerRequest } from './PersonPicker'
import { writeSearchParams } from './searchParams'
import { useOrgSnapshot } from './useOrgSnapshot'
import type { OrgSnapshot } from '@/lib/types'

/** 业务分工页的客户端根：持有共享快照与选人弹窗，按 ?view= 切「四象限」（默认）/「结构」。 */
export default function OrgPageView({ initial, today }: { initial: OrgSnapshot; today: string }) {
  const t = useTranslations('team')
  const params = useSearchParams()
  const view = params.get('view') === 'structure' ? 'structure' : 'quadrant'
  const { snapshot, actions } = useOrgSnapshot(initial)
  const [picker, setPicker] = useState<PickerRequest | null>(null)

  const setView = (v: string) => writeSearchParams({ view: v === 'structure' ? 'structure' : null, q: null }, 'replace')
  const pickItemOwner = (itemId: string) =>
    setPicker({ title: t('org.setOwner'), allowClear: true, onSelect: (p) => { actions.setItemOwner(itemId, p) } })

  return (
    <div className="space-y-4">
      <SegmentedControl
        label={t('org.viewLabel')}
        value={view}
        onChange={setView}
        items={[
          { value: 'quadrant', label: t('org.viewQuadrant') },
          { value: 'structure', label: t('org.viewStructure') },
        ]}
      />
      {view === 'quadrant'
        ? <QuadrantView snapshot={snapshot} today={today} onUpdateItem={actions.updateItemFields} onPickOwner={pickItemOwner} />
        : <OrgView snapshot={snapshot} actions={actions} onPick={setPicker} />}
      {picker && <PersonPicker request={picker} people={snapshot.people} onClose={() => setPicker(null)} />}
    </div>
  )
}
```

- [ ] **Step 5: page 传入东京今天**

`src/app/[locale]/(app)/team/org/page.tsx`：import 区加 `import { tokyoToday } from '@/lib/org/quadrant'`，`<OrgPageView initial={snapshot} />` 改为 `<OrgPageView initial={snapshot} today={tokyoToday()} />`。（服务端算一次传下去，避免 SSR 与浏览器跨零点时不一致。）

- [ ] **Step 6: 跑检查**

Run: `npx tsc --noEmit && npm test && npm run test:copy`
Expected: PASS。

- [ ] **Step 7: Commit**

```bash
test "$(git branch --show-current)" = feat/org-quadrant-board
git add src/components/org "src/app/[locale]/(app)/team/org/page.tsx"
git commit -m "feat(org): 业务分工新增四象限视图（桌面四格 + 手机两层 + 按负责人筛选）

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: 更新日志、全量检查与视觉验证

**Files:**
- Modify: `src/lib/changelog/entries.ts`
- 临时（不提交）：`src/app/[locale]/login/quadrant-fixture/page.tsx`

- [ ] **Step 1: 写更新日志**

`src/lib/changelog/entries.ts` 的 `CHANGELOG` 数组顶部插入（若顶部已有当天的条目，就把 item 并进去；日期写实际合并当天）：

```ts
  {
    date: '2026-10-15',
    items: [
      {
        kind: 'feat',
        scope: '业务分工',
        title: '业务分工新增「四象限」视图：按重要与紧急分四格，一眼看出先做什么',
        details:
          '打开「业务分工」默认进入四象限：立即做 / 排进计划 / 速办或转交 / 放一放。「重要」由管理员在事项详情里标「是 / 否」；「紧急」不用标，截止日在 7 天内或已逾期就自动算紧急，所以事项会随日期临近自己挪进「立即做」。每个事项还能设截止日和状态（未开始 / 进行中 / 卡住 / 已完成），完成的收进「已完成」。顶部可按负责人筛选，看某个人手上压着什么。手机上先看四格各有几项，点进去再看列表。原来的层级清单还在，切到「结构」即可。上线时所有事项都在「待评估」，需要先统一标一遍重要与否。',
      },
    ],
  },
```

- [ ] **Step 2: 全量检查**

Run: `npm test && npx tsc --noEmit && npm run test:copy && npm run test:migrations`
Expected: 全部 PASS。

- [ ] **Step 3: 建临时夹具页（不提交）**

`cp ../../../.env.local .env.local`（worktree 嵌在主仓 `.claude/worktrees/` 下；中间件对每个请求都要 Supabase 环境变量，缺了整站 500）。然后新建 `src/app/[locale]/login/quadrant-fixture/page.tsx`：

```tsx
import OrgPageView from '@/components/org/OrgPageView'
import type { OrgSnapshot, TaskItem } from '@/lib/types'

// 临时夹具：只验逻辑与交互，验完删除，不提交。
const TODAY = '2026-10-15'
const item = (id: string, name: string, over: Partial<TaskItem>): TaskItem => ({
  id, task_id: 't1', name, sort_order: Number(id.slice(1)),
  owner_member_type: 'user', owner_user_id: 'u1', owner_creator_id: null, owner_name: 'Member A',
  is_important: null, due_date: null, status: 'todo', ...over,
})
const snapshot: OrgSnapshot = {
  canEdit: true,
  people: [{ member_type: 'user', id: 'u1', name: 'Member A' }, { member_type: 'user', id: 'u2', name: 'Member B' }],
  positions: [{ id: 'p1', key: 'ops', name: 'Ops', description: '', sort_order: 1, members: [] }],
  businesses: [{
    id: 'b1', key: 'b', name: 'Business 1', sort_order: 1,
    owner_member_type: null, owner_user_id: null, owner_creator_id: null, owner_name: null,
    tasks: [{ id: 't1', business_id: 'b1', name: 'Task 1', sort_order: 1, position_ids: ['p1'], items: [
      item('i1', 'Overdue and blocked important item', { is_important: true, due_date: '2026-10-13', status: 'blocked' }),
      item('i2', 'Due today', { is_important: true, due_date: '2026-10-15', status: 'doing' }),
      item('i3', 'Exactly seven days out', { is_important: true, due_date: '2026-10-22' }),
      item('i4', 'Eight days out', { is_important: true, due_date: '2026-10-23', owner_user_id: 'u2', owner_name: 'Member B' }),
      item('i5', 'Important without due date', { is_important: true }),
      item('i6', 'Urgent but not important', { is_important: false, due_date: '2026-10-17' }),
      item('i7', 'Not important, later', { is_important: false, due_date: '2026-12-01', owner_user_id: 'u2', owner_name: 'Member B' }),
      item('i8', 'Unrated item', {}),
      item('i9', 'Unassigned unrated item', { owner_member_type: null, owner_user_id: null, owner_name: null }),
      item('i10', 'Finished item', { is_important: true, status: 'done' }),
      item('i11', 'A very long item name that should be truncated in the desktop row but wrap on mobile cards', { is_important: true, due_date: '2026-10-30' }),
    ] }],
  }],
}

export default function QuadrantFixturePage() {
  // 模拟 (app) 布局约 240px 的侧边栏宽度：/login 下没有侧边栏，不收窄会得出过于乐观的宽度结论。
  return (
    <div className="min-h-screen bg-canvas p-6 md:pl-[264px]">
      <OrgPageView initial={snapshot} today={TODAY} />
    </div>
  )
}
```

- [ ] **Step 4: 生产构建并启动**

```bash
rm -rf .next && npx next build && ls .next/BUILD_ID && npx next start -p 3107
```

（后台运行。判据是 `.next/BUILD_ID` 存在且路由表里有 `/[locale]/login/quadrant-fixture`，不是退出码。）

- [ ] **Step 5: 桌面 1440 验证**

浏览器打开 `http://localhost:3107/zh/login/quadrant-fixture`，视口 1440×900。用 JS 读 DOM 断言（截图只留档）：
- 立即做 = 3（i1/i2/i3）、排进计划 = 3（i4/i5/i11）、速办或转交 = 1（i6）、放一放 = 1（i7）、待评估 = 2、已完成 = 1；统计条：未完成 10、逾期 1、卡住 1、待评估 2、未指派 1。
- 立即做格内顺序 i1 → i2 → i3（按截止日）。
- 点「Member B」筛选：立即做 0、排进计划 1、放一放 1；URL 带 `owner=user:u2`；刷新后筛选仍在。把 URL 改成 `owner=user:zzz` 刷新 → 回到「全部」。
- 点 i3 打开详情，把截止日改成 2026-10-30 并让输入框失焦 → 请求被拒（夹具无登录，会弹「保存失败」）属预期；确认没有在逐键输入年份时发出请求（Network 面板里只在失焦后出现一次 PATCH）。
- 用真实滚轮在详情面板外滚动，页面不动（滚动锁）；Esc 关闭面板。
- 切到「结构」，URL 变为 `?view=structure`，清单与原来一致。
- 截图一张留档。

- [ ] **Step 6: 手机 375 验证**

视口 375×812，重新加载：
- 首层四格数字同上，「立即做」块显示「逾期 1 · 卡住 1」；点「立即做」→ URL 带 `q=q1`，列表 3 张卡片；用浏览器后退 → 回首层且仍在本页。
- 直接打开 `?q=q2` → 列表层；点「四象限」返回按钮 → 留在本页首层（不离开页面）。打开 `?q=q9` → 首层。
- 列表层切换负责人，筛选项数字为该格内各人条数。
- 点卡片 → 底部面板；所有按钮高度 ≥ 44px（`getBoundingClientRect().height`）。
- 截图一张留档。

- [ ] **Step 7: 删夹具、收尾**

```bash
pkill -f "next start -p 3107"
rm -rf "src/app/[locale]/login/quadrant-fixture" .next/types
git status --short
```

Expected: 只剩 `src/lib/changelog/entries.ts` 一处改动（`.env.local` 被 `.gitignore` 忽略，不出现）。再跑一次 `npx tsc --noEmit` 确认干净。

- [ ] **Step 8: Commit**

```bash
test "$(git branch --show-current)" = feat/org-quadrant-board
git add src/lib/changelog/entries.ts
git commit -m "docs(changelog): 补记业务分工四象限视图

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: 上线（主会话执行，每一步都要 pollux 点头）

不派给子代理。

- [ ] **Step 1: 全分支审查**：派一个新的审查者看 `origin/main...feat/org-quadrant-board` 全量 diff，对 `quadrant.test.ts` 与 `tree.test.ts` 做突变探针（在已提交基线上），交击杀表。逐 task 审查全过不代表整体安全，这一步不能省。
- [ ] **Step 2: 生产迁移**：把 Task 1 的 SQL 原文贴给 pollux 确认 → 用 `agent-service/.env.local` 的 `SUPABASE_DB_URL` 以 psql 执行 → `npm run audit:rls` → `select column_name, data_type, is_nullable, column_default from information_schema.columns where table_name = 'task_items' and column_name in ('is_important','due_date','status');` 确认三列存在。
- [ ] **Step 3: 推送并开 PR**：推送前 `git log origin/main..HEAD` 和 diff 里 grep 一遍真实人名、内部事项名、本机路径（仓库是公开的）。PR 描述附桌面与手机截图。
- [ ] **Step 4: 合并**：问 pollux，得到明确同意才合并。
- [ ] **Step 5: 部署核对**：确认 Vercel 生产部署完成、域名别名指向新部署（CI 绿灯不等于上线）。
- [ ] **Step 6: 线上验证**：打开 `/team/org` → 默认四象限、全部事项在「待评估」；pollux 授权后改一条事项的重要与截止日，确认：落入正确象限；详情面板没有关闭、标题仍是这条事项（Review Focus 第 5 条，夹具页因写入被拒验不到）；刷新后保留。最后改回原样。
