# 竞品截图日期列对齐 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让竞品监测页的所有截图相册共用一条日期轴，竖着看一列就是同一天的不同竞品，缺图留占位保证行永远对齐。

**Architecture:** 页面级 `CompetitorDossierView` 持有 `anchorDate`，用纯函数算出日期轴与 5 列窗口，作为 props 逐层下传给每个 `ShotAlbum`。所有相册渲染完全相同的列集合与列宽，因此对齐是结构性质而非运行时同步的结果。日期归并、窗口计算、anchor 回落、日期校验全部抽成 `src/lib/competitors/shotGrid.ts` 里的纯函数并单测。

**Tech Stack:** Next.js 14 (App Router) · React 18 · TypeScript · Tailwind（语义 token）· next-intl · Supabase · `node --test --experimental-strip-types`

**设计文档:** `docs/superpowers/specs/2026-08-10-competitor-shot-date-columns-design.md`

**工作区:** `/Users/fengzhou/Code/newWith/.claude/worktrees/shot-date-columns`，分支 `feat/competitor-shot-date-columns`（已从 `origin/main` 切出）。所有命令都在这个目录里跑，**不要**在 `/Users/fengzhou/Code/newWith` 主仓操作——主仓正跑着另一个分支。每次提交前先跑 `git rev-parse --abbrev-ref HEAD` 确认分支是 `feat/competitor-shot-date-columns`。

---

## 三道必须遵守的仓库闸门

实现过程中反复会踩，先记牢：

1. **禁用样式基线**（`npm run test:style`）— `zinc-*` / `gray-*` / `slate-*` / 裸 hex 都是违规，按文件计数不得超过 `scripts/style-tokens-baseline.json` 的基线。现有基线：`CompetitorCard.tsx: 33`、`CompetitorDossierView.tsx: 7`、`ShotAlbum.tsx: 3`、`ShotUploader.tsx: 3`。**新建文件不在基线里，一处违规即致命。**

2. **正向 token 校验**（致命，不走基线）— 类名里的色阶必须真实登记在 `tailwind.config.ts`，否则 Tailwind 不生成、样式静默失效。可用的只有：

   | 用途 | 可用类名 |
   |---|---|
   | 背景 | `bg-canvas` `bg-surface` `bg-primary` `bg-primary-soft` `bg-row-hover` |
   | 文字 | `text-ink-900` `text-ink-700` `text-ink-500` `text-ink-400` `text-muted-text` `text-primary` `text-danger-text` |
   | 边框 | `border-line-soft` `border-line` `border-line-strong` `border-primary-border` |
   | 描边 | `ring-primary` |

   **没有 `ink-600`、没有 `ink-300`、没有 `line-DEFAULT` 以外的灰边框变体。** 禁止给 `primary-soft` / `line` / `muted-text` 这类固定值 token 加 `/50` 之类透明度修饰符（会静默失效）。`bg-black/60`、`text-white` 不在禁用名单内，可以用。

3. **JSX 禁裸中文**（`npm run test:no-bare-han`）— children、属性字符串、模板字面量里都不许出现汉字，允许名单已清空。所有文案走 `useTranslations('competitors')`，并同步补齐 `messages/en.json` `messages/zh.json` `messages/ja.json` 三份。

跑全部闸门：`npm run test:copy`

---

## File Structure

| 文件 | 职责 |
|---|---|
| `src/lib/competitors/shotGrid.ts` | **新建**。纯函数：日期轴收集、窗口切片、anchor 回落、按日期归组、日期格式校验。无 React、无 IO。 |
| `src/lib/competitors/shotGrid.test.ts` | **新建**。上述纯函数的单测。 |
| `src/components/competitors/ShotDateStrip.tsx` | **新建**。页面级日期条：窗口内日期 chip + 前后翻页。只读 axis/anchor，只回调 `onPick`。 |
| `src/components/competitors/ShotLightbox.tsx` | **新建**。当天图集查看器：左右切换、计数、日期编辑、删除。从 `ShotAlbum` 拆出来，避免 `ShotAlbum` 继续膨胀。 |
| `src/components/competitors/ShotAlbum.tsx` | **重写**。日期网格渲染，一格一天。原有 flex-wrap / 按周分组 / 折叠展开逻辑全部删除。 |
| `src/components/competitors/ShotUploader.tsx` | **改造**。从大块拖放区改为标题行内联控件，增加日期输入。 |
| `src/components/competitors/CompetitorCard.tsx` | **改**。透传 `dateWindow` / `selectedDate`；修正子主播卡的两处对齐破口。 |
| `src/components/competitors/CompetitorDossierView.tsx` | **改**。持有 `anchorDate`，算 axis/window，渲染 `ShotDateStrip`。 |
| `src/lib/competitors/service.ts` | **改**。`addShot` / `updateShot` 前置日期校验。 |
| `messages/{en,zh,ja}.json` | **改**。`competitors` 命名空间增删文案。 |
| `package.json` | **改**。`test` 脚本追加 `shotGrid.test.ts`。 |

---

### Task 1: shotGrid 模块骨架 + 日期校验

**Files:**
- Create: `src/lib/competitors/shotGrid.ts`
- Create: `src/lib/competitors/shotGrid.test.ts`
- Modify: `package.json`（`scripts.test` 追加新测试文件）

- [ ] **Step 1: 写失败的测试**

创建 `src/lib/competitors/shotGrid.test.ts`：

```ts
// src/lib/competitors/shotGrid.test.ts
import assert from 'node:assert/strict'
import test from 'node:test'

import { UNDATED_KEY, isValidShotDate } from './shotGrid.ts'

test('UNDATED_KEY: 无日期占位键', () => {
  assert.equal(UNDATED_KEY, '—')
})

test('isValidShotDate: 合法日期与 null', () => {
  assert.equal(isValidShotDate('2026-08-10'), true)
  assert.equal(isValidShotDate('2026-02-28'), true)
  assert.equal(isValidShotDate('2024-02-29'), true) // 闰年
  assert.equal(isValidShotDate(null), true)
  assert.equal(isValidShotDate(undefined), true)
})

test('isValidShotDate: 越界月日', () => {
  assert.equal(isValidShotDate('2026-13-01'), false)
  assert.equal(isValidShotDate('2026-02-30'), false)
  assert.equal(isValidShotDate('2026-02-29'), false) // 平年无 2/29
  assert.equal(isValidShotDate('2026-00-10'), false)
})

test('isValidShotDate: 年份超出合理范围', () => {
  // <input type="date"> 手滑很容易打出 0020 这种年份
  assert.equal(isValidShotDate('0000-01-01'), false)
  assert.equal(isValidShotDate('0020-08-10'), false)
  assert.equal(isValidShotDate('3000-01-01'), false)
})

test('isValidShotDate: 格式不合规', () => {
  assert.equal(isValidShotDate('2026-2-3'), false)
  assert.equal(isValidShotDate(''), false)
  assert.equal(isValidShotDate('2026-08-10T00:00:00Z'), false)
})

test('isValidShotDate: 非字符串类型', () => {
  assert.equal(isValidShotDate(20260810), false)
  assert.equal(isValidShotDate({}), false)
})
```

- [ ] **Step 2: 跑测试确认失败**

```bash
node --test --experimental-strip-types src/lib/competitors/shotGrid.test.ts
```

预期：FAIL，报错类似 `Cannot find module './shotGrid.ts'`

- [ ] **Step 3: 写最小实现**

