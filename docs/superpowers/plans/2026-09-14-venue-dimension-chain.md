# 场地布置 · 尺寸链标注 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 给场地布置 2D 画布加一条自动推导的「尺寸链」标注，把原本捆在一起的尺寸标尺开关拆成三个互相独立的勾选项，并给尺寸链的贴边带深度配一根可现场调的滑杆。

**Architecture:** 分段算法是两个纯函数（`planDimensionChain` 负责把贴边那一排组件切成连续的尺寸段，`layoutChainLabels` 负责把标签贪心装箱到不重叠的排），单独成文件、单独测；SVG 渲染是一个只吃几何数字的哑组件；`VenueCanvas` 只负责把两者接起来。`showRulers: boolean` 换成 `VenueRulerOptions`（三个开关 + 一个带深，带深为 `null` 时走自动值）。

**Tech Stack:** Next.js 15 + React 19 + TypeScript，SVG 手写画布，`node --test --experimental-strip-types` 跑单测，next-intl 三语（zh/en/ja）。

**设计说明：** `docs/superpowers/specs/2026-09-14-venue-dimension-chain-design.md`

**坐标系提醒：** 楼层坐标单位是**厘米**。`scale` = 屏幕 px / 楼层单位，所以任何要保持恒定屏幕大小的装饰都写成 `px / scale`。

---

### Task 1: 分段算法 `planDimensionChain`

**Files:**
- Create: `src/venue/dimensionChain.ts`
- Test: `src/venue/dimensionChain.test.ts`
- Modify: `package.json`（`test` 脚本尾部登记新测试文件）

- [ ] **Step 1: 写失败的测试**

创建 `src/venue/dimensionChain.test.ts`：

