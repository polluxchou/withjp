# 竞品开播记录 · 展示部分 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把导入进来的竞品开播记录画出来：卡片上的入口与单号「开播记录」弹窗（PR-B1），以及跨账号对比的一级页面「开播时段」三视图（PR-B2）。

**Architecture:** 所有计算下沉到 `src/lib/competitors/` 的纯函数（本仓没有 DOM 测试环境，组件里的逻辑测不到）：`liveSessions.ts` 合并两种来源的场次并给出地区时区，`liveStats.ts` 出弹窗里的指标/日历/分布/点赞序列，`liveBoard.ts` 出一级页面的月历矩阵/番组表密度。组件只负责把这些结构画成 DOM。主档算法改在 `liveSlots.ts` 一处，卡片、地区标尺、Ask 面板自动跟上。

**Tech Stack:** Next.js 14 App Router、React 18、next-intl（zh/en/ja）、Tailwind（只用设计 token）、Supabase、`node --test --experimental-strip-types`。

**Spec:** `docs/superpowers/specs/2026-10-10-competitor-live-display-design.md`

**Visual reference（本机，未入库——含竞品真实数据，仓库是 public）：**
`/private/tmp/claude-501/-Users-fengzhou-Code-newWith/5f3de1e1-311d-4b35-a783-2e5eb41cb7f0/scratchpad/design/project/`
下的 `Main.dc.html`（卡片入口）、`Records.dc.html`（弹窗）、`Import.dc.html`（导入视图）、`CountryMonth.dc.html`、`Room.dc.html`、`Timetable.dc.html`。
每个文件的 `<x-dc>` 里是版式，`renderVals()` 里是计算口径——版式照抄、颜色换成 token，计算以本计划的纯函数为准。

## Global Constraints

- 工作目录：`/Users/fengzhou/Code/newWith/.claude/worktrees/live-display`，分支 `feat/competitor-live-display`（叠在 PR 320 的分支上）。每次提交前 `git branch --show-current` 自检。不许 `git stash`，不许动主仓 `/Users/fengzhou/Code/newWith`。
- 仓库是 PUBLIC：测试夹具、注释、提交信息里不出现任何真实竞品 handle / 名称；用 `sample.a`、`Sample LIVE` 之类。
- lib 文件用相对路径 + `.ts` 后缀导入；纯类型导入写 `import type` 或内联 `type`（node --test 不做类型检查，tsc 会）。
- 新测试文件必须登记进 `package.json` 的 `test` 脚本。
- UI 只用设计 token（`ink-*`、`line-*`、`primary*`、`warning-*`、`surface`、`canvas`、`rounded-card/field`、`FOCUS_RING`），数字一律 `tabular-nums`；不写裸 hex；JSX 里不写裸汉字（全部走 `messages/{zh,en,ja}.json`，三语同步，ja 用自然日语）。注释里不写 `(#123)`，写 `PR 123`。
- 图表配色：单系列一律 `primary`；导入场次=实色，截图推断=斜纹（`repeating-linear-gradient(135deg, …)` 写在 `style` 里，颜色用 `rgb(var(--primary) / α)`）；「无数据」=中性斜线格；我方排期=warning 色虚线。
- 竞品开播时刻的显示时区 = `regionTimeZone(account.region, timeZoneForLocale(locale))`；所有显示时刻的标题处写明时区名（`liveZoneNote`，如「时间按日本时间」）。
- 时间轴统一：06:00 → 次日 02:00，即一天里的第 360 → 1560 分钟，15 分钟一格共 80 格。
- 门禁（每个 PR 收尾都要全过，style 门禁在最后一次编辑之后跑）：
  `npx tsc --noEmit` · `npm test` · `npm run test:i18n` · `npm run test:no-bare-han` · `npm run test:style` · `npm run test:lint`

## Review Focus

1. **只有截图、没有导入记录的号**（目前 22/23 个号都是这样）：所有视图都得画得出来，下播时刻标「约」/不标，不能因为 `ended_at` 缺失崩或画成 0 长度。→ Task 2、Task 4 的测试钉住。
2. **跨午夜的场次**（19:19 → 次日 00:24、23:23 → 00:06）：时段条要画到 24 点之后而不是绕回早上；归属日期按开播日。→ Task 3 `spanMinutes` 测试钉住。
3. **凌晨开播（00:30 开播）**：在 06:00→02:00 的轴上应画在最底部（24:30），不能画到顶上；归属日期是**前一天**的夜场还是当天？口径：按开播的当地日期归属，轴上位置按 `minute < 360 ? minute + 1440 : minute`。→ Task 3 测试钉住。
4. **地区没填的号**：时区回落到界面语言时区，月历里归到「地区未填」国家桶不出现（国家筛选只列有代码的）。→ Task 2 测试钉住。
5. **同一账号同一场既有导入又有截图**：只算一场（±10 分钟内认作同一场），场次数不能翻倍。→ Task 2 测试钉住。

---

# PR-B1：场次合并 + 主档算法 + 卡片入口 + 开播记录弹窗

### Task 1: 主档算法改为 45 分钟间隔 + 15% 占比门槛

**Files:**
- Modify: `src/lib/competitors/liveSlots.ts`
- Test: `src/lib/competitors/liveSlots.test.ts`

**Interfaces:**
- Produces: `SLOT_GAP_MINUTES = 45`、`SLOT_MIN_SHARE = 0.15`、`clusterMinutes(minutes: number[]): number[][]`（已排序的一天内分钟数 → 档；含跨午夜首尾合并，末组减 1440）、`summarizeLiveHabit` 签名不变。

- [ ] **Step 1: 写失败测试**（追加到 `liveSlots.test.ts` 末尾，`jst()` 已在文件顶部定义）

```ts
test('密集数据不坍缩：零散场次不能把午场和晚场桥接成一档', () => {
  const lunch = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((m, i) => jst(1 + i, 12, m))
  const evening = [3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((m, i) => jst(1 + i, 19, m))
  // 每隔 50 分钟一场的零散场次：旧算法（<180 分钟连成一档）会把它们和两头全部串起来
  const bridges = [[13, 0], [13, 50], [14, 40], [15, 30], [16, 20], [17, 10], [18, 0]]
    .map(([h, m], i) => jst(1 + i, h, m))
  const h = summarizeLiveHabit([...lunch, ...evening, ...bridges], JST)
  assert.equal(h.sessions, 27)
  assert.deepEqual(h.slots.map((s) => s.label), ['12:05', '19:07'])
  assert.deepEqual(h.slots.map((s) => s.count), [10, 10])
})

test('占比门槛：总场次多时，凑够 3 场的小档也不算主档', () => {
  const main = Array.from({ length: 20 }, (_, i) => jst(1 + (i % 28), 13, 30 + (i % 5)))
  const minor = [jst(1, 22, 0), jst(2, 22, 5), jst(3, 22, 10)]
  const h = summarizeLiveHabit([...main, ...minor], JST)
  // 23 场 × 15% = 3.45 → 门槛 4；22 点那 3 场不够
  assert.deepEqual(h.slots.map((s) => s.label), ['13:32'])
  // 地区标尺传 minSessions=1，占比门槛照样生效
  assert.deepEqual(summarizeLiveHabit([...main, ...minor], JST, 1).slots.map((s) => s.label), ['13:32'])
})

test('场次少时占比门槛不起作用：标尺的 minSessions=1 仍能摆出单场', () => {
  const h = summarizeLiveHabit([jst(1, 13, 30), jst(2, 20, 0)], JST, 1)
  assert.deepEqual(h.slots.map((s) => s.label), ['13:30', '20:00'])
})

test('clusterMinutes: 45 分钟以内连成一档，跨午夜首尾合并', () => {
  assert.deepEqual(clusterMinutes([720, 740, 800, 1140]), [[720, 740], [800], [1140]])
  assert.deepEqual(clusterMinutes([5, 700, 1430]), [[-10, 5], [700]])
})
```

并把文件顶部 import 改成：
```ts
import { SLOT_MIN_SESSIONS, clusterMinutes, minutesToLabel, recentSessionStarts, summarizeLiveHabit } from './liveSlots.ts'
```

- [ ] **Step 2: 跑测试确认失败**

Run: `node --test --experimental-strip-types src/lib/competitors/liveSlots.test.ts`
Expected: FAIL（`clusterMinutes` 不存在；坍缩用例得到一档）

- [ ] **Step 3: 实现**