创建 `src/lib/competitors/shotGrid.ts`：

```ts
// src/lib/competitors/shotGrid.ts
// 纯函数：把竞品截图按日期归并成一条整页共用的日期轴与窗口。

/** 无日期图片在日期轴上的占位键。 */
export const UNDATED_KEY = '—'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

/**
 * shot_on 是否合法：null / undefined 或真实存在的 YYYY-MM-DD 日历日。
 *
 * 这是**写入前的入参守卫**，不是通用的格式判定：null 表示"显式清空日期"、
 * undefined 表示"本次不改这个字段"，两者都必须放行，所以 null 合法而空串不合法。
 * 别拿它去校验文本框输入。
 *
 * 用 toISOString 回读比对，挡掉 2026-02-30 这类会被 Date 自动进位的假日期；
 * 年份另外卡范围，否则 0020-08-10 这种手滑值会在日期轴上拉出一列两千年前的孤儿。
 */
export function isValidShotDate(value: unknown): boolean {
  if (value === null || value === undefined) return true
  if (typeof value !== 'string') return false
  if (!DATE_RE.test(value)) return false
  const year = Number(value.slice(0, 4))
  if (year < 1900 || year > 2999) return false
  const d = new Date(value + 'T00:00:00Z')
  if (Number.isNaN(d.getTime())) return false
  return d.toISOString().slice(0, 10) === value
}
```

- [ ] **Step 4: 跑测试确认通过**

```bash
node --test --experimental-strip-types src/lib/competitors/shotGrid.test.ts
```

预期：PASS，6 个 test 全绿

- [ ] **Step 5: 把新测试文件接进 npm test**

打开 `package.json`，在 `scripts.test` 那一长串文件列表里，紧跟在 `src/lib/competitors/mentions.test.ts` 之后插入 `src/lib/competitors/shotGrid.test.ts`（空格分隔，同一行）。

漏了这一步，新测试永远不会在 `npm test` 里跑到。

- [ ] **Step 6: 跑全量测试确认接线成功**

```bash
npm test 2>&1 | tail -20
```

预期：输出的 `# tests` 总数比改动前增加 6，且 `# fail 0`（改动前基线 260）

- [ ] **Step 7: 提交**

```bash
git rev-parse --abbrev-ref HEAD
git add src/lib/competitors/shotGrid.ts src/lib/competitors/shotGrid.test.ts package.json
git commit -m "feat(competitors): shotGrid 模块 + shot_on 日期校验纯函数"
```

---

### Task 2: collectShotDates — 收集全站日期轴

**Files:**
- Modify: `src/lib/competitors/shotGrid.ts`
- Modify: `src/lib/competitors/shotGrid.test.ts`

- [ ] **Step 1: 写失败的测试**

在 `shotGrid.test.ts` 顶部的 import 改为：

```ts
import { UNDATED_KEY, isValidShotDate, collectShotDates } from './shotGrid.ts'
import type { CompetitorShot, CompetitorWithHistory } from './types.ts'
```

在文件末尾追加。注意这里用了两个构造辅助函数，避免每个用例都手写 `CompetitorWithHistory` 的全部字段：

```ts
function shot(id: string, shot_on: string | null): CompetitorShot {
  return {
    id,
    competitor_id: 'c1',
    image_url: `https://example.test/${id}.png`,
    shot_on,
    tag: null,
    caption: '',
    sort_order: 0,
    created_at: '2026-08-01T00:00:00Z',
  }
}

function competitor(
  id: string,
  shots: CompetitorShot[],
  related: CompetitorWithHistory[] = [],
): CompetitorWithHistory {
  return {
    id,
    platform: 'tiktok',
    handle: id,
    profile_url: `https://www.tiktok.com/@${id}`,
    display_name: null,
    note: '',
    created_at: '2026-08-01T00:00:00Z',
    parent_id: null,
    avatar_url: null,
    region: 'JP',
    member_count: null,
    composition: null,
    launch_city: null,
    launched_on: null,
    mc_note: null,
    online_note: null,
    latest_videos: null,
    latest: null,
    history: [],
    shots,
    weekly: [],
    related,
  }
}

test('collectShotDates: 跨竞品去重并升序', () => {
  const axis = collectShotDates([
    competitor('a', [shot('s1', '2026-08-05'), shot('s2', '2026-08-03')]),
    competitor('b', [shot('s3', '2026-08-05'), shot('s4', '2026-08-01')]),
  ])
  assert.deepEqual(axis, ['2026-08-01', '2026-08-03', '2026-08-05'])
})

test('collectShotDates: 递归收集 related 子主播的日期', () => {
  const axis = collectShotDates([
    competitor('parent', [shot('s1', '2026-08-05')], [
      competitor('kid', [shot('s2', '2026-08-02')]),
    ]),
  ])
  assert.deepEqual(axis, ['2026-08-02', '2026-08-05'])
})

test('collectShotDates: 存在无日期图时末尾追加 UNDATED_KEY', () => {
  const axis = collectShotDates([
    competitor('a', [shot('s1', '2026-08-05'), shot('s2', null)]),
  ])
  assert.deepEqual(axis, ['2026-08-05', UNDATED_KEY])
})

test('collectShotDates: 只有无日期图时轴上只有占位键', () => {
  assert.deepEqual(collectShotDates([competitor('a', [shot('s1', null)])]), [UNDATED_KEY])
})

test('collectShotDates: 全空返回空数组', () => {
  assert.deepEqual(collectShotDates([]), [])
  assert.deepEqual(collectShotDates([competitor('a', [])]), [])
})
```

- [ ] **Step 2: 跑测试确认失败**

```bash
node --test --experimental-strip-types src/lib/competitors/shotGrid.test.ts
```

预期：FAIL，`collectShotDates is not a function`

- [ ] **Step 3: 写最小实现**

在 `shotGrid.ts` 顶部注释下面加 import：

```ts
import type { CompetitorShot, CompetitorWithHistory } from './types.ts'
```

在文件末尾追加：

```ts
/**
 * 递归收集所有竞品（含 related 子主播）有图的日期，升序去重。
 * 存在 shot_on 为空的图时，末尾追加 UNDATED_KEY 作为兜底列。
 */
export function collectShotDates(competitors: CompetitorWithHistory[]): string[] {
  const dated = new Set<string>()
  let hasUndated = false
  const walk = (list: CompetitorWithHistory[]) => {
    for (const c of list) {
      for (const s of c.shots ?? []) {
        if (s.shot_on) dated.add(s.shot_on)
        else hasUndated = true
      }
      if (c.related?.length) walk(c.related)
    }
  }
  walk(competitors ?? [])
  // Array.from 而非展开：避免 Set 展开在当前 tsconfig 下触发 TS2802
  const axis = Array.from(dated).sort((a, b) => a.localeCompare(b))
  if (hasUndated) axis.push(UNDATED_KEY)
  return axis
}
```

- [ ] **Step 4: 跑测试确认通过**

```bash
node --test --experimental-strip-types src/lib/competitors/shotGrid.test.ts
```

预期：PASS，11 个 test 全绿

- [ ] **Step 5: 提交**

```bash
git rev-parse --abbrev-ref HEAD
git add src/lib/competitors/shotGrid.ts src/lib/competitors/shotGrid.test.ts
git commit -m "feat(competitors): collectShotDates 递归收集全站截图日期轴"
```

---

### Task 3: windowOf — 窗口切片

**Files:**
- Modify: `src/lib/competitors/shotGrid.ts`
- Modify: `src/lib/competitors/shotGrid.test.ts`

- [ ] **Step 1: 写失败的测试**

import 追加 `windowOf`，文件末尾加：

```ts
const AXIS10 = ['d0', 'd1', 'd2', 'd3', 'd4', 'd5', 'd6', 'd7', 'd8', 'd9']