```ts
import assert from 'node:assert/strict'
import test from 'node:test'

import { planDimensionChain } from './dimensionChain.ts'
import type { VenueItem, VenueItemType } from './layoutData.ts'

function item(o: {
  id: string
  x: number
  y: number
  width: number
  height: number
  type?: VenueItemType
  rotation?: number
}): VenueItem {
  return {
    id: o.id,
    type: o.type ?? 'area',
    name: o.id,
    x: o.x,
    y: o.y,
    width: o.width,
    height: o.height,
    rotation: o.rotation ?? 0,
    status: 'planned',
    note: '',
    height3d: 0,
    elevation: 0,
    thickness: 0,
    placement: 'ground',
  }
}

// 只比 start/end/itemId,length 另外单独断言,避免浮点噪声写进期望值
const strip = (segments: { start: number; end: number; itemId: string | null }[]) =>
  segments.map(({ start, end, itemId }) => ({ start, end, itemId }))

test('planDimensionChain: 单个组件出一段,长度等于组件宽', () => {
  const plan = planDimensionChain([item({ id: 'a', x: 100, y: 200, width: 500, height: 300 })], 'horizontal')
  assert.deepEqual(strip(plan.segments), [{ start: 100, end: 600, itemId: 'a' }])
  assert.equal(plan.segments[0].length, 500)
  assert.equal(plan.anchor, 200)
})

test('planDimensionChain: 两个相邻组件出两段,中间没有空隙段', () => {
  const plan = planDimensionChain([
    item({ id: 'a', x: 0, y: 0, width: 400, height: 400 }),
    item({ id: 'b', x: 400, y: 0, width: 300, height: 400 }),
  ], 'horizontal')
  assert.deepEqual(strip(plan.segments), [
    { start: 0, end: 400, itemId: 'a' },
    { start: 400, end: 700, itemId: 'b' },
  ])
})

test('planDimensionChain: 两个组件之间留空,中间出空隙段', () => {
  const plan = planDimensionChain([
    item({ id: 'a', x: 0, y: 0, width: 400, height: 400 }),
    item({ id: 'b', x: 450, y: 0, width: 300, height: 400 }),
  ], 'horizontal')
  assert.deepEqual(strip(plan.segments), [
    { start: 0, end: 400, itemId: 'a' },
    { start: 400, end: 450, itemId: null },
    { start: 450, end: 750, itemId: 'b' },
  ])
})

test('planDimensionChain: 带内嵌套组件切开外层空间,三段之和等于跨度', () => {
  const plan = planDimensionChain([
    item({ id: 'hall', x: 0, y: 0, width: 1000, height: 1000 }),
    item({ id: 'pillar', x: 400, y: 20, width: 70, height: 70, type: 'corridor' }),
  ], 'horizontal')
  assert.deepEqual(strip(plan.segments), [
    { start: 0, end: 400, itemId: 'hall' },
    { start: 400, end: 470, itemId: 'pillar' },
    { start: 470, end: 1000, itemId: 'hall' },
  ])
  const total = plan.segments.reduce((sum, s) => sum + s.length, 0)
  assert.equal(total, 1000)
})

test('planDimensionChain: 贴边带之外的深处组件不参与分段', () => {
  // 纵向跨度 1000 → 带深 = clamp(100, 60, 200) = 100;楼梯 y=600 落在带外
  const plan = planDimensionChain([
    item({ id: 'hall', x: 0, y: 0, width: 1000, height: 1000 }),
    item({ id: 'stairs', x: 400, y: 600, width: 200, height: 150, type: 'corridor' }),
  ], 'horizontal')
  assert.deepEqual(strip(plan.segments), [{ start: 0, end: 1000, itemId: 'hall' }])
})

test('planDimensionChain: 标识类组件被排除', () => {
  const plan = planDimensionChain([
    item({ id: 'hall', x: 0, y: 0, width: 1000, height: 1000 }),
    item({ id: 'door', x: 400, y: 10, width: 70, height: 20, type: 'door_sliding' }),
  ], 'horizontal')
  assert.deepEqual(strip(plan.segments), [{ start: 0, end: 1000, itemId: 'hall' }])
})

test('planDimensionChain: 旋转组件按外接矩形参与', () => {
  // 100×100 转 45° → 外接正方形边长 100·(cos45+sin45) ≈ 141.42,中心不变
  const plan = planDimensionChain([
    item({ id: 'hall', x: 0, y: 0, width: 1000, height: 1000 }),
    item({ id: 'spun', x: 450, y: 10, width: 100, height: 100, rotation: 45, type: 'equipment' }),
  ], 'horizontal')
  const spun = plan.segments.find((s) => s.itemId === 'spun')
  assert.ok(spun, '旋转组件应当占到一段')
  assert.ok(Math.abs(spun.length - 141.42) < 0.1, `外接矩形宽应≈141.42,实得 ${spun.length}`)
})

test('planDimensionChain: vertical 轴上同样成立', () => {
  const plan = planDimensionChain([
    item({ id: 'hall', x: 0, y: 0, width: 1000, height: 1000 }),
    item({ id: 'office', x: 20, y: 400, width: 70, height: 70, type: 'corridor' }),
  ], 'vertical')
  assert.deepEqual(strip(plan.segments), [
    { start: 0, end: 400, itemId: 'hall' },
    { start: 400, end: 470, itemId: 'office' },
    { start: 470, end: 1000, itemId: 'hall' },
  ])
  assert.equal(plan.anchor, 0)
})

test('planDimensionChain: 面积相同的重叠组件,owner 取 id 小的那个', () => {
  const plan = planDimensionChain([
    item({ id: 'zz', x: 0, y: 0, width: 200, height: 200 }),
    item({ id: 'aa', x: 0, y: 0, width: 200, height: 200 }),
  ], 'horizontal')
  assert.deepEqual(strip(plan.segments), [{ start: 0, end: 200, itemId: 'aa' }])
})

test('planDimensionChain: 没有可量组件时返回空链', () => {
  const plan = planDimensionChain([item({ id: 'door', x: 0, y: 0, width: 70, height: 20, type: 'door_inward' })], 'horizontal')
  assert.deepEqual(plan.segments, [])
})

test('autoChainBandDepth: 取总跨度 10%,并夹在 0.6m–2.0m', () => {
  const tall = [item({ id: 'a', x: 0, y: 0, width: 100, height: 1000 })]
  assert.equal(autoChainBandDepth(tall, 'horizontal'), 100)
  // 跨度 300 → 30,夹到下限 60
  const short = [item({ id: 'a', x: 0, y: 0, width: 100, height: 300 })]
  assert.equal(autoChainBandDepth(short, 'horizontal'), 60)
  // 跨度 5000 → 500,夹到上限 200
  const huge = [item({ id: 'a', x: 0, y: 0, width: 100, height: 5000 })]
  assert.equal(autoChainBandDepth(huge, 'horizontal'), 200)
})

test('planDimensionChain: 传入带深覆盖自动值', () => {
  const items = [
    item({ id: 'hall', x: 0, y: 0, width: 1000, height: 1000 }),
    // 自动带深 100,这个组件在 140 处,自动模式下落选
    item({ id: 'annex', x: 1000, y: 140, width: 500, height: 600, type: 'renovation' }),
  ]
  assert.deepEqual(
    strip(planDimensionChain(items, 'horizontal').segments),
    [{ start: 0, end: 1000, itemId: 'hall' }],
    '自动带深下 annex 应落选',
  )
  assert.deepEqual(
    strip(planDimensionChain(items, 'horizontal', 200).segments),
    [
      { start: 0, end: 1000, itemId: 'hall' },
      { start: 1000, end: 1500, itemId: 'annex' },
    ],
    '带深放到 200 后 annex 应进链',
  )
})
```

> 最后两条测试盯的是带深滑杆：`annex` 在 1.40m 处、自动带深 1.00m，差 40cm 落选——这就是 mock 上驻车场差 4cm 落选那个临界情况的缩小版，把它钉成回归用例。

顶部 import 相应改成：

```ts
import { autoChainBandDepth, planDimensionChain } from './dimensionChain.ts'
```

- [ ] **Step 2: 跑测试确认它失败**

Run:
```bash
node --test --experimental-strip-types src/venue/dimensionChain.test.ts
```
Expected: FAIL —— `Cannot find module './dimensionChain.ts'`

- [ ] **Step 3: 写实现**

创建 `src/venue/dimensionChain.ts`：