`liveSlots.ts`：
1. 把 `SLOT_GAP_MINUTES` 改成 45，注释改写成：「相邻开播差 ≥ 45 分钟就算另一档。原来是 180：数据一密，13/15/17/18 点的零散场次会把午场和晚场桥接成一整档（实测 80 场的号坍缩成一档 12:25）。45 分钟仍能容纳同一档常见的十几分钟浮动。」
2. 新增：
```ts
/** 一档至少占总场次的这个比例才算主档。数据密时，凑够 3 场的零散时刻不该被说成规律。 */
export const SLOT_MIN_SHARE = 0.15

/**
 * 已按分钟升序的一天内分钟数 → 档（单链聚类，相邻差 < SLOT_GAP_MINUTES 连成一档）。
 * 跨午夜：首尾两组绕过 24 点仍在间隔内就合并，末组减去一天放到前面（结果里会出现负数）。
 */
export function clusterMinutes(minutes: number[]): number[][] {
  if (minutes.length === 0) return []
  const groups: number[][] = [[minutes[0]]]
  for (let i = 1; i < minutes.length; i += 1) {
    if (minutes[i] - minutes[i - 1] < SLOT_GAP_MINUTES) groups[groups.length - 1].push(minutes[i])
    else groups.push([minutes[i]])
  }
  if (groups.length > 1 && minutes[0] + DAY_MINUTES - minutes[minutes.length - 1] < SLOT_GAP_MINUTES) {
    const last = groups.pop()!
    groups[0] = [...last.map((m) => m - DAY_MINUTES), ...groups[0]].sort((a, b) => a - b)
  }
  return groups
}
```
3. `summarizeLiveHabit` 里用 `clusterMinutes(minutes)` 替换原来手写的分组与跨午夜合并，过滤条件改成：
```ts
const floor = Math.max(minSessions, Math.ceil(withMinutes.length * SLOT_MIN_SHARE))
const slots = groups.filter((g) => g.length >= floor) /* 其余 map/sort 不变 */
```
4. `minSessions` 参数的 JSDoc 补一句：「实际门槛还要与总场次 × SLOT_MIN_SHARE 取大」。

- [ ] **Step 4: 跑测试确认全过**

Run: `node --test --experimental-strip-types src/lib/competitors/liveSlots.test.ts src/lib/competitors/regionRuler.test.ts src/lib/competitors/ask-context.test.ts`
Expected: PASS（原有用例全部保持成立；若 regionRuler/ask-context 有用例依赖 180 分钟间隔，按新口径更新其期望值并在测试里注明原因）

- [ ] **Step 5: Commit**

```bash
git add src/lib/competitors/liveSlots.ts src/lib/competitors/liveSlots.test.ts
git commit -m "fix(competitors): 主档改为 45 分钟间隔 + 15% 占比门槛，密集数据不再坍缩成一档"
```

---

### Task 2: 合并两种来源的场次 + 地区时区

**Files:**
- Create: `src/lib/competitors/liveSessions.ts`
- Test: `src/lib/competitors/liveSessions.test.ts`（登记进 package.json）

**Interfaces:**
- Consumes: `CompetitorLiveSession`、`CompetitorShot`（`types.ts`），`REGION_CODES`/`RegionCode`（`regions.ts`）
- Produces:
```ts
export const REGION_TIME_ZONE: Record<RegionCode, string>
export function regionTimeZone(region: string | null | undefined, fallback: string): string
export const SHOT_MATCH_TOLERANCE_MS: number // 10 分钟
export interface LiveSpan {
  startedAt: string        // toISOString() 写法
  endedAt: string          // 截图推断的 = 该场最后一张截图时刻（下限）
  approxEnd: boolean       // 截图推断 = true
  likes: number | null
  title: string
  source: 'history' | 'shot'
}
export interface LiveSpanInput {
  live_sessions?: { started_at: string; ended_at: string; likes: number | null; title: string }[] | null
  shots?: { stream_started_at: string | null; captured_at: string | null }[] | null
}
export function liveSpansOf(input: LiveSpanInput): LiveSpan[] // 按 startedAt 降序
export function liveStartsOf(input: LiveSpanInput): string[]  // = liveSpansOf(input).map(s => s.startedAt)
```

- [ ] **Step 1: 写失败测试**

```ts
// src/lib/competitors/liveSessions.test.ts
import assert from 'node:assert/strict'
import test from 'node:test'
import { liveSpansOf, liveStartsOf, regionTimeZone } from './liveSessions.ts'

const hist = (start: string, end: string, likes: number | null = 1000) =>
  ({ started_at: start, ended_at: end, likes, title: 'Sample LIVE' })
const shot = (start: string | null, cap: string | null) => ({ stream_started_at: start, captured_at: cap })

test('regionTimeZone: 已知地区给 IANA 时区，未填或未知回落', () => {
  assert.equal(regionTimeZone('JP', 'Asia/Shanghai'), 'Asia/Tokyo')
  assert.equal(regionTimeZone(' kr ', 'Asia/Shanghai'), 'Asia/Seoul')
  assert.equal(regionTimeZone('MY', 'Asia/Shanghai'), 'Asia/Kuala_Lumpur')
  assert.equal(regionTimeZone(null, 'Asia/Shanghai'), 'Asia/Shanghai')
  assert.equal(regionTimeZone('ZZ', 'America/Los_Angeles'), 'America/Los_Angeles')
})

test('只有截图：按开播时刻去重，下播取最后一张截图，标记为估计', () => {
  const spans = liveSpansOf({
    shots: [
      shot('2026-08-20T03:10:00+00:00', '2026-08-20T03:30:00+00:00'),
      shot('2026-08-20T03:10:00+00:00', '2026-08-20T04:45:00+00:00'),
      shot(null, '2026-08-20T05:00:00+00:00'),
      shot('not-a-date', '2026-08-20T05:00:00+00:00'),
    ],
  })
  assert.equal(spans.length, 1)
  assert.deepEqual(spans[0], {
    startedAt: '2026-08-20T03:10:00.000Z', endedAt: '2026-08-20T04:45:00.000Z',
    approxEnd: true, likes: null, title: '', source: 'shot',
  })
})

test('截图时刻早于开播（脏数据）时，下播取开播时刻，不出现负时长', () => {
  const [s] = liveSpansOf({ shots: [shot('2026-08-20T03:10:00Z', '2026-08-20T03:00:00Z')] })
  assert.equal(s.endedAt, s.startedAt)
})

test('导入与截图是同一场（±10 分钟内）只算一场，保留导入那条', () => {
  const spans = liveSpansOf({
    live_sessions: [hist('2026-08-22T03:17:00+00:00', '2026-08-22T05:33:00+00:00', 131800)],
    shots: [
      shot('2026-08-22T03:17:20+00:00', '2026-08-22T04:38:01+00:00'),
      shot('2026-08-23T10:15:20+00:00', '2026-08-23T12:23:10+00:00'),
    ],
  })
  assert.equal(spans.length, 2)
  assert.deepEqual(spans.map((s) => s.source), ['shot', 'history'])
  assert.equal(spans[1].likes, 131800)
  assert.equal(spans[1].approxEnd, false)
})

test('相差超过 10 分钟的截图场次不被吞掉', () => {
  const spans = liveSpansOf({
    live_sessions: [hist('2026-08-22T03:00:00Z', '2026-08-22T05:00:00Z')],
    shots: [shot('2026-08-22T03:11:00Z', '2026-08-22T03:40:00Z')],
  })
  assert.equal(spans.length, 2)
})

test('输出按开播时刻降序，写法统一成 toISOString；liveStartsOf 与之一致', () => {
  const input = {
    live_sessions: [hist('2026-07-13T00:06:00+00:00', '2026-07-13T02:42:00+00:00'), hist('2026-10-09T03:04:00+00:00', '2026-10-09T05:09:00+00:00')],
  }
  assert.deepEqual(liveStartsOf(input), ['2026-10-09T03:04:00.000Z', '2026-07-13T00:06:00.000Z'])
})

test('空输入 / null 字段不崩', () => {
  assert.deepEqual(liveSpansOf({}), [])
  assert.deepEqual(liveSpansOf({ live_sessions: null, shots: null }), [])
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `node --test --experimental-strip-types src/lib/competitors/liveSessions.test.ts`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现**

```ts
// src/lib/competitors/liveSessions.ts
// 一个号的「场次」有两个来源，在这里合成一份：
//   - LIVE History 粘贴导入（competitor_live_sessions）：起止完整、带点赞——权威
//   - 截图推断（competitor_shots.stream_started_at）：只知开播；下播只能拿该场最后一张截图的时刻，是下限
// 同一场两边都有时（开播差 ≤ 10 分钟），以导入的为准。
// 时刻在这里统一成 toISOString() 写法：库里读回来的是 +00:00 写法，下游按字符串比较时刻，写法必须一致。
//
// 显示时区：竞品的开播时刻按**账号所在地区**的时区显示（看的是对方当地作息；且与界面语言无关，
// 三地同事读到同一个数）。地区没填才回落到界面语言时区。
// 纯函数、不读时钟，可单测。
import type { RegionCode } from './regions.ts'
import { normalizeRegion } from './regions.ts'

export const REGION_TIME_ZONE: Record<RegionCode, string> = {
  JP: 'Asia/Tokyo',
  KR: 'Asia/Seoul',
  MY: 'Asia/Kuala_Lumpur',
  TW: 'Asia/Taipei',
  CN: 'Asia/Shanghai',
  TH: 'Asia/Bangkok',
  VN: 'Asia/Ho_Chi_Minh',
  ID: 'Asia/Jakarta',
  // 美国横跨多个时区；竞品目前都在西海岸，先取洛杉矶，与站内英文界面的时区一致。
  US: 'America/Los_Angeles',
}

export function regionTimeZone(region: string | null | undefined, fallback: string): string {
  const code = normalizeRegion(region)
  return code ? REGION_TIME_ZONE[code] : fallback
}

/** 截图推断的开播与导入的开播差在这个范围内就认作同一场（直播间自报的开播时刻带秒，导入的是整分钟）。 */
export const SHOT_MATCH_TOLERANCE_MS = 10 * 60_000