test('windowOf: anchor 居中取 5 列', () => {
  assert.deepEqual(windowOf(AXIS10, 4, 5), ['d2', 'd3', 'd4', 'd5', 'd6'])
})

test('windowOf: 贴左边界仍取满 5 列且含 anchor', () => {
  assert.deepEqual(windowOf(AXIS10, 0, 5), ['d0', 'd1', 'd2', 'd3', 'd4'])
})

test('windowOf: 贴右边界仍取满 5 列且含 anchor', () => {
  assert.deepEqual(windowOf(AXIS10, 9, 5), ['d5', 'd6', 'd7', 'd8', 'd9'])
})

test('windowOf: anchorIndex 为 -1 时按贴右处理', () => {
  assert.deepEqual(windowOf(AXIS10, -1, 5), ['d5', 'd6', 'd7', 'd8', 'd9'])
})

test('windowOf: 轴长度不足 size 时全量返回', () => {
  assert.deepEqual(windowOf(['a', 'b', 'c'], 1, 5), ['a', 'b', 'c'])
})

test('windowOf: 空轴或非正 size 返回空数组', () => {
  assert.deepEqual(windowOf([], 0, 5), [])
  assert.deepEqual(windowOf(AXIS10, 4, 0), [])
})

test('windowOf: 不修改入参', () => {
  const axis = AXIS10.slice()
  windowOf(axis, 4, 5)
  assert.deepEqual(axis, AXIS10)
})
```

- [ ] **Step 2: 跑测试确认失败**

```bash
node --test --experimental-strip-types src/lib/competitors/shotGrid.test.ts
```

预期：FAIL，`windowOf is not a function`

- [ ] **Step 3: 写最小实现**

追加到 `shotGrid.ts`：

```ts
/**
 * 以 anchorIndex 为中心取 size 列，夹逼到 [0, axis.length)。
 * 靠边时向另一侧补足，仍尽量取满 size 列，保证每个竞品行的列数一致。
 * anchorIndex 为 -1（anchor 不在轴上）时按贴右处理，即取轴末尾 size 列。
 */
export function windowOf(axis: string[], anchorIndex: number, size: number): string[] {
  if (!axis.length || size <= 0) return []
  if (size >= axis.length) return axis.slice()
  const anchor = anchorIndex < 0 ? axis.length - 1 : Math.min(anchorIndex, axis.length - 1)
  let start = anchor - Math.floor((size - 1) / 2)
  if (start < 0) start = 0
  if (start + size > axis.length) start = axis.length - size
  return axis.slice(start, start + size)
}
```

- [ ] **Step 4: 跑测试确认通过**

```bash
node --test --experimental-strip-types src/lib/competitors/shotGrid.test.ts
```

预期：PASS，18 个 test 全绿

- [ ] **Step 5: 提交**

```bash
git rev-parse --abbrev-ref HEAD
git add src/lib/competitors/shotGrid.ts src/lib/competitors/shotGrid.test.ts
git commit -m "feat(competitors): windowOf 日期窗口切片"
```

---

### Task 4: resolveAnchor — anchor 回落

轴会随上传/改日期/删除而重算。用户选中的那天可能从轴上消失，需要一个确定的回落规则：日历距离最近的一天，并列时取较新的。

**Files:**
- Modify: `src/lib/competitors/shotGrid.ts`
- Modify: `src/lib/competitors/shotGrid.test.ts`

- [ ] **Step 1: 写失败的测试**

import 追加 `resolveAnchor`，文件末尾加：

```ts
test('resolveAnchor: anchor 在轴上时原样返回', () => {
  assert.equal(resolveAnchor(['2026-08-01', '2026-08-05'], '2026-08-01'), '2026-08-01')
})

test('resolveAnchor: anchor 为 null 时取最新一天', () => {
  assert.equal(resolveAnchor(['2026-08-01', '2026-08-05'], null), '2026-08-05')
})

test('resolveAnchor: anchor 脱轴时取日历距离最近的一天', () => {
  const axis = ['2026-08-01', '2026-08-10', '2026-08-20']
  assert.equal(resolveAnchor(axis, '2026-08-09'), '2026-08-10')
  assert.equal(resolveAnchor(axis, '2026-08-02'), '2026-08-01')
})

test('resolveAnchor: 距离并列时取较新的一天', () => {
  // 08-05 距 08-01 与 08-09 各 4 天
  assert.equal(resolveAnchor(['2026-08-01', '2026-08-09'], '2026-08-05'), '2026-08-09')
})

test('resolveAnchor: UNDATED_KEY 不参与距离计算', () => {
  const axis = ['2026-08-01', UNDATED_KEY]
  assert.equal(resolveAnchor(axis, '2026-08-30'), '2026-08-01')
})

test('resolveAnchor: anchor 本身是 UNDATED_KEY 但已脱轴时取最新一天', () => {
  assert.equal(resolveAnchor(['2026-08-01', '2026-08-05'], UNDATED_KEY), '2026-08-05')
})

test('resolveAnchor: 轴尾有 UNDATED_KEY 时默认仍取最新的有日期那天', () => {
  // collectShotDates 把占位键追加在轴尾,不能直接拿 axis 末位当"最新一天"
  assert.equal(resolveAnchor(['2026-08-01', '2026-08-05', UNDATED_KEY], null), '2026-08-05')
})

test('resolveAnchor: 轴上只剩 UNDATED_KEY 时返回占位键', () => {
  assert.equal(resolveAnchor([UNDATED_KEY], '2026-08-01'), UNDATED_KEY)
})

test('resolveAnchor: 空轴返回 null', () => {
  assert.equal(resolveAnchor([], '2026-08-01'), null)
  assert.equal(resolveAnchor([], null), null)
})
```

- [ ] **Step 2: 跑测试确认失败**

```bash
node --test --experimental-strip-types src/lib/competitors/shotGrid.test.ts
```

预期：FAIL，`resolveAnchor is not a function`

- [ ] **Step 3: 写最小实现**

追加到 `shotGrid.ts`：

```ts
/**
 * 把用户选中的 anchor 归一化到轴上的一个真实日期。
 * 命中则原样返回；未命中（轴重算后该天消失、或初始为 null）取日历距离最近的一天，
 * 距离并列时取较新的一天。UNDATED_KEY 不参与距离计算。轴为空返回 null。
 */