```ts
import { isVenueMarkerType, type VenueItem } from './layoutData'

export type DimensionChainAxis = 'horizontal' | 'vertical'

export type DimensionChainSegment = {
  start: number
  end: number
  length: number
  // null 表示这一段没有任何组件占据(空隙)
  itemId: string | null
}

export type DimensionChainPlan = {
  segments: DimensionChainSegment[]
  // 近边坐标:横链取最小 y,竖链取最小 x。渲染层据此把链线摆到外侧。
  anchor: number
}

// 贴边带深度:该方向总跨度的 10%,夹在 0.6m–2.0m。整套分段规则里唯一的可调参数——
// 调大了会把楼梯这类深处组件吸进链里,调小了会漏掉贴墙的柱子。
const BAND_DEPTH_RATIO = 0.1
const BAND_DEPTH_MIN = 60
const BAND_DEPTH_MAX = 200

// 小于半厘米的段当成浮点噪声丢掉
const EPSILON = 0.5

type Box = {
  id: string
  near: number
  far: number
  start: number
  end: number
  area: number
}

// 旋转组件取绕中心旋转后的外接正矩形
function axisAlignedBox(item: VenueItem) {
  if (item.rotation === 0) {
    return { x: item.x, y: item.y, width: item.width, height: item.height }
  }
  const theta = (item.rotation * Math.PI) / 180
  const cos = Math.abs(Math.cos(theta))
  const sin = Math.abs(Math.sin(theta))
  const width = item.width * cos + item.height * sin
  const height = item.width * sin + item.height * cos
  return {
    x: item.x + item.width / 2 - width / 2,
    y: item.y + item.height / 2 - height / 2,
    width,
    height,
  }
}

// 覆盖该点的成员里选面积最小的——嵌套组件因此切开外层空间,而不是被它盖掉。
// 面积相同按 id 字典序,保证同一份数据每次算出同样的链。
function ownerAt(band: Box[], position: number): string | null {
  let best: Box | null = null
  for (const box of band) {
    if (position < box.start || position > box.end) continue
    if (!best || box.area < best.area || (box.area === best.area && box.id < best.id)) best = box
  }
  return best ? best.id : null
}

function collectBoxes(items: VenueItem[], axis: DimensionChainAxis): Box[] {
  const horizontal = axis === 'horizontal'
  const boxes: Box[] = []
  for (const item of items) {
    if (isVenueMarkerType(item.type)) continue
    const box = axisAlignedBox(item)
    if (box.width <= 0 || box.height <= 0) continue
    boxes.push({
      id: item.id,
      near: horizontal ? box.y : box.x,
      far: horizontal ? box.y + box.height : box.x + box.width,
      start: horizontal ? box.x : box.y,
      end: horizontal ? box.x + box.width : box.y + box.height,
      area: box.width * box.height,
    })
  }
  return boxes
}

function clampBandDepth(span: number): number {
  return Math.min(Math.max(span * BAND_DEPTH_RATIO, BAND_DEPTH_MIN), BAND_DEPTH_MAX)
}

// 页面也要调它:滑杆处于自动模式时,要停在这个值上并显示出来。
export function autoChainBandDepth(items: VenueItem[], axis: DimensionChainAxis): number {
  const boxes = collectBoxes(items, axis)
  if (boxes.length === 0) return BAND_DEPTH_MIN
  const nearEdge = Math.min(...boxes.map((b) => b.near))
  const farEdge = Math.max(...boxes.map((b) => b.far))
  return clampBandDepth(farEdge - nearEdge)
}

export function planDimensionChain(
  items: VenueItem[],
  axis: DimensionChainAxis,
  // null/省略 = 用自动值。用户拨了滑杆就传具体数值进来。
  bandDepthOverride?: number | null,
): DimensionChainPlan {
  const boxes = collectBoxes(items, axis)
  if (boxes.length === 0) return { segments: [], anchor: 0 }

  const nearEdge = Math.min(...boxes.map((b) => b.near))
  const farEdge = Math.max(...boxes.map((b) => b.far))
  const bandDepth = bandDepthOverride ?? clampBandDepth(farEdge - nearEdge)
  const band = boxes.filter((b) => b.near <= nearEdge + bandDepth)
  if (band.length === 0) return { segments: [], anchor: nearEdge }

  const cuts = new Set<number>()
  for (const box of band) {
    cuts.add(box.start)
    cuts.add(box.end)
  }
  const sorted = Array.from(cuts).sort((a, z) => a - z)

  const segments: DimensionChainSegment[] = []
  for (let i = 0; i < sorted.length - 1; i++) {
    const start = sorted[i]
    const end = sorted[i + 1]
    if (end - start < EPSILON) continue
    const itemId = ownerAt(band, (start + end) / 2)
    const previous = segments[segments.length - 1]
    if (previous && previous.itemId === itemId && previous.end === start) {
      previous.end = end
      previous.length = end - previous.start
      continue
    }
    segments.push({ start, end, length: end - start, itemId })
  }

  return { segments, anchor: nearEdge }
}
```

- [ ] **Step 4: 跑测试确认它通过**

Run:
```bash
node --test --experimental-strip-types src/venue/dimensionChain.test.ts
```
Expected: PASS，12 项全过

- [ ] **Step 5: 把新测试文件登记进 `package.json`**

`package.json` 的 `test` 脚本是一长串显式文件列表，**不登记就永远不会跑**。在 `src/venue/layoutData.test.ts` 之后插入 `src/venue/dimensionChain.test.ts`：

```
... src/venue/layoutData.test.ts src/venue/dimensionChain.test.ts src/lib/venue/layout-sync.test.ts ...
```

- [ ] **Step 6: 跑全量测试**

Run:
```bash
npm test 2>&1 | tail -8
```
Expected: `pass 921`（基线 909 + 新增 12），`fail 0`

- [ ] **Step 7: 提交**

