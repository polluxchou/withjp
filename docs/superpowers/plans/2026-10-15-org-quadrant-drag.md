# 业务分工四象限：拖拽编辑 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让管理员在四象限视图里直接拖动事项完成分级、改重要/紧急、结项与重开（桌面拖、手机长按拖到底部放置区、键盘操作），拖完立即生效并可撤销。

**Architecture:** 拖放规则（`planDrop`）与键盘跳区（`nextZone`）是 `src/lib` 里的纯函数，用 `node --test` 覆盖；拖拽接线用 `@dnd-kit/core`，拆在 `QuadrantDnd.tsx`，`QuadrantView` 只负责编排；写入沿用 `PATCH /api/org/items/[id]`，`useOrgSnapshot.updateItemFields` 改成乐观更新 + 按字段的写入账本回滚。

**Tech Stack:** Next.js 14.2（App Router）、React 18、next-intl、Tailwind 设计 token、`@dnd-kit/core@6.3.1`、`node --test --experimental-strip-types`。

**Spec:** `docs/superpowers/specs/2026-10-15-org-quadrant-drag-design.md`（基础口径见 `docs/superpowers/specs/2026-10-15-org-quadrant-board-design.md`）

## Global Constraints

- 工作目录：仓库根下 `.claude/worktrees/org-quadrant-drag`，分支 `feat/org-quadrant-drag`。每次 `git commit` 前先跑 `test "$(git branch --show-current)" = feat/org-quadrant-drag`，不等就停下。
- 新依赖只有 `@dnd-kit/core`，精确版本 `6.3.1`（`npm install --save-exact`），不引入 `@dnd-kit/sortable` 或其他拖拽库。
- 拖进紧急列（① 立即做 / ③ 速办或转交）且当前不紧急：`due_date = today + 7`（`URGENT_WITHIN_DAYS`）。拖进不紧急列（② / ④）且当前紧急：先询问日期，`min = today + 8`，默认值 `today + 8`；取消不写入。
- 「当前紧急」只看截止日（`isUrgent`），与状态无关；从已完成拖回任何格或待评估：`status = 'todo'`；「进行中」「卡住」跨象限保持不变。
- 起拖阈值：鼠标移动 ≥ 6px；触控长按 250ms、容差 5px；键盘 Space 拿起/放下、方向键跳区、Esc 取消，**Enter 保持打开详情**（`keyboardCodes.start` 只含 `Space`）。
- 手机只在列表层（`?q=`）可拖，放置区目标高度 ≥ 44px；首层不可拖；非管理员不可拖。
- 撤销提示条 5 秒自动消失，只用于拖放；新拖放替换旧提示。
- 不改数据库、不改 API、不做格内排序/多选/拖拽改负责人。
- 测试：`node --test --experimental-strip-types`；lib 内相对 import 带 `.ts` 后缀；纯类型 import 写 `import type`；新测试文件登记进 `package.json` 的 `test` 脚本。
- tsconfig 没有 downlevelIteration：不许展开 Map/Set 迭代器（用 `Array.from` / `forEach`），展开数组可以。
- JSX 不许出现裸汉字（`npm run test:no-bare-han`），文案走 `useTranslations('team')` 的 `org.*`，`messages/{zh,en,ja}.json` 三语同步（`npm run test:i18n`）。
- 样式只用设计 token（`npm run test:style` 零容忍）：不写裸 hex；`*-soft` / `*-border` / `line-*` 不加 `/N`，只有 `ink-*`、`primary` 能加；注释里的 PR 号写成 `PR 123`，不写 `(#123)`。
- 每个任务结束 `npx tsc --noEmit`、`npm test`、`npm run test:copy` 必须全绿。
- 删文件用 `trash`，不用 `rm`（钩子会拦）。不推送、不开 PR，直到 Task 7。
- 提交信息简体中文 conventional 格式，末尾带执行该任务的模型的 `Co-Authored-By` 行。
- 仓库公开：代码、注释、文档、测试数据不写真实人名、内部事项名、本机绝对路径。

## Review Focus

1. **落点是被响应式 CSS 隐藏的区**（桌面四格在手机上 `display:none`、手机放置区在桌面上 `md:hidden`）：绝不能成为落点或键盘跳转目标。Task 2 的 `nextZone` 忽略零尺寸区并有用例；指针落点由 `pointerWithin` 自然排除（Task 6 实测）。
2. **拖到区外、按 Esc、或在询问框点取消**：不写入、事项不动、没有提示条。Task 1 的 `planDrop` 同格返回 noop 有用例；Task 6 逐项实测。
3. **写入失败**：事项退回原格并弹出原因；同一事项连续两次写入时，只有最新那次失败才回滚。Task 3 的序号逻辑 + Task 6 用 `?mock=fail` 实测。
4. **点击与拖拽不能互相吞**：鼠标轻微抖动（< 6px）的点击仍打开详情；键盘 Enter 仍打开详情，Space 才拿起。Task 6 实测。
5. **撤销自动设的日期**：原截止日（包括原来为空）完整恢复。Task 3 的 `pickItemFields` 对空值有用例；Task 6 用 `?mock=ok` 实测撤销。

---

## File Structure

| 文件 | 动作 | 职责 |
| --- | --- | --- |
| `src/lib/org/quadrant.ts` / `quadrant.test.ts` | 改 | `addDays`、`planDrop`、`confirmAskedDate` |
| `src/lib/org/dragZones.ts` / `dragZones.test.ts` | 新建 | `nextZone`（键盘跳区） |
| `src/lib/org/tree.ts` / `tree.test.ts` | 改 | `pickItemFields` |
| `src/components/org/useOrgSnapshot.ts` | 改 | 乐观更新 + 序号回滚 |
| `src/components/org/DueDatePrompt.tsx` | 新建 | 拖出紧急列时的询问框 |
| `src/components/org/DropNotice.tsx` | 新建 | 拖放后的提示条（含撤销） |
| `src/components/org/QuadrantDnd.tsx` | 新建 | `DraggableButton`、`DropZone`、`DragPreview`、`DropDock`、`zoneKeyboardCoordinates` |
| `src/components/org/QuadrantView.tsx` | 改 | 接入 `DndContext`、处理拖放、询问框、提示条 |
| `messages/{zh,en,ja}.json` | 改 | 15 个新 `team.org.*` 键 |
| `package.json` / `package-lock.json` | 改 | `@dnd-kit/core@6.3.1`；登记 `dragZones.test.ts` |
| `src/lib/changelog/entries.ts` | 改 | 更新日志 |

---

### Task 1: 拖放规则纯函数

**Files:**
- Modify: `src/lib/org/quadrant.ts`
- Modify: `src/lib/org/quadrant.test.ts`

**Interfaces:**
- Consumes（已存在于 `quadrant.ts`）：`URGENT_WITHIN_DAYS`、私有 `utcMidnight(ymd)`、`isUrgent(item, today)`、`bucketOf(item, today)`、`isCalendarDate(s)`、类型 `Bucket`、`QuadrantRow`、`ItemPatch`。
- Produces：
  - `addDays(ymd: string, n: number): string`
  - `type DropTarget = Bucket`
  - `type DropPlan = { kind: 'noop' } | { kind: 'patch'; patch: ItemPatch; autoDue: string | null } | { kind: 'askDate'; base: ItemPatch; minDate: string }`
  - `planDrop(row: QuadrantRow, target: DropTarget, today: string): DropPlan`
  - `confirmAskedDate(plan: { base: ItemPatch; minDate: string }, value: string): ItemPatch | null`

- [ ] **Step 1: 写失败的测试**

`src/lib/org/quadrant.test.ts` 顶部 value import 列表里加 `addDays, confirmAskedDate, planDrop`。文件末尾追加（`TODAY = '2026-10-15'` 与 `row()` 辅助函数已存在，`row()` 默认 `status: 'todo', is_important: true, due_date: null`）：