export interface LiveSpan {
  startedAt: string
  endedAt: string
  approxEnd: boolean
  likes: number | null
  title: string
  source: 'history' | 'shot'
}

export interface LiveSpanInput {
  live_sessions?: { started_at: string; ended_at: string; likes: number | null; title: string }[] | null
  shots?: { stream_started_at: string | null; captured_at: string | null }[] | null
}

const ms = (iso: string | null | undefined): number | null => {
  if (!iso) return null
  const t = Date.parse(iso)
  return Number.isNaN(t) ? null : t
}

export function liveSpansOf(input: LiveSpanInput): LiveSpan[] {
  const spans: LiveSpan[] = []
  const histStarts: number[] = []
  for (const s of input.live_sessions ?? []) {
    const start = ms(s.started_at)
    const end = ms(s.ended_at)
    if (start == null || end == null) continue
    histStarts.push(start)
    spans.push({
      startedAt: new Date(start).toISOString(),
      endedAt: new Date(Math.max(end, start)).toISOString(),
      approxEnd: false,
      likes: s.likes ?? null,
      title: s.title ?? '',
      source: 'history',
    })
  }

  // 同一场的多张截图报同一个 stream_started_at：按它分组，下播取最晚那张。
  const lastCapture = new Map<number, number>()
  for (const s of input.shots ?? []) {
    const start = ms(s.stream_started_at)
    if (start == null) continue
    const cap = ms(s.captured_at) ?? start
    lastCapture.set(start, Math.max(lastCapture.get(start) ?? start, cap))
  }
  for (const [start, end] of lastCapture) {
    if (histStarts.some((h) => Math.abs(h - start) <= SHOT_MATCH_TOLERANCE_MS)) continue
    spans.push({
      startedAt: new Date(start).toISOString(),
      endedAt: new Date(end).toISOString(),
      approxEnd: true,
      likes: null,
      title: '',
      source: 'shot',
    })
  }

  return spans.sort((a, b) => (a.startedAt < b.startedAt ? 1 : a.startedAt > b.startedAt ? -1 : 0))
}

export function liveStartsOf(input: LiveSpanInput): string[] {
  return liveSpansOf(input).map((s) => s.startedAt)
}
```

- [ ] **Step 4: 登记测试并跑通**

在 `package.json` 的 `test` 脚本里 `src/lib/competitors/liveHistory.test.ts` 后面加 `src/lib/competitors/liveSessions.test.ts`。
Run: `node --test --experimental-strip-types src/lib/competitors/liveSessions.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/competitors/liveSessions.ts src/lib/competitors/liveSessions.test.ts package.json
git commit -m "feat(competitors): 合并导入与截图两种来源的场次，按账号地区取显示时区"
```

---

### Task 3: 弹窗用的统计纯函数

**Files:**
- Create: `src/lib/competitors/liveStats.ts`
- Modify: `src/lib/time/zonedTime.ts`（加 `addDaysYmd`、`weekdayOfYmd`、`minuteOfDayInZone`）
- Test: `src/lib/competitors/liveStats.test.ts`（登记进 package.json），`src/lib/time/zonedTime.test.ts`（追加）

**Interfaces:**
- Consumes: `LiveSpan`（Task 2），`zonedYmd`（zonedTime.ts，已有）
- Produces:
```ts
// zonedTime.ts
export function addDaysYmd(ymd: string, days: number): string           // 纯日历运算
export function weekdayOfYmd(ymd: string): number                          // 0=周日
export function minuteOfDayInZone(iso: string, timeZone: string): number | null // 0..1439
// liveStats.ts
export const AXIS_START = 360           // 06:00
export const AXIS_END = 1560            // 次日 02:00
export const BUCKET_MINUTES = 15
export const BUCKETS = 80
export interface LocatedSpan extends LiveSpan { date: string; start: number; end: number } // date=开播当地日期；start∈[360,1800)；end=start+时长分钟
export function locateSpans(spans: LiveSpan[], timeZone: string): LocatedSpan[]
export function inRange(located: LocatedSpan[], from: string, to: string): LocatedSpan[] // date ∈ [from,to]
export interface LiveWindowStats {
  sessions: number; liveDays: number; spanDays: number
  avgMinutes: number | null; medianMinutes: number | null; totalMinutes: number
  longestGapDays: number; medianLikes: number | null; perWeek: number
}
export function windowStats(located: LocatedSpan[], from: string, to: string): LiveWindowStats
export interface CalendarDay { date: string; sessions: number; minutes: number; level: 0 | 1 | 2 | 3 | 4; future: boolean; inRange: boolean }
export function calendarWeeks(located: LocatedSpan[], opts: { today: string; weeks: number; rangeFrom: string }): CalendarDay[][] // 每列一周（周一→周日）
export function coverageHistogram(located: LocatedSpan[], from: string, to: string): { shares: number[]; liveDays: number } // shares.length === BUCKETS
export interface LikesBar { startedAt: string; date: string; likes: number; top: boolean }
export function likesSeries(located: LocatedSpan[], from: string, to: string): { bars: LikesBar[]; median: number | null; max: number }
```

口径（写进代码注释）：
- `locateSpans`：`date = zonedYmd(startedAt, tz)`；`start = minuteOfDayInZone(startedAt, tz)`，若 `< AXIS_START` 则 `+1440`（凌晨开播画在轴底部，归属日期仍是开播当地日期）；`end = start + round((endedAt − startedAt)/60000)`。
- `windowStats`：`spanDays` = from..to 的天数；`longestGapDays` = 区间内最长连续无场次天数；`perWeek = round1(sessions / spanDays * 7)`；中位数取偶数个时偏小那个（与 liveSlots 一致）；`medianLikes` 只算 likes 非 null 的场次。
- `calendarWeeks`：最后一列是 `today` 所在周（周一起），共 `weeks` 列；`level`：0=没播，<120 分钟=1，<180=2，<240=3，≥240=4；`future = date > today`；`inRange = date >= rangeFrom`。
- `coverageHistogram`：第 i 格中点 `t = 360 + i*15 + 7`；某天在该格「在播」= 当天任一场 `start <= t < end`；`shares[i] = 在播天数 / 有场次天数`（无场次时全 0）。
- `likesSeries`：区间内 likes 非 null 的场次按开播升序；`top` = likes 最大的两场（并列取先出现的）。

- [ ] **Step 1: 写失败测试**

```ts
// src/lib/competitors/liveStats.test.ts
import assert from 'node:assert/strict'
import test from 'node:test'
import type { LiveSpan } from './liveSessions.ts'
import { calendarWeeks, coverageHistogram, inRange, likesSeries, locateSpans, windowStats } from './liveStats.ts'

const TZ = 'Asia/Tokyo'
/** JST 墙上时间 → UTC ISO */
const j = (ymd: string, hm: string) => new Date(`${ymd}T${hm}:00+09:00`).toISOString()
const span = (ymd: string, from: string, to: string, likes: number | null = 100, endYmd = ymd): LiveSpan => ({
  startedAt: j(ymd, from), endedAt: j(endYmd, to), approxEnd: false, likes, title: '', source: 'history',
})

test('locateSpans: 日期按开播当地日期，跨午夜的下播画到 24 点之后', () => {
  const [s] = locateSpans([span('2026-09-29', '19:19', '00:24', 1, '2026-09-30')], TZ)
  assert.equal(s.date, '2026-09-29')
  assert.equal(s.start, 19 * 60 + 19)
  assert.equal(s.end, 24 * 60 + 24)
})

test('locateSpans: 凌晨开播画在轴底部（+1440），日期仍是开播当地日期', () => {
  const [s] = locateSpans([span('2026-08-24', '00:34', '01:11')], TZ)
  assert.equal(s.date, '2026-08-24')
  assert.equal(s.start, 24 * 60 + 34)
  assert.equal(s.end, 25 * 60 + 11)
})

test('locateSpans: 同一时刻在不同时区落在不同日期', () => {
  const [s] = locateSpans([span('2026-08-24', '08:30', '10:00')], 'America/Los_Angeles')
  assert.equal(s.date, '2026-08-23')
  assert.equal(s.start, 16 * 60 + 30)
})

test('windowStats: 场次、开播天数、平均与中位时长、最长断播、点赞中位数', () => {
  const located = locateSpans([
    span('2026-09-01', '12:00', '14:00', 100),
    span('2026-09-01', '19:00', '22:00', 300),
    span('2026-09-02', '12:00', '13:00', null),
    span('2026-09-06', '12:00', '16:00', 200),
  ], TZ)
  const s = windowStats(located, '2026-09-01', '2026-09-07')
  assert.equal(s.sessions, 4)
  assert.equal(s.liveDays, 3)
  assert.equal(s.spanDays, 7)
  assert.equal(s.totalMinutes, 600)
  assert.equal(s.avgMinutes, 150)
  assert.equal(s.medianMinutes, 120)
  assert.equal(s.longestGapDays, 3) // 09-03..09-05
  assert.equal(s.medianLikes, 200)  // [100,200,300] 中位
  assert.equal(s.perWeek, 4)
})

test('windowStats: 区间内没有场次', () => {
  const s = windowStats([], '2026-09-01', '2026-09-30')
  assert.equal(s.sessions, 0)
  assert.equal(s.avgMinutes, null)
  assert.equal(s.medianLikes, null)
  assert.equal(s.longestGapDays, 30)
})