```bash
git add src/venue/dimensionChain.ts src/venue/dimensionChain.test.ts package.json
git commit -m "feat(venue): 尺寸链分段算法

贴边那一排组件按相邻组件切分,嵌套组件切开外层空间,整条链
首尾相加等于该方向跨度。

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: 标签分排 `layoutChainLabels`

窄段的标签会互相压住。经典制图做法是错到第二、第三排并拉引线。这一步只做「谁去第几排」的纯计算，不碰字体度量。

**Files:**
- Modify: `src/venue/dimensionChain.ts`
- Test: `src/venue/dimensionChain.test.ts`

- [ ] **Step 1: 写失败的测试**

追加到 `src/venue/dimensionChain.test.ts` 末尾（顶部 import 改成 `import { layoutChainLabels, planDimensionChain } from './dimensionChain.ts'`）：

```ts
const seg = (start: number, end: number): DimensionChainSegment => ({
  start,
  end,
  length: end - start,
  itemId: 'x',
})

test('layoutChainLabels: 段都够宽时全部留在第 0 排', () => {
  const rows = layoutChainLabels([seg(0, 200), seg(200, 400), seg(400, 600)], {
    labelWidth: () => 50,
    minGap: 4,
  })
  assert.deepEqual(rows, [0, 0, 0])
})

test('layoutChainLabels: 窄段被推到上一排', () => {
  // 三段各 20 宽,标签却要 50 宽 → 互相压住,只能一段一排
  const rows = layoutChainLabels([seg(0, 20), seg(20, 40), seg(40, 60)], {
    labelWidth: () => 50,
    minGap: 4,
  })
  assert.deepEqual(rows, [0, 1, 2])
})

test('layoutChainLabels: 窄段让开后,后面的宽段回到第 0 排', () => {
  // 标签宽 50:第 2 段(中点 210)还挤得进第 0 排,第 3 段(中点 230)挤不进被推到
  // 第 1 排,第 4 段(中点 420)离得够远又落回第 0 排
  const rows = layoutChainLabels([seg(0, 200), seg(200, 220), seg(220, 240), seg(240, 600)], {
    labelWidth: () => 50,
    minGap: 4,
  })
  assert.deepEqual(rows, [0, 0, 1, 0])
})

test('layoutChainLabels: 同一排内的标签不重叠', () => {
  // 连着三个窄段,逼出三排,才真的检验得到「同排不重叠」
  const segments = [seg(0, 200), seg(200, 220), seg(220, 240), seg(240, 260), seg(260, 600)]
  const width = 50
  const rows = layoutChainLabels(segments, { labelWidth: () => width, minGap: 4 })
  assert.equal(Math.max(...rows), 2, '这组数据应当用到三排')
  const byRow = new Map<number, { left: number; right: number }[]>()
  segments.forEach((segment, index) => {
    const mid = (segment.start + segment.end) / 2
    const list = byRow.get(rows[index]) ?? []
    list.push({ left: mid - width / 2, right: mid + width / 2 })
    byRow.set(rows[index], list)
  })
  for (const list of byRow.values()) {
    for (let i = 1; i < list.length; i++) {
      assert.ok(list[i].left >= list[i - 1].right, '同排标签不得重叠')
    }
  }
})

test('layoutChainLabels: 空输入返回空数组', () => {
  assert.deepEqual(layoutChainLabels([], { labelWidth: () => 50, minGap: 4 }), [])
})
```

同时把顶部的 type import 补上 `DimensionChainSegment`：

```ts
import type { DimensionChainSegment } from './dimensionChain.ts'
```

- [ ] **Step 2: 跑测试确认它失败**

Run:
```bash
node --test --experimental-strip-types src/venue/dimensionChain.test.ts
```
Expected: FAIL —— `layoutChainLabels is not a function` 或导入报错

- [ ] **Step 3: 写实现**

追加到 `src/venue/dimensionChain.ts` 末尾：

```ts
// 贪心区间装箱:按顺序把每个标签放进「能放下它的最小排号」。第 0 排紧贴链线,
// 排号越大越靠外。窄段因此自动让到上一排,后面的宽段又能落回第 0 排。
export function layoutChainLabels(
  segments: DimensionChainSegment[],
  options: {
    labelWidth: (segment: DimensionChainSegment, index: number) => number
    minGap: number
  },
): number[] {
  const rowEnds: number[] = []
  return segments.map((segment, index) => {
    const width = options.labelWidth(segment, index)
    const mid = (segment.start + segment.end) / 2
    const left = mid - width / 2
    const right = mid + width / 2
    for (let row = 0; row < rowEnds.length; row++) {
      if (left >= rowEnds[row] + options.minGap) {
        rowEnds[row] = right
        return row
      }
    }
    rowEnds.push(right)
    return rowEnds.length - 1
  })
}
```

- [ ] **Step 4: 跑测试确认它通过**

Run:
```bash
npm test 2>&1 | tail -8
```
Expected: `pass 926`（Task 1 后的 921 + 新增 5），`fail 0`

- [ ] **Step 5: 提交**

```bash
git add src/venue/dimensionChain.ts src/venue/dimensionChain.test.ts
git commit -m "feat(venue): 尺寸链标签贪心分排

窄段标签互相压住时错到上一排,后面的宽段仍能落回第 0 排。

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: SVG 渲染件 `DimensionChain.tsx`

**Files:**
- Create: `src/venue/DimensionChain.tsx`
- Modify: `scripts/check-style-tokens.mjs`（WHITELIST 加一行）
- Modify: `docs/design-system.md:194` 附近（豁免登记表加一行）