export function resolveAnchor(axis: string[], anchor: string | null): string | null {
  if (!axis.length) return null
  if (anchor && axis.includes(anchor)) return anchor
  // 注意：UNDATED_KEY 被 collectShotDates 追加在轴尾，所以"最新一天"必须从
  // 过滤掉占位键的 dated 里取，不能直接拿 axis 的末位。
  const dated = axis.filter((d) => d !== UNDATED_KEY)
  const newest = dated.length ? dated[dated.length - 1] : axis[axis.length - 1]
  if (!anchor || anchor === UNDATED_KEY) return newest
  if (!dated.length) return newest
  const target = Date.parse(anchor + 'T00:00:00Z')
  if (Number.isNaN(target)) return dated[dated.length - 1]
  let best = dated[0]
  let bestDist = Infinity
  for (const d of dated) {
    const dist = Math.abs(Date.parse(d + 'T00:00:00Z') - target)
    if (dist < bestDist || (dist === bestDist && d > best)) {
      best = d
      bestDist = dist
    }
  }
  return best
}
```

- [ ] **Step 4: 跑测试确认通过**

```bash
node --test --experimental-strip-types src/lib/competitors/shotGrid.test.ts
```

预期：PASS，27 个 test 全绿

- [ ] **Step 5: 提交**

```bash
git rev-parse --abbrev-ref HEAD
git add src/lib/competitors/shotGrid.ts src/lib/competitors/shotGrid.test.ts
git commit -m "feat(competitors): resolveAnchor 轴重算后的 anchor 回落规则"
```

---

### Task 5: groupShotsByDate — 按日期归组

**Files:**
- Modify: `src/lib/competitors/shotGrid.ts`
- Modify: `src/lib/competitors/shotGrid.test.ts`

- [ ] **Step 1: 写失败的测试**

import 追加 `groupShotsByDate`，文件末尾加：

```ts
function shotAt(id: string, shot_on: string | null, sort_order: number, created_at: string): CompetitorShot {
  return { ...shot(id, shot_on), sort_order, created_at }
}

test('groupShotsByDate: 按日期归组', () => {
  const g = groupShotsByDate([
    shot('s1', '2026-08-01'),
    shot('s2', '2026-08-02'),
    shot('s3', '2026-08-01'),
  ])
  assert.deepEqual(g.get('2026-08-01')!.map((s) => s.id), ['s1', 's3'])
  assert.deepEqual(g.get('2026-08-02')!.map((s) => s.id), ['s2'])
})

test('groupShotsByDate: 组内按 sort_order 升序，首张为封面', () => {
  const g = groupShotsByDate([
    shotAt('b', '2026-08-01', 2, '2026-08-01T00:00:00Z'),
    shotAt('a', '2026-08-01', 1, '2026-08-01T00:00:00Z'),
  ])
  assert.deepEqual(g.get('2026-08-01')!.map((s) => s.id), ['a', 'b'])
})

test('groupShotsByDate: sort_order 相同时按 created_at 升序', () => {
  const g = groupShotsByDate([
    shotAt('late', '2026-08-01', 0, '2026-08-01T10:00:00Z'),
    shotAt('early', '2026-08-01', 0, '2026-08-01T09:00:00Z'),
  ])
  assert.deepEqual(g.get('2026-08-01')!.map((s) => s.id), ['early', 'late'])
})

test('groupShotsByDate: shot_on 为空归入 UNDATED_KEY', () => {
  const g = groupShotsByDate([shot('s1', null)])
  assert.deepEqual(g.get(UNDATED_KEY)!.map((s) => s.id), ['s1'])
})

test('groupShotsByDate: 空输入返回空 Map', () => {
  assert.equal(groupShotsByDate([]).size, 0)
})

test('groupShotsByDate: 不修改入参数组的顺序', () => {
  const input = [shotAt('b', '2026-08-01', 2, '2026-08-01T00:00:00Z'), shotAt('a', '2026-08-01', 1, '2026-08-01T00:00:00Z')]
  groupShotsByDate(input)
  assert.deepEqual(input.map((s) => s.id), ['b', 'a'])
})
```

- [ ] **Step 2: 跑测试确认失败**

```bash
node --test --experimental-strip-types src/lib/competitors/shotGrid.test.ts
```

预期：FAIL，`groupShotsByDate is not a function`

- [ ] **Step 3: 写最小实现**

追加到 `shotGrid.ts`：

```ts
/**
 * 按日期归组；shot_on 为空归入 UNDATED_KEY。
 * 组内按 sort_order 再 created_at 升序，首张即该日封面。
 */
export function groupShotsByDate(shots: CompetitorShot[]): Map<string, CompetitorShot[]> {
  const map = new Map<string, CompetitorShot[]>()
  for (const s of shots ?? []) {
    const key = s.shot_on || UNDATED_KEY
    const arr = map.get(key) ?? []
    arr.push(s)
    map.set(key, arr)
  }
  for (const arr of Array.from(map.values())) {
    arr.sort((a, b) => (a.sort_order - b.sort_order) || a.created_at.localeCompare(b.created_at))
  }
  return map
}
```

- [ ] **Step 4: 跑测试确认通过**

```bash
node --test --experimental-strip-types src/lib/competitors/shotGrid.test.ts
```

预期：PASS，33 个 test 全绿

- [ ] **Step 5: 跑全量测试 + 类型检查**

```bash
npm test 2>&1 | tail -10
npx tsc --noEmit
```

预期：`# fail 0`；`tsc` 无输出

- [ ] **Step 6: 提交**

```bash
git rev-parse --abbrev-ref HEAD
git add src/lib/competitors/shotGrid.ts src/lib/competitors/shotGrid.test.ts
git commit -m "feat(competitors): groupShotsByDate 按日期归组并定序"
```

---

### Task 6: service 层接入日期校验

现有 `updateShot` 把 `shot_on` 原样透给数据库，格式非法时 Postgres 报错经 `db_error` 映射成 500，语义上应是 400。

**Files:**
- Modify: `src/lib/competitors/service.ts:170`（`addShot`）、`src/lib/competitors/service.ts:188`（`updateShot`）

- [ ] **Step 1: 加 import**

在 `src/lib/competitors/service.ts` 的 import 区加：

```ts
import { isValidShotDate } from './shotGrid'
```

注意：`service.ts` 是被 Next 打包的应用代码，import 不带 `.ts` 后缀；只有 `*.test.ts` 和被测纯函数模块之间用 `.ts` 后缀（沿用 `weekly.ts` / `weekly.test.ts` 的既有写法）。若 `shotGrid.ts` 内部 import `./types.ts` 带后缀而此处不带，两边都能正常解析，不必统一。

- [ ] **Step 2: 在 addShot 里前置校验**

把 `addShot` 开头的这一行：

```ts
  if (!input?.image_url) return err('invalid_input', 'image_url required')
```

改为：

```ts
  if (!input?.image_url) return err('invalid_input', 'image_url required')
  if (!isValidShotDate(input.shot_on)) return err('invalid_input', SHOT_ON_HINT)
```

并在文件里 `addShot` 之前定义这个常量（两处共用，且比 `must be YYYY-MM-DD` 更准确——校验还会拒 `2026-02-30` 和越界年份）：

```ts
const SHOT_ON_HINT = 'shot_on must be a real calendar date in YYYY-MM-DD (1900-2999), or null to clear'
```

- [ ] **Step 3: 在 updateShot 里前置校验**

把 `updateShot` 开头的这一行：

```ts
  const patch: Record<string, unknown> = {}
```

改为：

```ts
  if (!fields || typeof fields !== 'object') return err('invalid_input', 'body must be an object')
  if (!isValidShotDate(fields.shot_on)) return err('invalid_input', SHOT_ON_HINT)
  const patch: Record<string, unknown> = {}
```

第一行的 null 守卫和 `addShot` 的 `input?.image_url` 对称：路由把 `await req.json()` 原样透传，请求体是字面量 `null` 时 `fields.shot_on` 会抛 TypeError 变成 500——正是本任务要消灭的那类失败。

- [ ] **Step 4: 类型检查**

```bash
npx tsc --noEmit
```

预期：无输出

- [ ] **Step 5: 提交**