test('calendarWeeks: 最后一列是今天所在周，按当天总时长分档，未来日与范围外标记', () => {
  const located = locateSpans([
    span('2026-10-05', '12:00', '13:00'),  // 60 → 1
    span('2026-10-06', '12:00', '15:00'),  // 180 → 3
    span('2026-10-07', '19:00', '23:30'),  // 270 → 4
  ], TZ)
  const weeks = calendarWeeks(located, { today: '2026-10-08', weeks: 2, rangeFrom: '2026-10-01' })
  assert.equal(weeks.length, 2)
  assert.equal(weeks[1][0].date, '2026-10-05') // 周一
  assert.deepEqual(weeks[1].slice(0, 3).map((d) => d.level), [1, 3, 4])
  assert.equal(weeks[1][3].future, false)       // 10-08 是今天
  assert.equal(weeks[1][4].future, true)
  assert.equal(weeks[0][0].date, '2026-09-28')
  assert.equal(weeks[0][0].inRange, false)
  assert.equal(weeks[0][3].inRange, true)       // 10-01
})

test('coverageHistogram: 份额 = 该刻在播的天数 / 开播天数', () => {
  const located = locateSpans([
    span('2026-09-01', '12:00', '14:00'),
    span('2026-09-02', '12:00', '13:00'),
  ], TZ)
  const { shares, liveDays } = coverageHistogram(located, '2026-09-01', '2026-09-30')
  assert.equal(shares.length, 80)
  assert.equal(liveDays, 2)
  const idx = (h: number, m: number) => (h * 60 + m - 360) / 15
  assert.equal(shares[idx(12, 0)], 1)
  assert.equal(shares[idx(13, 15)], 0.5)
  assert.equal(shares[idx(14, 0)], 0)
})

test('likesSeries: 升序、跳过无点赞、标出最高两场与中位数', () => {
  const located = locateSpans([
    span('2026-09-03', '12:00', '13:00', 50),
    span('2026-09-01', '12:00', '13:00', 900),
    span('2026-09-02', '12:00', '13:00', null),
    span('2026-09-04', '12:00', '13:00', 400),
  ], TZ)
  const r = likesSeries(located, '2026-09-01', '2026-09-30')
  assert.deepEqual(r.bars.map((b) => b.likes), [900, 50, 400])
  assert.deepEqual(r.bars.map((b) => b.top), [true, false, true])
  assert.equal(r.median, 400)
  assert.equal(r.max, 900)
})

test('inRange: 闭区间按日期字符串比较', () => {
  const located = locateSpans([span('2026-09-01', '12:00', '13:00'), span('2026-09-10', '12:00', '13:00')], TZ)
  assert.equal(inRange(located, '2026-09-01', '2026-09-09').length, 1)
})
```

zonedTime.test.ts 追加：
```ts
test('addDaysYmd / weekdayOfYmd: 纯日历运算，跨月跨年', () => {
  assert.equal(addDaysYmd('2026-12-31', 1), '2027-01-01')
  assert.equal(addDaysYmd('2026-03-01', -1), '2026-02-28')
  assert.equal(weekdayOfYmd('2026-10-09'), 5)
})