渲染件没有单测（SVG 结构断言性价比低），验证靠类型检查 + 门禁 + Task 6 的实机走查。

- [ ] **Step 1: 写渲染件**

创建 `src/venue/DimensionChain.tsx`：

```tsx
'use client'

import { layoutChainLabels, type DimensionChainAxis, type DimensionChainSegment } from './dimensionChain'
import { formatVenueMeasurement } from './layoutData'

// 尺寸链专用青绿。与组件标尺的灰 #64748b、外轮廓总尺寸的红 #ef4444 是「三条标注
// 必须一眼分得开」的一套,改其中任何一个都要回头确认另外两个还认得出来。
const CHAIN_LINE = '#0d9488'
const CHAIN_TEXT = '#0f766e'
const CHAIN_GAP_TEXT = '#5eead4'

// 链线离组件近边的距离。组件标尺在 14/scale、外轮廓总尺寸在 80/scale,
// 这里取 50/scale 夹在中间,三层由内到外互不打架。
const CHAIN_OFFSET = 50

export default function DimensionChain({
  segments,
  axis,
  anchor,
  scale,
}: {
  segments: DimensionChainSegment[]
  axis: DimensionChainAxis
  anchor: number
  scale: number
}) {
  if (segments.length === 0) return null

  const horizontal = axis === 'horizontal'
  const fontSize = 11 / scale
  const baseline = anchor - CHAIN_OFFSET / scale
  const tick = 6 / scale
  const lineW = 1.6 / scale
  const halo = 3.5 / scale
  const textGap = 6 / scale
  const rowGap = 15 / scale
  const dash = `${4 / scale} ${3 / scale}`

  const labels = segments.map((segment) => formatVenueMeasurement(segment.length))
  const rows = layoutChainLabels(segments, {
    // SVG 里拿不到字体度量,按经验字宽比估算:11px 无衬线的数字+m 大约 0.62 个字高宽
    labelWidth: (_segment, index) => labels[index].length * 0.62 * fontSize,
    minGap: 4 / scale,
  })

  // along = 沿链方向,cross = 垂直链方向。两条链都是「cross 变小 = 更靠外」。
  const at = (along: number, cross: number) =>
    horizontal ? { x: along, y: cross } : { x: cross, y: along }

  const line = (along1: number, cross1: number, along2: number, cross2: number) => {
    const a = at(along1, cross1)
    const b = at(along2, cross2)
    return { x1: a.x, y1: a.y, x2: b.x, y2: b.y }
  }

  const cuts = [segments[0].start, ...segments.map((segment) => segment.end)]

  return (
    <g pointerEvents="none" stroke={CHAIN_LINE} fontSize={fontSize} fontWeight="700">
      {segments.map((segment, index) => (
        <line
          key={`seg-${index}`}
          {...line(segment.start, baseline, segment.end, baseline)}
          strokeWidth={lineW}
          strokeDasharray={segment.itemId === null ? dash : undefined}
          opacity={segment.itemId === null ? 0.6 : 1}
        />
      ))}

      {cuts.map((cut, index) => (
        <g key={`cut-${index}`}>
          <line {...line(cut, baseline - tick, cut, baseline + tick)} strokeWidth={lineW} />
          <line {...line(cut, baseline + tick, cut, anchor)} strokeWidth={0.8 / scale} opacity={0.3} />
        </g>
      ))}

      {segments.map((segment, index) => {
        const mid = (segment.start + segment.end) / 2
        const cross = baseline - textGap - rows[index] * rowGap
        const point = at(mid, cross)
        return (
          <g key={`label-${index}`}>
            {rows[index] > 0 && (
              <line
                {...line(mid, baseline - tick, mid, cross + fontSize * 0.3)}
                strokeWidth={0.9 / scale}
                opacity={0.55}
              />
            )}
            <text
              x={point.x}
              y={point.y}
              textAnchor="middle"
              dominantBaseline="auto"
              transform={horizontal ? undefined : `rotate(-90 ${point.x} ${point.y})`}
              fill={segment.itemId === null ? CHAIN_GAP_TEXT : CHAIN_TEXT}
              stroke="#fff"
              strokeWidth={halo}
              strokeLinejoin="round"
              paintOrder="stroke"
            >
              {labels[index]}
            </text>
          </g>
        )
      })}
    </g>
  )
}
```

- [ ] **Step 2: 加进样式门禁白名单**

`scripts/check-style-tokens.mjs` 的 `WHITELIST` 数组（第 28–35 行附近），在 `Venue3DCanvas.client.tsx` 那行之后插入：

```js
  'src/venue/DimensionChain.tsx', // 场馆尺寸链标注:青绿与组件标尺灰/总尺寸红同属工程制图语义,非 UI chrome（spec §6）
```

- [ ] **Step 3: 在 design-system 文档同步登记**

门禁脚本注释写死了「新增条目必须在 `docs/design-system.md` §7 同步登记」。在 `docs/design-system.md:194`（`Venue3DCanvas.client.tsx` 那一行）之后插入表格行：

```markdown
     | `src/venue/DimensionChain.tsx` | 场馆尺寸链标注：青绿与组件标尺灰／总尺寸红同属工程制图语义，非 UI chrome |
```

- [ ] **Step 4: 跑门禁与类型检查**

Run:
```bash
npm run test:style && npx tsc --noEmit
```
Expected: 门禁通过；`tsc` 无输出（此时 `DimensionChain` 还没被任何地方引用，属正常）

