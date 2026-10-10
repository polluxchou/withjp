# 竞品相册按日期窗口加载 + 标签多语言 + 封面取最新 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 竞品页首屏只取最近 10 个有图日的截图记录，往历史翻时后台按需补取；截图标签按界面语言显示；每天的封面改为当天最新一张。卡片开播时段、地区标尺、统计条、导航条、问答面板上的数字一律不变。

**Architecture:** 服务端先用一个三列的瘦查询拿全量截图索引，算出完整日期轴和每个账号全部历史的开播时刻，再按日期窗口取截图本体。前端用纯函数判断何时补取、怎么合并，并把「未加载」和「没图」区分开来。问答面板单独查它需要的列，取全部历史。所有判断逻辑都放在 `src/lib/competitors/*.ts`，写成纯函数并配单测；组件只负责接线，用源码断言守住。

**Tech Stack:** Next.js 14 App Router、React 18、TypeScript、Supabase（PostgREST）、next-intl、`node --test --experimental-strip-types`。

**Spec:** `docs/superpowers/specs/2026-10-10-competitor-shot-album-windowing-design.md`

## Global Constraints

- 所有命令都在本 worktree 根目录执行。**每次提交前先跑 `git branch --show-current`**，确认还在本功能分支上。
- 门禁全部要过：`npx tsc --noEmit`、`npm test`、`npm run test:copy`。最后一项包含 i18n 键一致性、JSX 不许裸中文、样式 token、`next lint --max-warnings=0`。
- `src/lib` 里的文件互相引用时，用相对路径并带 `.ts` 后缀，因为 `node --test` 不认 `@/` 别名。只引用类型时用 `import type`，否则 strip-types 能跑通，tsc 却会报错。
- 组件里不许写裸中文：文案放进 `messages/{zh,en,ja}.json`，三种语言同步。翻译键要写成字面量，比如 `t('shotTag.live_auto')`，i18n 门禁才认得出这是一次引用。
- 新增的测试文件要追加到 `package.json` 里 `"test"` 那一行的末尾，否则 CI 不会跑它。
- `src/` 的注释里不要写 `(#123)` 这种 PR 编号写法，样式门禁会把它当成裸十六进制色值；要写就写成 `PR 123`。
- 这是公开仓库：文档、注释、提交信息、PR 里都不能出现本机路径、人名或安全配置细节。
- 常量值：`SHOT_CHUNK_DAYS = 10`（新增）；`SHOT_WINDOW_SIZE = 5`（已有，不改）。
- 标签文案逐字照抄：`live_auto` 是 自动巡检 / Auto patrol / 自動巡回；`live_manual` 是 插件 / Extension / 拡張機能。
- 不改数据库结构（无 DDL）。
- 提交信息结尾加 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`。
- 突变探针必须在**已提交**的基线上跑。探针里会用 `git checkout` 还原文件，没提交的实现会被一并冲掉。

## Review Focus

以下几种情况，spec 的测试没有直接覆盖，但用户最容易碰到。每一条都已在对应任务里补了钉住它的测试。

1. **连续快点「更早」，点击快过补取**：窗口会整屏落在还没加载的日期上。预期：这些格子显示骨架，补取的这一段要能盖住整屏，不能只补一小段然后卡住。→ Task 4 的 `nextChunk` 有「一次跳很远」的用例。
2. **补取请求还在路上，用户上传或改日期触发了刷新**：刷新先回来，把看板换掉了，之后补取结果才回来。预期：过期结果直接丢掉，不能把数据合并进错误的范围里。→ Task 4 的 `mergeShotRange` 有「过期结果原样返回」的用例。
3. **加载起点那一天的图被删光了**：`shotsLoadedFrom` 已经不在日期轴上。预期：照常判断还缺哪一段，不能卡住，也不能重复拉同一段。→ Task 4 的 `nextChunk` 有「起点不在轴上」的用例。
4. **刷新时带的 `since` 比默认起点更晚**：例如当天新增了很多日期，默认起点往后移了。预期：仍然至少覆盖默认的两屏，不能反过来变少。→ Task 3 的 `resolveLoadedFrom` 有「取较早者」的用例。
5. **某账号在已加载的窗口里一张图都没有，但历史上有开播记录**：预期：卡片的开播时段照常显示。→ Task 1 的 `assembleBoard` 有「开播时刻不受已加载截图影响」的用例，Task 2 有接线断言。

---

## File Structure

| 文件 | 动作 | 职责 |
| --- | --- | --- |
| `src/lib/competitors/types.ts` | 改 | 看板类型加截图类型参数；新增 `sessionStarts`、`shotAxis`、`shotsLoadedFrom`、`BoardShot`、`AskShot` |
| `src/lib/competitors/shotWindow.ts` | **新** | 按日期窗口加载的全部纯函数：建索引、定起点、生成过滤串、解析查询参数、拼路径、判断是否已加载、算下一段、合并 |
| `src/lib/competitors/shotWindow.test.ts` | **新** | 上述纯函数的单测 |
| `src/lib/competitors/shotGrid.ts` | 改 | 新增 `compareShotsForBoard`、`coverOf`；`groupShotsByDate` 改按截图时刻排序；删掉 `collectShotDates` |
| `src/lib/competitors/assemble.ts` | 改 | 泛型化；接收 `meta`，挂上 `sessionStarts`、`shotAxis`、`shotsLoadedFrom` |
| `src/lib/competitors/regionRuler.ts` | 改 | 数据来源从 `shots` 换成 `sessionStarts` |
| `src/lib/competitors/shotTag.ts` | **新** | 判断一个 tag 是机器值还是人写的文本 |
| `src/lib/competitors/service.ts` | 改 | `getCompetitorBoard` 按窗口取数；新增 `getShotsInRange`、`getAskBoard` |
| `src/lib/competitors/ask-context.ts` / `ask-service.ts` | 改 | 入参放宽到 `CompetitorBoard<AskShot>`；问答改走 `getAskBoard` |
| `src/app/api/competitors/route.ts` | 改 | GET 支持 `since` 参数 |
| `src/app/api/competitors/shots/route.ts` | **新** | GET 按日期区间补取截图 |
| `src/components/competitors/CompetitorDossierView.tsx` | 改 | 日期轴改用服务端下发的完整轴；按需补取；刷新时带 `since`；导航条「待补」加守卫；补取失败时给重试 |
| `src/components/competitors/CompetitorCard.tsx` | 改 | 开播时段改读 `sessionStarts`；把已加载起点透传给相册 |
| `src/components/competitors/ShotAlbum.tsx` | 改 | 新增 `PendingCell`；标签显示走文案；封面取最新一张 |
| `src/components/competitors/ShotLightbox.tsx` | 改 | 新增 `initialId`；alt 里的标签走文案 |
| `src/components/competitors/useShotTagLabel.ts` | **新** | 把 tag 翻译成当前语言的显示文本 |
| `src/components/competitors/album-windowing-wiring.test.ts` | **新** | 前端接线的源码断言 |
| `src/lib/competitors/shot-window-wiring.test.ts` | **新** | 服务端和路由接线的源码断言 |
| `src/lib/competitors/board-pagination.test.ts` | 改 | 覆盖新增的取数函数 |
| `messages/{zh,en,ja}.json` | 改 | 新增 `competitors.shotTag.*`、`competitors.shotsLoadFailed` |
| `docs/competitors.md`、`src/lib/changelog/entries.ts` | 改 | 接口文档与更新日志 |

---

### Task 1: 数据模型——完整日期轴、全量开播时刻、已加载范围

**Files:**
- Create: `src/lib/competitors/shotWindow.ts`
- Create: `src/lib/competitors/shotWindow.test.ts`
- Modify: `src/lib/competitors/types.ts`（`CompetitorWithHistory`、`CompetitorBoard` 两个接口，以及文件末尾）
- Modify: `src/lib/competitors/shotGrid.ts`（新增 `compareShotsForBoard`）
- Modify: `src/lib/competitors/assemble.ts`（整个 `assembleBoard`）
- Modify: `src/app/[locale]/(app)/competitors/page.tsx:22`（兜底空看板）
- Modify: 测试夹具 `src/lib/competitors/shotGrid.test.ts`、`ask-context.test.ts`、`ask-prompt.test.ts`、`ask-service.test.ts`
- Test: `src/lib/competitors/assemble.test.ts`、`src/lib/competitors/shotGrid.test.ts`
- Modify: `package.json`（`test` 行末尾追加 `src/lib/competitors/shotWindow.test.ts`）

**Interfaces:**
- Produces（类型，`types.ts`）：
  - `CompetitorWithHistory<S = CompetitorShot>`：多了 `sessionStarts: string[]`，`shots: S[]`，`related: CompetitorWithHistory<S>[]`
  - `CompetitorBoard<S = CompetitorShot>`：`{ competitors: CompetitorWithHistory<S>[]; canEdit: boolean; shotAxis: string[]; shotsLoadedFrom: string | null }`
  - `BoardShot = Pick<CompetitorShot, 'competitor_id' | 'shot_on' | 'sort_order' | 'stream_started_at'>`
  - `AskShot = Pick<CompetitorShot, 'competitor_id' | 'shot_on' | 'sort_order' | 'stream_started_at' | 'viewer_count' | 'captured_at'>`
- Produces（`shotWindow.ts`）：
  - `ShotIndexRow = Pick<CompetitorShot, 'competitor_id' | 'shot_on' | 'stream_started_at'>`
  - `ShotIndex = { shotAxis: string[]; sessionStartsBy: Map<string, string[]> }`
  - `buildShotIndex(rows: ShotIndexRow[]): ShotIndex`
- Produces（`shotGrid.ts`）：`compareShotsForBoard(a: Pick<CompetitorShot,'shot_on'|'sort_order'>, b: same): number`
- Produces（`assemble.ts`）：
  - `ShotMeta = ShotIndex & { shotsLoadedFrom: string | null }`
  - `assembleBoard<S extends BoardShot = CompetitorShot>(competitors, snapshots, shots: S[], canEdit, descriptions = [], meta?: ShotMeta): CompetitorBoard<S>`

- [ ] **Step 1: 写 `buildShotIndex` 的失败测试**

新建 `src/lib/competitors/shotWindow.test.ts`：

```ts
// src/lib/competitors/shotWindow.test.ts
import assert from 'node:assert/strict'
import test from 'node:test'

import { UNDATED_KEY } from './shotGrid.ts'
import { buildShotIndex } from './shotWindow.ts'

const row = (competitor_id: string, shot_on: string | null, stream_started_at: string | null = null) =>
  ({ competitor_id, shot_on, stream_started_at })

test('buildShotIndex: 日期轴跨账号去重并升序', () => {
  const { shotAxis } = buildShotIndex([
    row('a', '2026-08-05'), row('a', '2026-08-03'), row('b', '2026-08-05'), row('b', '2026-08-01'),
  ])
  assert.deepEqual(shotAxis, ['2026-08-01', '2026-08-03', '2026-08-05'])
})

test('buildShotIndex: 有无日期截图时轴尾追加 UNDATED_KEY', () => {
  assert.deepEqual(buildShotIndex([row('a', '2026-08-05'), row('a', null)]).shotAxis, ['2026-08-05', UNDATED_KEY])
  assert.deepEqual(buildShotIndex([row('a', null)]).shotAxis, [UNDATED_KEY])
})

test('buildShotIndex: 空表', () => {
  const idx = buildShotIndex([])
  assert.deepEqual(idx.shotAxis, [])
  assert.equal(idx.sessionStartsBy.size, 0)
})

test('buildShotIndex: 开播时刻按账号去重、忽略空值、升序', () => {
  const idx = buildShotIndex([
    row('a', '2026-08-05', '2026-08-05T05:00:00+00:00'),
    row('a', '2026-08-05', '2026-08-05T05:00:00+00:00'), // 同一场的第二张截图
    row('a', '2026-08-03', '2026-08-03T04:30:00+00:00'),
    row('a', '2026-08-04', null),
    row('b', '2026-08-05', '2026-08-05T05:00:00+00:00'), // 另一个号凑巧同一秒开播，不能被并掉
  ])
  assert.deepEqual(idx.sessionStartsBy.get('a'), ['2026-08-03T04:30:00+00:00', '2026-08-05T05:00:00+00:00'])
  assert.deepEqual(idx.sessionStartsBy.get('b'), ['2026-08-05T05:00:00+00:00'])
})