```ts
test('addDays: 跨月、跨年、闰日、负数', () => {
  assert.equal(addDays('2026-10-15', 7), '2026-10-22')
  assert.equal(addDays('2026-10-28', 7), '2026-11-04')
  assert.equal(addDays('2026-12-28', 7), '2027-01-04')
  assert.equal(addDays('2028-02-27', 2), '2028-02-29')
  assert.equal(addDays('2026-10-23', -1), '2026-10-22')
})

test('planDrop: 同格不写入', () => {
  assert.deepEqual(planDrop(row({ is_important: null }), 'unrated', TODAY), { kind: 'noop' })
  assert.deepEqual(planDrop(row({ due_date: '2026-10-18' }), 'q1', TODAY), { kind: 'noop' })
  assert.deepEqual(planDrop(row({ status: 'done' }), 'done', TODAY), { kind: 'noop' })
})

test('planDrop: 待评估 → 紧急列，无截止日时自动设 today+7', () => {
  assert.deepEqual(planDrop(row({ is_important: null }), 'q1', TODAY),
    { kind: 'patch', patch: { is_important: true, due_date: '2026-10-22' }, autoDue: '2026-10-22' })
  assert.deepEqual(planDrop(row({ is_important: null }), 'q3', TODAY),
    { kind: 'patch', patch: { is_important: false, due_date: '2026-10-22' }, autoDue: '2026-10-22' })
})

test('planDrop: 待评估 → 紧急列，已在 7 天内时不改日期', () => {
  assert.deepEqual(planDrop(row({ is_important: null, due_date: '2026-10-18' }), 'q1', TODAY),
    { kind: 'patch', patch: { is_important: true }, autoDue: null })
})

test('planDrop: 待评估 → 不紧急列，不紧急时只设重要', () => {
  assert.deepEqual(planDrop(row({ is_important: null }), 'q2', TODAY),
    { kind: 'patch', patch: { is_important: true }, autoDue: null })
  assert.deepEqual(planDrop(row({ is_important: null, due_date: '2026-11-30' }), 'q4', TODAY),
    { kind: 'patch', patch: { is_important: false }, autoDue: null })
})

test('planDrop: ② 截止日 30 天后 → ①，日期被改成 today+7', () => {
  assert.deepEqual(planDrop(row({ due_date: '2026-11-14' }), 'q1', TODAY),
    { kind: 'patch', patch: { is_important: true, due_date: '2026-10-22' }, autoDue: '2026-10-22' })
})

test('planDrop: 差 8 天算不紧急 → 拖进紧急列要改日期；差 7 天算紧急 → 不改', () => {
  assert.equal((planDrop(row({ due_date: '2026-10-23' }), 'q1', TODAY) as { autoDue: string | null }).autoDue, '2026-10-22')
  assert.deepEqual(planDrop(row({ is_important: false, due_date: '2026-10-22' }), 'q1', TODAY),
    { kind: 'patch', patch: { is_important: true }, autoDue: null })
})

test('planDrop: 紧急 → 不紧急列先问日期，下限 today+8', () => {
  assert.deepEqual(planDrop(row({ due_date: '2026-10-18' }), 'q2', TODAY),
    { kind: 'askDate', base: { is_important: true }, minDate: '2026-10-23' })
  assert.deepEqual(planDrop(row({ due_date: '2026-10-01' }), 'q4', TODAY),
    { kind: 'askDate', base: { is_important: false }, minDate: '2026-10-23' })
})

test('planDrop: ① → ③ 只翻重要，日期不动', () => {
  assert.deepEqual(planDrop(row({ due_date: '2026-10-18' }), 'q3', TODAY),
    { kind: 'patch', patch: { is_important: false }, autoDue: null })
})

test('planDrop: 任意 → 已完成', () => {
  assert.deepEqual(planDrop(row({ due_date: '2026-10-18', status: 'blocked' }), 'done', TODAY),
    { kind: 'patch', patch: { status: 'done' }, autoDue: null })
  assert.deepEqual(planDrop(row({ is_important: null }), 'done', TODAY),
    { kind: 'patch', patch: { status: 'done' }, autoDue: null })
})

test('planDrop: 已完成 → 格子或待评估都会重开为 todo', () => {
  assert.deepEqual(planDrop(row({ status: 'done', is_important: null }), 'q1', TODAY),
    { kind: 'patch', patch: { status: 'todo', is_important: true, due_date: '2026-10-22' }, autoDue: '2026-10-22' })
  assert.deepEqual(planDrop(row({ status: 'done' }), 'unrated', TODAY),
    { kind: 'patch', patch: { status: 'todo', is_important: null }, autoDue: null })
  assert.deepEqual(planDrop(row({ status: 'done', due_date: '2026-10-16' }), 'q2', TODAY),
    { kind: 'askDate', base: { status: 'todo', is_important: true }, minDate: '2026-10-23' })
})

test('planDrop: 卡住、进行中跨象限保持原状态（补丁里不含 status）', () => {
  const p = planDrop(row({ status: 'blocked', is_important: false }), 'q2', TODAY)
  assert.deepEqual(p, { kind: 'patch', patch: { is_important: true }, autoDue: null })
  const d = planDrop(row({ status: 'doing', is_important: null }), 'q3', TODAY)
  assert.equal('status' in (d as { patch: object }).patch, false)
})

test('planDrop: 待评估区只清空重要，日期不动', () => {
  assert.deepEqual(planDrop(row({ due_date: '2026-10-18' }), 'unrated', TODAY),
    { kind: 'patch', patch: { is_important: null }, autoDue: null })
})

test('confirmAskedDate: 早于下限、非法、越界返回 null；等于下限合并进补丁', () => {
  const plan = { base: { is_important: true }, minDate: '2026-10-23' }
  assert.equal(confirmAskedDate(plan, '2026-10-22'), null)
  assert.equal(confirmAskedDate(plan, ''), null)
  assert.equal(confirmAskedDate(plan, '2026-02-30'), null)
  assert.equal(confirmAskedDate(plan, '2100-01-01'), null)
  assert.deepEqual(confirmAskedDate(plan, '2026-10-23'), { is_important: true, due_date: '2026-10-23' })
  assert.deepEqual(confirmAskedDate(plan, '2026-12-01'), { is_important: true, due_date: '2026-12-01' })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `node --test --experimental-strip-types src/lib/org/quadrant.test.ts`
Expected: FAIL，`planDrop` 等未导出。

- [ ] **Step 3: 写实现**

`src/lib/org/quadrant.ts` 末尾追加：

```ts
// ── 拖放（spec: 2026-10-15-org-quadrant-drag-design.md 第 2 节）────────────

/** 'YYYY-MM-DD' + n 天，UTC 零点计算，不经过本地时区。 */
export function addDays(ymd: string, n: number): string {
  return new Date(utcMidnight(ymd) + n * 86_400_000).toISOString().slice(0, 10)
}

export type DropTarget = Bucket

export type DropPlan =
  | { kind: 'noop' }
  | { kind: 'patch'; patch: ItemPatch; autoDue: string | null }
  | { kind: 'askDate'; base: ItemPatch; minDate: string }

/**
 * 把事项放进某个区要写什么。横向（紧急 ↔ 不紧急）等于改截止日：
 * 拖进紧急列且当前不紧急 → 截止日自动设为 today+7（紧急窗口最后一天）；
 * 拖进不紧急列且当前紧急 → 先问日期（下限 today+8）。从已完成拖出来一律重开为 todo。
 */