```bash
git rev-parse --abbrev-ref HEAD
git add src/lib/competitors/service.ts
git commit -m "fix(competitors): shot_on 非法格式返回 400 而非落到 DB 报 500"
```

---

### Task 7: i18n 文案

**Files:**
- Modify: `messages/zh.json`、`messages/en.json`、`messages/ja.json`（各文件的 `competitors` 对象）

- [ ] **Step 1: 删除不再使用的两个键**

三个文件的 `competitors` 对象里，删掉 `viewAll` 和 `collapse` 两行。这两个键在 `competitors` 命名空间下只被 `ShotAlbum.tsx:120` 的折叠按钮使用，该按钮在 Task 11 会被删除。（首页的 `viewAll` 和侧边栏的 `collapse` 是不同命名空间，不受影响。）

- [ ] **Step 2: 在三个文件的 competitors 对象里追加新键**

`messages/zh.json`：

```json
    "shotDates": "截图日期",
    "earlierDates": "更早",
    "laterDates": "更晚",
    "noShotOnDate": "{date} 无截图",
    "noShotUndated": "无未标日期的截图",
    "moreShots": "+{count}",
    "shotIndexOf": "{index} / {total}",
    "prevShot": "上一张",
    "nextShot": "下一张",
    "closeShot": "关闭",
    "shotDate": "截图日期",
    "saveShotDate": "保存日期",
    "shotDateInvalid": "日期格式不对"
```

`messages/en.json`：

```json
    "shotDates": "Shot dates",
    "earlierDates": "Earlier",
    "laterDates": "Later",
    "noShotOnDate": "No shot on {date}",
    "noShotUndated": "No undated shot",
    "moreShots": "+{count}",
    "shotIndexOf": "{index} / {total}",
    "prevShot": "Previous shot",
    "nextShot": "Next shot",
    "closeShot": "Close",
    "shotDate": "Shot date",
    "saveShotDate": "Save date",
    "shotDateInvalid": "Invalid date format"
```

`messages/ja.json`：

```json
    "shotDates": "スクショの日付",
    "earlierDates": "より古い日付",
    "laterDates": "より新しい日付",
    "noShotOnDate": "{date} のスクショなし",
    "noShotUndated": "日付なしのスクショはありません",
    "moreShots": "+{count}",
    "shotIndexOf": "{index} / {total}",
    "prevShot": "前の画像",
    "nextShot": "次の画像",
    "closeShot": "閉じる",
    "shotDate": "日付",
    "saveShotDate": "日付を保存",
    "shotDateInvalid": "日付の形式が不正です"
```

- [ ] **Step 3: 校验三份文案键位对齐**

```bash
npm run test:i18n
```

预期：通过。若报缺键，说明三个文件里有某个漏加或漏删，按报错补齐。

- [ ] **Step 4: 提交**

```bash
git rev-parse --abbrev-ref HEAD
git add messages/zh.json messages/en.json messages/ja.json
git commit -m "i18n(competitors): 日期列相关文案,移除失效的 viewAll/collapse"
```

---

### Task 8: ShotDateStrip — 页面级日期条

**Files:**
- Create: `src/components/competitors/ShotDateStrip.tsx`

- [ ] **Step 1: 创建组件**

```tsx
// src/components/competitors/ShotDateStrip.tsx
'use client'

import { useTranslations } from 'next-intl'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { UNDATED_KEY } from '@/lib/competitors/shotGrid'

export default function ShotDateStrip({
  axis, dateWindow, selectedDate, onPick,
}: {
  axis: string[]
  dateWindow: string[]
  selectedDate: string | null
  onPick: (date: string) => void
}) {
  const t = useTranslations('competitors')
  if (axis.length === 0) return null

  const first = dateWindow[0]
  const last = dateWindow[dateWindow.length - 1]
  const atStart = axis.indexOf(first) <= 0
  const atEnd = axis.indexOf(last) >= axis.length - 1

  // 整屏翻:轴上累积几个月后逐天点会点到手废
  const step = (direction: -1 | 1) => {
    const anchor = selectedDate ?? last
    const target = axis.indexOf(anchor) + direction * dateWindow.length
    const next = axis[Math.min(Math.max(target, 0), axis.length - 1)]
    if (next) onPick(next)
  }

  return (
    <div className="flex items-center gap-2" role="group" aria-label={t('shotDates')}>
      <button
        type="button"
        onClick={() => step(-1)}
        disabled={atStart}
        aria-label={t('earlierDates')}
        className="shrink-0 rounded border border-line px-1 py-1 text-ink-500 hover:text-ink-900 disabled:opacity-40"
      >
        <ChevronLeft size={14} />
      </button>
      <div className="grid flex-1 gap-2" style={{ gridTemplateColumns: `repeat(${dateWindow.length}, minmax(0, 1fr))` }}>
        {dateWindow.map((d) => (
          <button
            key={d}
            type="button"
            onClick={() => onPick(d)}
            aria-pressed={d === selectedDate}
            className={`truncate rounded px-1 py-1 text-center text-[11px] ${
              d === selectedDate
                ? 'bg-primary-soft text-primary'
                : 'text-ink-500 hover:bg-row-hover'
            }`}
          >
            {d === UNDATED_KEY ? t('undated') : d.slice(5)}
          </button>
        ))}
      </div>
      <button
        type="button"
        onClick={() => step(1)}
        disabled={atEnd}
        aria-label={t('laterDates')}
        className="shrink-0 rounded border border-line px-1 py-1 text-ink-500 hover:text-ink-900 disabled:opacity-40"
      >
        <ChevronRight size={14} />
      </button>
    </div>
  )
}
```

日期 chip 显示 `d.slice(5)` 即 `MM-DD`，省掉年份让 5 列在卡片宽度内不挤。

- [ ] **Step 2: 类型检查 + 闸门**

```bash
npx tsc --noEmit
npm run test:copy
```

预期：`tsc` 无输出；`test:copy` 三项全过。**新文件不在样式基线里，出现任何 `zinc-*` / 裸 hex / 未登记 token 都会致命失败** — 若报错，对照本计划开头的 token 表逐个换掉。

- [ ] **Step 3: 提交**

```bash
git rev-parse --abbrev-ref HEAD
git add src/components/competitors/ShotDateStrip.tsx
git commit -m "feat(competitors): ShotDateStrip 页面级日期条"
```

---

### Task 9: ShotLightbox — 当天图集查看器

从 `ShotAlbum` 拆出独立文件：承担左右切换、计数、日期编辑、删除。

**Files:**
- Create: `src/components/competitors/ShotLightbox.tsx`

- [ ] **Step 1: 创建组件**