test('buildShotIndex: 只有无开播时刻截图的账号不进 sessionStartsBy', () => {
  assert.equal(buildShotIndex([row('a', '2026-08-05')]).sessionStartsBy.has('a'), false)
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `node --test --experimental-strip-types src/lib/competitors/shotWindow.test.ts`
Expected: FAIL，报找不到模块 `./shotWindow.ts`。

- [ ] **Step 3: 改类型**

在 `src/lib/competitors/types.ts` 里，把 `CompetitorWithHistory` 和 `CompetitorBoard` 两个接口整段替换成下面的内容，并在文件末尾追加 `BoardShot` / `AskShot`：

```ts
export interface CompetitorWithHistory<S = CompetitorShot> extends Competitor {
  latest: CompetitorSnapshot | null
  history: HistoryPoint[]
  /**
   * **已加载范围内**的截图（见 CompetitorBoard.shotsLoadedFrom），不一定是全部历史。
   * 要全量口径的统计别用它：开播时刻用 sessionStarts，日期轴用 board.shotAxis。
   */
  shots: S[]
  /**
   * 全部历史里去重后的开播时刻（ISO，升序），与相册加载到哪一天无关。
   * 卡片的开播时段、地区标尺都读它——统计数字不能跟着相册翻页变。
   */
  sessionStarts: string[]
  /** 风格描述，已按生成日期倒序。 */
  descriptions: CompetitorDescription[]
  weekly: WeeklyPoint[]
  /** 下探发现的关联主播（子账号），只在父卡片里下钻展示,不在首页平铺。 */
  related: CompetitorWithHistory<S>[]
}

export interface CompetitorBoard<S = CompetitorShot> {
  competitors: CompetitorWithHistory<S>[]
  canEdit: boolean
  /** 完整日期轴：全部有图日期升序去重；存在无日期截图时末尾追加 UNDATED_KEY。 */
  shotAxis: string[]
  /**
   * 已加载 = 所有 shot_on >= shotsLoadedFrom 的截图 + 全部无日期截图；null = 全部已加载。
   * 已加载范围总包含最新一天（统计条的「最近采集日」依赖这一点，见 summary.ts）。
   */
  shotsLoadedFrom: string | null
}
```

文件末尾追加：

```ts
/** 看板装配对截图只依赖这几列：归属、排序、日期轴与开播时刻。 */
export type BoardShot = Pick<CompetitorShot, 'competitor_id' | 'shot_on' | 'sort_order' | 'stream_started_at'>

/**
 * 竞品问答需要的截图列（getAskBoard 只查这几列）。ask-context.ts 新读一个截图字段时，
 * 要同时加到这里和 service.ts 的 ASK_SHOT_COLUMNS，否则那一列在问答里恒为 undefined。
 */
export type AskShot = Pick<
  CompetitorShot,
  'competitor_id' | 'shot_on' | 'sort_order' | 'stream_started_at' | 'viewer_count' | 'captured_at'
>
```

- [ ] **Step 4: 写 `shotWindow.ts` 的第一部分**

新建 `src/lib/competitors/shotWindow.ts`：

```ts
// src/lib/competitors/shotWindow.ts
// 纯函数：竞品相册「按日期窗口加载」的全部判据——全量索引、加载起点、补取时机、合并。
// 零 IO、零时钟，可单测。设计见
// docs/superpowers/specs/2026-10-10-competitor-shot-album-windowing-design.md
import { UNDATED_KEY } from './shotGrid.ts'
import type { CompetitorShot } from './types.ts'

/** 全量瘦查询的一行：只要归属、日期、开播时刻三列。 */
export type ShotIndexRow = Pick<CompetitorShot, 'competitor_id' | 'shot_on' | 'stream_started_at'>

export interface ShotIndex {
  /** 完整日期轴：有图日期升序去重；存在无日期截图时末尾追加 UNDATED_KEY。 */
  shotAxis: string[]
  /** 账号 id → 全部历史里去重后的开播时刻（升序）。从没采到开播时刻的账号不在里面。 */
  sessionStartsBy: Map<string, string[]>
}

export function buildShotIndex(rows: ShotIndexRow[]): ShotIndex {
  const dated = new Set<string>()
  let hasUndated = false
  const starts = new Map<string, Set<string>>()
  for (const r of rows ?? []) {
    if (r.shot_on) dated.add(r.shot_on)
    else hasUndated = true
    if (r.stream_started_at) {
      // 同一场直播的多张截图报同一个开播时刻；身份是 (账号, 时刻)，跨账号不去重。
      const set = starts.get(r.competitor_id) ?? new Set<string>()
      set.add(r.stream_started_at)
      starts.set(r.competitor_id, set)
    }
  }
  // Array.from 而非展开：避免 Set 展开在当前 tsconfig 下触发 TS2802
  const shotAxis = Array.from(dated).sort((a, b) => a.localeCompare(b))
  if (hasUndated) shotAxis.push(UNDATED_KEY)
  const sessionStartsBy = new Map<string, string[]>()
  starts.forEach((set, id) => {
    sessionStartsBy.set(id, Array.from(set).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)))
  })
  return { shotAxis, sessionStartsBy }
}
```

- [ ] **Step 5: 跑测试确认通过**

Run: `node --test --experimental-strip-types src/lib/competitors/shotWindow.test.ts`
Expected: PASS（5 tests）

- [ ] **Step 6: 写 `compareShotsForBoard` 和 `assembleBoard` 新行为的失败测试**

在 `src/lib/competitors/shotGrid.test.ts` 顶部的 import 里加上 `compareShotsForBoard`，然后在 `groupShotsByDate: 不修改入参数组的顺序` 这条测试之后追加：

```ts
test('compareShotsForBoard: 有日期的按日期倒序、同日 sort_order 升序，无日期垫底且按 sort_order', () => {
  const list = [
    shotAt('x2', null, 2, '2026-08-01T00:00:00Z'),
    shotAt('x1', null, 1, '2026-08-01T00:00:00Z'),
    shotAt('a', '2026-07-20', 0, '2026-08-01T00:00:00Z'),
    shotAt('c', '2026-07-25', 1, '2026-08-01T00:00:00Z'),
    shotAt('b', '2026-07-25', 0, '2026-08-01T00:00:00Z'),
  ]
  assert.deepEqual(list.slice().sort(compareShotsForBoard).map((s) => s.id), ['b', 'c', 'a', 'x1', 'x2'])
})
```

在 `src/lib/competitors/assemble.test.ts` 末尾追加：

```ts
test('assembleBoard: 不给 meta 时日期轴与开播时刻从 shots 算，视为全部已加载', () => {
  const s1 = { ...shot('a', '2026-07-20'), stream_started_at: '2026-07-20T05:00:00+00:00' }
  const s2 = { ...shot('b', '2026-07-25'), stream_started_at: '2026-07-25T05:00:00+00:00' }
  const board = assembleBoard([comp()], [], [s1, s2], true)
  assert.deepEqual(board.shotAxis, ['2026-07-20', '2026-07-25'])
  assert.equal(board.shotsLoadedFrom, null)
  assert.deepEqual(board.competitors[0].sessionStarts, ['2026-07-20T05:00:00+00:00', '2026-07-25T05:00:00+00:00'])
})

test('assembleBoard: 给了 meta 就原样挂上，开播时刻不受已加载截图影响', () => {
  const parent = comp({ id: 'p', handle: 'parent' })
  const child = comp({ id: 'k', handle: 'kid', parent_id: 'p' })
  const board = assembleBoard([parent, child], [], [], true, [], {
    shotAxis: ['2026-07-01', '2026-07-20'],
    sessionStartsBy: new Map([['p', ['2026-07-01T05:00:00+00:00']], ['k', ['2026-07-02T05:00:00+00:00']]]),
    shotsLoadedFrom: '2026-07-20',
  })
  assert.deepEqual(board.shotAxis, ['2026-07-01', '2026-07-20'])
  assert.equal(board.shotsLoadedFrom, '2026-07-20')
  // 已加载截图为空，开播时刻照样来自全量索引——卡片的开播时段不该跟着相册翻页变
  assert.deepEqual(board.competitors[0].sessionStarts, ['2026-07-01T05:00:00+00:00'])
  assert.deepEqual(board.competitors[0].related[0].sessionStarts, ['2026-07-02T05:00:00+00:00'])
})

test('assembleBoard: 没有开播记录的账号 sessionStarts 为空数组', () => {
  const board = assembleBoard([comp()], [], [], true)
  assert.deepEqual(board.competitors[0].sessionStarts, [])
})
```

- [ ] **Step 7: 跑测试确认失败**

Run: `node --test --experimental-strip-types src/lib/competitors/shotGrid.test.ts src/lib/competitors/assemble.test.ts`
Expected: FAIL。`compareShotsForBoard` 不是导出成员；`board.shotAxis` 是 `undefined`。

- [ ] **Step 8: 实现 `compareShotsForBoard`**

在 `src/lib/competitors/shotGrid.ts` 里 `groupShotsByDate` 的上方加：

```ts
/**
 * 看板里单个账号截图的排列：有日期的按 shot_on 倒序、同日按 sort_order 升序，无日期的垫底。
 * assembleBoard 与 mergeShotRange 共用——补取合并后的顺序才和首屏一致。
 */
export function compareShotsForBoard(
  a: Pick<CompetitorShot, 'shot_on' | 'sort_order'>,
  b: Pick<CompetitorShot, 'shot_on' | 'sort_order'>,
): number {
  if (a.shot_on == null && b.shot_on == null) return a.sort_order - b.sort_order
  if (a.shot_on == null) return 1
  if (b.shot_on == null) return -1
  const cmp = b.shot_on.localeCompare(a.shot_on)
  return cmp !== 0 ? cmp : a.sort_order - b.sort_order
}
```

- [ ] **Step 9: 改 `assembleBoard`**

把 `src/lib/competitors/assemble.ts` 的 import 区和 `assembleBoard` 整段换成下面的内容。`parseHandleFromUrl` 不动。

```ts
// src/lib/competitors/assemble.ts
import type {
  BoardShot, Competitor, CompetitorSnapshot, CompetitorShot, CompetitorDescription,
  CompetitorBoard, CompetitorWithHistory, HistoryPoint,
} from './types.ts'
import { sortDescriptions } from './descriptions.ts'
import { compareShotsForBoard } from './shotGrid.ts'
import { buildShotIndex } from './shotWindow.ts'
import type { ShotIndex } from './shotWindow.ts'
import { bucketFollowersByWeek } from './weekly.ts'
```

（`parseHandleFromUrl` 原样保留）

```ts
/**
 * 截图的全量索引 + 已加载范围（字段含义见 CompetitorBoard 的注释）。
 * getCompetitorBoard 用瘦查询单独算好传进来；不传时视为「传进来的 shots 就是全部截图」。
 */
export type ShotMeta = ShotIndex & { shotsLoadedFrom: string | null }

/** 把竞品 + 快照 + 截图 + 风格描述组装成看板；下探发现的子账号（parent_id）挂到父的 related,首页只列顶层。 */
export function assembleBoard<S extends BoardShot = CompetitorShot>(
  competitors: Competitor[],
  snapshots: CompetitorSnapshot[],
  shots: S[],
  canEdit: boolean,
  descriptions: CompetitorDescription[] = [],
  meta?: ShotMeta,
): CompetitorBoard<S> {
  const shotMeta: ShotMeta = meta ?? { ...buildShotIndex(shots), shotsLoadedFrom: null }
  const snapsBy = new Map<string, CompetitorSnapshot[]>()
  for (const s of snapshots) {
    const arr = snapsBy.get(s.competitor_id) ?? []
    arr.push(s)
    snapsBy.set(s.competitor_id, arr)
  }
  const shotsBy = new Map<string, S[]>()
  for (const s of shots) {
    const arr = shotsBy.get(s.competitor_id) ?? []
    arr.push(s)
    shotsBy.set(s.competitor_id, arr)
  }
  const descsBy = new Map<string, CompetitorDescription[]>()
  for (const d of descriptions) {
    const arr = descsBy.get(d.competitor_id) ?? []
    arr.push(d)
    descsBy.set(d.competitor_id, arr)
  }

  const build = (c: Competitor): CompetitorWithHistory<S> => {
    const rows = (snapsBy.get(c.id) ?? [])
      .slice()
      .sort((a, b) => a.captured_on.localeCompare(b.captured_on))
    const history: HistoryPoint[] = rows.map((r) => ({
      captured_on: r.captured_on, followers: r.followers, likes: r.likes, videos: r.videos,
    }))
    const latest = rows.length ? rows[rows.length - 1] : null
    const weekly = bucketFollowersByWeek(rows.map((r) => ({ captured_on: r.captured_on, followers: r.followers })))
    const shotRows = (shotsBy.get(c.id) ?? []).slice().sort(compareShotsForBoard)
    return {
      ...c, latest, history, weekly, shots: shotRows, related: [],
      sessionStarts: shotMeta.sessionStartsBy.get(c.id) ?? [],
      descriptions: sortDescriptions(descsBy.get(c.id) ?? []),
    }
  }

  const built = new Map<string, CompetitorWithHistory<S>>()
  for (const c of competitors) built.set(c.id, build(c))

  const topLevel: CompetitorWithHistory<S>[] = []
  for (const c of competitors) {
    const node = built.get(c.id)!
    const parent = c.parent_id ? built.get(c.parent_id) : undefined
    if (parent) parent.related.push(node) // 子账号挂到父的 related
    else topLevel.push(node)               // parent_id 为空或悬空 → 顶层
  }

  return { canEdit, competitors: topLevel, shotAxis: shotMeta.shotAxis, shotsLoadedFrom: shotMeta.shotsLoadedFrom }
}
```

- [ ] **Step 10: 补齐测试夹具和兜底看板，让 tsc 通过**

- `src/lib/competitors/shotGrid.test.ts`：`competitor()` 返回的对象里，在 `shots,` 下一行加 `sessionStarts: [],`。
- `src/lib/competitors/ask-context.test.ts` 和 `src/lib/competitors/ask-prompt.test.ts`：`comp()` 返回的对象里，在 `shots: over.shots ?? [],` 下一行加 `sessionStarts: over.sessionStarts ?? [],`；`board()` 改成 `return { competitors, canEdit: true, shotAxis: [], shotsLoadedFrom: null }`。
- `src/lib/competitors/ask-service.test.ts`：`const EMPTY_BOARD: CompetitorBoard = { competitors: [], canEdit: true, shotAxis: [], shotsLoadedFrom: null }`。
- `src/app/[locale]/(app)/competitors/page.tsx`：`const board: CompetitorBoard = boardRes.data ?? { competitors: [], canEdit: false, shotAxis: [], shotsLoadedFrom: null }`。

Run: `npx tsc --noEmit`
Expected: 0 errors。如果还有地方在构造 `CompetitorBoard` 或 `CompetitorWithHistory`，按报错位置用同样的方式补字段，不要用 `as` 绕过。

- [ ] **Step 11: 跑测试确认通过**

Run: `node --test --experimental-strip-types src/lib/competitors/shotWindow.test.ts src/lib/competitors/shotGrid.test.ts src/lib/competitors/assemble.test.ts src/lib/competitors/ask-context.test.ts src/lib/competitors/ask-prompt.test.ts src/lib/competitors/ask-service.test.ts`
Expected: 全部 PASS。原来那条「截图按 shot_on 倒序（空值垫底）+ sort_order」也还要是绿的。

- [ ] **Step 12: 登记新测试并提交**

在 `package.json` 的 `"test"` 行末尾（`src/lib/competitors/board-pagination.test.ts` 之后）追加 ` src/lib/competitors/shotWindow.test.ts`。

Run: `npm test 2>&1 | tail -5`
Expected: `fail 0`

```bash
git branch --show-current
git add src/lib/competitors/shotWindow.ts src/lib/competitors/shotWindow.test.ts src/lib/competitors/types.ts src/lib/competitors/shotGrid.ts src/lib/competitors/shotGrid.test.ts src/lib/competitors/assemble.ts src/lib/competitors/assemble.test.ts src/lib/competitors/ask-context.test.ts src/lib/competitors/ask-prompt.test.ts src/lib/competitors/ask-service.test.ts "src/app/[locale]/(app)/competitors/page.tsx" package.json
git commit -m "feat(competitors): 看板带完整日期轴、全量开播时刻与已加载范围

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: 开播时段与地区标尺改读全量开播时刻

**Files:**
- Modify: `src/lib/competitors/regionRuler.ts`（`RulerInput`，以及 `buildRegionRuler` 里取 `starts` 的那几行，文件头注释）
- Modify: `src/lib/competitors/regionRuler.test.ts`
- Modify: `src/components/competitors/CompetitorCard.tsx:71-83`
- Create: `src/components/competitors/album-windowing-wiring.test.ts`
- Modify: `package.json`（`test` 行末尾追加 `src/components/competitors/album-windowing-wiring.test.ts`）

**Interfaces:**
- Consumes: Task 1 的 `CompetitorWithHistory.sessionStarts: string[]`
- Produces: `RulerInput.sessionStarts?: string[]`（替换掉原来的 `shots?`）

- [ ] **Step 1: 迁移标尺测试（会先失败）**

在 `src/lib/competitors/regionRuler.test.ts` 里依次改：

1. `acc()` 的默认值改成 `return { region: 'JP', sessionStarts: [], ...over }`。
2. 把辅助函数 `shots(...isos)` 整段换成：
   ```ts
   function starts(...isos: string[]): string[] {
     return isos
   }
   ```
3. 全文把 `shots: shots(` 替换成 `sessionStarts: starts(`：
   ```bash
   sed -i '' 's/shots: shots(/sessionStarts: starts(/g' src/lib/competitors/regionRuler.test.ts
   ```
4. 把测试「没有任何开播时刻时返回空图而不是崩」里的 `shots: [{ stream_started_at: null }]` 改成 `sessionStarts: []`。
5. 在文件末尾追加：
   ```ts
   test('读不出的开播时刻跳过，不影响同账号其它场次', () => {
     const r = buildRegionRuler({
       competitors: [acc({ id: 'a', handle: 'a', sessionStarts: ['not-a-date', jst(18, 13, 0)] })],
       region: 'JP',
       timeZone: TZ,
       now: NOW,
     })
     assert.equal(r.sessions, 1)
   })
   ```

Run: `grep -c "shots" src/lib/competitors/regionRuler.test.ts`
Expected: `0`

Run: `node --test --experimental-strip-types src/lib/competitors/regionRuler.test.ts`
Expected: FAIL。实现还在读 `c.shots`，所以每个账号都没有场次。

- [ ] **Step 2: 改标尺实现**

`src/lib/competitors/regionRuler.ts`：

- 文件头注释里，「证据只有一种：competitor_shots.stream_started_at（直播间自报的开播时刻）。」这一句后面补一句：「经看板的 sessionStarts 下发：全部历史、已去重，跟相册加载到哪一天无关。」
- 在 `RulerInput` 里，用下面这段替换 `shots?: { stream_started_at?: string | null }[]`：
  ```ts
  /** 全部历史里去重后的开播时刻（ISO），即 CompetitorWithHistory.sessionStarts；14 天窗口在这里过滤。 */
  sessionStarts?: string[]
  ```
- 在 `buildRegionRuler` 里，用下面这段替换 `const starts = (c.shots ?? [])...` 整个表达式：
  ```ts
  const starts = (c.sessionStarts ?? []).filter((iso) => {
    const t = Date.parse(iso)
    return !Number.isNaN(t) && t >= cutoff && t <= nowMs
  })
  ```

Run: `node --test --experimental-strip-types src/lib/competitors/regionRuler.test.ts`
Expected: PASS

- [ ] **Step 3: 写卡片接线的失败断言**

新建 `src/components/competitors/album-windowing-wiring.test.ts`：

```ts
// src/components/competitors/album-windowing-wiring.test.ts
// 源码断言：竞品相册「按日期窗口加载」在组件层的接线。
// 本仓没有 DOM 测试环境，判据都在 src/lib/competitors/shotWindow.ts 里单测；
// 这里只钉「组件真的在用它们」——接线一旦被改回旧写法，别的测试一个都不会红。
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const read = (f: string) => readFileSync(new URL(f, import.meta.url), 'utf8')
const CARD = read('./CompetitorCard.tsx')

test('卡片开播时段读全量 sessionStarts，不读已加载截图（否则数字会跟着相册翻页变）', () => {
  assert.match(CARD, /summarizeLiveHabit\(c\.sessionStarts,/)
  assert.match(CARD, /recentSessionStarts\(c\.sessionStarts,/)
  assert.doesNotMatch(CARD, /c\.shots\.map\(\(s\) => s\.stream_started_at\)/)
})
```

Run: `node --test --experimental-strip-types src/components/competitors/album-windowing-wiring.test.ts`
Expected: FAIL

- [ ] **Step 4: 改卡片**

`src/components/competitors/CompetitorCard.tsx` 第 71-83 行，把 `habit` 和 `recentSessions` 两个 `useMemo` 换成：

```tsx
  // 开播档按界面语言的时区聚类："一天里的第几分钟"这个概念本身依赖时区。
  // 读全量 sessionStarts 而不是 c.shots：后者只是相册已加载的那一段，会随翻页变。
  const locale = useLocale()
  const habit = useMemo(
    () => summarizeLiveHabit(c.sessionStarts, timeZoneForLocale(locale)),
    [c.sessionStarts, locale],
  )
  const slotLabels = habit.slots.map((s) => s.label).join(' / ')
  // 未达 3 场门槛就只报最近一场,不把单次开播说成规律。
  const recentSessions = useMemo(
    () => recentSessionStarts(c.sessionStarts, RECENT_SESSIONS)
      .map((iso) => formatDayTimeInLocaleZone(iso, locale))
      .filter((label): label is string => label != null),
    [c.sessionStarts, locale],
  )
```

（原有的 `const locale = useLocale()` 和那行注释已经包含在上面这段里，不要重复声明。）

Run: `node --test --experimental-strip-types src/components/competitors/album-windowing-wiring.test.ts src/lib/competitors/regionRuler.test.ts && npx tsc --noEmit`
Expected: PASS，tsc 0 errors。

- [ ] **Step 5: 登记并提交**

在 `package.json` 的 `"test"` 行末尾追加 ` src/components/competitors/album-windowing-wiring.test.ts`。

Run: `npm test 2>&1 | tail -5`
Expected: `fail 0`

```bash
git branch --show-current
git add src/lib/competitors/regionRuler.ts src/lib/competitors/regionRuler.test.ts src/components/competitors/CompetitorCard.tsx src/components/competitors/album-windowing-wiring.test.ts package.json
git commit -m "refactor(competitors): 开播时段与地区标尺改读全量开播时刻，与相册加载范围脱钩

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: 加载起点、查询过滤串与接口参数

**Files:**
- Modify: `src/lib/competitors/shotWindow.ts`（追加）
- Test: `src/lib/competitors/shotWindow.test.ts`（追加）

**Interfaces:**
- Consumes: `isValidShotDate`、`UNDATED_KEY`（来自 `shotGrid.ts`）
- Produces（全部从 `shotWindow.ts` 导出）：
  - `SHOT_CHUNK_DAYS = 10`
  - `initialLoadedFrom(axis: string[]): string | null`
  - `resolveLoadedFrom(axis: string[], since: string | null): string | null`
  - `loadedRangeOrFilter(loadedFrom: string | null): string`
  - `parseSinceQuery(raw: string | null): { ok: true; since: string | null } | { ok: false }`
  - `ShotRange = { from: string; before: string }`
  - `parseShotRangeQuery(from: string | null, before: string | null): ({ ok: true } & ShotRange) | { ok: false }`
  - `boardRefreshPath(loadedFrom: string | null): string`
  - `shotRangePath(range: ShotRange): string`

- [ ] **Step 1: 写失败测试**

先把 `shotWindow.test.ts` 顶部的 import 换成：

```ts
import {
  SHOT_CHUNK_DAYS, boardRefreshPath, buildShotIndex, initialLoadedFrom, loadedRangeOrFilter,
  parseShotRangeQuery, parseSinceQuery, resolveLoadedFrom, shotRangePath,
} from './shotWindow.ts'
```

再在文件末尾追加：

```ts
/** 2026-08-01 起连续 n 天的日期轴。 */
function axisOf(n: number): string[] {
  return Array.from({ length: n }, (_, i) => `2026-08-${String(i + 1).padStart(2, '0')}`)
}

test('SHOT_CHUNK_DAYS: 一段 10 个有图日（两屏）', () => {
  assert.equal(SHOT_CHUNK_DAYS, 10)
})

test('initialLoadedFrom: 有图日不超过一段时全取（null）', () => {
  assert.equal(initialLoadedFrom([]), null)
  assert.equal(initialLoadedFrom(axisOf(10)), null)
})

test('initialLoadedFrom: 超过一段时取倒数第 10 个有图日', () => {
  assert.equal(initialLoadedFrom(axisOf(11)), '2026-08-02')
  assert.equal(initialLoadedFrom(axisOf(25)), '2026-08-16')
})

test('initialLoadedFrom: 轴尾的 UNDATED_KEY 不算一天', () => {
  assert.equal(initialLoadedFrom([...axisOf(10), UNDATED_KEY]), null)
  assert.equal(initialLoadedFrom([...axisOf(11), UNDATED_KEY]), '2026-08-02')
})

test('resolveLoadedFrom: 不带 since 就是首屏默认起点', () => {
  assert.equal(resolveLoadedFrom(axisOf(25), null), '2026-08-16')
})

test('resolveLoadedFrom: since 更早时用 since（刷新保住已翻到的范围）', () => {
  assert.equal(resolveLoadedFrom(axisOf(25), '2026-08-05'), '2026-08-05')
})

test('resolveLoadedFrom: since 比默认起点还晚时仍至少盖住默认两屏', () => {
  assert.equal(resolveLoadedFrom(axisOf(25), '2026-08-20'), '2026-08-16')
})

test('resolveLoadedFrom: 起点早于或等于轴首时归一成 null（全部）', () => {
  assert.equal(resolveLoadedFrom(axisOf(25), '2026-08-01'), null)
  assert.equal(resolveLoadedFrom(axisOf(25), '2026-07-01'), null)
})

test('resolveLoadedFrom: 轴不足一段时不管 since 都是 null', () => {
  assert.equal(resolveLoadedFrom(axisOf(8), '2026-08-05'), null)
})

test('loadedRangeOrFilter: 已加载 = 不早于起点或无日期', () => {
  assert.equal(loadedRangeOrFilter('2026-08-16'), 'shot_on.gte.2026-08-16,shot_on.is.null')
})

test('loadedRangeOrFilter: null（全部）给恒真式', () => {
  assert.equal(loadedRangeOrFilter(null), 'shot_on.is.null,shot_on.not.is.null')
})

test('parseSinceQuery: 缺省为 null，合法日期原样返回', () => {
  assert.deepEqual(parseSinceQuery(null), { ok: true, since: null })
  assert.deepEqual(parseSinceQuery('2026-08-16'), { ok: true, since: '2026-08-16' })
})

test('parseSinceQuery: 空串、假日期、带注入的串一律拒绝', () => {
  assert.deepEqual(parseSinceQuery(''), { ok: false })
  assert.deepEqual(parseSinceQuery('2026-02-30'), { ok: false })
  assert.deepEqual(parseSinceQuery('2026-08-16,id.gt.0'), { ok: false })
})

test('parseShotRangeQuery: 合法区间', () => {
  assert.deepEqual(parseShotRangeQuery('2026-08-01', '2026-08-16'), { ok: true, from: '2026-08-01', before: '2026-08-16' })
})

test('parseShotRangeQuery: 缺参数、假日期、空区间、倒置区间一律拒绝', () => {
  assert.deepEqual(parseShotRangeQuery(null, '2026-08-16'), { ok: false })
  assert.deepEqual(parseShotRangeQuery('2026-08-01', null), { ok: false })
  assert.deepEqual(parseShotRangeQuery('2026-02-30', '2026-08-16'), { ok: false })
  assert.deepEqual(parseShotRangeQuery('2026-08-01', '2026-04-31'), { ok: false })
  assert.deepEqual(parseShotRangeQuery('2026-08-16', '2026-08-16'), { ok: false })
  assert.deepEqual(parseShotRangeQuery('2026-08-17', '2026-08-16'), { ok: false })
})

test('boardRefreshPath / shotRangePath', () => {
  assert.equal(boardRefreshPath(null), '/api/competitors')
  assert.equal(boardRefreshPath('2026-08-16'), '/api/competitors?since=2026-08-16')
  assert.equal(shotRangePath({ from: '2026-08-01', before: '2026-08-16' }), '/api/competitors/shots?from=2026-08-01&before=2026-08-16')
})
```

Run: `node --test --experimental-strip-types src/lib/competitors/shotWindow.test.ts`
Expected: FAIL，报导出成员不存在。

- [ ] **Step 2: 实现**

把 `shotWindow.ts` 的 shotGrid 导入改成：

```ts
import { UNDATED_KEY, isValidShotDate } from './shotGrid.ts'
```

然后在文件末尾追加：

```ts
/** 首屏与每次补取的段长：有图日的个数，正好两屏（SHOT_WINDOW_SIZE = 5）。 */
export const SHOT_CHUNK_DAYS = 10

function datedOf(axis: string[]): string[] {
  return axis.filter((d) => d !== UNDATED_KEY)
}

/**
 * 首屏加载起点：倒数第 SHOT_CHUNK_DAYS 个有图日。不超过这么多天就全取（null）。
 * 按「有图日」而不是日历日数：轴上有空档（整周没采集），按日历天切会凑不满一屏。
 */
export function initialLoadedFrom(axis: string[]): string | null {
  const dated = datedOf(axis)
  if (dated.length <= SHOT_CHUNK_DAYS) return null
  return dated[dated.length - SHOT_CHUNK_DAYS]
}

/**
 * 实际加载起点：首屏默认起点与调用方给的 since 取较早者——改完数据刷新时保住用户已翻到的范围，
 * 同时永远至少盖住默认那两屏（轴在两次请求之间变长时，旧 since 可能比新默认起点还晚）。
 * 早于或等于轴上第一天时归一成 null（= 全部）。
 */
export function resolveLoadedFrom(axis: string[], since: string | null): string | null {
  const initial = initialLoadedFrom(axis)
  if (initial === null) return null
  const from = since !== null && since < initial ? since : initial
  return from <= datedOf(axis)[0] ? null : from
}

/**
 * 截图本体查询的 PostgREST or() 过滤串：已加载 = shot_on >= loadedFrom 或无日期。
 * null（全部）也给一个恒真式而不是省掉 .or()——查询链保持同一个形状，源码断言才钉得住。
 * 入参必须先过 isValidShotDate：这串会原样拼进查询。
 */
export function loadedRangeOrFilter(loadedFrom: string | null): string {
  return loadedFrom === null
    ? 'shot_on.is.null,shot_on.not.is.null'
    : `shot_on.gte.${loadedFrom},shot_on.is.null`
}

/** GET /api/competitors 的 since：缺省为 null；给了就必须是真实存在的 YYYY-MM-DD。 */
export function parseSinceQuery(raw: string | null): { ok: true; since: string | null } | { ok: false } {
  if (raw === null) return { ok: true, since: null }
  return isValidShotDate(raw) ? { ok: true, since: raw } : { ok: false }
}

/** 一段日期 [from, before)。 */
export interface ShotRange {
  from: string
  before: string
}

/**
 * GET /api/competitors/shots 的 from / before：都必须是真实日期，且 from < before。
 * 先挡 null：isValidShotDate 对 null 放行（那是给"清空日期"留的口子），这里不能放。
 */
export function parseShotRangeQuery(
  from: string | null,
  before: string | null,
): ({ ok: true } & ShotRange) | { ok: false } {
  if (from === null || before === null) return { ok: false }
  if (!isValidShotDate(from) || !isValidShotDate(before)) return { ok: false }
  if (!(from < before)) return { ok: false }
  return { ok: true, from, before }
}

/** 改完数据后刷新看板的请求路径：带上已加载起点，翻到历史后刷新不会被缩回首屏范围。 */
export function boardRefreshPath(loadedFrom: string | null): string {
  return loadedFrom === null ? '/api/competitors' : `/api/competitors?since=${loadedFrom}`
}

/** 补取一段截图的请求路径。 */
export function shotRangePath(range: ShotRange): string {
  return `/api/competitors/shots?from=${range.from}&before=${range.before}`
}
```

- [ ] **Step 3: 跑测试确认通过**

Run: `node --test --experimental-strip-types src/lib/competitors/shotWindow.test.ts && npx tsc --noEmit`
Expected: PASS，tsc 0 errors。

- [ ] **Step 4: 提交**

```bash
git branch --show-current
git add src/lib/competitors/shotWindow.ts src/lib/competitors/shotWindow.test.ts
git commit -m "feat(competitors): 截图加载起点、查询过滤串与接口参数校验

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: 翻页判据——是否已加载、下一段补哪里、怎么合并

**Files:**
- Modify: `src/lib/competitors/shotWindow.ts`（追加）
- Test: `src/lib/competitors/shotWindow.test.ts`（追加）

**Interfaces:**
- Consumes: Task 1 的 `CompetitorBoard<S>`、`CompetitorWithHistory<S>`、`BoardShot`、`compareShotsForBoard`；Task 3 的 `ShotRange`、`SHOT_CHUNK_DAYS`；`shotGrid.ts` 的 `SHOT_WINDOW_SIZE`
- Produces:
  - `isShotDateLoaded(date: string | null, loadedFrom: string | null): boolean`
  - `nextChunk(axis: string[], dateWindow: string[], loadedFrom: string | null): ShotRange | null`
  - `mergeShotRange<S extends BoardShot>(board: CompetitorBoard<S>, rows: S[], range: ShotRange): CompetitorBoard<S>`

- [ ] **Step 1: 写失败测试**

`shotWindow.test.ts` 的 import 里再加上 `isShotDateLoaded, mergeShotRange, nextChunk`，并追加 `import type { CompetitorBoard, CompetitorShot, CompetitorWithHistory } from './types.ts'`。然后在文件末尾追加：

```ts
test('isShotDateLoaded: 全部已加载、轴为空、无日期列一律算已加载', () => {
  assert.equal(isShotDateLoaded('2026-08-01', null), true)
  assert.equal(isShotDateLoaded(null, '2026-08-16'), true)
  assert.equal(isShotDateLoaded(UNDATED_KEY, '2026-08-16'), true)
})

test('isShotDateLoaded: 不早于起点才算已加载', () => {
  assert.equal(isShotDateLoaded('2026-08-16', '2026-08-16'), true)
  assert.equal(isShotDateLoaded('2026-08-20', '2026-08-16'), true)
  assert.equal(isShotDateLoaded('2026-08-15', '2026-08-16'), false)
})

// 轴 08-01…08-25；首屏起点 08-16（下标 15）
const AXIS = axisOf(25)
const win = (firstDay: number) => AXIS.slice(firstDay - 1, firstDay + 4)

test('nextChunk: 全部已加载时不补', () => {
  assert.equal(nextChunk(AXIS, win(1), null), null)
})

test('nextChunk: 当前屏之前还剩整整一屏缓冲时不补', () => {
  // 首屏看 08-21..08-25，起点 08-16：前面正好 5 天缓冲
  assert.equal(nextChunk(AXIS, win(21), '2026-08-16'), null)
})

test('nextChunk: 缓冲不足一屏就补起点之前 10 个有图日', () => {
  // 点一次「更早」→ 看 08-16..08-20，缓冲 0
  assert.deepEqual(nextChunk(AXIS, win(16), '2026-08-16'), { from: '2026-08-06', before: '2026-08-16' })
})

test('nextChunk: 补到轴首为止', () => {
  assert.deepEqual(nextChunk(AXIS, win(6), '2026-08-06'), { from: '2026-08-01', before: '2026-08-06' })
})

test('nextChunk: 窗口一次跳很远时，补的这一段盖住整屏再往前一屏', () => {
  // 窗口 08-03..08-07 整屏落在未加载区，起点还在 08-16
  assert.deepEqual(nextChunk(AXIS, win(3), '2026-08-16'), { from: '2026-08-01', before: '2026-08-16' })
  const axis40 = Array.from({ length: 40 }, (_, i) => new Date(Date.UTC(2026, 6, 1 + i)).toISOString().slice(0, 10))
  // 起点 08-05（下标 35），窗口从 07-11（下标 10）开始：from 取 10-5=5 → 07-06
  assert.deepEqual(nextChunk(axis40, axis40.slice(10, 15), '2026-08-05'), { from: '2026-07-06', before: '2026-08-05' })
})

test('nextChunk: 起点那天的图被删光、已不在轴上时按轴上下一个日期定位', () => {
  const axis = AXIS.filter((d) => d !== '2026-08-16')
  // 起点 08-16 不在轴上 → 定位到 08-17（新下标 15），窗口 08-17..08-21 缓冲 0
  assert.deepEqual(nextChunk(axis, ['2026-08-17', '2026-08-18', '2026-08-19', '2026-08-20', '2026-08-21'], '2026-08-16'),
    { from: '2026-08-06', before: '2026-08-16' })
})

test('nextChunk: 轴上已经没有比起点更早的日期时不补', () => {
  const axis = AXIS.slice(15) // 08-16 之前的日期全被删光
  assert.equal(nextChunk(axis, axis.slice(0, 5), '2026-08-16'), null)
})

test('nextChunk: 窗口里只有无日期列时不补', () => {
  assert.equal(nextChunk([...AXIS, UNDATED_KEY], [UNDATED_KEY], '2026-08-16'), null)
})

function shotRow(id: string, competitor_id: string, shot_on: string | null, sort_order = 0): CompetitorShot {
  return {
    id, competitor_id, image_url: `https://example.test/${id}.png`, shot_on, tag: null, caption: '',
    sort_order, created_at: '2026-08-01T00:00:00Z', viewer_count: null, stream_started_at: null, captured_at: null,
  }
}

function node(id: string, shots: CompetitorShot[], related: CompetitorWithHistory[] = []): CompetitorWithHistory {
  return {
    id, platform: 'tiktok', handle: id, profile_url: '', display_name: null, note: '',
    created_at: '2026-08-01T00:00:00Z', parent_id: null, avatar_url: null, region: 'JP',
    member_count: null, composition: null, launch_city: null, launched_on: null, mc_note: null,
    online_note: null, latest_videos: null, latest: null, history: [], shots, sessionStarts: [],
    weekly: [], related, descriptions: [],
  }
}

function boardOf(competitors: CompetitorWithHistory[], shotsLoadedFrom: string | null): CompetitorBoard {
  return { competitors, canEdit: true, shotAxis: AXIS, shotsLoadedFrom }
}

test('mergeShotRange: 按账号（含子主播）并入，排序与首屏一致，起点推进', () => {
  const board = boardOf([
    node('p', [shotRow('p20', 'p', '2026-08-20')], [node('k', [])]),
  ], '2026-08-16')
  const next = mergeShotRange(board, [
    shotRow('p10', 'p', '2026-08-10'), shotRow('k12', 'k', '2026-08-12'), shotRow('p12', 'p', '2026-08-12'),
  ], { from: '2026-08-06', before: '2026-08-16' })
  assert.equal(next.shotsLoadedFrom, '2026-08-06')
  assert.deepEqual(next.competitors[0].shots.map((s) => s.id), ['p20', 'p12', 'p10'])
  assert.deepEqual(next.competitors[0].related[0].shots.map((s) => s.id), ['k12'])
})

test('mergeShotRange: 补到轴首时起点归一成 null', () => {
  const next = mergeShotRange(boardOf([node('p', [])], '2026-08-06'), [], { from: '2026-08-01', before: '2026-08-06' })
  assert.equal(next.shotsLoadedFrom, null)
})

test('mergeShotRange: 过期结果（起点已不是这段的右端）原样返回', () => {
  const board = boardOf([node('p', [])], '2026-08-11')
  const next = mergeShotRange(board, [shotRow('p10', 'p', '2026-08-10')], { from: '2026-08-06', before: '2026-08-16' })
  assert.equal(next, board)
})

test('mergeShotRange: 区间外的行与找不到账号的行丢弃', () => {
  const next = mergeShotRange(boardOf([node('p', [])], '2026-08-16'), [
    shotRow('in', 'p', '2026-08-10'),
    shotRow('late', 'p', '2026-08-16'),   // 已加载范围里的，接口不该给；给了也不能重复
    shotRow('early', 'p', '2026-08-05'),
    shotRow('undated', 'p', null),        // 无日期截图首屏已全量带上
    shotRow('ghost', 'deleted', '2026-08-10'),
  ], { from: '2026-08-06', before: '2026-08-16' })
  assert.deepEqual(next.competitors[0].shots.map((s) => s.id), ['in'])
})

test('mergeShotRange: 区间内已有的旧行被新行替换，不重复', () => {
  const board = boardOf([node('p', [shotRow('p10', 'p', '2026-08-10')])], '2026-08-16')
  const next = mergeShotRange(board, [{ ...shotRow('p10', 'p', '2026-08-10'), caption: 'new' }],
    { from: '2026-08-06', before: '2026-08-16' })
  assert.deepEqual(next.competitors[0].shots.map((s) => [s.id, s.caption]), [['p10', 'new']])
})

test('mergeShotRange: 不修改入参看板', () => {
  const board = boardOf([node('p', [shotRow('p20', 'p', '2026-08-20')])], '2026-08-16')
  mergeShotRange(board, [shotRow('p10', 'p', '2026-08-10')], { from: '2026-08-06', before: '2026-08-16' })
  assert.equal(board.shotsLoadedFrom, '2026-08-16')
  assert.deepEqual(board.competitors[0].shots.map((s) => s.id), ['p20'])
})
```

Run: `node --test --experimental-strip-types src/lib/competitors/shotWindow.test.ts`
Expected: FAIL，报导出成员不存在。

- [ ] **Step 2: 实现**

`shotWindow.ts` 顶部的导入改成：

```ts
import { SHOT_WINDOW_SIZE, UNDATED_KEY, compareShotsForBoard, isValidShotDate } from './shotGrid.ts'
import type { BoardShot, CompetitorBoard, CompetitorShot, CompetitorWithHistory } from './types.ts'
```

然后在文件末尾追加：

```ts
/**
 * 这一天的截图在不在已加载范围里。全部已加载（null）、轴为空（date 为 null）、无日期列一律算已加载：
 * 无日期截图首屏就全量带上，轴为空时本来就没有可显示的格子。
 */
export function isShotDateLoaded(date: string | null, loadedFrom: string | null): boolean {
  if (loadedFrom === null || date === null || date === UNDATED_KEY) return true
  return date >= loadedFrom
}

/** 第一个不早于 date 的有图日下标；全都早于它时返回 dated.length。 */
function lowerBound(dated: string[], date: string): number {
  let i = 0
  while (i < dated.length && dated[i] < date) i += 1
  return i
}

/**
 * 下一段该补哪里。当前屏第一天往前、已加载的有图日不足一屏时，补 [from, loadedFrom)：
 * from 取「起点再往前 SHOT_CHUNK_DAYS 天」与「当前屏再往前一屏」中较早的那个（夹到轴首），
 * 这样即使窗口一次跳很远，这一段也能把整屏盖住，不会补一小段又卡住。
 * 起点不在轴上（那天的图刚被删光）时按轴上第一个不早于它的日期定位。
 */
export function nextChunk(axis: string[], dateWindow: string[], loadedFrom: string | null): ShotRange | null {
  if (loadedFrom === null) return null
  const firstVisible = dateWindow.find((d) => d !== UNDATED_KEY)
  if (!firstVisible) return null
  const dated = datedOf(axis)
  const loadedIdx = lowerBound(dated, loadedFrom)
  if (loadedIdx === 0) return null // 轴上没有比起点更早的日期了
  const visibleIdx = lowerBound(dated, firstVisible)
  if (visibleIdx - loadedIdx >= SHOT_WINDOW_SIZE) return null
  const fromIdx = Math.max(0, Math.min(loadedIdx - SHOT_CHUNK_DAYS, visibleIdx - SHOT_WINDOW_SIZE))
  return { from: dated[fromIdx], before: loadedFrom }
}

/**
 * 把补取到的一段 [from, before) 并进看板。前提是看板的起点仍是这段的右端（before）——
 * 不是就说明请求飞行期间看板被刷新换掉了，结果已过期，原样返回，由调用方按新状态重判。
 * 只收落在区间里的行；先去掉各账号区间内已有的行再并入，所以重复合并不会出重复。
 * 找不到归属账号的行（账号刚被删）丢弃。
 */
export function mergeShotRange<S extends BoardShot>(
  board: CompetitorBoard<S>,
  rows: S[],
  range: ShotRange,
): CompetitorBoard<S> {
  if (board.shotsLoadedFrom !== range.before) return board
  const inRange = (s: S) => s.shot_on != null && s.shot_on >= range.from && s.shot_on < range.before
  const byComp = new Map<string, S[]>()
  for (const r of rows ?? []) {
    if (!inRange(r)) continue
    const arr = byComp.get(r.competitor_id) ?? []
    arr.push(r)
    byComp.set(r.competitor_id, arr)
  }
  const walk = (list: CompetitorWithHistory<S>[]): CompetitorWithHistory<S>[] =>
    list.map((c) => ({
      ...c,
      shots: [...c.shots.filter((s) => !inRange(s)), ...(byComp.get(c.id) ?? [])].sort(compareShotsForBoard),
      related: walk(c.related),
    }))
  const dated = datedOf(board.shotAxis)
  return {
    ...board,
    competitors: walk(board.competitors),
    shotsLoadedFrom: dated.length === 0 || range.from <= dated[0] ? null : range.from,
  }
}
```

（如果 `CompetitorShot` 在本文件里已经不再被用到，就从 type import 里删掉，避免 lint 报未使用。）

- [ ] **Step 3: 跑测试确认通过**

Run: `node --test --experimental-strip-types src/lib/competitors/shotWindow.test.ts && npx tsc --noEmit`
Expected: PASS，tsc 0 errors。

- [ ] **Step 4: 提交**

```bash
git branch --show-current
git add src/lib/competitors/shotWindow.ts src/lib/competitors/shotWindow.test.ts
git commit -m "feat(competitors): 截图翻页判据——是否已加载、下一段补哪里、过期结果丢弃的合并

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: 问答面板独立取数（全量历史、只取所需列）

**Files:**
- Modify: `src/lib/competitors/service.ts`（新增 `ASK_SHOT_COLUMNS`、`getAskBoard`）
- Modify: `src/lib/competitors/ask-context.ts`（类型放宽，逻辑一行不改）
- Modify: `src/lib/competitors/ask-service.ts`（改走 `getAskBoard`）
- Modify: `src/lib/competitors/board-pagination.test.ts`
- Create: `src/lib/competitors/shot-window-wiring.test.ts`
- Modify: `package.json`（`test` 行末尾追加 `src/lib/competitors/shot-window-wiring.test.ts`）

**Interfaces:**
- Consumes: Task 1 的 `AskShot`、`CompetitorBoard<S>`、`assembleBoard`（不传 `meta`，即视为全部已加载）
- Produces:
  - `ASK_SHOT_COLUMNS: string`（导出，值为 `'competitor_id, shot_on, sort_order, stream_started_at, viewer_count, captured_at'`）
  - `getAskBoard(_userId: string): Promise<ServiceResult<CompetitorBoard<AskShot>>>`
  - `buildAskContext(board: CompetitorBoard<AskShot>, now: Date, locale: string): AskContext`
  - `shotsOf(shots: AskShot[], timeZone: string): AskShots`
  - `AskServiceDeps.board?: typeof getAskBoard`

- [ ] **Step 1: 写失败测试**

改造 `src/lib/competitors/board-pagination.test.ts`：把文件里的 `for (const name of [...]) { ... }` 循环整段替换成下面这个按表驱动的版本。文件头注释和 `bodyOf` 保持不动。

```ts
// 每个看板取数函数至少有几个整表/整段加载。数少了说明有查询被删了或绕开了 fetchAllRows。
const LOADERS: [name: string, minFroms: number][] = [
  ['getCompetitorBoard', 4],
  ['getCompanyBoard', 4],
  ['getAskBoard', 3],
]

for (const [name, minFroms] of LOADERS) {
  test(`${name}：每个整表 db.from(...) 都包在 fetchAllRows 里，并带稳定排序与 range`, () => {
    const body = bodyOf(name)
    const froms = body.match(/db\.from\(/g) ?? []
    assert.ok(froms.length >= minFroms, `${name} 里应有至少 ${minFroms} 个整表加载，实际 ${froms.length}`)
    const wrapped = body.match(/fetchAllRows\(\(from, to\) => db\.from\(/g) ?? []
    assert.equal(wrapped.length, froms.length, `${name} 里有 db.from 没走 fetchAllRows，超过 1000 行会被静默截断`)
    const ranged = body.match(/\.range\(from, to\)/g) ?? []
    assert.equal(ranged.length, froms.length, `${name} 里有分页查询没带 .range(from, to)`)
    // 每段分页查询都要有 .order(：没有稳定排序，翻页会漏行或重复
    const segments = body.split('fetchAllRows((from, to) =>').slice(1)
    for (const seg of segments) {
      const q = seg.slice(0, seg.indexOf('.range(from, to)'))
      assert.match(q, /\.order\(/, `${name} 里有分页查询没带 .order(...)：${q.trim().slice(0, 60)}`)
    }
  })
}
```

新建 `src/lib/competitors/shot-window-wiring.test.ts`：

```ts
// src/lib/competitors/shot-window-wiring.test.ts
// 源码断言 + 常量断言：截图按日期窗口加载在服务端与路由层的接线。
// 判据本身在 shotWindow.test.ts 单测；这里钉「服务端真的在用它们」。
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import { ASK_SHOT_COLUMNS } from './service.ts'

const SERVICE = readFileSync(new URL('./service.ts', import.meta.url), 'utf8')
const ASK_SERVICE = readFileSync(new URL('./ask-service.ts', import.meta.url), 'utf8')

function bodyOf(src: string, name: string): string {
  const start = src.indexOf(`export async function ${name}(`)
  assert.ok(start >= 0, `找不到 ${name}`)
  const next = src.indexOf('\nexport ', start + 1)
  return src.slice(start, next < 0 ? undefined : next)
}

test('问答截图列：正好是 ask-context 读到的那几列', () => {
  assert.deepEqual(
    ASK_SHOT_COLUMNS.split(',').map((s) => s.trim()),
    ['competitor_id', 'shot_on', 'sort_order', 'stream_started_at', 'viewer_count', 'captured_at'],
  )
})

test('getAskBoard：截图只查问答列，不 select(*)，不按窗口截断', () => {
  const body = bodyOf(SERVICE, 'getAskBoard')
  assert.match(body, /db\.from\('competitor_shots'\)\.select\(ASK_SHOT_COLUMNS\)/)
  assert.doesNotMatch(body, /competitor_shots'\)\.select\('\*'\)/)
  assert.doesNotMatch(body, /\.or\(|\.gte\(|\.lt\(/)
})

test('问答服务改走 getAskBoard（全量历史），不再用相册窗口化的 getCompetitorBoard', () => {
  assert.match(ASK_SERVICE, /import \{ getAskBoard \} from '\.\/service\.ts'/)
  assert.doesNotMatch(ASK_SERVICE, /getCompetitorBoard/)
})
```

Run: `node --test --experimental-strip-types src/lib/competitors/board-pagination.test.ts src/lib/competitors/shot-window-wiring.test.ts`
Expected: FAIL（找不到 `getAskBoard`；`ASK_SHOT_COLUMNS` 是 `undefined`）。

- [ ] **Step 2: 实现 `getAskBoard`**

`src/lib/competitors/service.ts`：在 type import 里加上 `AskShot`、`CompetitorBoard`（`CompetitorBoard` 原来就有）。然后在 `getCompanyBoard` 之前加：

```ts
/**
 * 竞品问答要的截图列。ask-context.ts 新读一个截图字段时，同时加到这里和 types.ts 的 AskShot，
 * 否则那一列在问答里恒为 undefined——shot-window-wiring.test.ts 钉着这份清单。
 */
export const ASK_SHOT_COLUMNS = 'competitor_id, shot_on, sort_order, stream_started_at, viewer_count, captured_at'

/**
 * 竞品问答的数据源。截图取**全部历史**——问答的采集日历、累计场次、在线峰值都是全量口径，
 * 不能跟着相册的日期窗口走；但只查问答读得到的几列，图片地址、备注这些大字段问答用不上。
 * 风格描述问答不读，不查。不传 meta：shots 就是全部截图，日期轴与开播时刻由 assembleBoard 现算。
 */
export async function getAskBoard(_userId: string): Promise<ServiceResult<CompetitorBoard<AskShot>>> {
  const db = createServerClient()
  const [compRes, snapRes, shotRes] = await Promise.all([
    fetchAllRows((from, to) => db.from('competitors').select('*')
      .order('created_at', { ascending: true }).order('id', { ascending: true }).range(from, to)),
    fetchAllRows((from, to) => db.from('competitor_snapshots').select('*')
      .order('id', { ascending: true }).range(from, to)),
    fetchAllRows((from, to) => db.from('competitor_shots').select(ASK_SHOT_COLUMNS)
      .order('id', { ascending: true }).range(from, to)),
  ])
  const firstErr = compRes.error ?? snapRes.error ?? shotRes.error
  if (firstErr) return err('db_error', firstErr.message)
  return ok(assembleBoard(
    (compRes.data ?? []) as Competitor[],
    (snapRes.data ?? []) as CompetitorSnapshot[],
    (shotRes.data ?? []) as AskShot[],
    true,
  ))
}
```

（竞品表的排序必须和 `getCompetitorBoard` 一样，按 `created_at` 再按 `id`。问答数据包里账号的先后顺序就取自这里，Task 11 的对拍要求逐字节一致。）

- [ ] **Step 3: 放宽 ask-context 入参类型**

`src/lib/competitors/ask-context.ts`：

- 类型导入改成：`import type { AskShot, CompetitorBoard, CompetitorWithHistory, HistoryPoint } from './types.ts'`（去掉 `CompetitorShot`）
- `function liveHabitOf(c: CompetitorWithHistory<AskShot>, timeZone: string, now: Date): AskLiveHabit`
- `export function shotsOf(shots: AskShot[], timeZone: string): AskShots`
- `interface FlatEntry { c: CompetitorWithHistory<AskShot>; parentHandle: string | null }`
- `function flatten(list: CompetitorWithHistory<AskShot>[], parentHandle: string | null): FlatEntry[]`
- `export function buildAskContext(board: CompetitorBoard<AskShot>, now: Date, locale: string): AskContext`

`shotsOf` 上方那行注释「只收截图列表本身」后面补一句：「入参只要求问答列（AskShot），完整的 CompetitorShot 也照收。」

函数体一行都不改。

- [ ] **Step 4: 问答服务改走 `getAskBoard`**

`src/lib/competitors/ask-service.ts`：
- `import { getCompetitorBoard } from './service.ts'` → `import { getAskBoard } from './service.ts'`
- `board?: typeof getCompetitorBoard` → `board?: typeof getAskBoard`
- `const board = deps?.board ?? getCompetitorBoard` → `const board = deps?.board ?? getAskBoard`
- `console.error('[ask-service] getCompetitorBoard failed', boardRes.error)` → `console.error('[ask-service] getAskBoard failed', boardRes.error)`
- 文件头注释里的「取看板」改成「取看板（全量历史、只取问答列，见 service.ts 的 getAskBoard）」

- [ ] **Step 5: 跑测试确认通过**

Run: `node --test --experimental-strip-types src/lib/competitors/board-pagination.test.ts src/lib/competitors/shot-window-wiring.test.ts src/lib/competitors/ask-context.test.ts src/lib/competitors/ask-prompt.test.ts src/lib/competitors/ask-service.test.ts && npx tsc --noEmit`
Expected: PASS（ask-context/ask-prompt/ask-service 的原有断言一条不改），tsc 0 errors。

- [ ] **Step 6: 登记并提交**

在 `package.json` 的 `"test"` 行末尾追加 ` src/lib/competitors/shot-window-wiring.test.ts`。

Run: `npm test 2>&1 | tail -5`
Expected: `fail 0`

```bash
git branch --show-current
git add src/lib/competitors/service.ts src/lib/competitors/ask-context.ts src/lib/competitors/ask-service.ts src/lib/competitors/board-pagination.test.ts src/lib/competitors/shot-window-wiring.test.ts package.json
git commit -m "feat(competitors): 问答面板独立取数——截图全量历史、只取问答用到的列

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: 看板按日期窗口取数 + 补取接口

**Files:**
- Modify: `src/lib/competitors/service.ts`（`getCompetitorBoard` 整段，新增 `getShotsInRange`）
- Modify: `src/app/api/competitors/route.ts`（GET）
- Create: `src/app/api/competitors/shots/route.ts`
- Modify: `src/lib/competitors/board-pagination.test.ts`（`LOADERS` 表）
- Modify: `src/lib/competitors/shot-window-wiring.test.ts`（追加）

**Interfaces:**
- Consumes: Task 1 的 `buildShotIndex`、`ShotIndexRow`、`assembleBoard(..., meta)`；Task 3 的 `resolveLoadedFrom`、`loadedRangeOrFilter`、`parseSinceQuery`、`parseShotRangeQuery`
- Produces:
  - `getCompetitorBoard(_userId: string, opts?: { since?: string | null }): Promise<ServiceResult<CompetitorBoard>>`
  - `getShotsInRange(rangeFrom: string, rangeBefore: string): Promise<ServiceResult<CompetitorShot[]>>`
  - `GET /api/competitors?since=YYYY-MM-DD` → `{ data: CompetitorBoard, error: null }`，`since` 非法时返回 400
  - `GET /api/competitors/shots?from=YYYY-MM-DD&before=YYYY-MM-DD` → `{ data: CompetitorShot[], error: null }`，参数非法时返回 400

- [ ] **Step 1: 写失败的接线断言**

`board-pagination.test.ts` 的 `LOADERS` 表改成：

```ts
const LOADERS: [name: string, minFroms: number][] = [
  ['getCompetitorBoard', 5],
  ['getCompanyBoard', 4],
  ['getAskBoard', 3],
  ['getShotsInRange', 1],
]
```

`shot-window-wiring.test.ts` 末尾追加：

```ts
const BOARD_ROUTE = readFileSync(new URL('../../app/api/competitors/route.ts', import.meta.url), 'utf8')
const SHOTS_ROUTE = readFileSync(new URL('../../app/api/competitors/shots/route.ts', import.meta.url), 'utf8')

test('getCompetitorBoard：先瘦查询建全量索引，截图本体按已加载范围过滤', () => {
  const body = bodyOf(SERVICE, 'getCompetitorBoard')
  assert.match(body, /db\.from\('competitor_shots'\)\.select\('competitor_id, shot_on, stream_started_at'\)/)
  assert.match(body, /buildShotIndex\(/)
  assert.match(body, /resolveLoadedFrom\(index\.shotAxis, since\)/)
  assert.match(body, /db\.from\('competitor_shots'\)\.select\('\*'\)\s*\.or\(loadedRangeOrFilter\(loadedFrom\)\)/)
  // 全量索引与已加载起点必须一起交给 assembleBoard，否则前端拿不到完整日期轴
  assert.match(body, /shotsLoadedFrom: loadedFrom/)
})

test('getCompetitorBoard：since 进查询前自己再校验一道', () => {
  const body = bodyOf(SERVICE, 'getCompetitorBoard')
  assert.match(body, /isValidShotDate\(since\)/)
})

test('getShotsInRange：按 [from, before) 取整段，入参再校验一道', () => {
  const body = bodyOf(SERVICE, 'getShotsInRange')
  assert.match(body, /parseShotRangeQuery\(rangeFrom, rangeBefore\)/)
  assert.match(body, /\.gte\('shot_on', q\.from\)\.lt\('shot_on', q\.before\)/)
})

test('GET /api/competitors：鉴权后解析 since 再取看板', () => {
  assert.match(BOARD_ROUTE, /parseSinceQuery\(req\.nextUrl\.searchParams\.get\('since'\)\)/)
  assert.match(BOARD_ROUTE, /getCompetitorBoard\(user\.id, \{ since: q\.since \}\)/)
  assert.ok(BOARD_ROUTE.indexOf('authGuard()') < BOARD_ROUTE.indexOf('parseSinceQuery('), 'GET 必须先鉴权')
})

test('GET /api/competitors/shots：鉴权后解析区间再取', () => {
  assert.match(SHOTS_ROUTE, /parseShotRangeQuery\(params\.get\('from'\), params\.get\('before'\)\)/)
  assert.match(SHOTS_ROUTE, /getShotsInRange\(q\.from, q\.before\)/)
  assert.ok(SHOTS_ROUTE.indexOf('authGuard()') >= 0 && SHOTS_ROUTE.indexOf('authGuard()') < SHOTS_ROUTE.indexOf('parseShotRangeQuery('), '必须先鉴权')
})
```

Run: `node --test --experimental-strip-types src/lib/competitors/board-pagination.test.ts src/lib/competitors/shot-window-wiring.test.ts`
Expected: FAIL（`shots/route.ts` 不存在，读文件时抛 ENOENT；`getShotsInRange` 找不到）。

- [ ] **Step 2: 改 `getCompetitorBoard`，新增 `getShotsInRange`**

`src/lib/competitors/service.ts` 的导入补上：

```ts
import { buildShotIndex, loadedRangeOrFilter, parseShotRangeQuery, resolveLoadedFrom } from './shotWindow.ts'
import type { ShotIndexRow } from './shotWindow.ts'
```

把原来的 `getCompetitorBoard` 整段（含注释）换成：

```ts
/**
 * 加载看板：任意登录用户可读可写（canEdit 恒 true）。
 *
 * 截图分两层取：
 * 1. 瘦查询（三列、全量）建索引：完整日期轴 + 各账号全部历史的开播时刻——统计口径与相册加载范围无关；
 * 2. 截图本体只取已加载范围：默认最近 SHOT_CHUNK_DAYS 个有图日（两屏），since 可把起点往前推
 *    （改完数据刷新时保住用户已翻到的范围）。更早的由前端按需走 getShotsInRange 补取。
 * 第 2 步要用第 1 步算出的日期轴，所以两次查询串行。
 * 每段都走 fetchAllRows：Supabase 单次响应最多 1000 行且静默截断。
 */
export async function getCompetitorBoard(
  _userId: string,
  opts: { since?: string | null } = {},
): Promise<ServiceResult<CompetitorBoard>> {
  const since = opts.since ?? null
  // since 会拼进 PostgREST 过滤串：路由层校验过，这里自己再挡一道，不只依赖调用方。
  if (since !== null && !isValidShotDate(since)) {
    return err('invalid_input', 'since must be a real calendar date in YYYY-MM-DD')
  }
  const db = createServerClient()
  const [compRes, snapRes, indexRes, descRes] = await Promise.all([
    fetchAllRows((from, to) => db.from('competitors').select('*')
      .order('created_at', { ascending: true }).order('id', { ascending: true }).range(from, to)),
    fetchAllRows((from, to) => db.from('competitor_snapshots').select('*')
      .order('id', { ascending: true }).range(from, to)),
    fetchAllRows((from, to) => db.from('competitor_shots').select('competitor_id, shot_on, stream_started_at')
      .order('id', { ascending: true }).range(from, to)),
    fetchAllRows((from, to) => db.from('competitor_descriptions').select('*')
      .order('id', { ascending: true }).range(from, to)),
  ])
  const firstErr = compRes.error ?? snapRes.error ?? indexRes.error ?? descRes.error
  if (firstErr) return err('db_error', firstErr.message)

  const index = buildShotIndex((indexRes.data ?? []) as ShotIndexRow[])
  const loadedFrom = resolveLoadedFrom(index.shotAxis, since)
  const shotRes = await fetchAllRows((from, to) => db.from('competitor_shots').select('*')
    .or(loadedRangeOrFilter(loadedFrom))
    .order('id', { ascending: true }).range(from, to))
  if (shotRes.error) return err('db_error', shotRes.error.message)

  return ok(assembleBoard(
    (compRes.data ?? []) as Competitor[],
    (snapRes.data ?? []) as CompetitorSnapshot[],
    (shotRes.data ?? []) as CompetitorShot[],
    true,
    (descRes.data ?? []) as CompetitorDescription[],
    { ...index, shotsLoadedFrom: loadedFrom },
  ))
}

/**
 * 一段日期 [rangeFrom, rangeBefore) 的截图本体，给前端往历史翻页时补取。
 * 区间在路由层已由 parseShotRangeQuery 校验，这里再挡一道（值会进查询）。
 */
export async function getShotsInRange(
  rangeFrom: string,
  rangeBefore: string,
): Promise<ServiceResult<CompetitorShot[]>> {
  const q = parseShotRangeQuery(rangeFrom, rangeBefore)
  if (!q.ok) return err('invalid_input', 'from/before must be real dates in YYYY-MM-DD with from < before')
  const db = createServerClient()
  const res = await fetchAllRows((from, to) => db.from('competitor_shots').select('*')
    .gte('shot_on', q.from).lt('shot_on', q.before)
    .order('id', { ascending: true }).range(from, to))
  if (res.error) return err('db_error', res.error.message)
  return ok((res.data ?? []) as CompetitorShot[])
}
```

注意：`.or(loadedRangeOrFilter(loadedFrom))` 要紧跟在 `select('*')` 后面，中间只能有空白，源码断言就是按这个形状匹配的。

- [ ] **Step 3: 改看板路由，新建补取路由**

`src/app/api/competitors/route.ts` 的 GET 改成如下（POST 不动）：

```ts
import { NextRequest, NextResponse } from 'next/server'
import { authGuard } from '@/lib/auth/guard'
import { getCompetitorBoard, addCompetitor, httpStatusForError } from '@/lib/competitors/service'
import type { CompetitorFields } from '@/lib/competitors/service'
import { parseSinceQuery } from '@/lib/competitors/shotWindow'

// GET /api/competitors?since=YYYY-MM-DD — 看板（含 canEdit）。截图默认只带最近一段；
// since 把已加载起点往前推（改完数据刷新时保住用户已翻到的范围）。
export async function GET(req: NextRequest) {
  const user = await authGuard()
  if (user instanceof NextResponse) return user
  const q = parseSinceQuery(req.nextUrl.searchParams.get('since'))
  if (!q.ok) return NextResponse.json({ data: null, error: 'since must be YYYY-MM-DD' }, { status: 400 })
  const result = await getCompetitorBoard(user.id, { since: q.since })
  if (result.error) {
    return NextResponse.json({ data: null, error: result.error.message }, { status: httpStatusForError(result.error.code) })
  }
  return NextResponse.json({ data: result.data, error: null })
}
```

新建 `src/app/api/competitors/shots/route.ts`：

```ts
import { NextRequest, NextResponse } from 'next/server'
import { authGuard } from '@/lib/auth/guard'
import { getShotsInRange, httpStatusForError } from '@/lib/competitors/service'
import { parseShotRangeQuery } from '@/lib/competitors/shotWindow'

// GET /api/competitors/shots?from=YYYY-MM-DD&before=YYYY-MM-DD — 往历史翻页时补取 [from, before) 的截图
export async function GET(req: NextRequest) {
  const user = await authGuard()
  if (user instanceof NextResponse) return user
  const params = req.nextUrl.searchParams
  const q = parseShotRangeQuery(params.get('from'), params.get('before'))
  if (!q.ok) {
    return NextResponse.json({ data: null, error: 'from/before must be YYYY-MM-DD with from < before' }, { status: 400 })
  }
  const result = await getShotsInRange(q.from, q.before)
  if (result.error) {
    return NextResponse.json({ data: null, error: result.error.message }, { status: httpStatusForError(result.error.code) })
  }
  return NextResponse.json({ data: result.data, error: null })
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `node --test --experimental-strip-types src/lib/competitors/board-pagination.test.ts src/lib/competitors/shot-window-wiring.test.ts && npx tsc --noEmit && npm test 2>&1 | tail -5`
Expected: PASS，tsc 0 errors，`fail 0`。

- [ ] **Step 5: 生产数据只读冒烟（不进仓库）**

worktree 默认没有 `.env.local`。从主仓根目录拷一份到 worktree 根目录（`.gitignore` 已覆盖 `.env*.local`），拷完跑 `git status`，确认没有出现新文件。

在会话 scratchpad 目录里写 `smoke-shot-window.mjs`：

```js
const svc = await import('file://' + process.cwd() + '/src/lib/competitors/service.ts')
const flat = (list) => list.flatMap((c) => [c, ...flat(c.related)])
const shotsOf = (board) => flat(board.competitors).flatMap((c) => c.shots)

const page = await svc.getCompetitorBoard('smoke')
if (page.error) throw new Error(page.error.message)
const dated = page.data.shotAxis.filter((d) => d !== '—')
console.log('page', { axisDays: dated.length, loadedFrom: page.data.shotsLoadedFrom, shots: shotsOf(page.data).length, bytes: JSON.stringify(page.data).length })

const before = page.data.shotsLoadedFrom
const from = dated[Math.max(0, dated.indexOf(before) - 10)]
const chunk = await svc.getShotsInRange(from, before)
console.log('chunk', { from, before, rows: chunk.data?.length, error: chunk.error, outOfRange: chunk.data?.filter((s) => s.shot_on < from || s.shot_on >= before).length })

const all = await svc.getCompetitorBoard('smoke', { since: dated[0] })
console.log('all', { loadedFrom: all.data.shotsLoadedFrom, shots: shotsOf(all.data).length, bytes: JSON.stringify(all.data).length })

const ask = await svc.getAskBoard('smoke')
const askShots = shotsOf(ask.data)
console.log('ask', { shots: askShots.length, keys: Object.keys(askShots[0] ?? {}).sort() })
```

Run（在 worktree 根目录）：`node --env-file=.env.local --experimental-strip-types <scratchpad>/smoke-shot-window.mjs`

Expected：
- `page.loadedFrom` 等于轴上倒数第 10 个有图日；`page.shots` 远小于 `all.shots`；
- `chunk.rows > 0`，`outOfRange = 0`；
- `all.loadedFrom = null`，`all.shots` 等于表的总行数（可以用 `select count(*) from competitor_shots` 核对）；
- `ask.shots` 等于 `all.shots`；`ask.keys` 正好是那 6 列。

如果经代理时报 JSON 解析错误，去掉代理相关的环境变量再跑。把输出贴进任务报告，作为 Task 11 体积对比的依据。

- [ ] **Step 6: 提交**

```bash
git branch --show-current
git status --short   # 确认 .env.local 没有被跟踪
git add src/lib/competitors/service.ts src/app/api/competitors/route.ts src/app/api/competitors/shots/route.ts src/lib/competitors/board-pagination.test.ts src/lib/competitors/shot-window-wiring.test.ts
git commit -m "feat(competitors): 看板截图按日期窗口取数，新增按区间补取接口

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: 前端按需补取、「未加载」格子、刷新保住范围

**Files:**
- Modify: `src/components/competitors/CompetitorDossierView.tsx`
- Modify: `src/components/competitors/CompetitorCard.tsx`（props、`ShotAlbum` 调用处、子卡调用处）
- Modify: `src/components/competitors/ShotAlbum.tsx`（新增 `PendingCell`、新增 props）
- Modify: `src/lib/competitors/shotGrid.ts`（删掉 `collectShotDates`）
- Modify: `src/lib/competitors/shotGrid.test.ts`（删掉 `collectShotDates` 的 5 条测试和对应的 import）
- Modify: `src/lib/competitors/summary.ts`（只加注释）
- Modify: `messages/zh.json`、`messages/en.json`、`messages/ja.json`（`competitors.shotsLoadFailed`）
- Modify: `src/components/competitors/album-windowing-wiring.test.ts`（追加）

**Interfaces:**
- Consumes: Task 1 的 `board.shotAxis`、`board.shotsLoadedFrom`；Task 3 的 `boardRefreshPath`、`shotRangePath`；Task 4 的 `isShotDateLoaded`、`nextChunk`、`mergeShotRange`
- Produces:
  - `CompetitorCard` 新增 props：`shotsLoadedFrom: string | null`、`shotLoadFailed: boolean`
  - `ShotAlbum` 新增 props：`loadedFrom: string | null`、`loadFailed: boolean`

- [ ] **Step 1: 写失败的接线断言**

在 `album-windowing-wiring.test.ts` 末尾追加：

```ts
const VIEW = read('./CompetitorDossierView.tsx')
const ALBUM = read('./ShotAlbum.tsx')

test('日期轴用服务端下发的完整轴，不再从已加载截图拼', () => {
  assert.match(VIEW, /const shotAxis = board\.shotAxis/)
  assert.doesNotMatch(VIEW, /collectShotDates/)
})

test('补取：nextChunk 判缺口，结果经 mergeShotRange 以函数式更新并入（过期结果才丢得掉）', () => {
  assert.match(VIEW, /nextChunk\(shotAxis, dateWindow, board\.shotsLoadedFrom\)/)
  assert.match(VIEW, /fetch\(shotRangePath\(/)
  assert.match(VIEW, /setBoard\(\(b\) => mergeShotRange\(b, /)
})

test('刷新带上已加载起点，翻到历史后刷新不回缩', () => {
  assert.match(VIEW, /fetch\(boardRefreshPath\(loadedFromRef\.current\)/)
  assert.doesNotMatch(VIEW, /fetch\('\/api\/competitors', \{ cache/)
})

test('导航条「待补」：选中日未加载时不标', () => {
  assert.match(VIEW, /isShotDateLoaded\(selectedDate, board\.shotsLoadedFrom\) && missesShotOn\(/)
})

test('相册：未加载的日期渲染 PendingCell，且先于空格子判断（空格子带补图入口）', () => {
  const pending = ALBUM.indexOf('if (!isShotDateLoaded(d, loadedFrom))')
  assert.ok(pending >= 0, '相册里要先判 isShotDateLoaded')
  assert.ok(pending < ALBUM.indexOf('<EmptyCell'), 'PendingCell 分支必须在 EmptyCell 之前')
  const cell = ALBUM.slice(ALBUM.indexOf('function PendingCell'), ALBUM.indexOf('function FilledCell'))
  assert.doesNotMatch(cell, /uploadShot|type="file"|onPaste/, 'PendingCell 不能有补图入口')
})

test('卡片把已加载起点与失败态透传给相册和子卡', () => {
  assert.match(CARD, /loadedFrom=\{shotsLoadedFrom\}/)
  assert.match(CARD, /loadFailed=\{shotLoadFailed\}/)
  assert.match(CARD, /shotsLoadedFrom=\{shotsLoadedFrom\}\s+shotLoadFailed=\{shotLoadFailed\}/)
})
```

Run: `node --test --experimental-strip-types src/components/competitors/album-windowing-wiring.test.ts`
Expected: FAIL

- [ ] **Step 2: 文案**

在三个语言文件的 `competitors` 对象里，紧挨着 `"noShots"` 加一个键：

- `messages/zh.json`：`"shotsLoadFailed": "截图加载失败"`
- `messages/en.json`：`"shotsLoadFailed": "Couldn't load screenshots"`
- `messages/ja.json`：`"shotsLoadFailed": "スクリーンショットを読み込めませんでした"`

重试按钮复用 `common.retry`；未加载格子的读屏文案复用 `common.loading`、`common.loadFailed`。这三个键都已经存在。

- [ ] **Step 3: 相册加 `PendingCell` 与新 props**

`src/components/competitors/ShotAlbum.tsx`：

导入补上：

```ts
import { isShotDateLoaded } from '@/lib/competitors/shotWindow'
```

在 `function FilledCell` 之前加：

```tsx
/**
 * 还没加载到的日期。和空格子同尺寸，但**不给补图入口**：这天可能其实有图，只是还没取回来，
 * 在这里补图会造出重复截图。补取失败时停止闪烁，免得被读成"还在加载"；
 * 重试入口在页面顶部的报错行。
 */
function PendingCell({ ring, failed }: { ring: string; failed: boolean }) {
  const tCommon = useTranslations('common')
  return (
    <div
      role="status"
      aria-busy={!failed}
      aria-label={failed ? tCommon('loadFailed') : tCommon('loading')}
      className={`${BOX} ${ring} rounded-field bg-line-soft ${failed ? '' : 'animate-pulse'}`}
    />
  )
}
```

`ShotAlbum` 的参数与类型补上两项：

```tsx
export default function ShotAlbum({
  competitorId, handle, shots, canEdit, onChanged, dateWindow, selectedDate, loadedFrom, loadFailed,
}: {
  // …原有字段不动…
  /** 已加载起点（CompetitorBoard.shotsLoadedFrom）：更早的日期还没取回来，格子显示占位而不是"没图"。 */
  loadedFrom: string | null
  /** 补取失败：占位格停止闪烁。 */
  loadFailed: boolean
}) {
```

网格的 `dateWindow.map` 改成：

```tsx
        {dateWindow.map((d) => {
          // 描边两个分支都要:一列里空格子越多,越需要它告诉你看的是同一天
          const ring = d === selectedDate ? 'ring-2 ring-primary' : ''
          if (!isShotDateLoaded(d, loadedFrom)) return <PendingCell key={d} ring={ring} failed={loadFailed} />
          const dayShots = grouped.get(d) ?? []
          return dayShots.length
            ? <FilledCell key={d} shots={dayShots} dateKey={d} ring={ring} onOpen={() => setOpenDate(d)} />
            : <EmptyCell key={d} competitorId={competitorId} dateKey={d} canEdit={canEdit} onChanged={onChanged} ring={ring} />
        })}
```

- [ ] **Step 4: 卡片透传**

`src/components/competitors/CompetitorCard.tsx`：

- 解构参数里加上 `shotsLoadedFrom, shotLoadFailed`，类型里加上：
  ```ts
  /** 相册已加载起点，见 CompetitorBoard.shotsLoadedFrom。 */
  shotsLoadedFrom: string | null
  /** 往历史补取截图失败：相册占位格停止闪烁。 */
  shotLoadFailed: boolean
  ```
- `<ShotAlbum ... selectedDate={selectedDate} />` 后面补上 `loadedFrom={shotsLoadedFrom}` 和 `loadFailed={shotLoadFailed}`。
- 子卡 `<CompetitorCard ... selectedDate={selectedDate}` 的下一行补上（两行连着写，断言要求两者相邻）：
  ```tsx
                  shotsLoadedFrom={shotsLoadedFrom}
                  shotLoadFailed={shotLoadFailed}
  ```

- [ ] **Step 5: 看板视图接上补取、刷新与守卫**

`src/components/competitors/CompetitorDossierView.tsx`：

导入：

```ts
import { SHOT_WINDOW_SIZE, missesShotOn, resolveAnchor, windowOf } from '@/lib/competitors/shotGrid'
import { boardRefreshPath, isShotDateLoaded, mergeShotRange, nextChunk, shotRangePath } from '@/lib/competitors/shotWindow'
import type { CompetitorBoard, CompetitorShot } from '@/lib/competitors/types'
```

在 `const t = useTranslations('competitors')` 下一行加 `const tCommon = useTranslations('common')`。

日期轴那段换成：

```ts
  // 整页共用的截图日期轴：服务端下发的完整轴（全部有图日期），不从已加载的截图里拼——
  // 截图只加载了最近一段，从它拼出来的轴会让「更早」键以为历史到头了。
  const [anchorDate, setAnchorDate] = useState<string | null>(null)
  const shotAxis = board.shotAxis
```

（`selectedDate`、`dateWindow` 两个 `useMemo` 不动。）

`navTargets` 里的 `missingShot` 改成下面这样，并在依赖数组里补上 `board.shotsLoadedFrom`：

```ts
      // 选中日还没加载时一律不标：那天的截图还没取回来，不等于没图。
      missingShot: isShotDateLoaded(selectedDate, board.shotsLoadedFrom) && missesShotOn(c.shots, selectedDate),
```

```ts
    [board.competitors, board.shotsLoadedFrom, selectedDate],
```

在 `refresh` 之前加上补取逻辑：

```ts
  // 往历史翻页时按需补取截图。判据全在 shotWindow.ts：nextChunk 决定补哪段，
  // mergeShotRange 合并并丢弃过期结果（请求飞行期间看板被刷新换掉的情况）。
  // 不在 effect 清理里取消请求：dev 的 StrictMode 双挂载会把在途请求取消掉、又被去重挡住重发，
  // 永远卡在占位格；靠 inflightRef 去重 + 过期丢弃就够了。
  const [shotLoadFailed, setShotLoadFailed] = useState(false)
  const [retryTick, setRetryTick] = useState(0)
  const inflightRef = useRef<string | null>(null)
  const pendingChunk = useMemo(
    () => nextChunk(shotAxis, dateWindow, board.shotsLoadedFrom),
    [shotAxis, dateWindow, board.shotsLoadedFrom],
  )
  useEffect(() => {
    if (!pendingChunk) { setShotLoadFailed(false); return }
    const key = `${pendingChunk.from}|${pendingChunk.before}`
    if (inflightRef.current === key) return
    inflightRef.current = key
    setShotLoadFailed(false)
    void (async () => {
      try {
        const res = await fetch(shotRangePath(pendingChunk), { cache: 'no-store' })
        if (!res.ok) throw new Error('load failed')
        const json = await res.json()
        const rows = (json.data ?? []) as CompetitorShot[]
        setBoard((b) => mergeShotRange(b, rows, pendingChunk))
      } catch {
        setShotLoadFailed(true)
      } finally {
        if (inflightRef.current === key) inflightRef.current = null
      }
    })()
  }, [pendingChunk, retryTick])

  // refresh 是 useCallback，闭包里的 board 会过期；起点走 ref 读最新值。
  const loadedFromRef = useRef(board.shotsLoadedFrom)
  useEffect(() => { loadedFromRef.current = board.shotsLoadedFrom }, [board.shotsLoadedFrom])
```

`refresh` 里的 `fetch('/api/competitors', { cache: 'no-store' })` 改成：

```ts
      // 带上已加载起点：翻到历史后上传/改日期/删图再刷新，不会被缩回首屏那两屏。
      const res = await fetch(boardRefreshPath(loadedFromRef.current), { cache: 'no-store' })
```

在 `{error && <p className="text-sm text-danger-text">{error}</p>}` 的下一行加：

```tsx
      {shotLoadFailed && (
        <p className="flex items-center gap-2 text-sm text-danger-text">
          {t('shotsLoadFailed')}
          <Button variant="secondary" size="sm" onClick={() => setRetryTick((n) => n + 1)}>
            {tCommon('retry')}
          </Button>
        </p>
      )}
```

`<CompetitorCard` 的调用处补上：

```tsx
              shotsLoadedFrom={board.shotsLoadedFrom}
              shotLoadFailed={shotLoadFailed}
```

- [ ] **Step 6: 删掉 `collectShotDates`，统计条加注释**

- `src/lib/competitors/shotGrid.ts`：删掉 `collectShotDates` 函数和它上面的注释。删完之后，如果文件里已经没有地方用到 `CompetitorWithHistory`，就把它从 type import 里去掉。
- `src/lib/competitors/shotGrid.test.ts`：删掉 import 里的 `collectShotDates`，以及五条 `collectShotDates:` 开头的测试；同类覆盖已经移到 `shotWindow.test.ts` 的 `buildShotIndex` 用例里。如果 `competitor()` 夹具删完测试后已经没人用，连同 type import 里的 `CompetitorWithHistory` 一并删掉，避免 lint 报未使用（`test:lint` 不允许任何 warning）。
- `src/lib/competitors/summary.ts`：在 `maxShotOn` 的注释末尾补一句：「看板的截图只加载了最近一段，但已加载范围总包含最新一天（见 CompetitorBoard.shotsLoadedFrom），所以这里取到的最大值不受影响。」

Run: `grep -rn collectShotDates src`
Expected: 无输出

- [ ] **Step 7: 跑测试与门禁**

Run: `node --test --experimental-strip-types src/components/competitors/album-windowing-wiring.test.ts src/lib/competitors/shotGrid.test.ts && npx tsc --noEmit && npm test 2>&1 | tail -5 && npm run test:copy`
Expected: 全部 PASS。`test:copy` 包含 i18n 键一致、无裸中文、样式 token、lint 0 warning。

- [ ] **Step 8: 提交**

```bash
git branch --show-current
git add src/components/competitors/CompetitorDossierView.tsx src/components/competitors/CompetitorCard.tsx src/components/competitors/ShotAlbum.tsx src/lib/competitors/shotGrid.ts src/lib/competitors/shotGrid.test.ts src/lib/competitors/summary.ts messages/zh.json messages/en.json messages/ja.json src/components/competitors/album-windowing-wiring.test.ts
git commit -m "feat(competitors): 相册往历史翻页时按需补取，未加载的日期显示占位而非空格

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: 截图标签按界面语言显示

**Files:**
- Create: `src/lib/competitors/shotTag.ts`
- Create: `src/lib/competitors/shotTag.test.ts`
- Create: `src/components/competitors/useShotTagLabel.ts`
- Modify: `src/components/competitors/ShotAlbum.tsx`（`FilledCell`）
- Modify: `src/components/competitors/ShotLightbox.tsx`（主图 `alt`）
- Modify: `messages/zh.json`、`messages/en.json`、`messages/ja.json`（`competitors.shotTag`）
- Modify: `src/components/competitors/album-windowing-wiring.test.ts`（追加）
- Modify: `package.json`（`test` 行末尾追加 `src/lib/competitors/shotTag.test.ts`）

**Interfaces:**
- Consumes: `quickShot.ts` 的 `QUICK_SHOT_TAG`
- Produces:
  - `AUTO_SHOT_TAG = 'live_auto'`
  - `ShotTagDisplay = { kind: 'known'; key: 'live_auto' | 'live_manual' } | { kind: 'text'; text: string }`
  - `shotTagDisplay(tag: string | null | undefined): ShotTagDisplay | null`
  - `useShotTagLabel(): (tag: string | null | undefined) => string | null`

- [ ] **Step 1: 写失败测试**

新建 `src/lib/competitors/shotTag.test.ts`：

```ts
// src/lib/competitors/shotTag.test.ts
import assert from 'node:assert/strict'
import test from 'node:test'

import { QUICK_SHOT_TAG } from './quickShot.ts'
import { AUTO_SHOT_TAG, shotTagDisplay } from './shotTag.ts'

test('机器值常量与写入方一致', () => {
  assert.equal(AUTO_SHOT_TAG, 'live_auto')
  assert.equal(QUICK_SHOT_TAG, 'live_manual')
})

test('shotTagDisplay: 空值与纯空白不显示', () => {
  assert.equal(shotTagDisplay(null), null)
  assert.equal(shotTagDisplay(undefined), null)
  assert.equal(shotTagDisplay(''), null)
  assert.equal(shotTagDisplay('   '), null)
})

test('shotTagDisplay: 两个机器值换成文案键', () => {
  assert.deepEqual(shotTagDisplay('live_auto'), { kind: 'known', key: 'live_auto' })
  assert.deepEqual(shotTagDisplay('live_manual'), { kind: 'known', key: 'live_manual' })
})

test('shotTagDisplay: 人写的自由文本原样显示（去首尾空白）', () => {
  assert.deepEqual(shotTagDisplay('全妆'), { kind: 'text', text: '全妆' })
  assert.deepEqual(shotTagDisplay('  常服 '), { kind: 'text', text: '常服' })
})

test('shotTagDisplay: 只认精确的机器值，大小写或空白不同就当人写的文本', () => {
  assert.deepEqual(shotTagDisplay('LIVE_AUTO'), { kind: 'text', text: 'LIVE_AUTO' })
  assert.deepEqual(shotTagDisplay(' live_manual'), { kind: 'text', text: 'live_manual' })
})
```

在 `album-windowing-wiring.test.ts` 末尾追加：

```ts
const LIGHTBOX = read('./ShotLightbox.tsx')

test('标签：相册与灯箱不直接渲染 tag 原文，一律经 useShotTagLabel', () => {
  assert.match(ALBUM, /useShotTagLabel\(\)/)
  assert.match(LIGHTBOX, /useShotTagLabel\(\)/)
  assert.doesNotMatch(ALBUM, /\{cover\.tag\}|cover\.caption \|\| cover\.tag/)
  assert.doesNotMatch(LIGHTBOX, /selected\.caption \|\| selected\.tag/)
})
```

Run: `node --test --experimental-strip-types src/lib/competitors/shotTag.test.ts src/components/competitors/album-windowing-wiring.test.ts`
Expected: FAIL

- [ ] **Step 2: 实现纯函数与 hook**

新建 `src/lib/competitors/shotTag.ts`：

```ts
// src/lib/competitors/shotTag.ts
// 截图 tag 的显示：程序写入的两个机器值换成界面语言的文案，人填的自由文本原样显示。
import { QUICK_SHOT_TAG } from './quickShot.ts'

/** 自动巡检脚本写入的 tag（scripts/live-watch/record-live-shot.mjs 的默认值）。 */
export const AUTO_SHOT_TAG = 'live_auto'

export type ShotTagDisplay =
  | { kind: 'known'; key: 'live_auto' | 'live_manual' }
  | { kind: 'text'; text: string }

/**
 * 精确匹配机器值：它们由代码写死，大小写或空白不同的只可能是人手写的，原样显示更诚实。
 * 空值与纯空白返回 null（不显示角标）。
 */
export function shotTagDisplay(tag: string | null | undefined): ShotTagDisplay | null {
  const text = tag?.trim()
  if (!text) return null
  if (tag === AUTO_SHOT_TAG) return { kind: 'known', key: 'live_auto' }
  if (tag === QUICK_SHOT_TAG) return { kind: 'known', key: 'live_manual' }
  return { kind: 'text', text }
}
```

新建 `src/components/competitors/useShotTagLabel.ts`：

```ts
// src/components/competitors/useShotTagLabel.ts
import { useTranslations } from 'next-intl'
import { shotTagDisplay } from '@/lib/competitors/shotTag'

/**
 * 截图 tag → 当前界面语言的显示文本；空 tag 返回 null。
 * 文案键写成字面量而不是拼接：i18n 门禁只认得出字面量引用，拼出来的键会被判成"没人用"。
 */
export function useShotTagLabel(): (tag: string | null | undefined) => string | null {
  const t = useTranslations('competitors')
  return (tag) => {
    const d = shotTagDisplay(tag)
    if (!d) return null
    if (d.kind === 'text') return d.text
    return d.key === 'live_auto' ? t('shotTag.live_auto') : t('shotTag.live_manual')
  }
}
```

- [ ] **Step 3: 文案**

在三个语言文件的 `competitors` 对象里加一个 `shotTag` 子对象：

- zh：`"shotTag": { "live_auto": "自动巡检", "live_manual": "插件" }`
- en：`"shotTag": { "live_auto": "Auto patrol", "live_manual": "Extension" }`
- ja：`"shotTag": { "live_auto": "自動巡回", "live_manual": "拡張機能" }`

- [ ] **Step 4: 相册与灯箱接上**

`ShotAlbum.tsx`：加上 `import { useShotTagLabel } from './useShotTagLabel'`。在 `FilledCell` 里：

```tsx
  const t = useTranslations('competitors')
  const tagLabel = useShotTagLabel()
  const cover = shots[0]
  const extra = shots.length - 1
  const coverTag = tagLabel(cover.tag)
```

（`cover` 那一行先保持 `shots[0]` 不动，Task 9 再改。）`img` 的 `alt` 改成 `alt={cover.caption || coverTag || (dateKey === UNDATED_KEY ? t('undated') : dateKey)}`；底部标签角标改成：

```tsx
      {coverTag && (
        <span className="pointer-events-none absolute inset-x-1 bottom-1 truncate rounded bg-black/50 px-1 py-0.5 text-[9px] text-white">
          {coverTag}
        </span>
      )}
```

`ShotLightbox.tsx`：加上 `import { useShotTagLabel } from './useShotTagLabel'`。在组件体里 `const tCommon = useTranslations('common')` 的下一行加 `const tagLabel = useShotTagLabel()`；主图改成 `alt={selected.caption || tagLabel(selected.tag) || ''}`。

- [ ] **Step 5: 跑测试与门禁**

在 `package.json` 的 `"test"` 行末尾追加 ` src/lib/competitors/shotTag.test.ts`。

Run: `node --test --experimental-strip-types src/lib/competitors/shotTag.test.ts src/components/competitors/album-windowing-wiring.test.ts && npx tsc --noEmit && npm test 2>&1 | tail -5 && npm run test:copy`
Expected: 全部 PASS。i18n 门禁不应报 `shotTag.*` 未被引用。

- [ ] **Step 6: 提交**

```bash
git branch --show-current
git add src/lib/competitors/shotTag.ts src/lib/competitors/shotTag.test.ts src/components/competitors/useShotTagLabel.ts src/components/competitors/ShotAlbum.tsx src/components/competitors/ShotLightbox.tsx messages/zh.json messages/en.json messages/ja.json src/components/competitors/album-windowing-wiring.test.ts package.json
git commit -m "feat(competitors): 截图标签按界面语言显示（自动巡检 / 插件），自由文本原样

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: 封面取当天最新一张，灯箱停在封面

**Files:**
- Modify: `src/lib/competitors/shotGrid.ts`（`groupShotsByDate` 的排序；新增 `coverOf`）
- Modify: `src/lib/competitors/shotGrid.test.ts`
- Modify: `src/components/competitors/ShotAlbum.tsx`（`FilledCell` 的封面、`ShotLightbox` 调用处）
- Modify: `src/components/competitors/ShotLightbox.tsx`（`initialId`）
- Modify: `src/components/competitors/album-windowing-wiring.test.ts`（追加）

**Interfaces:**
- Produces:
  - `groupShotsByDate`：组内排序改为 `sort_order` 升序 → 截图时刻升序 → `id` 升序
  - `coverOf<T>(dayShots: T[]): T | undefined`
  - `ShotLightbox` 新增 prop `initialId?: string`

- [ ] **Step 1: 写失败测试**

`shotGrid.test.ts`：import 里加上 `coverOf`；`shotAt` 辅助函数改成可以带 `captured_at`：

```ts
function shotAt(
  id: string, shot_on: string | null, sort_order: number, created_at: string, captured_at: string | null = null,
): CompetitorShot {
  return { ...shot(id, shot_on), sort_order, created_at, captured_at }
}
```

把测试「组内按 sort_order 升序，首张为封面」的标题改成「组内按 sort_order 升序」（断言不变）。把「sort_order 相同时按 created_at 升序」整条换成下面这几条：

```ts
test('groupShotsByDate: 没有截图时刻时按入库时刻升序', () => {
  const g = groupShotsByDate([
    shotAt('late', '2026-08-01', 0, '2026-08-01T10:00:00Z'),
    shotAt('early', '2026-08-01', 0, '2026-08-01T09:00:00Z'),
  ])
  assert.deepEqual(g.get('2026-08-01')!.map((s) => s.id), ['early', 'late'])
})

test('groupShotsByDate: 截图时刻（captured_at）优先于入库时刻', () => {
  // 自动截图批量补传：入库晚，但截图时刻早
  const g = groupShotsByDate([
    shotAt('batch', '2026-08-01', 0, '2026-08-01T12:00:00Z', '2026-08-01T05:00:00Z'),
    shotAt('manual', '2026-08-01', 0, '2026-08-01T08:00:00Z'),
  ])
  assert.deepEqual(g.get('2026-08-01')!.map((s) => s.id), ['batch', 'manual'])
})

test('groupShotsByDate: 时刻按数值比，不按字符串（Z 与 +00:00、小数秒混用）', () => {
  // 字符串比较会把 "…10:00:00Z" 排在 "…10:00:00.5+00:00" 之后（'Z' > '.'），实际前者更早
  const g = groupShotsByDate([
    shotAt('later', '2026-08-01', 0, '2026-08-01T10:00:00.5+00:00'),
    shotAt('earlier', '2026-08-01', 0, '2026-08-01T10:00:00Z'),
  ])
  assert.deepEqual(g.get('2026-08-01')!.map((s) => s.id), ['earlier', 'later'])
})

test('groupShotsByDate: 时刻相同或读不出时按 id 兜底，结果稳定', () => {
  const g = groupShotsByDate([
    shotAt('b', '2026-08-01', 0, '2026-08-01T10:00:00Z'),
    shotAt('a', '2026-08-01', 0, '2026-08-01T10:00:00Z'),
    shotAt('d', '2026-08-01', 0, 'garbage'),
    shotAt('c', '2026-08-01', 0, 'garbage'),
  ])
  assert.deepEqual(g.get('2026-08-01')!.map((s) => s.id).filter((id) => id === 'a' || id === 'b'), ['a', 'b'])
  assert.deepEqual(g.get('2026-08-01')!.map((s) => s.id).filter((id) => id === 'c' || id === 'd'), ['c', 'd'])
})

test('coverOf: 封面是组内最后一张（当天最新），空组为 undefined', () => {
  const g = groupShotsByDate([
    shotAt('first', '2026-08-01', 0, '2026-08-01T09:00:00Z'),
    shotAt('newest', '2026-08-01', 0, '2026-08-01T11:00:00Z'),
    shotAt('middle', '2026-08-01', 0, '2026-08-01T10:00:00Z'),
  ])
  assert.equal(coverOf(g.get('2026-08-01')!)!.id, 'newest')
  assert.equal(coverOf([]), undefined)
})
```

`album-windowing-wiring.test.ts` 末尾追加：

```ts
test('封面：相册格子取 coverOf，灯箱从封面那张打开', () => {
  assert.match(ALBUM, /const cover = coverOf\(shots\)/)
  assert.match(ALBUM, /initialId=\{coverOf\(grouped\.get\(openDate\) \?\? \[\]\)\?\.id\}/)
  assert.match(LIGHTBOX, /useState<string \| null>\(initialId \?\? null\)/)
})
```

Run: `node --test --experimental-strip-types src/lib/competitors/shotGrid.test.ts src/components/competitors/album-windowing-wiring.test.ts`
Expected: FAIL（`coverOf` 没有导出；captured_at 优先、数值比较这两条红）。

- [ ] **Step 2: 实现**

`shotGrid.ts`：把 `groupShotsByDate` 连同它的注释换成：

```ts
/** 截图时刻（毫秒）：采集脚本/插件写的 captured_at 优先，人工上传没有它，退回入库时刻。读不出为 NaN。 */
function shotMoment(s: Pick<CompetitorShot, 'captured_at' | 'created_at'>): number {
  return Date.parse(s.captured_at ?? s.created_at)
}

/**
 * 按日期归组；shot_on 为空归入 UNDATED_KEY。
 * 组内按时间正序：sort_order → 截图时刻 → id 兜底。末张是当天最新的一张，即封面（见 coverOf）。
 * 时刻按数值比而不是字符串：时间戳写法不统一（Z / +00:00 混用、小数秒位数不定），字符串比较会排错。
 * NaN 相减仍是 NaN，被 || 当成"相等"，落到 id 兜底。
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
    arr.sort((a, b) => (a.sort_order - b.sort_order) || (shotMoment(a) - shotMoment(b)) || a.id.localeCompare(b.id))
  }
  return map
}

/**
 * 当天封面：组内（groupShotsByDate 的时间正序）最后一张，即最新截的那张——插件刚截的图会立刻
 * 成为封面，相当于上传成功的回执。灯箱也从这张打开（往左是更早的），胶片条与下载序号仍按时间正序。
 */
export function coverOf<T>(dayShots: T[]): T | undefined {
  return dayShots[dayShots.length - 1]
}
```

`ShotAlbum.tsx`：
- 从 `@/lib/competitors/shotGrid` 的导入里加上 `coverOf`；
- `FilledCell` 里 `const cover = shots[0]` 改成 `const cover = coverOf(shots)!`，上面加一行注释 `// FilledCell 只在当天有图时渲染，coverOf 必有值`；
- `<ShotLightbox` 的调用处加上 `initialId={coverOf(grouped.get(openDate) ?? [])?.id}`。

`ShotLightbox.tsx`：
- props 解构加上 `initialId`，类型里加上：
  ```ts
  /** 打开时先停在哪张（相册传当天封面，即最新一张）。不传就从第一张开始。 */
  initialId?: string
  ```
- `const [pickedId, setPickedId] = useState<string | null>(null)` 改成 `const [pickedId, setPickedId] = useState<string | null>(initialId ?? null)`。

- [ ] **Step 3: 跑测试与门禁**

Run: `node --test --experimental-strip-types src/lib/competitors/shotGrid.test.ts src/components/competitors/album-windowing-wiring.test.ts && npx tsc --noEmit && npm test 2>&1 | tail -5 && npm run test:copy`
Expected: 全部 PASS。

- [ ] **Step 4: 提交**

```bash
git branch --show-current
git add src/lib/competitors/shotGrid.ts src/lib/competitors/shotGrid.test.ts src/components/competitors/ShotAlbum.tsx src/components/competitors/ShotLightbox.tsx src/components/competitors/album-windowing-wiring.test.ts
git commit -m "feat(competitors): 相册封面取当天最新一张，灯箱从封面打开

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: 文档与更新日志

**Files:**
- Modify: `docs/competitors.md`
- Modify: `src/lib/changelog/entries.ts`

- [ ] **Step 1: 更新 `docs/competitors.md`**

- 接口表：`GET /api/competitors` 那一行的说明改成「看板（含 `canEdit`、嵌套 `related`、`weekly`、`shots`、`sessionStarts`、`shotAxis`、`shotsLoadedFrom`）。截图默认只带最近 10 个有图日；`?since=YYYY-MM-DD` 把起点往前推」。在它的下一行新增一行：`| GET | /api/competitors/shots?from=&before= | 往历史翻页时补取 [from, before) 的截图 |`。
- `ShotAlbum` 那一条（「截图相册。折叠态换行网格…」）已经和现状不符，换成：「`ShotAlbum`：截图相册。整页共用一条日期轴，一屏 5 天，每天一格；封面是当天最新一张，其余显示「+N」；点开进灯箱，默认停在封面。截图按日期窗口加载：首屏只取最近 10 个有图日，往前翻到离已加载边界不足一屏时后台补取下一段；还没取回的日期显示占位格，不提供补图入口。标签 `live_auto` / `live_manual` 按界面语言显示，其它 tag 原样显示。」
- `competitor_shots` 表的 `tag` 说明后面补一句：「界面上这两个机器值分别显示为 自动巡检 / 插件（英文 Auto patrol / Extension，日文 自動巡回 / 拡張機能）」。

- [ ] **Step 2: 更新日志**

`src/lib/changelog/entries.ts`：用 `TZ=Asia/Tokyo date +%F` 拿到当天日期。如果数组顶部第一条的 `date` 就是这一天，把下面这一条加到它的 `items` 最前面；如果不是，就在数组顶部新建一条 `{ date: '<当天>', items: [ … ] }`。

```ts
      {
        kind: 'improve',
        scope: '竞品监测',
        title: '竞品页打开更快；截图标签按界面语言显示；每天的封面换成最新一张',
        details:
          '竞品页以前一打开就把一千多张截图的记录全部取下来，截图越多页面越慢。现在默认只取最近 10 个有截图的日期（两屏），往前翻时会在后台提前把下一段取好，正常翻页不用等；还没取回来的日期先显示灰色占位格，这时不能往里补图，免得重复上传。卡片上的常见开播时段、同地区开播标尺、问答面板的回答都照常使用全部历史，数字不会因为只加载了一部分而变化。\n\n截图角上的标签以前直接显示 live_auto、live_manual，现在按界面语言显示为「自动巡检」「插件」（英文 Auto patrol / Extension，日文 自動巡回 / 拡張機能），人工填写的标签照原样显示。\n\n相册每天一格的封面改为当天最新截的那张，用插件刚截完的图会马上出现在封面上；点开大图时也先停在这张，往左翻是更早的图。',
      },
```

- [ ] **Step 3: 门禁并提交**

Run: `npx tsc --noEmit && npm run test:copy`
Expected: PASS

```bash
git branch --show-current
git add docs/competitors.md src/lib/changelog/entries.ts
git commit -m "docs(competitors): 相册按日期窗口加载、标签多语言、封面规则写入文档与更新日志

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: 整体验证（控制方执行，不派实现子代理）

这一步不写产品代码，产出的是证据。所有临时脚本都放在会话 scratchpad，不进仓库。

- [ ] **Step 1: 新旧口径对拍（只读）**

先把 `origin/main` 上的旧版 `regionRuler.ts`、`liveSlots.ts` 导出到 scratchpad 的 `old/` 子目录：

```bash
git show origin/main:src/lib/competitors/regionRuler.ts > <scratchpad>/old/regionRuler.ts
git show origin/main:src/lib/competitors/liveSlots.ts > <scratchpad>/old/liveSlots.ts
```

再在 scratchpad 里写 `parity.mjs`，在 worktree 根目录用 `node --env-file=.env.local --experimental-strip-types` 跑。脚本要做下面这些事：

1. 用 `createServerClient` + `fetchAllRows` 取 `competitors`（按 `created_at` 再按 `id` 排序）、`competitor_snapshots`，以及**全部列、全部行**的 `competitor_shots`，组成「旧看板」：`assembleBoard(comps, snaps, allShots, true)`。
2. 取「新看板」：`getCompetitorBoard('parity')`；取「新问答看板」：`getAskBoard('parity')`。
3. 对拍以下几项，固定 `now = new Date()` 只取一次。**每一项都要求 `JSON.stringify` 全等**：
   - 问答：分别在 `zh`、`en`、`ja` 三种语言下，`buildAskContext(旧看板, now, locale)` 和 `buildAskContext(新问答看板, now, locale)` 全等；
   - 卡片开播时段：对每个账号（递归包含子主播）、每种语言对应的时区，`summarizeLiveHabit(旧.shots.map(s => s.stream_started_at), tz)` 和 `summarizeLiveHabit(新.sessionStarts, tz)` 全等；`recentSessionStarts(..., 8)` 同样全等；
   - 地区标尺：对库里出现过的每个地区、每个时区，旧版 `buildRegionRuler`（`old/regionRuler.ts`，输入用 `shots`）和新版（输入用 `sessionStarts`）全等，`now` 用 `now.toISOString()`；
   - 统计条：`summarizeBoard(旧.competitors, today)` 和 `summarizeBoard(新.competitors, today)` 全等；
   - 日期轴：新看板的 `shotAxis` 等于旧看板从全量截图算出来的轴。
4. 体积：分别输出新旧看板 `JSON.stringify` 后的字节数和截图条数。

Expected：所有对拍项全等，新看板体积明显小于旧看板。把输出原样贴进最终汇报。只要有一项不等就停下排查，不能带着差异继续往下走。

- [ ] **Step 2: 全量门禁**

Run: `npx tsc --noEmit && npm test 2>&1 | tail -5 && npm run test:copy`
Expected: 全部 PASS，`fail 0`。

- [ ] **Step 3: 生产构建实机验证**

1. 在 worktree 根目录跑 `npm run build`。不要只看退出码，要确认产物里有 `.next/BUILD_ID`，路由表里有 `/api/competitors/shots`。
2. 后台起服务：`npx next start -p 3002`。
3. 用内置浏览器打开 `http://localhost:3002/zh/competitors`，**请用户在浏览器面板里自己登录**，我们不代填账号密码。
4. 逐项检查。交互是否生效一律用 JS 读 DOM 或网络记录来断言，截图只用来留档：
   - 首屏：网络记录里没有 `/api/competitors/shots`，相册 5 列都有内容，没有 `role="status"` 的占位格；
   - 点一次「更早」：这一屏立刻有图，同时发出且只发出一次 `/api/competitors/shots?from=…&before=…`；
   - 连点 3 次「更早」：中途出现占位格（`[role=status][aria-busy=true]`），请求返回后被图填满；导航条上「待补」的数量不会在翻页瞬间暴涨；
   - 一直翻到最早一屏：「更早」键变成禁用，不再发请求；
   - 在 DevTools 里把 `/api/competitors/shots` 拦成失败（或用 JS 临时改写 `fetch`），翻到未加载区：出现「截图加载失败」和「重试」，占位格停止闪烁；恢复后点重试，格子被填满；
   - 在已经翻到的历史位置，打开某天的灯箱改一张图的日期再改回来，触发刷新：加载范围不回缩，当前屏不变成占位；
   - 打开一个当天有多张图的格子：封面是当天最新的一张；灯箱打开时主图和封面是同一张，左边是更早的图；
   - 依次切到 `/zh`、`/en`、`/ja`：封面角标显示 自动巡检/插件、Auto patrol/Extension、自動巡回/拡張機能；人工 tag 原样显示；
   - 问答：在问答入口问一句「最近谁开播最早」，能正常作答。
5. 收尾：结束 3002 端口上的服务，确认 worktree 里 `git status` 是干净的。

- [ ] **Step 4: 全分支终审，开 PR**

- 按 subagent-driven-development 的流程派一次全分支终审，要求跨任务整体走查，并对关键判据交出突变探针的击杀表。
- 推送功能分支，开 PR。PR 描述里写：本次改了什么、对拍结果、体积对比、实机验证清单。不写本机路径和人名。结尾附上 `🤖 Generated with [Claude Code](https://claude.com/claude-code)`。
- **合并前先问用户。** 合并后以 Vercel 生产部署状态和线上实测为准，确认首屏、翻页、标签、封面都正常，不凭 CI 绿灯推断已经上线。