test('minuteOfDayInZone: 按时区取一天里的第几分钟', () => {
  assert.equal(minuteOfDayInZone('2026-10-09T03:04:00Z', 'Asia/Tokyo'), 12 * 60 + 4)
  assert.equal(minuteOfDayInZone('bad', 'Asia/Tokyo'), null)
})
```
（同时把这三个函数加进该测试文件顶部的 import。）

- [ ] **Step 2: 跑测试确认失败**

Run: `node --test --experimental-strip-types src/lib/competitors/liveStats.test.ts src/lib/time/zonedTime.test.ts`
Expected: FAIL

- [ ] **Step 3: 实现**

zonedTime.ts 追加：
```ts
/** YYYY-MM-DD 加减天数（纯日历运算，按 UTC 零点算，与任何时区无关）。 */
export function addDaysYmd(ymd: string, days: number): string {
  const d = new Date(`${ymd}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

/** YYYY-MM-DD 是星期几（0=周日）。 */
export function weekdayOfYmd(ymd: string): number {
  return new Date(`${ymd}T00:00:00Z`).getUTCDay()
}

/** UTC 时刻在指定时区是一天里的第几分钟（0–1439）。时刻非法返回 null。 */
export function minuteOfDayInZone(instant: Date | string | number, timeZone: string): number | null {
  const t = new Date(instant).getTime()
  if (Number.isNaN(t)) return null
  const p = zonedParts(t, timeZone)
  return p.hour * 60 + p.minute
}
```

liveStats.ts：按上面「口径」实现，结构如下（完整写出，不要省略）：
```ts
// src/lib/competitors/liveStats.ts
// 开播记录弹窗里的指标、日历、时段分布、点赞序列。纯函数、不读时钟（today 由调用方注入）。
// 轴统一 06:00 → 次日 02:00（第 360 → 1560 分钟），15 分钟一格。
import type { LiveSpan } from './liveSessions.ts'
import { addDaysYmd, minuteOfDayInZone, weekdayOfYmd, zonedYmd } from '../time/zonedTime.ts'

export const AXIS_START = 360
export const AXIS_END = 1560
export const BUCKET_MINUTES = 15
export const BUCKETS = (AXIS_END - AXIS_START) / BUCKET_MINUTES

export interface LocatedSpan extends LiveSpan { date: string; start: number; end: number }

export function locateSpans(spans: LiveSpan[], timeZone: string): LocatedSpan[] {
  const out: LocatedSpan[] = []
  for (const s of spans) {
    const date = zonedYmd(s.startedAt, timeZone)
    const minute = minuteOfDayInZone(s.startedAt, timeZone)
    if (date == null || minute == null) continue
    const start = minute < AXIS_START ? minute + 1440 : minute
    const dur = Math.max(0, Math.round((Date.parse(s.endedAt) - Date.parse(s.startedAt)) / 60_000))
    out.push({ ...s, date, start, end: start + dur })
  }
  return out
}

export function inRange(located: LocatedSpan[], from: string, to: string): LocatedSpan[] {
  return located.filter((s) => s.date >= from && s.date <= to)
}

/** 偶数个取偏小那个，与 liveSlots 的中位数口径一致。 */
function lowerMedian(values: number[]): number | null {
  if (!values.length) return null
  const v = values.slice().sort((a, b) => a - b)
  return v[Math.floor((v.length - 1) / 2)]
}

function daysBetweenInclusive(from: string, to: string): string[] {
  const out: string[] = []
  for (let d = from; d <= to; d = addDaysYmd(d, 1)) out.push(d)
  return out
}

export interface LiveWindowStats { /* 同 Interfaces */ }

export function windowStats(located: LocatedSpan[], from: string, to: string): LiveWindowStats {
  const w = inRange(located, from, to)
  const days = daysBetweenInclusive(from, to)
  const live = new Set(w.map((s) => s.date))
  let run = 0
  let gap = 0
  for (const d of days) { if (live.has(d)) run = 0; else { run += 1; gap = Math.max(gap, run) } }
  const minutes = w.map((s) => s.end - s.start)
  const total = minutes.reduce((a, b) => a + b, 0)
  return {
    sessions: w.length,
    liveDays: live.size,
    spanDays: days.length,
    avgMinutes: w.length ? Math.round(total / w.length) : null,
    medianMinutes: lowerMedian(minutes),
    totalMinutes: total,
    longestGapDays: gap,
    medianLikes: lowerMedian(w.map((s) => s.likes).filter((l): l is number => l != null)),
    perWeek: days.length ? Math.round((w.length / days.length) * 7 * 10) / 10 : 0,
  }
}

export interface CalendarDay { date: string; sessions: number; minutes: number; level: 0 | 1 | 2 | 3 | 4; future: boolean; inRange: boolean }

function levelOf(minutes: number, sessions: number): CalendarDay['level'] {
  if (!sessions) return 0
  return minutes >= 240 ? 4 : minutes >= 180 ? 3 : minutes >= 120 ? 2 : 1
}

export function calendarWeeks(
  located: LocatedSpan[],
  opts: { today: string; weeks: number; rangeFrom: string },
): CalendarDay[][] {
  const byDay = new Map<string, { n: number; m: number }>()
  for (const s of located) {
    const cur = byDay.get(s.date) ?? { n: 0, m: 0 }
    byDay.set(s.date, { n: cur.n + 1, m: cur.m + (s.end - s.start) })
  }
  const monday = addDaysYmd(opts.today, -((weekdayOfYmd(opts.today) + 6) % 7))
  const first = addDaysYmd(monday, -7 * (opts.weeks - 1))
  const cols: CalendarDay[][] = []
  for (let w = 0; w < opts.weeks; w += 1) {
    const col: CalendarDay[] = []
    for (let d = 0; d < 7; d += 1) {
      const date = addDaysYmd(first, w * 7 + d)
      const rec = byDay.get(date)
      col.push({
        date, sessions: rec?.n ?? 0, minutes: rec?.m ?? 0, level: levelOf(rec?.m ?? 0, rec?.n ?? 0),
        future: date > opts.today, inRange: date >= opts.rangeFrom,
      })
    }
    cols.push(col)
  }
  return cols
}

export function coverageHistogram(located: LocatedSpan[], from: string, to: string): { shares: number[]; liveDays: number } {
  const w = inRange(located, from, to)
  const liveDays = new Set(w.map((s) => s.date)).size
  const shares: number[] = []
  for (let i = 0; i < BUCKETS; i += 1) {
    const t = AXIS_START + i * BUCKET_MINUTES + 7
    const days = new Set(w.filter((s) => s.start <= t && t < s.end).map((s) => s.date))
    shares.push(liveDays ? days.size / liveDays : 0)
  }
  return { shares, liveDays }
}

export interface LikesBar { startedAt: string; date: string; likes: number; top: boolean }

export function likesSeries(located: LocatedSpan[], from: string, to: string): { bars: LikesBar[]; median: number | null; max: number } {
  const w = inRange(located, from, to)
    .filter((s): s is LocatedSpan & { likes: number } => s.likes != null)
    .sort((a, b) => (a.startedAt < b.startedAt ? -1 : 1))
  const topIdx = w.map((s, i) => ({ i, l: s.likes })).sort((a, b) => b.l - a.l || a.i - b.i).slice(0, 2).map((x) => x.i)
  return {
    bars: w.map((s, i) => ({ startedAt: s.startedAt, date: s.date, likes: s.likes, top: topIdx.includes(i) })),
    median: lowerMedian(w.map((s) => s.likes)),
    max: w.reduce((m, s) => Math.max(m, s.likes), 0),
  }
}
```

- [ ] **Step 4: 登记测试并跑通**

`package.json` 的 `test` 加 `src/lib/competitors/liveStats.test.ts`。
Run: `node --test --experimental-strip-types src/lib/competitors/liveStats.test.ts src/lib/time/zonedTime.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/competitors/liveStats.ts src/lib/competitors/liveStats.test.ts src/lib/time/zonedTime.ts src/lib/time/zonedTime.test.ts package.json
git commit -m "feat(competitors): 开播记录弹窗的指标、日历、时段分布与点赞序列（纯函数）"
```

---

### Task 4: 卡片「常见开播」、地区标尺、Ask 面板改吃合并场次；地区时区

**Files:**
- Modify: `src/lib/competitors/regionRuler.ts`（`RulerInput` 加 `live_sessions?`，starts 改用 `liveStartsOf`）
- Modify: `src/components/competitors/RegionLiveRuler.tsx`（`timeZone: regionTimeZone(region, timeZoneForLocale(locale))`）
- Modify: `src/lib/competitors/ask-context.ts`（`liveHabitOf` 的 `allStarts` 改用 `liveStartsOf(c)`；时区不动）
- Modify: `src/components/competitors/CompetitorCard.tsx`（habit / recentSessions 用 `liveStartsOf(c)` + `regionTimeZone(c.region, timeZoneForLocale(locale))`）
- Modify: `src/lib/time/zonedTime.ts`（加 `formatDayTimeInZone(iso, timeZone): string | null`，`MM-DD HH:mm`，与 `formatDayTimeInLocaleZone` 同版式）
- Test: `src/lib/competitors/regionRuler.test.ts`、`src/lib/competitors/ask-context.test.ts`、`src/lib/time/zonedTime.test.ts`（各追加）

**Interfaces:**
- Consumes: `liveStartsOf`、`regionTimeZone`（Task 2）
- Produces: `formatDayTimeInZone`

- [ ] **Step 1: 写失败测试**

regionRuler.test.ts 追加（沿用该文件已有的夹具构造方式；`now` 与窗口照抄文件里现有用例）：
```ts
test('标尺把导入的场次也算进去，同一场的截图不重复计', () => {
  const now = '2026-10-10T00:00:00Z'
  const ruler = buildRegionRuler({
    competitors: [{
      id: 'a', handle: 'sample.a', region: 'JP',
      live_sessions: [
        { started_at: '2026-10-08T03:04:00+00:00', ended_at: '2026-10-08T05:09:00+00:00', likes: 1, title: '' },
        { started_at: '2026-10-09T03:06:00+00:00', ended_at: '2026-10-09T05:00:00+00:00', likes: 1, title: '' },
      ],
      shots: [{ stream_started_at: '2026-10-09T03:06:30+00:00', captured_at: '2026-10-09T04:00:00+00:00' }],
    }],
    region: 'JP', timeZone: 'Asia/Tokyo', now,
  })
  assert.equal(ruler.sessions, 2)
  assert.equal(ruler.rows[0].sessions, 2)
})
```
（`RulerInput.shots` 的元素类型同时补 `captured_at?: string | null`。）

ask-context.test.ts 追加一条：构造一个只有 `live_sessions`（3 场、都在 14 天窗口内、同一时刻 12:0x JST）且 `shots: []` 的竞品，断言 `liveHabit.sessionsInWindow === 3` 且 `slots[0].sessions === 3`（照该文件已有的 `buildAskContext` 夹具写法构造，补 `live_sessions` 字段）。

zonedTime.test.ts 追加：
```ts
test('formatDayTimeInZone: MM-DD HH:mm，非法返回 null', () => {
  assert.equal(formatDayTimeInZone('2026-10-09T03:04:00Z', 'Asia/Tokyo'), '10-09 12:04')
  assert.equal(formatDayTimeInZone(null, 'Asia/Tokyo'), null)
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `node --test --experimental-strip-types src/lib/competitors/regionRuler.test.ts src/lib/competitors/ask-context.test.ts src/lib/time/zonedTime.test.ts`
Expected: FAIL

- [ ] **Step 3: 实现**

- `regionRuler.ts`：`RulerInput` 加
  `live_sessions?: { started_at: string; ended_at: string; likes: number | null; title: string }[] | null`，
  `shots` 元素类型加 `captured_at?: string | null`；
  循环里 `const starts = liveStartsOf({ live_sessions: c.live_sessions, shots: (c.shots ?? []).map((s) => ({ stream_started_at: s.stream_started_at ?? null, captured_at: s.captured_at ?? null })) }).filter(/* 原窗口过滤 */)`。顶部注释「证据只有一种」改写为两种来源。
- `RegionLiveRuler.tsx`：`timeZone: regionTimeZone(region, timeZoneForLocale(locale))`；浮层标题旁加一行 `t('liveZoneNote', { zone: t(\`zoneName.${region}\`) })`（地区未知时不显示）。
- `ask-context.ts`：`liveHabitOf` 里 `const allStarts = liveStartsOf(c).filter((iso) => Date.parse(iso) <= nowMs)`；其余不动。
- `zonedTime.ts`：
```ts
/** UTC 时刻 → 指定时区的「MM-DD HH:mm」（24 小时制）。与 localeZone.formatDayTimeInLocaleZone 同版式，只是时区由调用方给。 */
export function formatDayTimeInZone(iso: string | null | undefined, timeZone: string): string | null {
  if (!iso) return null
  const ymd = zonedYmd(iso, timeZone)
  const hm = zonedHm(iso, timeZone)
  return ymd && hm ? `${ymd.slice(5)} ${hm}` : null
}
```
- `CompetitorCard.tsx`：
```ts
const liveZone = regionTimeZone(c.region, timeZoneForLocale(locale))
const starts = useMemo(() => liveStartsOf(c), [c])
const habit = useMemo(() => summarizeLiveHabit(starts, liveZone), [starts, liveZone])
const recentSessions = useMemo(
  () => recentSessionStarts(starts, RECENT_SESSIONS).map((iso) => formatDayTimeInZone(iso, liveZone)).filter((l): l is string => l != null),
  [starts, liveZone],
)
```
  `liveSlotsLatest` 那一支同样换成 `formatDayTimeInZone(habit.latestStartedAt, liveZone)`。
- i18n（三语）：`competitors.zoneName.{JP,KR,MY,TW,CN,TH,VN,ID,US}`（zh：日本时间/韩国时间/马来西亚时间/台湾时间/北京时间/泰国时间/越南时间/印尼西部时间/美国太平洋时间；en：Japan time/Korea time/Malaysia time/Taiwan time/China time/Thailand time/Vietnam time/Western Indonesia time/US Pacific time；ja：日本時間/韓国時間/マレーシア時間/台湾時間/中国時間/タイ時間/ベトナム時間/インドネシア西部時間/米国太平洋時間），`competitors.liveZoneNote`（zh「时间按{zone}」/ en「Times in {zone}」/ ja「時刻は{zone}」）。

- [ ] **Step 4: 跑全部测试 + tsc**

Run: `npx tsc --noEmit && npm test`
Expected: tsc 无输出；tests 全过

- [ ] **Step 5: Commit**

```bash
git add -A src/lib src/components messages
git commit -m "feat(competitors): 常见开播、地区标尺、Ask 改吃合并后的场次，开播时刻按账号地区时区显示"
```

---

### Task 5: 开播记录弹窗 + 卡片入口（导入并入弹窗）

**Files:**
- Create: `src/components/competitors/live/LiveSessionsModal.tsx`（弹窗壳：`view: 'records' | 'import'`）
- Create: `src/components/competitors/live/LiveRecordsPanel.tsx`（记录视图：范围切换 + 下列 5 块）
- Create: `src/components/competitors/live/LiveKpiTiles.tsx`、`LiveCalendar.tsx`、`LiveCoverageHistogram.tsx`、`LiveLikesBars.tsx`、`LiveSessionTable.tsx`
- Modify: `src/components/competitors/LiveSessionImport.tsx` → 拆出 `LiveImportPanel`（原 `LiveImportModal` 的正文 + 自带的操作按钮行，不再自己套 `Modal`），原 `LiveSessionImport` 改名 `LiveSessionsRow`（档案行），打开 `LiveSessionsModal`
- Modify: `src/components/competitors/CompetitorCard.tsx`（指标行加「近 30 天 N 场 ›」按钮；档案行用 `LiveSessionsRow`；两处共用一个 `liveModal` state）
- Modify: `messages/{zh,en,ja}.json`

**Interfaces:**
- Consumes: `liveSpansOf`、`regionTimeZone`（Task 2），`locateSpans`/`windowStats`/`calendarWeeks`/`coverageHistogram`/`likesSeries`/`AXIS_START`/`BUCKETS`（Task 3），`summarizeLiveHabit`（Task 1），`zonedYmd`/`addDaysYmd`/`zonedHm`（zonedTime），`formatCount`（metrics），`Modal`/`Button`/`SegmentedControl`（components/ui）
- Produces:
```ts
// LiveSessionsModal.tsx
export default function LiveSessionsModal(props: {
  competitor: CompetitorWithHistory
  canEdit: boolean
  initialView: 'records' | 'import'
  onClose: () => void
  onChanged: () => void
}): JSX.Element
```

版式照 `Records.dc.html` / `Import.dc.html`：
- `Modal width="max-w-5xl"`，标题 `t('liveRecordsTitle', { name })`；正文顶部一行：来源与时区说明（`liveRecordsMeta` + `liveZoneNote`）、`SegmentedControl`（`近 30 天` / `全部 {n} 场`）、canEdit 时「粘贴导入」按钮（切到 import 视图）。
- import 视图顶部一个「‹ 开播记录」文字按钮切回；导入成功：`onChanged()` 后切回 records 视图（不关弹窗）。
- `today` = `zonedYmd(Date.now(), liveZone)`，只在弹窗挂载时取一次（`useState(() => …)`）。近 30 天：`from = addDaysYmd(today, -29)`, `to = today`；前 30 天：`addDaysYmd(today, -59)` ～ `addDaysYmd(today, -30)`；全部：最早一场的 `date` ～ today。
- **KPI 6 格**（`LiveKpiTiles`）：场次 / 开播天数 `liveDays / spanDays` / 平均单场 / 总时长（小时，取整）/ 最长连续断播 / 单场点赞中位数（`formatCount`）；近 30 天视图每格下方一行「前 30 天 …」，全部视图下方给周均等补充。时长统一 `t('liveDurationHm', { h, m })`（「2时42分」/ ja「2時間42分」/ en「2h 42m」）。
- **开播日历**（`LiveCalendar`）：`calendarWeeks(located, { today, weeks: 13, rangeFrom: from })`；7 行 × 13 列 18px 格；level 0 用 `bg-line-soft`，1–4 用 `primary` 的 0.22/0.42/0.66/1.0 透明度（`style={{ backgroundColor: \`rgb(var(--primary) / ${a})\` }}`）；future 虚线框；`!inRange` 加 `opacity-30`；每格 `title` = `MM-DD 周X · N 场 · 时长` / `未播`；月份标签放在该周含 1 号的列顶。
- **时段分布**（`LiveCoverageHistogram`）：80 根柱，高度 `share × 120px`；Y 轴 50%/100% 虚线；X 刻度 06/09/12/15/18/21/24/02；主档竖线用 `summarizeLiveHabit(range 内 startedAt, liveZone).slots`，标签 `HH:mm · N 场`（`slot.startMinutes < 360` 的加 1440 后定位）；底部一句 `liveSlotFoot`（主档列表 + 其余 N 场不成档）。
- **每场点赞**（`LiveLikesBars`）：`likesSeries`；柱高 `likes/max × 148px`，最低 2px，`rounded-t`；中位数虚线；`top` 的柱上方标 `MM-DD · 1.6M`；X 轴每 `ceil(n/9)` 根标一个 `MM-DD`；每根 `title` = 日期 星期 时段 点赞。没有任何点赞（全是截图场次）时整块替换成一行说明 `liveLikesEmpty`。
- **场次清单**（`LiveSessionTable`）：范围内场次降序，默认 8 行，「查看全部 N 场 / 收起」；列：日期+星期 / 时段（跨午夜下播后标 `+1`；`approxEnd` 的下播前加 `t('approxPrefix')`「约」）/ 时长 / 点赞（null 显示 —）/ 标题（空显示 —）/ 来源（截图推断时显示小标签）。
- 卡片指标行：`近 30 天 N 场 ›` 是 `<button>`（N 用同一套 `windowStats` 算，N=0 不渲染），点了 `setLiveModal('records')`。
- 档案行 `LiveSessionsRow`：有场次（含截图推断）显示 `N 场 · MM-DD ～ MM-DD` + 「查看」；没有任何场次显示「暂无」+（canEdit 时）「粘贴导入」→ `setLiveModal('import')`。
- 新 i18n 键（三语同步，键名以 `liveRecords*` / `live*` 开头，复用已有 `liveImport*`）。

- [ ] **Step 1: 拆 `LiveImportPanel`**：把 `LiveSessionImport.tsx` 里 `LiveImportModal` 的正文与提交逻辑原样搬进 `LiveImportPanel({ competitorId, existing, onImported, onCancel })`，把原来放在 `Modal footer` 的错误提示 + 取消/导入按钮改成正文底部的一行（`flex justify-end gap-2 border-t border-line-soft pt-3`）。行为不变。
- [ ] **Step 2: 写 `LiveSessionsModal` + `LiveRecordsPanel` + 5 个子组件**（逻辑只调 Task 2/3 的纯函数，组件里不写统计）
- [ ] **Step 3: 接到 `CompetitorCard`**（指标行按钮、档案行、一个 `liveModal: null | 'records' | 'import'` state）
- [ ] **Step 4: i18n 三语 + 门禁**

Run: `npx tsc --noEmit && npm test && npm run test:i18n && npm run test:no-bare-han && npm run test:lint && npm run test:style`
Expected: 全过

- [ ] **Step 5: 生产构建实机走查**（dev 的 StrictMode 会让批量取数卡 loading，视觉验证走生产构建）

```bash
npx next build && npx next start -p 3021
```
登录后打开 `/zh/competitors`：展开任一有截图的竞品卡 → 点「查看」→ 弹窗五块都画出来、切「全部」数字变化、点「粘贴导入」进导入视图再「‹ 开播记录」返回；`/ja`、`/en` 各看一遍文案不溢出。用 JS 读 DOM 断言（截图会滞后于点击）。

- [ ] **Step 6: Commit**

```bash
git add -A src/components messages
git commit -m "feat(competitors): 开播记录弹窗（指标/日历/时段分布/点赞/清单）+ 卡片入口，粘贴导入并入弹窗"
```

**PR-B1 收尾**：推分支，开 PR（base = `main`，若 PR 320 未合则 base = `feat/competitor-live-sessions-import`），描述写清新主档算法与时区口径的变化。

---

# PR-B2：开播时段一级页面

### Task 6: 一级页面的数据与月历/番组表纯函数

**Files:**
- Create: `src/lib/competitors/liveBoard.ts`
- Test: `src/lib/competitors/liveBoard.test.ts`（登记进 package.json）

**Interfaces:**
- Consumes: `LiveSpan`/`liveSpansOf`/`regionTimeZone`（Task 2），`locateSpans`/`LocatedSpan`/`AXIS_START`/`BUCKETS`/`BUCKET_MINUTES`（Task 3），`clusterMinutes`/`SLOT_MIN_SHARE`/`SLOT_MIN_SESSIONS`（Task 1），`addDaysYmd`/`weekdayOfYmd`（zonedTime）
- Produces:
```ts
export const OUR_SCHEDULE_JST: readonly (readonly [number, number])[] // [[870,1050],[1110,1290]]，14:30–17:30、18:30–21:30
export interface LiveAccount {
  id: string; handle: string; name: string; region: string | null; company: string | null
  spans: LiveSpan[]
}
export function flattenAccounts(
  competitors: CompetitorWithHistory[],
  companyOf: Record<string, string>,   // competitor_id → 公司名；子账号查不到时用父账号的
): LiveAccount[]                         // 递归展开 related；没有任何场次的号也保留（月历里不列，由视图过滤）
export function monthDays(month: string /* YYYY-MM */): string[]
export interface MonthCell {
  date: string
  status: 'live' | 'idle' | 'nodata'
  bars: { start: number; end: number; approx: boolean }[]   // 轴上分钟，已按 start 升序
  firstStart: number | null
  tip: { start: number; end: number; approx: boolean }[]
}
export function hasData(spans: LocatedSpan[], date: string, patrolDays: ReadonlySet<string>): boolean
// 有导入场次：date ∈ [最早导入场次 date, 最晚导入场次 date] → true；否则看 patrolDays（截图巡检跑过的日子）
export function monthRow(account: LiveAccount, month: string, timeZone: string, patrolDays: ReadonlySet<string>): {
  cells: MonthCell[]; liveDays: number; earliest: number | null; latest: number | null
}
export function monthTotals(rows: MonthCell[][]): { live: number; withData: number }[]
export interface DensityColumn {
  shares: number[]                                   // BUCKETS 格，在播天数占比
  slots: { start: number; end: number | null; count: number }[] // end 只在该档全是导入场次时给中位下播
  sessions: number
  source: 'history' | 'shot' | 'mixed' | 'none'
}
export function densityColumn(spans: LiveSpan[], opts: { from: string; to: string; timeZone: string }): DensityColumn
export function peakBucket(columns: number[][], threshold?: number): { index: number; count: number } | null // threshold 默认 0.3
export function patrolDaysOf(shotDates: (string | null)[]): Set<string>
```

口径：
- `monthRow`：场次按 `locateSpans(account.spans, timeZone)` 落到日期；`status`：有场次=live；无场次但 `hasData`=idle；否则 nodata。`earliest/latest` = 本月各天第一场开播分钟的最小/最大。
- `densityColumn`：区间内场次，份额算法同 `coverageHistogram`；`slots` = 对开播分钟（轴上分钟，≥360）`clusterMinutes` 后按 `max(SLOT_MIN_SESSIONS, ceil(n × SLOT_MIN_SHARE))` 过滤（场次 < SLOT_MIN_SESSIONS 时门槛降到 2，保证截图号也能标出时刻），`start` 取下中位；`end` 只在该档全部是 `history` 来源时取下播分钟的下中位。
- `peakBucket`：每格统计 `share >= threshold` 的列数，取最多的那一格（并列取最早）；全为 0 返回 null。

- [ ] **Step 1: 写失败测试**

```ts
// src/lib/competitors/liveBoard.test.ts
import assert from 'node:assert/strict'
import test from 'node:test'
import type { LiveSpan } from './liveSessions.ts'
import { densityColumn, hasData, monthDays, monthRow, monthTotals, patrolDaysOf, peakBucket } from './liveBoard.ts'
import { locateSpans } from './liveStats.ts'

const TZ = 'Asia/Tokyo'
const j = (ymd: string, hm: string) => new Date(`${ymd}T${hm}:00+09:00`).toISOString()
const h = (ymd: string, a: string, b: string, endYmd = ymd): LiveSpan =>
  ({ startedAt: j(ymd, a), endedAt: j(endYmd, b), approxEnd: false, likes: 1, title: '', source: 'history' })
const s = (ymd: string, a: string, b: string): LiveSpan =>
  ({ startedAt: j(ymd, a), endedAt: j(ymd, b), approxEnd: true, likes: null, title: '', source: 'shot' })
const acc = (spans: LiveSpan[]) => ({ id: 'x', handle: 'sample.a', name: 'Sample', region: 'JP', company: null, spans })

test('monthDays: 月份天数含闰年', () => {
  assert.equal(monthDays('2026-09').length, 30)
  assert.equal(monthDays('2028-02').length, 29)
  assert.equal(monthDays('2026-08')[0], '2026-08-01')
})

test('hasData: 导入号看首末场之间，截图号看巡检日', () => {
  const hist = locateSpans([h('2026-08-10', '12:00', '13:00'), h('2026-08-20', '12:00', '13:00')], TZ)
  assert.equal(hasData(hist, '2026-08-15', new Set()), true)
  assert.equal(hasData(hist, '2026-08-21', new Set()), false)
  const shot = locateSpans([s('2026-08-19', '13:30', '14:00')], TZ)
  assert.equal(hasData(shot, '2026-08-20', new Set(['2026-08-20'])), true)
  assert.equal(hasData(shot, '2026-08-27', new Set(['2026-08-20'])), false)
})

test('monthRow: 有场次=live、有数据没场次=idle、其余=nodata；跨午夜画到 24 点后', () => {
  const row = monthRow(acc([h('2026-09-01', '12:00', '14:00'), h('2026-09-03', '19:19', '00:24', '2026-09-04')]), '2026-09', TZ, new Set())
  assert.equal(row.cells.length, 30)
  assert.equal(row.cells[0].status, 'live')
  assert.equal(row.cells[1].status, 'idle')
  assert.equal(row.cells[2].bars[0].end, 24 * 60 + 24)
  assert.equal(row.cells[4].status, 'nodata')
  assert.equal(row.liveDays, 2)
  assert.equal(row.earliest, 12 * 60)
  assert.equal(row.latest, 19 * 60 + 19)
})

test('monthTotals: 每天开播号数与有数据号数', () => {
  const a = monthRow(acc([h('2026-09-01', '12:00', '13:00'), h('2026-09-02', '12:00', '13:00')]), '2026-09', TZ, new Set())
  const b = monthRow(acc([s('2026-09-02', '12:00', '13:00')]), '2026-09', TZ, new Set(['2026-09-01', '2026-09-02']))
  const t = monthTotals([a.cells, b.cells])
  assert.deepEqual(t[0], { live: 1, withData: 2 })
  assert.deepEqual(t[1], { live: 2, withData: 2 })
  assert.deepEqual(t[2], { live: 0, withData: 0 })
})

test('densityColumn: 导入档给出开播与下播中位，截图档只给开播', () => {
  const hist = densityColumn([
    h('2026-09-01', '12:05', '14:40'), h('2026-09-02', '12:07', '14:45'), h('2026-09-03', '12:10', '14:50'),
  ], { from: '2026-09-01', to: '2026-09-30', timeZone: TZ })
  assert.deepEqual(hist.slots, [{ start: 12 * 60 + 7, end: 14 * 60 + 45, count: 3 }])
  assert.equal(hist.source, 'history')
  const shot = densityColumn([s('2026-08-19', '13:30', '14:00'), s('2026-08-20', '13:35', '14:10')], { from: '2026-08-01', to: '2026-08-31', timeZone: TZ })
  assert.deepEqual(shot.slots, [{ start: 13 * 60 + 30, end: null, count: 2 }])
  assert.equal(shot.source, 'shot')
  assert.equal(densityColumn([], { from: '2026-08-01', to: '2026-08-31', timeZone: TZ }).source, 'none')
})

test('peakBucket: 份额过门槛的列数最多的那一格', () => {
  const a = new Array(80).fill(0); const b = new Array(80).fill(0)
  a[24] = 0.5; b[24] = 0.4; b[52] = 0.9
  assert.deepEqual(peakBucket([a, b]), { index: 24, count: 2 })
  assert.equal(peakBucket([new Array(80).fill(0)]), null)
})

test('patrolDaysOf: 去重去空', () => {
  assert.deepEqual([...patrolDaysOf(['2026-08-18', null, '2026-08-18', '2026-08-19'])].sort(), ['2026-08-18', '2026-08-19'])
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `node --test --experimental-strip-types src/lib/competitors/liveBoard.test.ts`
Expected: FAIL

- [ ] **Step 3: 实现** `liveBoard.ts`（按 Interfaces 与口径完整实现；`flattenAccounts` 用 `liveSpansOf(c)` 并递归 `c.related`，子账号 `company = companyOf[child.id] ?? companyOf[parent.id] ?? null`，`name = c.latest?.display_name ?? c.display_name ?? c.handle`）。文件头注释说明三件事：轴 06→02、「无数据≠没播」的判定、我方排期常量的来历（`liveSlots.ts` 注释里的 14:30–17:30 / 18:30–21:30）。

- [ ] **Step 4: 登记并跑通** — `package.json` 加 `src/lib/competitors/liveBoard.test.ts`；Run 同 Step 2，Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/competitors/liveBoard.ts src/lib/competitors/liveBoard.test.ts package.json
git commit -m "feat(competitors): 开播时段页的月历矩阵与番组表密度（纯函数）"
```

---

### Task 7: 路由、tab、服务端数据、视图切换 + 国家月历

**Files:**
- Create: `src/app/[locale]/(app)/competitors/live/page.tsx`
- Create: `src/components/competitors/live/CompetitorLiveView.tsx`（客户端：读写 URL 查询参数 `view/country/month/acc`，切三个视图，持有「打开某号开播记录弹窗」的 state 并复用 Task 5 的 `LiveSessionsModal`）
- Create: `src/components/competitors/live/LiveCountryMonth.tsx`
- Modify: `src/components/competitors/CompetitorTabs.tsx`（加 `live: '/competitors/live'`，label `tabLive`「开播时段」）
- Modify: `src/lib/competitors/service.ts`（加 `getCompanyOfCompetitor(): Promise<ServiceResult<Record<string, string>>>`：读 `competitor_company_accounts(competitor_id, company_id)` 与 `competitor_companies(id, name)`，都用 `fetchAllRows`，返回 competitor_id → 公司名）
- Modify: `messages/{zh,en,ja}.json`

**Interfaces:**
- Consumes: `getCompetitorBoard`、`getCompanyOfCompetitor`（service），`flattenAccounts`/`monthRow`/`monthTotals`/`patrolDaysOf`（Task 6），`regionTimeZone`（Task 2），`LiveSessionsModal`（Task 5）
- Produces: `CompetitorLiveView({ board, companyOf })`；URL 参数约定 `?view=month|room|timetable&country=JP&month=YYYY-MM&acc=<competitor id>`

页面：照 `companies/page.tsx` 的骨架（`authGuard` → 并发取 `getCompetitorBoard(user.id)` 与 `getCompanyOfCompetitor()` → `Header` + `CompetitorTabs active="live"` → `CompetitorLiveView`）；容器 `mx-auto max-w-7xl`（番组表需要宽度）。

国家月历版式照 `CountryMonth.dc.html`：
- 控件行：国家 `SegmentedControl`（只列有账号的地区代码，按账号数降序；默认 JP，若没有 JP 取第一个）；‹ 月份 ›（默认今天所在月；可翻到最早一场所在月 ～ 今天所在月）；右侧 `liveZoneNote`（该国时区）。
- 3 个指标：本月有开播记录的号 `m / n`、开播号数最多的一天、有数据的天数。
- 图例行：说明 + 导入/截图/无数据三种样式。
- 网格：左列 168px（handle 粗体、来源小字，整列是按钮→打开该号弹窗）、日期列 34px（周六日日期用 `text-warning-text`）、右列 112px（`N 天开播` + `最早 HH:mm · 最晚 HH:mm`）；按公司分组（公司名 · 号数；无公司的「未归属公会」放最后）；只列该国**有任何场次**的号。
- 格子：`nodata` 用中性斜线背景；`idle` 白底（周末 `bg-canvas`）；`live` 白底 + 40px 高迷你竖条区（12:00、18:00 两条点线），每场一根 12px 宽竖条（`top = (start-360) × 40/1200`，高度最少 3px，导入实色/截图斜纹）；格下 14px 行写 `firstStart` 的 HH:mm（多场加 `+`）；`title` 写当天每场精确起止（截图的下播前加「约」）。
- 底行「当天开播号数」：`monthTotals`，数字 + `primary` 透明度热度（`0.15 + 0.7 × live/maxLive`，深色时字白）。

- [ ] **Step 1: service + 路由 + tab + 视图切换壳**（`view` 默认 `month`；切换用 `router.replace` 更新查询参数，不新增历史记录）
- [ ] **Step 2: `LiveCountryMonth`**（组件里只调 `monthRow`/`monthTotals`，不自己算）
- [ ] **Step 3: i18n 三语 + 门禁**（同 Task 5 Step 4）
- [ ] **Step 4: 生产构建走查** `/zh/competitors/live`：tab 高亮、默认月历、翻月、换国家、点 handle 打开弹窗、URL 参数随之变化且刷新后保持
- [ ] **Step 5: Commit**

```bash
git add -A src messages
git commit -m "feat(competitors): 新增「开播时段」页与国家月历视图"
```

---

### Task 8: 单个直播间视图

**Files:**
- Create: `src/components/competitors/live/LiveRoomMonth.tsx`
- Modify: `src/components/competitors/live/CompetitorLiveView.tsx`（接入 `view=room`）
- Modify: `messages/{zh,en,ja}.json`

**Interfaces:**
- Consumes: `monthRow`（Task 6），`summarizeLiveHabit`（Task 1），`windowStats`/`locateSpans`（Task 3），`regionTimeZone`、`formatCount`
- Produces: `LiveRoomMonth({ account, month, onMonthChange, onPickAccount, accounts, patrolDays, onOpenRecords })`

版式照 `Room.dc.html`：
- 控件行：账号 `<select>`（按地区→handle 排序，选项文案 `handle · 地区 · 公司`；默认取 URL 的 `acc`，没有就取场次最多的号）、账号元信息（地区 · 公司 · 来源与覆盖范围）、‹ 月份 ›、右侧「逐场清单与点赞 ›」→ 打开该号弹窗。
- 4 个指标：本月开播 `N 天 · M 场`、有数据的天数、平均单场（全截图时后缀「偏短」）、主档开播（`summarizeLiveHabit(该号全部 startedAt, zone).slots` 的 HH:mm 用 / 连接）。
- 图：左侧 46px 时间轴（06:00 → 02:00 每小时一个刻度，12/18/24 加粗）；每天一列 36px、高 600px（0.5px/分钟），背景每小时一条细线；周末列 `bg-canvas`；`nodata` 斜线；每场一根 16px 宽圆角竖条，**上方粗体开播 HH:mm，下方灰字下播 HH:mm**（截图推断不标下播；同一天下一场开播距本场下播 ≤ 50 分钟时不标本场下播，避免叠字）；主档横向虚线 + 右端深色标签「主档 HH:mm 开」；日期表头里有场次的日子底部加一道 `primary` 色条。
- 列 `title` = `MM/DD 周X · 每场 起–止（时长）` / 没播 / 无数据。

- [ ] **Step 1: 实现组件并接入视图壳**
- [ ] **Step 2: i18n 三语 + 门禁**
- [ ] **Step 3: 生产构建走查**：切账号、翻月、跨午夜那场的竖条画到 24 点之后、凌晨开播的号画在底部
- [ ] **Step 4: Commit**

```bash
git add -A src messages
git commit -m "feat(competitors): 开播时段页·单个直播间视图（日期 × 纵向时刻）"
```

---

### Task 9: 时段对比（番组表）视图

**Files:**
- Create: `src/components/competitors/live/LiveTimetable.tsx`
- Modify: `src/components/competitors/live/CompetitorLiveView.tsx`（接入 `view=timetable`）
- Modify: `messages/{zh,en,ja}.json`

**Interfaces:**
- Consumes: `densityColumn`/`peakBucket`/`OUR_SCHEDULE_JST`（Task 6），`regionTimeZone`（Task 2），`AXIS_START`/`BUCKETS`（Task 3）
- Produces: `LiveTimetable({ accounts, today, onOpenRecords })`（筛选与时区切换是组件内 state）

版式照 `Timetable.dc.html`：
- 控件：国家 chips（全部 + 各地区 · 号数）、公会 chips（全部 + 各公司 · 号数 + 未归属）、时间（统一按日本时间 / 各自当地时间）、「我方排期参考线」开关、右侧「范围：近 90 天」（`from = addDaysYmd(today, -89)`）。
- 右上卡片「同时在播最多」：`peakBucket` → `HH:mm–HH:mm · N 个号常在播`。
- 图例：导入实色 / 截图斜纹 / 主档开播标签（黑框粗体）/ 主档下播标签（灰框）。
- 番组表：左侧 48px 时间轴（距顶 108px 对齐列头；06–02 每小时，12/18/24 加粗；我方排期开时在两段中点放 warning 色「我方」小标签）；按国家（深色条：`国家名 代码 · N 个号`）→ 公司（`primary-soft` 条：`公司 · N`）→ 账号列（58px）分组；列头 46px（handle 粗体可折行 + `N 场` / `截图 N 场`，整块是按钮→打开弹窗）；列体 720px（0.6px/分钟），80 个 9px 格按 `shares` 上色（导入：`rgb(var(--primary) / (0.14 + share×0.78))`；截图同色斜纹）；12/18/24 点三条较深横线；我方排期开时两段 warning 色虚线框 + 极浅底；主档开播标签（白底黑框粗体 `HH:mm`，截图号写 `HH:mm起`）与下播标签（白底灰框）居中压在对应高度。
- 「各自当地时间」：每列用 `regionTimeZone(account.region, 'Asia/Tokyo')` 算 `densityColumn`；「统一按日本时间」：全部用 `Asia/Tokyo`。
- 列排序：国家按号数降序 → 公司（有名字的按号数降序，未归属最后）→ 首个主档开播分钟升序（无主档的放最后）。只列近 90 天有场次的号。
- 下方「逐号列表」表格：账号（按钮→弹窗）/ 国家 / 公司 / 主档（当前时区口径：`HH:mm–HH:mm（N 场）` 或 `HH:mm 起（N 场）`，多档用 ` · ` 连接；无主档「场次太少，不成档」）/ 场次 / 数据来源。

- [ ] **Step 1: 实现组件并接入视图壳**
- [ ] **Step 2: i18n 三语 + 门禁**
- [ ] **Step 3: 生产构建走查**：横向滚动时左侧时间轴与列对齐；切「各自当地时间」时马来西亚的列整体上移 1 小时；关掉我方排期线；国家/公会筛选后「同时在播最多」随之变化
- [ ] **Step 4: Commit**

```bash
git add -A src messages
git commit -m "feat(competitors): 开播时段页·时段对比（番组表）视图"
```

**PR-B2 收尾**：推分支，开 PR（base = PR-B1 的分支，B1 合并后改 base 为 main），描述附三视图截图（截图里不要出现可识别的竞品主页头像；handle 可见无妨——看板本来就展示 handle，但 PR 正文里不要点名具体竞品做评价）。

---

## Self-Review 记录

- Spec 覆盖：场次合并（T2）、主档算法（T1）、时区（T2/T4）、无数据≠没播（T6 `hasData`）、我方排期（T6/T9）、卡片入口（T5）、弹窗五块（T3/T5）、三视图（T7/T8/T9）、点账号开弹窗（T7–T9）、URL 状态（T7）。Ask 面板只换数据源不换时区（T4），与 spec「不做」一致。
- 类型一致：`LiveSpan`/`LocatedSpan`/`DensityColumn`/`MonthCell` 在定义任务之外只按定义使用；`clusterMinutes` 在 T1 产出、T6 消费。
- Review Focus 五条各有测试：截图号（T2 `只有截图` / T6 `densityColumn` 截图档）、跨午夜（T3 / T6 `monthRow`）、凌晨开播（T3）、地区未填（T2 `regionTimeZone`）、同场去重（T2 / T4 标尺）。