- [ ] **Step 5: 提交**

```bash
git add src/venue/DimensionChain.tsx scripts/check-style-tokens.mjs docs/design-system.md
git commit -m "feat(venue): 尺寸链 SVG 渲染件

链线夹在组件标尺与外轮廓总尺寸之间,空隙段画虚线,窄段标签错排拉引线。

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 4: 三语文案

**Files:**
- Modify: `messages/zh.json`、`messages/en.json`、`messages/ja.json`

- [ ] **Step 1: 三个文件的 `venue` 命名空间各加一个 `rulerMenu` 对象**

放在已有的 `"dimensionRulers"` 键旁边。

`messages/zh.json`：
```json
    "rulerMenu": {
      "items": "组件标尺",
      "totalBounds": "外轮廓总尺寸",
      "chain": "尺寸链",
      "bandDepth": "贴边带",
      "bandAuto": "自动"
    },
```

`messages/en.json`：
```json
    "rulerMenu": {
      "items": "Item rulers",
      "totalBounds": "Overall size",
      "chain": "Dimension chain",
      "bandDepth": "Edge band",
      "bandAuto": "Auto"
    },
```

`messages/ja.json`：
```json
    "rulerMenu": {
      "items": "部材寸法",
      "totalBounds": "全体寸法",
      "chain": "寸法チェーン",
      "bandDepth": "外周帯",
      "bandAuto": "自動"
    },
```

已有的 `venue.dimensionRulers`（尺寸标尺 / Dimension rulers / 寸法補助線）**保留不动**，Task 5 里继续当按钮的 `title` / `aria-label`。

- [ ] **Step 2: 跑三语一致性门禁**

Run:
```bash
npm run test:i18n
```
Expected: 通过（三语 key 集合一致）

- [ ] **Step 3: 提交**

```bash
git add messages/zh.json messages/en.json messages/ja.json
git commit -m "i18n(venue): 尺寸标注三档开关文案

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 5: 接线 —— 开关拆三档 + 画布挂上尺寸链

这一步把前四个任务接起来，做完就能在浏览器里看到效果。三处改动必须一起做，否则中间状态编译不过。

**Files:**
- Modify: `src/venue/VenueCanvas.tsx`
- Modify: `src/app/[locale]/(app)/guild-venue/page.tsx`

- [ ] **Step 1: `VenueCanvas` 换 props 类型**

在 `src/venue/VenueCanvas.tsx` 顶部 import 区补上：

```ts
import DimensionChain from './DimensionChain'
import { planDimensionChain } from './dimensionChain'
```

在 `type Props` 之前加导出类型：

```ts
// 三档尺寸标注,互相独立。页面持有状态,画布只负责按开关渲染。
export type VenueRulerOptions = {
  // 每个组件自己的长宽标尺 + 选中两个组件时的间距标注
  items: boolean
  // 外轮廓总尺寸(红色,只统计空间类型)
  totalBounds: boolean
  // 尺寸链(青绿,贴边那一排组件的分段尺寸)
  chain: boolean
  // 贴边带深度(cm);null = 用自动值。工具栏滑杆一拨就变成具体数值。
  chainBandDepth: number | null
}
```

`Props` 里把 `showRulers: boolean` 换成：

```ts
  rulerOptions: VenueRulerOptions
```

函数签名的解构参数 `showRulers` 同步改成 `rulerOptions`（`VenueCanvas.tsx:88`）。

- [ ] **Step 2: 画布内部四处引用改名 + 算链**

`VenueCanvas.tsx` 里把原来读 `showRulers` 的地方逐个改掉：

- `:527` 未选中组件的 `showRulers={showRulers}` → `showRulers={rulerOptions.items}`
- `:571` 选中组件的 `showRulers={showRulers}` → `showRulers={rulerOptions.items}`
- `:618` `{showRulers && selectedItems.length === 2 && ...}` → `{rulerOptions.items && selectedItems.length === 2 && ...}`
- `:621` `{showRulers && <TotalBoundsRulers ... />}` → `{rulerOptions.totalBounds && <TotalBoundsRulers ... />}`

在 `defaultRulerPlan`（`:434`）之后加链的计算。注意依赖用 `items`（已含类型过滤与拖拽实时位置），所以拖动时链会实时重算：

```ts
  // 尺寸链:关掉时不算,省掉每次拖拽的无谓计算。两条链共用同一个带深。
  const chains = useMemo(
    () => rulerOptions.chain
      ? {
          horizontal: planDimensionChain(items, 'horizontal', rulerOptions.chainBandDepth),
          vertical: planDimensionChain(items, 'vertical', rulerOptions.chainBandDepth),
        }
      : null,
    [items, rulerOptions.chain, rulerOptions.chainBandDepth],
  )
```

- [ ] **Step 3: 挂上渲染**

在 `VenueCanvas.tsx:621` 的 `TotalBoundsRulers` 那一行之后插入：

```tsx
            {chains && (
              <>
                <DimensionChain
                  segments={chains.horizontal.segments}
                  axis="horizontal"
                  anchor={chains.horizontal.anchor}
                  scale={scale}
                />
                <DimensionChain
                  segments={chains.vertical.segments}
                  axis="vertical"
                  anchor={chains.vertical.anchor}
                  scale={scale}
                />
              </>
            )}
```

- [ ] **Step 4: 页面状态换成三元组**

`src/app/[locale]/(app)/guild-venue/page.tsx:149`：