```tsx
// src/components/competitors/ShotLightbox.tsx
'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { ChevronLeft, ChevronRight, Trash2, X } from 'lucide-react'
import type { CompetitorShot } from '@/lib/competitors/types'

export default function ShotLightbox({
  shots, canEdit, onClose, onChanged,
}: {
  shots: CompetitorShot[]
  canEdit: boolean
  onClose: () => void
  onChanged: () => void
}) {
  const t = useTranslations('competitors')
  const [index, setIndex] = useState(0)
  const [dateInput, setDateInput] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const current = shots[index]

  useEffect(() => {
    setDateInput(current?.shot_on ?? '')
    setError(null)
  }, [current])

  useEffect(() => {
    if (shots.length && index > shots.length - 1) setIndex(shots.length - 1)
  }, [shots.length, index])

  if (!current) return null

  const saveDate = async () => {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/competitors/shots/${current.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shot_on: dateInput || null }),
      })
      if (!res.ok) { setError(t('shotDateInvalid')); return }
      onChanged()
      onClose()
    } catch {
      setError(t('actionFailed'))
    } finally {
      setBusy(false)
    }
  }

  const removeCurrent = async () => {
    if (!confirm(t('deleteShotConfirm'))) return
    setBusy(true)
    try {
      const res = await fetch(`/api/competitors/shots/${current.id}`, { method: 'DELETE' })
      if (!res.ok) { setError(t('actionFailed')); return }
      onChanged()
      onClose()
    } catch {
      setError(t('actionFailed'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-3 bg-black/70 p-6"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div className="flex max-h-[80vh] items-center gap-3" onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          onClick={() => setIndex((i) => Math.max(i - 1, 0))}
          disabled={index === 0}
          aria-label={t('prevShot')}
          className="rounded bg-black/50 p-2 text-white disabled:opacity-30"
        >
          <ChevronLeft size={20} />
        </button>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={current.image_url} alt={current.caption || current.tag || ''} className="max-h-[80vh] max-w-full rounded-lg" />
        <button
          type="button"
          onClick={() => setIndex((i) => Math.min(i + 1, shots.length - 1))}
          disabled={index >= shots.length - 1}
          aria-label={t('nextShot')}
          className="rounded bg-black/50 p-2 text-white disabled:opacity-30"
        >
          <ChevronRight size={20} />
        </button>
      </div>

      <div className="flex items-center gap-3 text-xs text-white" onClick={(e) => e.stopPropagation()}>
        <span>{t('shotIndexOf', { index: index + 1, total: shots.length })}</span>
        {canEdit && (
          <>
            <label className="flex items-center gap-1">
              <span>{t('shotDate')}</span>
              <input
                type="date"
                value={dateInput}
                onChange={(e) => setDateInput(e.target.value)}
                className="rounded border border-line px-1.5 py-0.5 text-ink-900"
              />
            </label>
            <button
              type="button"
              onClick={saveDate}
              disabled={busy}
              className="rounded bg-primary px-2 py-1 text-white disabled:opacity-50"
            >
              {t('saveShotDate')}
            </button>
            <button
              type="button"
              onClick={removeCurrent}
              disabled={busy}
              aria-label={t('delete')}
              className="rounded bg-black/50 p-1 text-white hover:bg-danger-strong disabled:opacity-50"
            >
              <Trash2 size={14} />
            </button>
          </>
        )}
        <button type="button" onClick={onClose} aria-label={t('closeShot')} className="rounded bg-black/50 p-1 text-white">
          <X size={14} />
        </button>
      </div>

      {error && <p className="text-xs text-white">{error}</p>}
    </div>
  )
}
```

`hover:bg-danger-strong` 用的是 `danger.strong`，已登记在 `tailwind.config.ts`。

- [ ] **Step 2: 类型检查 + 闸门**

```bash
npx tsc --noEmit
npm run test:copy
```

预期：`tsc` 无输出；`test:copy` 全过。新文件违规即致命。

- [ ] **Step 3: 提交**

```bash
git rev-parse --abbrev-ref HEAD
git add src/components/competitors/ShotLightbox.tsx
git commit -m "feat(competitors): ShotLightbox 当天图集查看与日期编辑"
```

---

### Task 10: ShotUploader 改造为内联控件 + 日期输入

现在是 `h-[46vh] w-[26vh]` 的大块拖放区，与缩略图并排。日期网格下它不能占据一列，否则破坏列对齐——改为标题行内联控件。

**Files:**
- Modify: `src/components/competitors/ShotUploader.tsx`（整体重写）

- [ ] **Step 1: 重写整个文件**

```tsx
// src/components/competitors/ShotUploader.tsx
'use client'

import { useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Upload } from 'lucide-react'
import { compressImage } from './compressImage'

/**
 * 本地时区的今天。不能用 toISOString——那是 UTC，
 * 对 UTC+8 团队每天 08:00 前会算成昨天，而 shot_on 是整个日期轴的主键。
 */
function today(): string {
  const d = new Date()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${mm}-${dd}`
}

export default function ShotUploader({ competitorId, onDone }: { competitorId: string; onDone: () => void }) {
  const t = useTranslations('competitors')
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [shotOn, setShotOn] = useState(today)

  const onPick = async (file: File) => {
    setBusy(true)
    setError(null)
    try {
      const compressed = await compressImage(file)
      const form = new FormData()
      form.append('file', compressed)
      const up = await fetch('/api/competitors/upload', { method: 'POST', body: form })
      const upJson = await up.json().catch(() => ({ error: 'parse' }))
      if (!up.ok || upJson.error) { setError(t('uploadFailed')); return }
      const res = await fetch(`/api/competitors/${competitorId}/shots`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image_url: upJson.data.url, shot_on: shotOn || null }),
      })
      if (!res.ok) { setError(t('uploadFailed')); return }
      onDone()
    } catch {
      setError(t('uploadFailed'))
    } finally {
      setBusy(false)
    }
  }

  const onPaste = (e: React.ClipboardEvent<HTMLDivElement>) => {
    if (busy) return
    const items = e.clipboardData?.items
    if (!items) return
    for (const it of Array.from(items)) {
      if (it.type.startsWith('image/')) {
        const file = it.getAsFile()
        if (file) { e.preventDefault(); onPick(file); return }
      }
    }
  }

  return (
    <div
      tabIndex={0}
      onPaste={onPaste}
      aria-label={t('upload')}
      title={t('orPaste')}
      className="flex shrink-0 items-center gap-1.5 rounded border border-dashed border-line px-1.5 py-1 outline-none focus:border-primary-border"
    >
      <input
        type="date"
        value={shotOn}
        onChange={(e) => setShotOn(e.target.value)}
        aria-label={t('shotDate')}
        className="rounded border border-line px-1 py-0.5 text-[11px] text-ink-700"
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={busy}
        className="flex items-center gap-1 text-[11px] text-ink-500 hover:text-ink-900 disabled:opacity-50"
      >
        <Upload size={13} />
        {t('upload')}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) onPick(f); e.target.value = '' }}
      />
      {error && <span className="text-[10px] text-danger-text">{error}</span>}
    </div>
  )
}
```

改动要点：`compact` prop 移除（内联控件不需要两套尺寸）；`shot_on` 从硬编码今天改为可选日期 state；`text-zinc-*` / `border-zinc-300` 全换成语义 token，该文件违规数从 3 降到 0。

- [ ] **Step 2: 类型检查**

```bash
npx tsc --noEmit
```

预期：会报 `ShotAlbum.tsx` 传了已删除的 `compact` prop —— 这是预期内的，Task 11 会一并修好。先确认报错**只**来自 `ShotAlbum.tsx`。

- [ ] **Step 3: 暂不提交**

本任务与 Task 11 存在编译期耦合，合并到 Task 11 结束后一起提交。

---

### Task 11: ShotAlbum 重写为日期网格

**Files:**
- Modify: `src/components/competitors/ShotAlbum.tsx`（整体重写）

- [ ] **Step 1: 重写整个文件**

```tsx
// src/components/competitors/ShotAlbum.tsx
'use client'

import { useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'
import { UNDATED_KEY, groupShotsByDate } from '@/lib/competitors/shotGrid'
import ShotUploader from './ShotUploader'
import ShotLightbox from './ShotLightbox'
import type { CompetitorShot } from '@/lib/competitors/types'

function DateCell({ shots, dateKey, compact, selected, onOpen }: {
  shots: CompetitorShot[]
  dateKey: string
  compact: boolean
  selected: boolean
  onOpen: () => void
}) {
  const t = useTranslations('competitors')
  const box = compact ? 'h-32' : 'h-[46vh] min-h-[300px]'

  if (!shots.length) {
    // role="img" 是必要的：aria-label 挂在裸 div 上多数读屏根本不播报。
    // 无日期列要单独一句文案,否则会拼出 "No shot on Undated" 这种病句。
    return (
      <div
        role="img"
        aria-label={dateKey === UNDATED_KEY ? t('noShotUndated') : t('noShotOnDate', { date: dateKey })}
        className={`${box} rounded-lg border border-dashed border-line-soft`}
      />
    )
  }

  const cover = shots[0]
  const extra = shots.length - 1

  return (
    <div className={`relative ${box} overflow-hidden rounded-lg bg-canvas ${selected ? 'ring-2 ring-primary' : ''}`}>
      <button type="button" onClick={onOpen} className="block h-full w-full">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={cover.image_url} alt={cover.caption || cover.tag || ''} className="h-full w-full object-cover" loading="lazy" />
      </button>
      {extra > 0 && (
        <span className="pointer-events-none absolute right-1 top-1 rounded bg-black/60 px-1 py-0.5 text-[10px] text-white">
          {t('moreShots', { count: extra })}
        </span>
      )}
      {cover.tag && (
        <span className="pointer-events-none absolute inset-x-1 bottom-1 truncate rounded bg-black/50 px-1 py-0.5 text-[9px] text-white">
          {cover.tag}
        </span>
      )}
    </div>
  )
}

export default function ShotAlbum({
  competitorId, shots, canEdit, onChanged, dateWindow, selectedDate, compact = false,
}: {
  competitorId: string
  shots: CompetitorShot[]
  canEdit: boolean
  onChanged: () => void
  dateWindow: string[]
  selectedDate: string | null
  compact?: boolean
}) {
  const t = useTranslations('competitors')
  const [openDate, setOpenDate] = useState<string | null>(null)
  const grouped = useMemo(() => groupShotsByDate(shots), [shots])

  if (dateWindow.length === 0) {
    return (
      <div className="min-w-0 space-y-2">
        <p className="text-xs text-muted-text">{t('noShots')}</p>
        {canEdit && <ShotUploader competitorId={competitorId} onDone={onChanged} />}
      </div>
    )
  }

  return (
    <div className="min-w-0">
      {canEdit && (
        <div className="mb-2 flex justify-end">
          <ShotUploader competitorId={competitorId} onDone={onChanged} />
        </div>
      )}
      <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${dateWindow.length}, minmax(0, 1fr))` }}>
        {dateWindow.map((d) => (
          <DateCell
            key={d}
            shots={grouped.get(d) ?? []}
            dateKey={d}
            compact={compact}
            selected={d === selectedDate}
            onOpen={() => setOpenDate(d)}
          />
        ))}
      </div>
      {openDate && (
        <ShotLightbox
          shots={grouped.get(openDate) ?? []}
          canEdit={canEdit}
          onClose={() => setOpenDate(null)}
          onChanged={onChanged}
        />
      )}
    </div>
  )
}
```

删掉的东西：`weekStartOf` import、按周分组、`viewAll` / `collapse` 折叠按钮、旧的单图 lightbox state、缩略图上的删除按钮（已移进 `ShotLightbox`）。

**注意**：`src/lib/competitors/weekly.ts` 本身不要动——`WeeklyFollowersCurve` 还在用。

- [ ] **Step 2: 类型检查**

```bash
npx tsc --noEmit
```

预期：报 `CompetitorCard.tsx` 没给 `ShotAlbum` 传 `dateWindow` / `selectedDate` —— 预期内，Task 12 修。确认报错**只**来自 `CompetitorCard.tsx`。

- [ ] **Step 3: 检查样式基线没有回退**

```bash
npm run test:style
```

预期：通过，并提示 `ShotAlbum.tsx` / `ShotUploader.tsx` 违规数低于基线可收紧（非致命）。

- [ ] **Step 4: 提交（含 Task 10）**

```bash
git rev-parse --abbrev-ref HEAD
git add src/components/competitors/ShotAlbum.tsx src/components/competitors/ShotUploader.tsx
git commit -m "feat(competitors): 相册改为日期网格,上传器内联并支持指定日期"
```

---

### Task 12: CompetitorCard 透传 props + 子卡对齐修正

**Files:**
- Modify: `src/components/competitors/CompetitorCard.tsx`

- [ ] **Step 1: props 签名加两个字段**

把文件里的这段：

```tsx
export default function CompetitorCard({
  c, canEdit, onChanged, onDeleteId, parentOptions, onAssignParent, onUpdateHandle, nested = false,
}: {
  c: CompetitorWithHistory
  canEdit: boolean
  onChanged: () => void
  onDeleteId: (id: string) => void
  parentOptions: { id: string; label: string }[]
  onAssignParent: (id: string, parentId: string | null) => void
  onUpdateHandle: (id: string, raw: string) => void
  nested?: boolean
}) {
```

替换为：

```tsx
export default function CompetitorCard({
  c, canEdit, onChanged, onDeleteId, parentOptions, onAssignParent, onUpdateHandle,
  dateWindow, selectedDate, nested = false,
}: {
  c: CompetitorWithHistory
  canEdit: boolean
  onChanged: () => void
  onDeleteId: (id: string) => void
  parentOptions: { id: string; label: string }[]
  onAssignParent: (id: string, parentId: string | null) => void
  onUpdateHandle: (id: string, raw: string) => void
  dateWindow: string[]
  selectedDate: string | null
  nested?: boolean
}) {
```

- [ ] **Step 2: 统一 nested 与顶层的布局**

把现有的这段：

```tsx
      {nested ? (
        <div className="space-y-2">
          <WeeklyFollowersCurve weekly={c.weekly} compact />
          <ShotAlbum competitorId={c.id} shots={c.shots} canEdit={canEdit} onChanged={onChanged} compact />
        </div>
      ) : (
        <div className="grid grid-cols-[1fr_3fr] gap-3 max-md:grid-cols-1">
          <WeeklyFollowersCurve weekly={c.weekly} />
          <ShotAlbum competitorId={c.id} shots={c.shots} canEdit={canEdit} onChanged={onChanged} />
        </div>
      )}
```

替换为：

```tsx
      <div className="grid grid-cols-[1fr_3fr] gap-3 max-md:grid-cols-1">
        <WeeklyFollowersCurve weekly={c.weekly} compact={nested} />
        <ShotAlbum
          competitorId={c.id}
          shots={c.shots}
          canEdit={canEdit}
          onChanged={onChanged}
          dateWindow={dateWindow}
          selectedDate={selectedDate}
          compact={nested}
        />
      </div>
```

这样子卡和顶层卡的相册列宽、左起点完全一致。

- [ ] **Step 3: 去掉 related 区块的缩进**

把：

```tsx
            <div className="mt-2 space-y-2 border-l-2 border-zinc-100 pl-3">
```

改为：

```tsx
            <div className="mt-2 space-y-2">
```

层级感由子卡已有的 `bg-zinc-50` 底色承担。顺带让 `CompetitorCard.tsx` 的样式违规数减 1（基线 33 → 32，非致命）。

- [ ] **Step 4: 递归传给子卡**

在 `c.related.map((child) => (<CompetitorCard ... />))` 里补两个 prop：

```tsx
                  dateWindow={dateWindow}
                  selectedDate={selectedDate}
```

- [ ] **Step 5: 类型检查**

```bash
npx tsc --noEmit
```

预期：报 `CompetitorDossierView.tsx` 没传新 prop —— 预期内，Task 13 修。确认报错**只**来自 `CompetitorDossierView.tsx`。

- [ ] **Step 6: 暂不提交**

与 Task 13 存在编译期耦合，一起提交。

---

### Task 13: CompetitorDossierView 接线

**Files:**
- Modify: `src/components/competitors/CompetitorDossierView.tsx`

- [ ] **Step 1: 加 import**

```tsx
import ShotDateStrip from './ShotDateStrip'
import { collectShotDates, resolveAnchor, windowOf } from '@/lib/competitors/shotGrid'
```

- [ ] **Step 2: 加 state 与派生值**

在 `const [pending, startTransition] = useTransition()` 下面加：

```tsx
  // 整页共用的截图日期轴：所有竞品(含子主播)有图日期的并集
  const [anchorDate, setAnchorDate] = useState<string | null>(null)
  const shotAxis = useMemo(() => collectShotDates(board.competitors), [board.competitors])
  const selectedDate = useMemo(() => resolveAnchor(shotAxis, anchorDate), [shotAxis, anchorDate])
  const dateWindow = useMemo(
    () => windowOf(shotAxis, selectedDate ? shotAxis.indexOf(selectedDate) : -1, SHOT_WINDOW_SIZE),
    [shotAxis, selectedDate],
  )
```

并在文件顶部 import 之后、组件之外加常量：

```tsx
/** 日期窗口列数：一屏横向对比 5 天。 */
const SHOT_WINDOW_SIZE = 5
```

`anchorDate` 存用户点了什么，`selectedDate` 是归一化到轴上的结果。轴因上传/改期/删除重算时，`resolveAnchor` 自动回落，不需要额外的 `useEffect` 同步 state（在 effect 里改 state 会多一轮渲染，也容易和 `refresh()` 的时序打架）。

这个拆分同时决定了上传后的行为，是有意为之：用户没点过任何一天时 `anchorDate` 为 `null`，选中态跟着轴上最新一天走，所以新传的图会自动被选中；用户已经点定某天在做横向对比时，上传不会把他甩到别的日期。

- [ ] **Step 3: 渲染日期条**

在 `board.competitors.length === 0 ? (...) : (` 的 `else` 分支里，把：

```tsx
        <div className="space-y-3">
          {board.competitors.map((c) => (
```

改为：

```tsx
        <div className="space-y-3">
          <ShotDateStrip
            axis={shotAxis}
            dateWindow={dateWindow}
            selectedDate={selectedDate}
            onPick={setAnchorDate}
          />
          {board.competitors.map((c) => (
```

- [ ] **Step 4: 给每个 CompetitorCard 传新 prop**

在 `<CompetitorCard ... />` 的 prop 列表里补：

```tsx
              dateWindow={dateWindow}
              selectedDate={selectedDate}
```

- [ ] **Step 5: 类型检查与全部闸门**

```bash
npx tsc --noEmit
npm run test:copy
npm test 2>&1 | tail -5
```

预期：`tsc` 无输出；`test:copy` 全过；`# fail 0`

- [ ] **Step 6: 提交（含 Task 12）**

```bash
git rev-parse --abbrev-ref HEAD
git add src/components/competitors/CompetitorCard.tsx src/components/competitors/CompetitorDossierView.tsx
git commit -m "feat(competitors): 页面级日期轴接线,子主播卡与顶层卡严格对齐"
```

---

### Task 14: 构建验证与实机验证

纯函数有单测，但"列到底对没对齐"只有跑起来才知道。

**Files:** 无改动（除非发现问题）

- [ ] **Step 1: 生产构建**

```bash
npm run build
```

预期：构建成功。`/[locale]/competitors` 路由出现在产物列表里。

- [ ] **Step 2: 起 worktree 专用 dev server**

`preview_start` 会跑主仓，worktree 必须手动指定端口（主仓 dev 占 3001）：

```bash
npx next dev --port 3011
```

用 `run_in_background: true` 起，然后用 Browser 工具打开 `http://localhost:3011`。

- [ ] **Step 3: 逐条验证**

打开竞品监测页，确认：

1. 页面顶部出现日期条，显示 5 个 `MM-DD`，最右一个默认高亮
2. 每个竞品卡片的相册是 5 列等宽网格，没图的格子是虚线空框
3. **跨卡片竖着看**：不同竞品卡的第 N 列左边缘对齐、宽度一致
4. 展开某个有关联主播的竞品，**子主播卡的列与父卡的列也对齐**（无缩进、同列宽）
5. 点日期条上另一天 → 该列在所有卡片里同时高亮
6. 点左右箭头 → 窗口平移，所有卡片同步换列
7. 点一个有 `+N` 角标的格子 → 灯箱打开，左右能切换，计数正确
8. 灯箱里改日期保存 → 页面刷新，该图跳到新日期列
9. 上传控件在相册右上角，带日期输入，不占据任何一列
10. 未点过日期条时上传一张图 → 轴新增该列且自动选中；先点定某天再上传 → 选中态不动（见 Task 13 的行为说明）
11. **有无日期图时默认选中的仍是最新那天**，不是末尾的「未标日期」列（`resolveAnchor` 的已知坑，代码质量审查捞出来的）
12. 展开一个有关联主播的竞品：只有折叠子卡才有图的那些日期，会在父卡这一行显示为空列。这是结构对齐的既定代价，确认它看起来是「那天父卡没图」而不是「页面坏了」
13. 用 `resize_window` 切到 mobile：卡片外层是 `max-md:grid-cols-1`，但相册内部是硬编码 5 列，手机上每列约 60px。确认不至于糊成一片；若不可用，记下来但**不要**在本轮扩大范围去改

- [ ] **Step 4: 检查浏览器控制台**

用 `read_console_messages` 确认没有 React key 警告、没有 `NaN` 宽度、没有 next-intl 缺 key 报错。

- [ ] **Step 5: 截图留证**

用 `computer {action: "screenshot"}` 截一张，确认列对齐肉眼可见。

- [ ] **Step 6: 若一切正常，推分支开 PR**

```bash
git rev-parse --abbrev-ref HEAD
git push -u origin feat/competitor-shot-date-columns
```

PR 走 `gh pr create`，目标分支 `main`。**不要直接推 main。**

---

## 自查清单（实现完成后逐条确认）

- [ ] `npm test` 全绿，且 `shotGrid.test.ts` 确实在 `package.json` 的 `test` 列表里
- [ ] `npm run test:copy` 三项全过
- [ ] `npx tsc --noEmit` 无输出
- [ ] `npm run build` 成功
- [ ] `ShotDateStrip.tsx` / `ShotLightbox.tsx` 零样式违规（新文件无基线兜底）
- [ ] 没有动 `src/lib/competitors/weekly.ts`
- [ ] `messages/` 三份文件键位一致，`competitors` 下已无 `viewAll` / `collapse`
- [ ] 分支是 `feat/competitor-shot-date-columns`，主仓 `/Users/fengzhou/Code/newWith` 未被改动