export function planDrop(row: QuadrantRow, target: DropTarget, today: string): DropPlan {
  if (target === bucketOf(row, today)) return { kind: 'noop' }
  if (target === 'done') return { kind: 'patch', patch: { status: 'done' }, autoDue: null }
  const reopen: ItemPatch = row.status === 'done' ? { status: 'todo' } : {}
  if (target === 'unrated') return { kind: 'patch', patch: { ...reopen, is_important: null }, autoDue: null }
  const base: ItemPatch = { ...reopen, is_important: target === 'q1' || target === 'q2' }
  const wantUrgent = target === 'q1' || target === 'q3'
  const urgentNow = isUrgent(row, today)
  if (wantUrgent) {
    if (urgentNow) return { kind: 'patch', patch: base, autoDue: null }
    const due = addDays(today, URGENT_WITHIN_DAYS)
    return { kind: 'patch', patch: { ...base, due_date: due }, autoDue: due }
  }
  if (urgentNow) return { kind: 'askDate', base, minDate: addDays(today, URGENT_WITHIN_DAYS + 1) }
  return { kind: 'patch', patch: base, autoDue: null }
}

/** 询问框里填的日期 → 最终补丁；非法日期或早于下限返回 null。 */
export function confirmAskedDate(plan: { base: ItemPatch; minDate: string }, value: string): ItemPatch | null {
  if (!isCalendarDate(value) || value < plan.minDate) return null
  return { ...plan.base, due_date: value }
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `node --test --experimental-strip-types src/lib/org/quadrant.test.ts && npx tsc --noEmit && npm run test:lint`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
test "$(git branch --show-current)" = feat/org-quadrant-drag
git add src/lib/org/quadrant.ts src/lib/org/quadrant.test.ts
git commit -m "feat(org): 四象限拖放规则纯函数（自动设/询问截止日、重开）"
```

（提交信息末尾加上你的 `Co-Authored-By` 行。）

---

### Task 2: 键盘跳区纯函数

**Files:**
- Create: `src/lib/org/dragZones.ts`
- Create: `src/lib/org/dragZones.test.ts`
- Modify: `package.json`（`test` 脚本）

**Interfaces:**
- Produces：
  - `interface ZoneRect { id: string; left: number; top: number; width: number; height: number }`
  - `type Direction = 'up' | 'down' | 'left' | 'right'`
  - `nextZone(zones: ZoneRect[], from: { x: number; y: number }, dir: Direction): ZoneRect | null`

- [ ] **Step 1: 写失败的测试**

新建 `src/lib/org/dragZones.test.ts`：

```ts
import assert from 'node:assert/strict'
import test from 'node:test'

import { nextZone } from './dragZones.ts'
import type { ZoneRect } from './dragZones.ts'

// 2×2 网格，每格 100×100，间距 100：A 左上、B 右上、C 左下、D 右下
const A: ZoneRect = { id: 'A', left: 0, top: 0, width: 100, height: 100 }
const B: ZoneRect = { id: 'B', left: 200, top: 0, width: 100, height: 100 }
const C: ZoneRect = { id: 'C', left: 0, top: 200, width: 100, height: 100 }
const D: ZoneRect = { id: 'D', left: 200, top: 200, width: 100, height: 100 }
const GRID = [A, B, C, D]
const centerOf = (z: ZoneRect) => ({ x: z.left + z.width / 2, y: z.top + z.height / 2 })

test('nextZone: 四个方向各一例', () => {
  assert.equal(nextZone(GRID, centerOf(A), 'right')?.id, 'B')
  assert.equal(nextZone(GRID, centerOf(A), 'down')?.id, 'C')
  assert.equal(nextZone(GRID, centerOf(D), 'left')?.id, 'C')
  assert.equal(nextZone(GRID, centerOf(D), 'up')?.id, 'B')
})

test('nextZone: 该方向没有区域 → null（当前所在区不算）', () => {
  assert.equal(nextZone(GRID, centerOf(A), 'left'), null)
  assert.equal(nextZone(GRID, centerOf(A), 'up'), null)
})

test('nextZone: 同方向多个候选取最近', () => {
  const far: ZoneRect = { id: 'far', left: 500, top: 0, width: 100, height: 100 }
  assert.equal(nextZone([...GRID, far], centerOf(A), 'right')?.id, 'B')
})

test('nextZone: 偏离主轴的候选被惩罚（主轴距离 + 2 × 副轴距离）', () => {
  // E 在主轴上更近（右移 100）但下偏 150：100 + 300 = 400 > B 的 200 + 0
  const E: ZoneRect = { id: 'E', left: 100, top: 150, width: 100, height: 100 }
  assert.equal(nextZone([A, B, E], centerOf(A), 'right')?.id, 'B')
})

test('nextZone: 被 CSS 隐藏的零尺寸区不参与', () => {
  const hidden: ZoneRect = { id: 'hidden', left: 120, top: 0, width: 0, height: 0 }
  assert.equal(nextZone([A, B, hidden], centerOf(A), 'right')?.id, 'B')
  assert.equal(nextZone([A, hidden], centerOf(A), 'right'), null)
})
```

- [ ] **Step 2: 登记测试文件**

`package.json` 的 `test` 脚本里，把 `src/lib/org/quadrant.test.ts` 替换为 `src/lib/org/quadrant.test.ts src/lib/org/dragZones.test.ts`。

- [ ] **Step 3: 跑测试确认失败**

Run: `node --test --experimental-strip-types src/lib/org/dragZones.test.ts`
Expected: FAIL，`Cannot find module './dragZones.ts'`。

- [ ] **Step 4: 写实现**

新建 `src/lib/org/dragZones.ts`：

```ts
// src/lib/org/dragZones.ts — 四象限拖拽的键盘跳区：按方向在可放区之间跳转。
//
// dnd-kit 默认键盘每次只移 25px，跨不过大格子（spec 3.5），所以自己按方向挑下一个区。
// 相对路径 + .ts 后缀：node --test 不认 tsconfig 的 @/ 别名。

export interface ZoneRect {
  id: string
  left: number
  top: number
  width: number
  height: number
}

export type Direction = 'up' | 'down' | 'left' | 'right'

/**
 * 从当前点出发，按方向选最近的可放区；没有就返回 null（停在原地）。
 * 只看中心点严格落在该方向半平面内的区；得分 = 主轴距离 + 2 × 副轴距离，取最小。
 * 零尺寸的区（被响应式 CSS 隐藏的桌面区或手机放置区）不参与。
 */
export function nextZone(zones: ZoneRect[], from: { x: number; y: number }, dir: Direction): ZoneRect | null {
  let best: ZoneRect | null = null
  let bestScore = Infinity
  for (const z of zones) {
    if (z.width <= 0 || z.height <= 0) continue
    const dx = z.left + z.width / 2 - from.x
    const dy = z.top + z.height / 2 - from.y
    const main = dir === 'right' ? dx : dir === 'left' ? -dx : dir === 'down' ? dy : -dy
    const cross = dir === 'right' || dir === 'left' ? Math.abs(dy) : Math.abs(dx)
    if (main <= 0) continue
    const score = main + 2 * cross
    if (score < bestScore) {
      bestScore = score
      best = z
    }
  }
  return best
}
```

- [ ] **Step 5: 跑测试确认通过**

Run: `node --test --experimental-strip-types src/lib/org/dragZones.test.ts && npm test && npx tsc --noEmit && npm run test:lint`
Expected: PASS。

- [ ] **Step 6: Commit**

```bash
test "$(git branch --show-current)" = feat/org-quadrant-drag
git add src/lib/org/dragZones.ts src/lib/org/dragZones.test.ts package.json
git commit -m "feat(org): 四象限拖拽的键盘跳区纯函数"
```

---

### Task 3: 旧值读取与乐观更新

**Files:**
- Modify: `src/lib/org/tree.ts`、`src/lib/org/tree.test.ts`
- Modify: `src/components/org/useOrgSnapshot.ts`

**Interfaces:**
- Consumes：`ItemPatch`（`quadrant.ts`）、`applyUpdateItemFields`（`tree.ts`）。
- Produces：`pickItemFields(snapshot: OrgSnapshot, itemId: string, keys: (keyof ItemPatch)[]): ItemPatch | null`；`actions.updateItemFields(itemId, fields)` 签名不变（`Promise<void>`），行为改为乐观更新。

- [ ] **Step 1: 写失败的测试**

`src/lib/org/tree.test.ts` 的 import 列表加 `pickItemFields`，文件末尾追加（`baseSnapshot()` 里事项 `i1` 是 `is_important: null, due_date: null, status: 'todo'`）：

```ts
test('pickItemFields: 只取指定字段，空值原样取出（撤销要能恢复成空）', () => {
  const s = baseSnapshot()
  assert.deepEqual(pickItemFields(s, 'i1', ['is_important', 'due_date']), { is_important: null, due_date: null })
  const set = applyUpdateItemFields(s, 'i1', { is_important: true, due_date: '2026-10-22', status: 'doing' })
  assert.deepEqual(pickItemFields(set, 'i1', ['due_date']), { due_date: '2026-10-22' })
  assert.deepEqual(pickItemFields(set, 'i1', ['status', 'is_important']), { status: 'doing', is_important: true })
})

test('pickItemFields: 事项不存在返回 null', () => {
  assert.equal(pickItemFields(baseSnapshot(), 'nope', ['status']), null)
})

test('pickItemFields + applyUpdateItemFields: 用取出的旧值写回即完整还原', () => {
  const s = baseSnapshot()
  const patch = { is_important: true, due_date: '2026-10-22' }
  const prev = pickItemFields(s, 'i1', ['is_important', 'due_date'])!
  const restored = applyUpdateItemFields(applyUpdateItemFields(s, 'i1', patch), 'i1', prev)
  const it = restored.businesses[0].tasks[0].items[0]
  assert.deepEqual([it.is_important, it.due_date, it.status], [null, null, 'todo'])
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `node --test --experimental-strip-types src/lib/org/tree.test.ts`
Expected: FAIL，`pickItemFields` 未导出。

- [ ] **Step 3: 写 `pickItemFields`**

`src/lib/org/tree.ts` 末尾追加：

```ts
// 读出某事项指定四象限字段的当前值，作为乐观更新回滚与拖放撤销的补丁。
// 迁移前的旧数据可能缺列：按 待评估 / 无截止日 / 未开始 兜底。事项不存在返回 null。
export function pickItemFields(snapshot: OrgSnapshot, itemId: string, keys: (keyof ItemPatch)[]): ItemPatch | null {
  for (const b of snapshot.businesses) {
    for (const t of b.tasks) {
      for (const it of t.items) {
        if (it.id !== itemId) continue
        const out: ItemPatch = {}
        for (const k of keys) {
          if (k === 'is_important') out.is_important = it.is_important ?? null
          else if (k === 'due_date') out.due_date = it.due_date ?? null
          else out.status = it.status ?? 'todo'
        }
        return out
      }
    }
  }
  return null
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `node --test --experimental-strip-types src/lib/org/tree.test.ts`
Expected: PASS。

- [ ] **Step 5: `updateItemFields` 改乐观更新**

`src/components/org/useOrgSnapshot.ts`：
1. `import { useState } from 'react'` 改为 `import { useRef, useState } from 'react'`。
2. 从 `@/lib/org/tree` 的 import 列表里加 `pickItemFields`。
3. 在 `const [snapshot, setSnapshot] = useState<OrgSnapshot>(initial)` 下面加：

```ts
  // 每个事项一个递增写入序号：写入失败时只有「这是该事项最新的一次写入」才回滚（spec 4.1）。
  const writeSeq = useRef(new Map<string, number>())
```

4. 把 `updateItemFields` 整个替换为：

```ts
  // 先改界面再写库（spec 4.1）。旧值取自本次渲染的快照：每次拖放 / 点击都是独立事件，
  // 事件结束 React 会先重渲染，所以这里的 snapshot 已含上一次的乐观更新。
  const updateItemFields = async (itemId: string, fields: ItemPatch) => {
    const prev = pickItemFields(snapshot, itemId, Object.keys(fields) as (keyof ItemPatch)[])
    const seq = (writeSeq.current.get(itemId) ?? 0) + 1
    writeSeq.current.set(itemId, seq)
    setSnapshot((s) => applyUpdateItemFields(s, itemId, fields))
    const ok = await api(`/items/${itemId}`, 'PATCH', fields)
    // 失败（api() 已弹出原因）：只有这期间没有更新的写入发起过才回滚，免得盖掉之后的修改
    if (!ok && prev && writeSeq.current.get(itemId) === seq) {
      setSnapshot((s) => applyUpdateItemFields(s, itemId, prev))
    }
  }
```

- [ ] **Step 6: 跑检查**

Run: `npm test && npx tsc --noEmit && npm run test:copy`
Expected: PASS。（乐观更新与回滚的界面表现在 Task 6 用夹具页实测。）

- [ ] **Step 7: Commit**

```bash
test "$(git branch --show-current)" = feat/org-quadrant-drag
git add src/lib/org/tree.ts src/lib/org/tree.test.ts src/components/org/useOrgSnapshot.ts
git commit -m "feat(org): 事项四象限字段改为乐观更新，失败按序号回滚"
```

---

### Task 4: 依赖、文案、询问框与提示条

**Files:**
- Modify: `package.json`、`package-lock.json`（依赖）
- Modify: `messages/zh.json`、`messages/en.json`、`messages/ja.json`（`team.org`）
- Create: `src/components/org/DueDatePrompt.tsx`
- Create: `src/components/org/DropNotice.tsx`

**Interfaces:**
- Consumes：`addDays`、`confirmAskedDate`、`ItemPatch`（Task 1）；`Modal`（`open onClose title width footer`）、`Button`（`variant`）。
- Produces：
  - `<DueDatePrompt plan={{ base, minDate }} onConfirm={(patch: ItemPatch) => void} onCancel={() => void} />`
  - `<DropNotice message={string} canUndo={boolean} onUndo={() => void} onDismiss={() => void} />`（`onDismiss` 须是稳定引用，5 秒后自动调用）
  - `team.org.*` 15 个新键（Task 5 用）

- [ ] **Step 1: 装依赖**

```bash
npm ci
npm install --save-exact @dnd-kit/core@6.3.1
grep -n '"@dnd-kit/core"' package.json
```

Expected：`"@dnd-kit/core": "6.3.1"`（无 `^`）。

- [ ] **Step 2: 加文案**

三个文件的 `team.org` 对象末尾（最后一个已有键之后）追加下列键，三语键名一致：

| 键 | zh | en | ja |
| --- | --- | --- | --- |
| `dragInstructions` | 按空格拿起事项，用方向键移到别的区域，再按空格放下，按 Esc 取消。 | Press Space to pick up an item, use the arrow keys to move to another area, press Space to drop, or Esc to cancel. | スペースで持ち上げ、矢印キーで別のエリアへ移動、もう一度スペースで置きます。Esc で取り消し。 |
| `dragAnnouncePick` | 已拿起「{name}」 | Picked up {name} | 「{name}」を持ち上げました |
| `dragAnnounceOver` | 在「{zone}」上方 | Over {zone} | 「{zone}」の上 |
| `dragAnnounceDrop` | 已放进「{zone}」 | Dropped into {zone} | 「{zone}」に置きました |
| `dragAnnounceCancel` | 已取消拖动 | Drag cancelled | ドラッグを取り消しました |
| `dropMoved` | 已移到「{zone}」 | Moved to {zone} | 「{zone}」に移動しました |
| `dropMovedDue` | 已移到「{zone}」，截止日设为 {date} | Moved to {zone}, due date set to {date} | 「{zone}」に移動し、期限を {date} にしました |
| `dropDone` | 已标为完成 | Marked as done | 完了にしました |
| `dropReopened` | 已重新打开，移到「{zone}」 | Reopened and moved to {zone} | 再開して「{zone}」に移動しました |
| `undo` | 撤销 | Undo | 元に戻す |
| `askDateTitle` | 设置新的截止日 | Set a new due date | 新しい期限を設定 |
| `askDateBody` | 放进不紧急的一列，截止日需在 {date} 之后。 | To move it out of the urgent column, the due date must be after {date}. | 緊急でない列に移すには、期限を {date} より後にしてください。 |
| `askDateInvalid` | 请选择 {date} 之后的日期 | Choose a date after {date} | {date} より後の日付を選んでください |
| `confirm` | 确定 | OK | OK |
| `dockTitle` | 拖到这里 | Drop here | ここにドロップ |

Run: `npm run test:i18n`
Expected: PASS（新键在 Task 5 才被引用，未引用告警属预期，不是失败）。

- [ ] **Step 3: 新建 `DueDatePrompt.tsx`**

```tsx
'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import { addDays, confirmAskedDate } from '@/lib/org/quadrant'
import type { ItemPatch } from '@/lib/org/quadrant'

/**
 * 把紧急的事项拖进不紧急的一列时，先问新的截止日（spec 2.3）。
 * 「确定」只在日期合法且不早于下限时可点；取消 / Esc 不写入，事项留在原格。
 */
export default function DueDatePrompt({ plan, onConfirm, onCancel }: {
  plan: { base: ItemPatch; minDate: string }
  onConfirm: (patch: ItemPatch) => void
  onCancel: () => void
}) {
  const t = useTranslations('team')
  const tCommon = useTranslations('common')
  const [value, setValue] = useState(plan.minDate)
  const patch = confirmAskedDate(plan, value)
  const lastUrgentDay = addDays(plan.minDate, -1).slice(5)

  return (
    <Modal
      open
      onClose={onCancel}
      title={t('org.askDateTitle')}
      width="max-w-sm"
      footer={(
        <>
          <Button variant="ghost" onClick={onCancel}>{tCommon('cancel')}</Button>
          <Button disabled={!patch} onClick={() => { if (patch) onConfirm(patch) }}>{t('org.confirm')}</Button>
        </>
      )}
    >
      <p className="text-sm text-ink-700">{t('org.askDateBody', { date: lastUrgentDay })}</p>
      <input
        type="date"
        aria-label={t('org.dueDate')}
        min={plan.minDate}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="mt-3 h-11 w-full rounded-field border border-line bg-surface px-3 text-sm text-ink-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-ring"
      />
      {!patch && <p className="mt-2 text-xs text-danger-text">{t('org.askDateInvalid', { date: lastUrgentDay })}</p>}
    </Modal>
  )
}
```

- [ ] **Step 4: 新建 `DropNotice.tsx`**

```tsx
'use client'

import { useEffect } from 'react'
import { useTranslations } from 'next-intl'

/** 拖放后的提示条（spec 4.2）：5 秒后自动消失；有旧值时提供「撤销」。onDismiss 须是稳定引用。 */
export default function DropNotice({ message, canUndo, onUndo, onDismiss }: {
  message: string
  canUndo: boolean
  onUndo: () => void
  onDismiss: () => void
}) {
  const t = useTranslations('team')
  useEffect(() => {
    const timer = window.setTimeout(onDismiss, 5000)
    return () => window.clearTimeout(timer)
  }, [onDismiss])

  return (
    <div role="status" className="pointer-events-none fixed inset-x-0 bottom-6 z-40 flex justify-center px-4">
      <div className="pointer-events-auto flex max-w-md items-center gap-3 rounded-card bg-ink-900 py-1.5 pl-4 pr-2 text-sm text-surface shadow-pop">
        <span className="min-w-0">{message}</span>
        {canUndo && (
          <button
            type="button"
            onClick={onUndo}
            className="min-h-11 flex-none rounded-field px-3 font-semibold text-surface underline underline-offset-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-ring"
          >
            {t('org.undo')}
          </button>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 5: 跑检查**

Run: `npx tsc --noEmit && npm test && npm run test:copy`
Expected: PASS（两个组件 Task 5 才挂载）。

- [ ] **Step 6: Commit**

```bash
test "$(git branch --show-current)" = feat/org-quadrant-drag
git add package.json package-lock.json messages/zh.json messages/en.json messages/ja.json src/components/org/DueDatePrompt.tsx src/components/org/DropNotice.tsx
git commit -m "feat(org): 引入 dnd-kit，加拖拽文案、截止日询问框与撤销提示条"
```

---

### Task 5: 拖拽接线

**Files:**
- Create: `src/components/org/QuadrantDnd.tsx`
- Modify: `src/components/org/QuadrantView.tsx`

**Interfaces:**
- Consumes：Task 1 的 `planDrop`、`confirmAskedDate`；Task 2 的 `nextZone`、`ZoneRect`、`Direction`；Task 3 的 `pickItemFields`；Task 4 的 `DueDatePrompt`、`DropNotice` 与文案；`@dnd-kit/core`。
- Produces：`QuadrantView` 的 props 不变（`snapshot today onUpdateItem onPickOwner`）。

- [ ] **Step 1: 新建 `QuadrantDnd.tsx`**

```tsx
'use client'

import type { ReactNode } from 'react'
import { useTranslations } from 'next-intl'
import { useDraggable, useDroppable } from '@dnd-kit/core'
import type { KeyboardCoordinateGetter } from '@dnd-kit/core'
import { nextZone } from '@/lib/org/dragZones'
import type { Direction, ZoneRect } from '@/lib/org/dragZones'
import type { Bucket, Quadrant, QuadrantRow } from '@/lib/org/quadrant'

// 拖拽数据约定：可拖元素 data = { itemId }，可放区 data = { target }。
// 同一事项在桌面树（d:）与手机树（m:）各渲染一次，dnd-kit 的 id 必须唯一，所以加前缀。

/** 可拖的事项按钮。不可编辑时退化为普通按钮（不挂拖拽属性，读屏不会读成「可拖动」）。 */
export function DraggableButton({ dragId, itemId, disabled, className, onClick, title, children }: {
  dragId: string
  itemId: string
  disabled: boolean
  className: string
  onClick: () => void
  title?: string
  children: ReactNode
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: dragId, data: { itemId }, disabled })
  return (
    <button
      ref={setNodeRef}
      type="button"
      {...(disabled ? {} : attributes)}
      {...(disabled ? {} : listeners)}
      onClick={onClick}
      title={title}
      className={`touch-manipulation ${isDragging ? 'opacity-40' : ''} ${className}`}
    >
      {children}
    </button>
  )
}

/** 可放区。事项当前所在的区禁用（放回原处 = 不算落点），悬停时描边高亮。 */
export function DropZone({ id, target, current, label, className, children }: {
  id: string
  target: Bucket
  current: Bucket | null
  label: string
  className: string
  children: ReactNode
}) {
  const disabled = current === target
  const { setNodeRef, isOver } = useDroppable({ id, data: { target }, disabled })
  return (
    <section
      ref={setNodeRef}
      aria-label={label}
      className={`${className} ${isOver && !disabled ? 'ring-2 ring-primary-ring ring-offset-2' : ''}`}
    >
      {children}
    </section>
  )
}

/** 跟手的精简卡片（DragOverlay 里渲染）。 */
export function DragPreview({ row, ownerLabel }: { row: QuadrantRow; ownerLabel: string }) {
  return (
    <div className="flex max-w-[18rem] items-center gap-2 rounded-field border border-primary-border bg-surface px-3 py-2 text-sm text-ink-900 shadow-pop">
      <span className="min-w-0 flex-1 truncate">{row.name}</span>
      <span className="flex-none text-xs text-ink-500">{ownerLabel}</span>
    </div>
  )
}

/** 手机列表层起拖后从底部滑出的放置区（spec 3.3）。桌面隐藏。 */
export function DropDock({ current, titleOf, tone }: {
  current: Bucket
  titleOf: (b: Bucket) => string
  tone: Record<Quadrant, { dot: string; text: string; tile: string }>
}) {
  const t = useTranslations('team')
  const quads: Quadrant[] = ['q1', 'q2', 'q3', 'q4']
  const others: Bucket[] = ['unrated', 'done']
  return (
    <div
      className="fixed inset-x-0 bottom-0 z-40 rounded-t-card bg-surface px-3 pt-3 shadow-pop md:hidden"
      style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom))' }}
    >
      <p className="mb-2 text-center text-xs text-ink-500">{t('org.dockTitle')}</p>
      <div className="grid grid-cols-2 gap-2">
        {quads.map((q) => (
          <DropZone
            key={q}
            id={`dock:${q}`}
            target={q}
            current={current}
            label={titleOf(q)}
            className={`flex min-h-16 items-center justify-center gap-1.5 rounded-field border text-md font-semibold ${tone[q].tile} ${tone[q].text} ${current === q ? 'opacity-40' : ''}`}
          >
            <span aria-hidden className={`h-2 w-2 rounded-full ${tone[q].dot}`} />
            {titleOf(q)}
          </DropZone>
        ))}
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2">
        {others.map((b) => (
          <DropZone
            key={b}
            id={`dock:${b}`}
            target={b}
            current={current}
            label={titleOf(b)}
            className={`flex min-h-11 items-center justify-center rounded-field border border-dashed border-line-strong text-sm text-ink-700 ${current === b ? 'opacity-40' : ''}`}
          >
            {titleOf(b)}
          </DropZone>
        ))}
      </div>
    </div>
  )
}

const ARROWS: Record<string, Direction> = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' }

/** 键盘方向键：跳到该方向最近的可放区中心（spec 3.5）。非方向键或没有目标时不移动。 */
export const zoneKeyboardCoordinates: KeyboardCoordinateGetter = (event, { context }) => {
  const dir = ARROWS[event.code]
  if (!dir) return undefined
  const { collisionRect, droppableRects } = context
  if (!collisionRect) return undefined
  event.preventDefault()
  const zones: ZoneRect[] = []
  droppableRects.forEach((r, id) => {
    zones.push({ id: String(id), left: r.left, top: r.top, width: r.width, height: r.height })
  })
  const zone = nextZone(
    zones,
    { x: collisionRect.left + collisionRect.width / 2, y: collisionRect.top + collisionRect.height / 2 },
    dir,
  )
  if (!zone) return undefined
  return {
    x: zone.left + (zone.width - collisionRect.width) / 2,
    y: zone.top + (zone.height - collisionRect.height) / 2,
  }
}
```

- [ ] **Step 2: 改 `QuadrantView.tsx` 的 import 与常量**

文件顶部 import 区替换为：

```tsx
'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import {
  DndContext, DragOverlay, KeyboardSensor, MeasuringStrategy, MouseSensor, TouchSensor,
  pointerWithin, rectIntersection, useSensor, useSensors,
} from '@dnd-kit/core'
import type { Announcements, CollisionDetection, DragEndEvent, DragStartEvent, Over } from '@dnd-kit/core'
import { Stat, StatBand } from '@/components/ui/Stat'
import ItemDetailPanel from './ItemDetailPanel'
import OwnerFilter from './OwnerFilter'
import DueDatePrompt from './DueDatePrompt'
import DropNotice from './DropNotice'
import { DragPreview, DraggableButton, DropDock, DropZone, zoneKeyboardCoordinates } from './QuadrantDnd'
import { writeSearchParams } from './searchParams'
import {
  QUADRANTS, URGENT_WITHIN_DAYS, bucketOf, dueBadge, flattenItems, groupItems, ownerOptions,
  parseLevel, parseOwnerFilter, planDrop, quadrantStats,
} from '@/lib/org/quadrant'
import { pickItemFields } from '@/lib/org/tree'
import type { Bucket, DueBadge, ItemPatch, OwnerFilter as OwnerFilterValue, Quadrant, QuadrantRow } from '@/lib/org/quadrant'
import type { OrgSnapshot } from '@/lib/types'
```

在 `const FOCUS = ...` 之后加：

```tsx
// 鼠标 / 触控：指针落在哪个区就算哪个；键盘没有指针，退回矩形相交（覆盖层被方向键移到区中心）。
const collision: CollisionDetection = (args) => {
  const hits = pointerWithin(args)
  return hits.length > 0 ? hits : rectIntersection(args)
}
```

- [ ] **Step 3: 组件内加状态、传感器与处理函数**

在 `const positionName = ...` 那一行之后加：

```tsx
  const canEdit = snapshot.canEdit
  const [dragging, setDragging] = useState<{ row: QuadrantRow; from: Bucket } | null>(null)
  const [ask, setAsk] = useState<{ row: QuadrantRow; target: Bucket; base: ItemPatch; minDate: string } | null>(null)
  const [notice, setNotice] = useState<{ key: number; message: string; itemId: string; undo: ItemPatch | null } | null>(null)
  const dismissNotice = useCallback(() => setNotice(null), [])
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 5 } }),
    // Enter 留给「打开详情」，只用 Space 拿起 / 放下（spec 3.4）
    useSensor(KeyboardSensor, {
      coordinateGetter: zoneKeyboardCoordinates,
      keyboardCodes: { start: ['Space'], cancel: ['Escape'], end: ['Space'] },
    }),
  )
```

在 `const ownerLabel = ...` 那一行之后加：

```tsx
  const rowOf = (itemId: unknown) => rows.find((r) => r.id === itemId) ?? null
  const targetOf = (over: Over | null): Bucket | null =>
    (over?.data.current as { target?: Bucket } | undefined)?.target ?? null

  // 写入 + 提示条。撤销用的旧值在写入前从当前快照取。
  const commitDrop = (row: QuadrantRow, target: Bucket, patch: ItemPatch, autoDue: string | null) => {
    const undo = pickItemFields(snapshot, row.id, Object.keys(patch) as (keyof ItemPatch)[])
    onUpdateItem(row.id, patch)
    const zone = title(target)
    const message = target === 'done' ? t('org.dropDone')
      : row.status === 'done' ? t('org.dropReopened', { zone })
        : autoDue ? t('org.dropMovedDue', { zone, date: autoDue.slice(5) })
          : t('org.dropMoved', { zone })
    setNotice({ key: Date.now(), message, itemId: row.id, undo })
  }

  const onDragStart = ({ active }: DragStartEvent) => {
    const row = rowOf(active.data.current?.itemId)
    setDragging(row ? { row, from: bucketOf(row, today) } : null)
  }
  const onDragEnd = ({ active, over }: DragEndEvent) => {
    setDragging(null)
    const row = rowOf(active.data.current?.itemId)
    const target = targetOf(over)
    if (!row || !target) return
    const plan = planDrop(row, target, today)
    if (plan.kind === 'noop') return
    if (plan.kind === 'askDate') {
      setAsk({ row, target, base: plan.base, minDate: plan.minDate })
      return
    }
    commitDrop(row, target, plan.patch, plan.autoDue)
  }
  const onUndo = () => {
    if (notice?.undo) onUpdateItem(notice.itemId, notice.undo)
    setNotice(null)
  }

  const announcements: Announcements = {
    onDragStart: ({ active }) => t('org.dragAnnouncePick', { name: rowOf(active.data.current?.itemId)?.name ?? '' }),
    onDragOver: ({ over }) => {
      const target = targetOf(over)
      return target ? t('org.dragAnnounceOver', { zone: title(target) }) : undefined
    },
    onDragEnd: ({ over }) => {
      const target = targetOf(over)
      return target ? t('org.dragAnnounceDrop', { zone: title(target) }) : t('org.dragAnnounceCancel')
    },
    onDragCancel: () => t('org.dragAnnounceCancel'),
  }
```

- [ ] **Step 4: 事项改为可拖、区域改为可放**

1. `desktopRow` 里的 `<button ...>…</button>` 换成：

```tsx
      <DraggableButton
        dragId={`d:${row.id}`}
        itemId={row.id}
        disabled={!canEdit}
        onClick={() => setSelectedId(row.id)}
        title={`${row.businessName} › ${row.taskName}`}
        className={`flex w-full items-center gap-2.5 rounded-field px-2 py-2 text-left text-sm hover:bg-row-hover ${FOCUS}`}
      >
        <span className={`min-w-0 flex-1 truncate ${row.status === 'done' ? 'text-ink-500 line-through' : 'text-ink-900'}`}>{row.name}</span>
        <span className={`max-w-[7rem] flex-none truncate text-xs ${row.ownerKey === 'none' ? 'font-semibold text-warning-text' : 'text-ink-500'}`}>{ownerLabel(row)}</span>
        {badges(row)}
      </DraggableButton>
```

2. `quadrantCard` 外层 `<section key={q} aria-label={title(q)} className="…">…</section>` 换成 `DropZone`（内容不变）：

```tsx
  const quadrantCard = (q: Quadrant) => (
    <DropZone
      key={q}
      id={`zone:${q}`}
      target={q}
      current={dragging?.from ?? null}
      label={title(q)}
      className="flex h-[420px] min-h-0 flex-col rounded-card border border-line bg-surface shadow-card"
    >
      {/* header 与列表保持原样 */}
    </DropZone>
  )
```

（把原 `<header>…</header>` 和 `{groups[q].length === 0 ? … : …}` 原样放进去，替换掉那行注释。）

3. 「待评估」区外层 `<section aria-label={t('org.unratedTitle')} className="…">` 换成 `<DropZone id="zone:unrated" target="unrated" current={dragging?.from ?? null} label={t('org.unratedTitle')} className="rounded-card border border-dashed border-line-strong bg-surface p-4">`，闭合标签对应改成 `</DropZone>`；其中每个事项的 `<button …>` 换成：

```tsx
                <DraggableButton
                  dragId={`d:${row.id}`}
                  itemId={row.id}
                  disabled={!canEdit}
                  onClick={() => setSelectedId(row.id)}
                  className={`inline-flex h-8 items-center gap-1.5 rounded-btn bg-line-soft px-3 text-xs text-ink-900 hover:bg-row-hover ${FOCUS}`}
                >
                  <span className="max-w-[16rem] truncate">{row.name}</span>
                  <span className={row.ownerKey === 'none' ? 'font-semibold text-warning-text' : 'text-ink-500'}>{ownerLabel(row)}</span>
                </DraggableButton>
```

4. 「已完成」区外层 `<section aria-label={t('org.doneTitle')} className="rounded-card border border-line bg-surface">` 换成 `<DropZone id="zone:done" target="done" current={dragging?.from ?? null} label={t('org.doneTitle')} className="rounded-card border border-line bg-surface">`，闭合改 `</DropZone>`（内部的展开按钮与 `groups.done.map(desktopRow)` 不变——收起时整个区仍可放）。

5. `mobileCard` 里的 `<button …>…</button>` 换成：

```tsx
      <DraggableButton
        dragId={`m:${row.id}`}
        itemId={row.id}
        disabled={!canEdit}
        onClick={() => setSelectedId(row.id)}
        className={`flex w-full flex-col gap-2 rounded-card border border-line bg-surface p-3.5 text-left shadow-card ${FOCUS}`}
      >
        <span className="w-full truncate text-xs text-ink-500">{row.businessName} › {row.taskName}</span>
        <span className={`text-md font-medium leading-snug ${row.status === 'done' ? 'text-ink-500 line-through' : 'text-ink-900'}`}>{row.name}</span>
        <span className="flex w-full items-center justify-between gap-2">
          <span className={`truncate text-xs ${row.ownerKey === 'none' ? 'font-semibold text-warning-text' : 'text-ink-700'}`}>{ownerLabel(row)}</span>
          {badges(row)}
        </span>
      </DraggableButton>
```

（手机首层的四个统计方块、待评估/已完成入口按钮**不**改，首层不可拖。）

- [ ] **Step 5: 外层包 `DndContext` 并挂上询问框、提示条**

组件最后的 `return (…)` 整段替换为：

```tsx
  return (
    <DndContext
      id="org-quadrant-dnd"
      sensors={sensors}
      collisionDetection={collision}
      measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragCancel={() => setDragging(null)}
      accessibility={{ announcements, screenReaderInstructions: { draggable: t('org.dragInstructions') } }}
    >
      <div>
        {desktop}
        <div className="md:hidden">{level ? mobileList : mobileHome}</div>
      </div>
      {dragging && <DropDock current={dragging.from} titleOf={title} tone={TONE} />}
      <DragOverlay>
        {dragging ? <DragPreview row={dragging.row} ownerLabel={ownerLabel(dragging.row)} /> : null}
      </DragOverlay>
      {selected && (
        <ItemDetailPanel
          row={selected}
          today={today}
          canEdit={snapshot.canEdit}
          positionName={positionName}
          onClose={closePanel}
          onUpdate={(fields) => onUpdateItem(selected.id, fields)}
          onPickOwner={() => onPickOwner(selected.id)}
        />
      )}
      {ask && (
        <DueDatePrompt
          plan={ask}
          onCancel={() => setAsk(null)}
          onConfirm={(patch) => {
            commitDrop(ask.row, ask.target, patch, null)
            setAsk(null)
          }}
        />
      )}
      {notice && (
        <DropNotice
          key={notice.key}
          message={notice.message}
          canUndo={notice.undo !== null}
          onUndo={onUndo}
          onDismiss={dismissNotice}
        />
      )}
    </DndContext>
  )
```

说明：`id="org-quadrant-dnd"` 让 dnd-kit 生成确定的无障碍 id，避免 SSR 与客户端 `aria-describedby` 不一致；`MeasuringStrategy.Always` 让起拖后才出现的手机放置区也能被测量。

- [ ] **Step 6: 跑检查**

Run: `npx tsc --noEmit && npm test && npm run test:copy`
Expected: PASS。再 `wc -l src/components/org/QuadrantView.tsx src/components/org/QuadrantDnd.tsx`，QuadrantView 应在 ~420 行以内；明显更大时在报告里说明。

- [ ] **Step 7: Commit**

```bash
test "$(git branch --show-current)" = feat/org-quadrant-drag
git add src/components/org/QuadrantDnd.tsx src/components/org/QuadrantView.tsx
git commit -m "feat(org): 四象限支持拖拽编辑（桌面拖、手机长按拖到放置区、键盘操作）"
```

---

### Task 6: 更新日志、全量检查与实测

**Files:**
- Modify: `src/lib/changelog/entries.ts`
- 临时（不提交）：`src/app/[locale]/login/quadrant-drag-fixture/page.tsx`、`.env.local` 拷贝

- [ ] **Step 1: 写更新日志**

在 `CHANGELOG` 顶部当天（2026-10-15）的日期块里加一条（若顶部不是当天，就新建当天的块；日期写实际合并当天）：

```ts
      {
        kind: 'feat',
        scope: '业务分工',
        title: '四象限可以直接拖动事项了：拖进格子即分级，拖进「已完成」即结项，拖错可撤销',
        details:
          '电脑上把事项从「待评估」拖进任一格就完成分级，四格之间互拖改重要与紧急，拖进「已完成」结项、再拖出来即重开。「紧急」仍由截止日决定：拖进紧急的一列时，没有截止日或超过 7 天的会自动把截止日设为 7 天后；从紧急的一列拖出去时会请你选一个 7 天以后的新日期。手机上在列表里长按卡片，底部会出现放置区。键盘也能操作：空格拿起、方向键换区、空格放下。每次拖完底部会提示改了什么，5 秒内可点「撤销」。',
      },
```

- [ ] **Step 2: 全量检查**

Run: `npm test && npx tsc --noEmit && npm run test:copy && npm run test:migrations`
Expected: 全部 PASS。

- [ ] **Step 3: 夹具页（不提交）**

`cp ../../../.env.local .env.local`，新建 `src/app/[locale]/login/quadrant-drag-fixture/page.tsx`：

```tsx
import FetchStub from './FetchStub'
import OrgPageView from '@/components/org/OrgPageView'
import type { OrgSnapshot, TaskItem } from '@/lib/types'

// 临时夹具：验拖拽交互，验完删除，不提交。?mock=ok 让写入成功，?mock=fail 让写入失败。
const TODAY = '2026-10-15'
const item = (id: string, name: string, over: Partial<TaskItem>): TaskItem => ({
  id, task_id: 't1', name, sort_order: Number(id.slice(1)),
  owner_member_type: 'user', owner_user_id: 'u1', owner_creator_id: null, owner_name: 'Member A',
  is_important: null, due_date: null, status: 'todo', ...over,
})
const snapshot: OrgSnapshot = {
  canEdit: true,
  people: [{ member_type: 'user', id: 'u1', name: 'Member A' }],
  positions: [],
  businesses: [{
    id: 'b1', key: 'b', name: 'Business 1', sort_order: 1,
    owner_member_type: null, owner_user_id: null, owner_creator_id: null, owner_name: null,
    tasks: [{ id: 't1', business_id: 'b1', name: 'Task 1', sort_order: 1, position_ids: [], items: [
      item('i1', 'Unrated A', {}),
      item('i2', 'Unrated B with far due', { due_date: '2026-11-30' }),
      item('i3', 'Urgent important', { is_important: true, due_date: '2026-10-18' }),
      item('i4', 'Planned important', { is_important: true, due_date: '2026-11-14' }),
      item('i5', 'Blocked not important', { is_important: false, status: 'blocked' }),
      item('i6', 'Finished one', { is_important: true, status: 'done' }),
    ] }],
  }],
}

export default function QuadrantDragFixturePage() {
  return (
    <div className="min-h-screen bg-canvas p-6 md:pl-[264px]">
      <FetchStub />
      <OrgPageView initial={snapshot} initialToday={TODAY} />
    </div>
  )
}
```

同目录新建 `FetchStub.tsx`：

```tsx
'use client'

import { useEffect } from 'react'

export default function FetchStub() {
  useEffect(() => {
    const mode = new URLSearchParams(window.location.search).get('mock')
    if (!mode) return
    const original = window.fetch
    window.fetch = async (input, init) => {
      if (String(input).includes('/api/org/items/')) {
        await new Promise((r) => setTimeout(r, 400))
        return mode === 'ok'
          ? new Response(JSON.stringify({ data: { id: 'x' }, error: null }), { status: 200, headers: { 'Content-Type': 'application/json' } })
          : new Response(JSON.stringify({ data: null, error: 'mock failure' }), { status: 500, headers: { 'Content-Type': 'application/json' } })
      }
      return original(input, init)
    }
    return () => { window.fetch = original }
  }, [])
  return null
}
```

（`OrgPageView` 当前 props 名为 `initial` 与 `initialToday`，以文件实际签名为准。）

- [ ] **Step 4: 生产构建并启动**

```bash
trash .next 2>/dev/null; npx next build && ls .next/BUILD_ID
npx next start -p 3108
```

（后台运行。判据是 `BUILD_ID` 存在且路由表有 `/[locale]/login/quadrant-drag-fixture`。）

- [ ] **Step 5: 桌面 1440 实测**

浏览器打开 `http://localhost:3108/zh/login/quadrant-drag-fixture?mock=ok`，视口 1440×900。每一项用 JS 读 DOM 断言（截图只留档），用浏览器工具的真实鼠标拖动（按下-移动-松开），`window.alert` 可先替换成记录数组：

1. 把「Unrated A」拖进「立即做」→ 它出现在立即做格，徽标显示 10-22；提示条「已移到「立即做」，截止日设为 10-22」；点「撤销」→ 回到待评估且无截止日。
2. 「Urgent important」（立即做）拖进「排进计划」→ 弹出询问框，默认 2026-10-23；点取消 → 仍在立即做、无提示条；再拖一次，选 2026-10-30 点确定 → 进入排进计划。询问框里改成 2026-10-22 时「确定」不可点并显示提示。
3. 「Blocked not important」（放一放）拖进「排进计划」→ 进入排进计划且仍显示「卡住」。
4. 任一事项拖进「已完成」（收起状态，拖到标题栏）→ 已完成计数 +1、提示「已标为完成」；展开已完成，把它拖回待评估 → 提示「已重新打开…」。
5. 拖到四格之外（例如统计条）松手 → 没有任何变化、没有提示条、Network 里没有 PATCH。
6. 原地点一下事项（鼠标移动 < 6px）→ 打开详情面板，没有触发拖拽。
7. 键盘：用 JS `focus()` 一个待评估事项，按 Enter → 打开详情（关掉它）；再按 Space → 拿起，按 ArrowUp / ArrowRight 等把覆盖层移到「排进计划」，按 Space 放下 → 事项进入排进计划；再拿起一个按 Esc → 不变化。
8. 失败回滚：打开 `?mock=fail`，把「Unrated A」拖进「放一放」→ 先立即进入放一放，约 0.4 秒后退回待评估，并出现「保存失败」。
9. 读屏：拖动时 dnd-kit 的 live region（`[id^="DndLiveRegion"]` 或 `aria-live` 区域）里出现「已拿起…」「已放进…」文案。

- [ ] **Step 6: 手机 375 实测**

视口 375×812，打开 `?mock=ok&q=unrated`：
1. 首层（去掉 `q`）的方块和入口按钮不可拖（没有 `aria-roledescription`）。
2. 列表层卡片带拖拽属性；用鼠标拖动一张卡片（模拟器送的是鼠标事件，走 MouseSensor）→ 底部出现放置区，四个象限 + 待评估 + 已完成，每个目标 `getBoundingClientRect().height ≥ 44`，当前所在目标半透明且不可放；拖到「立即做」放下 → 卡片离开列表、提示条出现。
3. `document.documentElement.scrollWidth ≤ innerWidth`（没有横向滚动）。
4. 真正的触控长按无法在本机模拟，记为「待真机验收」。

- [ ] **Step 7: 收尾**

```bash
pkill -f "next start -p 3108"
trash "src/app/[locale]/login/quadrant-drag-fixture" .next/types
git status --short
npx tsc --noEmit
```

Expected：`git status` 只剩 `src/lib/changelog/entries.ts`；tsc 干净。

- [ ] **Step 8: Commit**

```bash
test "$(git branch --show-current)" = feat/org-quadrant-drag
git add src/lib/changelog/entries.ts
git commit -m "docs(changelog): 补记四象限拖拽编辑"
```

---

### Task 7: 上线（主会话执行，合并前问 pollux）

不派给子代理。

- [ ] **Step 1: 全分支审查**：派新审查者看 `origin/main...feat/org-quadrant-drag` 全量 diff，对 `quadrant.test.ts`、`dragZones.test.ts`、`tree.test.ts` 在已提交基线上跑突变探针，交击杀表。
- [ ] **Step 2: 推送并开 PR**：推送前确认 main 没有新提交（有就合并进来重跑检查），grep 新增行里的真实人名、内部事项名、本机路径。PR 描述附桌面与手机截图，并注明「手机触控长按待真机验收」。
- [ ] **Step 3: 合并**：CI 全绿后问 pollux，得到明确同意才合并。
- [ ] **Step 4: 部署核对**：`vercel inspect mcn.agenova.chat` 指向合并后的生产部署。
- [ ] **Step 5: 线上验证**：pollux 授权后，在 `/team/org` 把一个待评估事项拖进「立即做」，确认截止日自动设好，再点撤销，查库确认三列恢复原值。
- [ ] **Step 6: 真机**：请 pollux 在手机上长按拖一次（列表层 → 放置区），反馈结果。