```ts
  const [showRulers, setShowRulers] = useState(true)
```
改成
```ts
  const [rulerOptions, setRulerOptions] = useState<VenueRulerOptions>({
    items: true,
    totalBounds: true,
    chain: false,
    chainBandDepth: null,
  })
```

顶部 import 补上类型（与已有的 `VenueCanvas` 默认导入同一行来源）：

`page.tsx:53` 现在是 `import VenueCanvas from '@/venue/VenueCanvas'`，改成：

```ts
import VenueCanvas, { type VenueRulerOptions } from '@/venue/VenueCanvas'
import { autoChainBandDepth } from '@/venue/dimensionChain'
```

`formatVenueMeasurement` 已经在 `page.tsx:70` import 过了，不用再加。

滑杆处于自动模式时要显示自动值，页面自己算一份（口径跟画布一致：用已有的 `visibleFloor`，它是套过类型筛选的楼层，见 `page.tsx:308`）。放在 `visibleFloor` 定义之后：

```ts
  // 滑杆停在自动值上时要把这个数显示出来。顶链与左链的自动值可能不同,
  // 这里取顶链的——滑杆是两条链共用的,拿一个有代表性的当缺省位置。
  const chainAutoDepth = useMemo(
    () => autoChainBandDepth(visibleFloor.items, 'horizontal'),
    [visibleFloor.items],
  )
```

`:1057` 的 `showRulers={showRulers}` 改成 `rulerOptions={rulerOptions}`。

- [ ] **Step 5: 工具栏按钮换成三勾选弹层**

`page.tsx:969` 那一行：

```tsx
          <ToolbarButton iconOnly icon={Ruler} label={t('dimensionRulers')} onClick={() => setShowRulers((value) => !value)} active={showRulers} />
```
换成
```tsx
          <RulerMenu options={rulerOptions} onChange={setRulerOptions} autoDepth={chainAutoDepth} />
```

在文件里 `AddMenu`（`:1700`）之后新增组件。弹层开关、点外面关闭、`position: fixed` 定位都照抄 `AddMenu`：

```tsx
function RulerMenu({
  options,
  onChange,
  autoDepth,
}: {
  options: VenueRulerOptions
  onChange: (next: VenueRulerOptions) => void
  // 自动带深(cm),仅用于滑杆处于自动模式时的显示与滑块位置
  autoDepth: number
}) {
  const t = useTranslations('venue')
  const [open, setOpen] = useState(false)
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(null)
  const ref = useRef<HTMLDivElement | null>(null)
  const buttonRef = useRef<HTMLButtonElement | null>(null)

  useEffect(() => {
    if (!open) return
    const handle = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [open])

  const toggleOpen = () => {
    const rect = buttonRef.current?.getBoundingClientRect()
    if (rect) setMenuPos({ top: rect.bottom + 4, left: rect.left })
    setOpen((value) => !value)
  }

  const entries: { key: 'items' | 'totalBounds' | 'chain'; label: string }[] = [
    { key: 'items', label: t('rulerMenu.items') },
    { key: 'totalBounds', label: t('rulerMenu.totalBounds') },
    { key: 'chain', label: t('rulerMenu.chain') },
  ]
  const anyOn = options.items || options.totalBounds || options.chain

  return (
    <div ref={ref} className="flex-shrink-0">
      <button
        ref={buttonRef}
        type="button"
        title={t('dimensionRulers')}
        aria-label={t('dimensionRulers')}
        aria-expanded={open}
        onClick={toggleOpen}
        className={`h-8 w-8 shrink-0 inline-flex items-center justify-center rounded-field border text-xs font-semibold leading-none transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-ring focus-visible:ring-offset-1 ${
          anyOn
            ? 'border-primary-border bg-primary-soft text-primary'
            : 'border-line-strong bg-surface text-ink-700 hover:border-primary-border hover:text-primary-hover'
        }`}
      >
        <Ruler className="w-4 h-4" strokeWidth={1.5} />
      </button>
      {open && menuPos && (
        <div
          style={{ position: 'fixed', top: menuPos.top, left: menuPos.left }}
          className="z-40 min-w-44 rounded-card border border-line bg-surface py-1 shadow-pop"
        >
          {entries.map((entry) => (
            <label
              key={entry.key}
              className="flex w-full cursor-pointer items-center gap-2 px-3 py-1.5 text-left text-xs text-ink-700 hover:bg-line-soft transition-colors"
            >
              <input
                type="checkbox"
                checked={options[entry.key]}
                onChange={(event) => onChange({ ...options, [entry.key]: event.target.checked })}
                className="h-3.5 w-3.5 accent-primary"
              />
              <span>{entry.label}</span>
            </label>
          ))}
          {options.chain && (
            <div className="mt-1 border-t border-line-soft px-3 pb-1.5 pt-2">
              <div className="flex items-center justify-between gap-2 text-xs text-ink-700">
                <span>{t('rulerMenu.bandDepth')}</span>
                <span className="font-semibold tabular-nums text-ink-900">
                  {options.chainBandDepth === null
                    ? `${t('rulerMenu.bandAuto')} ${formatVenueMeasurement(autoDepth)}`
                    : formatVenueMeasurement(options.chainBandDepth)}
                </span>
              </div>
              <div className="mt-1.5 flex items-center gap-2">
                <input
                  id="venue-chain-band-depth"
                  type="range"
                  min={30}
                  max={400}
                  step={10}
                  value={options.chainBandDepth ?? Math.round(autoDepth)}
                  aria-label={t('rulerMenu.bandDepth')}
                  // 拨滑杆就等于「我要自己定」,顺手退出自动模式。别做成必须先点
                  // 「自动」才能拨——mock 上试过,那样会让人以为滑杆是坏的。
                  onChange={(event) => onChange({ ...options, chainBandDepth: Number(event.target.value) })}
                  className="h-1 flex-1 accent-primary"
                />
                <button
                  type="button"
                  onClick={() => onChange({ ...options, chainBandDepth: null })}
                  disabled={options.chainBandDepth === null}
                  className="shrink-0 rounded-field border border-line-strong px-2 py-0.5 text-[11px] font-semibold text-ink-700 transition-colors hover:border-primary-border hover:text-primary-hover disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {t('rulerMenu.bandAuto')}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
```

> `Ruler` 图标（`page.tsx:38`）、`useCallback/useEffect/useMemo/useRef/useState`（`page.tsx:3`）、`formatVenueMeasurement`（`page.tsx:70`）都已经 import 过，不用再加。按钮的 active/inactive 配色照搬 `ToolbarButton:1921-1923` 的同名分支（active 是 `border-primary-border bg-primary-soft text-primary-hover`），不要自造新配色。
>
> 带深滑杆只在「尺寸链」勾上时才出现——勾掉就收起来，面板保持精简。

- [ ] **Step 6: 类型检查 + lint + 全量测试**

Run:
```bash
npx tsc --noEmit && npm run test:lint && npm test 2>&1 | tail -6
```
Expected: `tsc` 无输出；lint 零警告；`pass 926` / `fail 0`

- [ ] **Step 7: 提交**

```bash
git add src/venue/VenueCanvas.tsx "src/app/[locale]/(app)/guild-venue/page.tsx"
git commit -m "feat(venue): 尺寸标注拆成三档独立开关并接上尺寸链

组件标尺／外轮廓总尺寸／尺寸链改为各自勾选,任意组合。

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 6: 门禁全跑 + 实机走查

**Files:** 无（只跑命令、只看效果；发现问题回到对应 Task 修）

- [ ] **Step 1: 跑全套文案/样式门禁**

Run:
```bash
npm run test:copy
```
Expected: `test:i18n`、`test:no-bare-han`、`test:style`、`test:lint` 四项全过

- [ ] **Step 2: 起本地 dev server**

worktree 里**不能**用 `preview_start`——它会跑到主仓去（见记忆「worktree 实机预览配方」）。手动起，换个端口避开主仓的 3001：

```bash
npx next dev --port 3021
```

- [ ] **Step 3: 打开场地布置页并逐项核对**

浏览器打开 `http://localhost:3021/zh/guild-venue`，点工具栏的尺子按钮展开三档，逐条确认：

1. **八种组合**：三个勾选项的 2³ 种组合都正确生效，互不牵连（尤其：只勾「尺寸链」时，组件标尺和红色总尺寸都必须消失）。
2. **分段是否符合预期**：顶部链是否把贴上墙的柱子、化妆间、后门都切了出来；深处的楼梯有没有混进来。若柱子没被收进链里，说明贴边带太浅；若楼梯混进来了，说明太深——调 `dimensionChain.ts` 的 `BAND_DEPTH_RATIO` / `BAND_DEPTH_MAX`，改完回 Task 1 补一条对应的测试。
3. **首尾相加**：链上各段数值相加，应当正好等于该方向的跨度。
4. **三层不打架**：链线夹在组件标尺与红色总尺寸之间，没有压住任何一方。
5. **缩放**：拉到 50% 和 300%，标签分排仍不重叠，链线仍贴在总尺寸内侧。
6. **拖拽**：拖动一个组件，链实时重算且不卡顿。
7. **竖链方向**：左侧竖链的文字是否正着可读（`rotate(-90)`），标签是否朝左错开而不是压在画布上。

- [ ] **Step 4: 截图存证**

把「三档都开」和「只开尺寸链」两张截图发给用户确认，再决定是否开 PR。

- [ ] **Step 5: 开 PR**

确认无误后推分支开 PR（本仓约定：不直接推 main）：

```bash
git push -u origin worktree-venue-dimension-chain
```

PR 描述里附上两张截图和贴边带深度的实测结论。

---

## 风险与回头要确认的点

- **贴边带深度的自动公式不可靠，所以它做成了滑杆。** 把算法跑在还原的 1F 数据上（mock: https://claude.ai/artifact/1iVTB2bTVAJPzLv8AQXchm）得到：顶部链自动带深 **1.36m**，而驻车场上边线在 **1.40m**——差 4cm 落选，整个 5.8m 的驻车场被排除在链外。一个 4 厘米的差额能决定半个平面进不进链，这种参数不该写死让用户猜。**用户 2026-09-14 拍板：自动值只当缺省，工具栏给一根滑杆随时拨。** `BAND_DEPTH_*` 常量现在只影响缺省位置，不再是唯一真相。
- **标签宽度是估算的**（`字符数 × 0.62 × 字号`），不是真实字体度量。窄段密集时可能仍有轻微重叠，实测发现就把 0.62 调大一点，而不是去改分排算法。
- **尺寸链与红色总尺寸的端点不对齐是预期行为**——前者统计所有非标识组件，后者只统计空间类型。看到两条线不齐不要当 bug 修。
