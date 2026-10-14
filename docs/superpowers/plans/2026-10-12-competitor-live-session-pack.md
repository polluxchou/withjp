# 竞品开播记录瘦身下发（列式紧凑编码）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 竞品看板与问答只查开播记录用得到的 5 列，并按账号打包成列式紧凑格式下发；所有统计与显示逐字节不变，看板体积降到约四分之一。

**Architecture:** 新增纯函数文件 `liveSessionPack.ts`（打包 / 解包 / 唯一访问器 `liveSessionRows`）。`assembleBoard` 按账号分组排序后打包，挂到 `CompetitorWithHistory.liveSessionPack`（替换 `live_sessions`）。四个读开播记录的地方（`accountSpans`、地区标尺、问答、导入预览）一律经 `liveSessionRows` 解包，解包后的形状就是 `liveSpansOf` 的 `live_sessions` 入参，下游不动。

**Tech Stack:** Next.js 14 App Router、TypeScript、Supabase（PostgREST）、`node --test --experimental-strip-types`。

**Spec:** `docs/superpowers/specs/2026-10-12-competitor-live-session-pack-design.md`

## Global Constraints

- 分支：`perf/competitor-live-session-pack`（基于重写历史后的 origin/main）。每次提交前 `git branch --show-current` 必须是它；只在派发时给定的 worktree 绝对路径下工作。
- 公开仓库：代码注释、文档、提交信息不写本机路径、人名、真实竞品账号名；测试数据用 `Sample …` / `sample.*`。
- `src/` 注释里引用 PR 写成 `PR 123`，不写 `(#123)`（style 门禁会误判成裸 hex）。
- lib 内相对导入带 `.ts` 后缀（`node --test` 不解析 `@/` 别名）；纯类型导入用 `import type` 或内联 `type`。
- 新测试文件必须登记进 `package.json` 的 `scripts.test` 那一行，否则 `npm test` 不跑它。
- JSX 不许出现裸中文（本次不新增界面文案）。
- 本仓没有 DOM 测试环境：组件只做源码断言，行为都在 `src/lib` 里测。
- 完成标准：`npx tsc --noEmit`、`npm test`、`npm run test:copy` 全过；最终 `npx next build` 通过。
- 写入路径不动：`CompetitorLiveSession`（库行类型）、`liveHistory.ts` 的解析与校验器、`upsertLiveSessions`、导入接口。
- `liveSpansOf` 的入参名 `live_sessions`、`LiveSpan`、`liveStats`、`liveCoverage` 都不改。

## Review Focus

1. **JSON 往返**：看板经服务端组件 props 与 `GET /api/competitors` 两条路都会被 JSON 序列化，包必须序列化后照样解包（Task 1 测 `JSON.parse(JSON.stringify(pack))`）。
2. **一个账号里混有带秒 / 带毫秒的下播时刻**（直接调导入接口写入的，校验器允许）：整账号退回毫秒，数字不变（Task 1 测）。
3. **同一时刻的不同写法**（`+00:00` / `Z` / `.000Z` / `+09:00`、微秒）：打包结果一致，微秒截到毫秒与现状 `Date.parse` 一致（Task 1 测）。
4. **导入预览的「新增 X · 更新 Y」**：已有场次换成解包后的行（写法 `…000Z`，库里是 `+00:00`），计数必须与现在相同（Task 1 测 `diffAgainstExisting` 等价）。
5. **子账号**：子账号的开播记录打包在它自己身上，挂到父的 `related` 后标尺与开播时段页照样读得到（Task 2 测 assemble）。

---

## File Structure

| 文件 | 动作 | 职责 |
| --- | --- | --- |
| `src/lib/competitors/liveSessionPack.ts` | 新建 | `LiveSessionPack` / `LiveSessionFields` 类型；`packLiveSessions`、`unpackLiveSessions`、`liveSessionRows` |
| `src/lib/competitors/liveSessionPack.test.ts` | 新建 | 往返、单位退回、写法归一、跳过坏行、JSON 往返、`liveSpansOf` 与导入预览等价 |
| `src/lib/competitors/types.ts` | 改 | `live_sessions` → `liveSessionPack`；新增 `BoardLiveSession` |
| `src/lib/competitors/assemble.ts` | 改 | 第 6 个入参改 `BoardLiveSession[]`，排序后打包 |
| `src/lib/competitors/service.ts` | 改 | 新常量 `LIVE_SESSION_COLUMNS`，两个看板都只查这 5 列 |
| `src/lib/competitors/liveBoard.ts` | 改 | `accountSpans` 经 `liveSessionRows` |
| `src/lib/competitors/regionRuler.ts` | 改 | `RulerInput.live_sessions` → `liveSessionPack`，内部解包 |
| `src/lib/competitors/ask-context.ts` | 改 | `startsUpTo` 经 `liveSessionRows` |
| `src/components/competitors/live/LiveSessionsModal.tsx` | 改 | `existing` 用解包后的行 |
| `src/components/competitors/LiveSessionImport.tsx` | 改 | `existing` prop 类型收窄为 `{ started_at: string }[]` |
| `src/lib/competitors/live-session-pack-wiring.test.ts` | 新建 | 源码断言：没人再读 `.live_sessions`、四个消费方都经访问器、assemble 打包 |
| `src/lib/competitors/shot-window-wiring.test.ts` | 改 | 两个看板的开播记录查询链与 `assembleBoard` 实参类型 |
| 6 个测试夹具文件 | 改 | `assemble` / `liveBoard` / `regionRuler` / `ask-context` / `ask-prompt` / `shotWindow` 的 `.test.ts` |
| `src/lib/changelog/entries.ts` | 改 | 更新日志一条 |
| `package.json` | 改 | 登记两个新测试文件 |

---

### Task 1: 打包 / 解包纯函数 `liveSessionPack.ts`

**Files:**
- Create: `src/lib/competitors/liveSessionPack.ts`
- Create: `src/lib/competitors/liveSessionPack.test.ts`
- Modify: `package.json`（`scripts.test` 一行）

**Interfaces:**
- Consumes: `liveSpansOf`（`./liveSessions.ts`，不改）、`diffAgainstExisting`（`./liveHistory.ts`，不改）——仅测试用。
- Produces（Task 2 依赖，名字与类型一字不差）：
  - `export interface LiveSessionPack { unitMs: 60000 | 1; start: number[]; dur: number[]; likes: (number | null)[]; title: string[] }`
  - `export interface LiveSessionFields { started_at: string; ended_at: string; likes: number | null; title: string }`
  - `export function packLiveSessions(rows: readonly LiveSessionFields[]): LiveSessionPack`
  - `export function unpackLiveSessions(pack: LiveSessionPack): LiveSessionFields[]`
  - `export function liveSessionRows(c: { liveSessionPack?: LiveSessionPack | null }): LiveSessionFields[]`

- [ ] **Step 1: 写失败的测试**

新建 `src/lib/competitors/liveSessionPack.test.ts`：

```ts
// src/lib/competitors/liveSessionPack.test.ts
import assert from 'node:assert/strict'
import test from 'node:test'
import { diffAgainstExisting } from './liveHistory.ts'
import { liveSessionRows, packLiveSessions, unpackLiveSessions, type LiveSessionFields } from './liveSessionPack.ts'
import { liveSpansOf } from './liveSessions.ts'

const MIN = 60_000
const row = (started_at: string, ended_at: string, likes: number | null = 100, title = 'Sample LIVE'): LiveSessionFields =>
  ({ started_at, ended_at, likes, title })
/** 解包后的期望值：时刻统一成 toISOString 写法，其余原样。 */
const norm = (r: LiveSessionFields): LiveSessionFields => ({
  started_at: new Date(r.started_at).toISOString(),
  ended_at: new Date(r.ended_at).toISOString(),
  likes: r.likes,
  title: r.title,
})

test('整分钟：按分钟存，开播 = epoch 分钟，时长 = 分钟数，点赞与标题按列原样', () => {
  const pack = packLiveSessions([
    row('2026-10-10T13:17:00+00:00', '2026-10-10T14:01:00+00:00', 786, 'Sample A'),
    row('2026-10-09T03:04:00Z', '2026-10-09T05:00:00Z', null, ''),
  ])
  assert.deepEqual(pack, {
    unitMs: 60_000,
    start: [Date.parse('2026-10-10T13:17:00Z') / MIN, Date.parse('2026-10-09T03:04:00Z') / MIN],
    dur: [44, 116],
    likes: [786, null],
    title: ['Sample A', ''],
  })
})

test('任一行带秒：整个账号退回按毫秒存，往返无损', () => {
  const rows = [
    row('2026-10-10T13:17:00Z', '2026-10-10T14:01:30Z'), // 下播带秒（校验器只要求开播整分钟）
    row('2026-10-09T03:04:00Z', '2026-10-09T05:00:00Z'),
  ]
  const pack = packLiveSessions(rows)
  assert.equal(pack.unitMs, 1)
  assert.deepEqual(pack.start, [Date.parse('2026-10-10T13:17:00Z'), Date.parse('2026-10-09T03:04:00Z')])
  assert.deepEqual(pack.dur, [44 * MIN + 30_000, 116 * MIN])
  assert.deepEqual(unpackLiveSessions(pack), rows.map(norm))
})

test('毫秒与微秒：毫秒原样保留，微秒截到毫秒（与 Date.parse 的现状一致）', () => {
  const pack = packLiveSessions([row('2026-10-10T13:17:00Z', '2026-10-10T14:01:00.123456+00:00')])
  assert.equal(pack.unitMs, 1)
  assert.equal(unpackLiveSessions(pack)[0].ended_at, '2026-10-10T14:01:00.123Z')
})

test('同一时刻的不同写法（+00:00 / Z / .000Z / +09:00）打包结果相同', () => {
  const a = packLiveSessions([row('2026-10-09T03:04:00+00:00', '2026-10-09T05:00:00+00:00')])
  const b = packLiveSessions([row('2026-10-09T12:04:00+09:00', '2026-10-09T05:00:00.000Z')])
  assert.deepEqual(a, b)
})

test('往返：解包得到同序、同值的行（时刻写成 toISOString），不重排输入顺序', () => {
  const rows = [
    row('2026-09-01T03:00:00Z', '2026-09-01T05:00:00Z', 5, 'Sample old first'), // 故意不按时刻排
    row('2026-10-01T03:00:00Z', '2026-10-01T04:00:00Z', null, ''),
    row('2026-08-01T03:00:00Z', '2026-08-01T03:00:00Z', 0, 'Sample zero length'),
  ]
  assert.deepEqual(unpackLiveSessions(packLiveSessions(rows)), rows.map(norm))
})

test('空列表：四个空数组、单位取分钟；解包为空', () => {
  const pack = packLiveSessions([])
  assert.deepEqual(pack, { unitMs: 60_000, start: [], dur: [], likes: [], title: [] })
  assert.deepEqual(unpackLiveSessions(pack), [])
})

test('读不出的时刻整行跳过（与 liveSpansOf 一致），不影响其余行的单位', () => {
  const good = row('2026-10-08T03:04:00Z', '2026-10-08T05:00:00Z')
  const pack = packLiveSessions([
    row('not a date', '2026-10-09T05:00:00Z'),
    row('2026-10-09T03:04:30Z', 'also bad'), // 带秒但整行被跳过：不该把单位拖成毫秒
    good,
  ])
  assert.equal(pack.unitMs, 60_000)
  assert.deepEqual(unpackLiveSessions(pack), [norm(good)])
})

test('JSON 往返（服务端组件传 props、接口返回 JSON）后照样解包', () => {
  const rows = [
    row('2026-10-10T13:17:00Z', '2026-10-10T14:01:30Z', null, ''),
    row('2026-10-09T03:04:00Z', '2026-10-09T05:00:00Z'),
  ]
  const pack = packLiveSessions(rows)
  assert.deepEqual(unpackLiveSessions(JSON.parse(JSON.stringify(pack))), rows.map(norm))
})

test('liveSessionRows：有包就解包，缺包（null / 没有这个字段）当没有开播记录', () => {
  const rows = [row('2026-10-09T03:04:00Z', '2026-10-09T05:00:00Z')]
  assert.deepEqual(liveSessionRows({ liveSessionPack: packLiveSessions(rows) }), rows.map(norm))
  assert.deepEqual(liveSessionRows({ liveSessionPack: null }), [])
  assert.deepEqual(liveSessionRows({}), [])
})

test('等价：liveSpansOf 吃解包后的行与吃原始行结果逐项相同（含标题、点赞、与截图合并去重）', () => {
  const rows = [
    row('2026-08-20T00:04:00+00:00', '2026-08-20T02:44:00+00:00', 1200, 'Sample A'),
    row('2026-08-19T00:04:00+00:00', '2026-08-19T02:44:30+00:00', null, ''),
  ]
  const shots = [
    { stream_started_at: '2026-08-20T01:11:00Z', captured_at: '2026-08-20T01:30:00Z' }, // 断线重连：落在导入场次内，丢掉
    { stream_started_at: '2026-08-21T10:00:00Z', captured_at: '2026-08-21T11:00:00Z' }, // 只有截图的一场
  ]
  assert.deepEqual(
    liveSpansOf({ live_sessions: unpackLiveSessions(packLiveSessions(rows)), shots }),
    liveSpansOf({ live_sessions: rows, shots }),
  )
})

test('等价（批量）：确定性生成 300 行，分钟路径与毫秒路径下 liveSpansOf 都与原始行相同', () => {
  // Park–Miller 最小标准生成器：结果固定、全程在安全整数内，便于复现。
  let seed = 42
  const rand = (n: number) => {
    seed = (seed * 48271) % 2147483647
    return seed % n
  }
  const base = Date.parse('2026-07-01T00:00:00Z')
  const gen = (withSeconds: boolean): LiveSessionFields[] =>
    Array.from({ length: 300 }, (_, i) => {
      const start = base + i * 6 * 3_600_000 + rand(300) * MIN
      const end = start + rand(400) * MIN + (withSeconds && i % 7 === 0 ? rand(59_000) + 1 : 0)
      return {
        started_at: new Date(start).toISOString(),
        ended_at: new Date(end).toISOString(),
        likes: i % 5 === 0 ? null : rand(100_000),
        title: i % 3 === 0 ? '' : `Sample ${i % 4}`,
      }
    }).reverse()
  for (const withSeconds of [false, true]) {
    const rows = gen(withSeconds)
    const pack = packLiveSessions(rows)
    assert.equal(pack.unitMs, withSeconds ? 1 : 60_000)
    assert.deepEqual(
      liveSpansOf({ live_sessions: unpackLiveSessions(pack), shots: [] }),
      liveSpansOf({ live_sessions: rows, shots: [] }),
    )
  }
})

test('导入预览：已有场次换成解包后的行，「新增 / 更新」计数与用库行算的一样', () => {
  const dbRows = [
    row('2026-10-09T03:04:00+00:00', '2026-10-09T05:00:00+00:00'),
    row('2026-10-08T03:04:00+00:00', '2026-10-08T05:00:00+00:00'),
  ]
  const parsed = [{ started_at: '2026-10-09T03:04:00.000Z' }, { started_at: '2026-10-10T03:04:00.000Z' }]
  const viaPack = diffAgainstExisting(parsed, unpackLiveSessions(packLiveSessions(dbRows)))
  assert.deepEqual(viaPack, diffAgainstExisting(parsed, dbRows))
  assert.deepEqual(viaPack, { added: 1, updated: 1 })
})
```

- [ ] **Step 2: 跑测试，确认失败**

Run: `node --test --experimental-strip-types src/lib/competitors/liveSessionPack.test.ts`
Expected: FAIL，报 `Cannot find module …/liveSessionPack.ts`。

- [ ] **Step 3: 写实现**

新建 `src/lib/competitors/liveSessionPack.ts`：

```ts
// src/lib/competitors/liveSessionPack.ts
// 开播记录（LIVE History 导入）在看板里的下发格式：每个账号一份，按列存放，时刻存成数字。
//
// 为什么不直接下发库行：整表 select('*') 时每场约 344 字节，约七成是没有消费方读的列
// （id / competitor_id / source / created_at / updated_at），时刻又是 25 个字符的字符串；
// 开播记录占了整个看板的八成以上，还按每月约 1000 场增长。只查用得到的列、按列存、时刻存数字后，
// 看板约为原来的四分之一（设计：docs/superpowers/specs/2026-10-12-competitor-live-session-pack-design.md）。
//
// 无损：消费方读到的都是毫秒时刻（Date.parse 之后）。本账号全部开播、下播都是整分钟时按分钟存
// （导入的原文只到分钟，实际都走这条）；只要有一行带秒或毫秒（校验器只要求开播整分钟，下播允许带秒），
// 整个账号退回按毫秒存。
//
// 读开播记录只经 liveSessionRows(c)：解包后的形状就是 liveSpansOf 的 live_sessions 入参。
// 组件与 lib 里别直接读 liveSessionPack 的数组。纯函数、不读时钟，可单测。

const MINUTE_MS = 60_000

/** 一个账号的开播记录，按列存放：第 i 场 = 各数组的第 i 个元素；顺序就是打包时的输入顺序。 */
export interface LiveSessionPack {
  /** 时刻单位（毫秒）：本账号全部开播、下播都是整分钟时为 60000，否则为 1。 */
  unitMs: 60000 | 1
  /** 开播时刻 = epoch 毫秒 ÷ unitMs。 */
  start: number[]
  /** 时长 = (下播 − 开播) 毫秒 ÷ unitMs。库里有约束 ended_at >= started_at，恒 ≥ 0。 */
  dur: number[]
  likes: (number | null)[]
  title: string[]
}

/** 一场开播记录里看板用得到的字段；也就是 liveSpansOf 的 live_sessions 入参形状。 */
export interface LiveSessionFields {
  started_at: string
  ended_at: string
  likes: number | null
  title: string
}

/**
 * 打包一个账号的开播记录，保持输入顺序（看板传进来时已按开播时刻倒序）。
 * 读不出时刻的行跳过，与 liveSpansOf 的处理一致——库里两列都是 not null timestamptz，实际不会出现。
 */
export function packLiveSessions(rows: readonly LiveSessionFields[]): LiveSessionPack {
  const kept: { start: number; end: number; likes: number | null; title: string }[] = []
  for (const r of rows) {
    const start = Date.parse(r.started_at)
    const end = Date.parse(r.ended_at)
    if (Number.isNaN(start) || Number.isNaN(end)) continue
    kept.push({ start, end, likes: r.likes ?? null, title: r.title ?? '' })
  }
  const unitMs: LiveSessionPack['unitMs'] =
    kept.every((r) => r.start % MINUTE_MS === 0 && r.end % MINUTE_MS === 0) ? MINUTE_MS : 1
  return {
    unitMs,
    start: kept.map((r) => r.start / unitMs),
    dur: kept.map((r) => (r.end - r.start) / unitMs),
    likes: kept.map((r) => r.likes),
    title: kept.map((r) => r.title),
  }
}

/**
 * 还原成行，时刻写成 toISOString()。写法与库里读回来的（+00:00）不同无妨：
 * 下游都按时刻比（liveSpansOf 统一成 toISOString，导入预览用 getTime）。
 */
export function unpackLiveSessions(pack: LiveSessionPack): LiveSessionFields[] {
  const out: LiveSessionFields[] = []
  for (let i = 0; i < pack.start.length; i += 1) {
    const start = pack.start[i] * pack.unitMs
    out.push({
      started_at: new Date(start).toISOString(),
      ended_at: new Date(start + pack.dur[i] * pack.unitMs).toISOString(),
      likes: pack.likes[i] ?? null,
      title: pack.title[i] ?? '',
    })
  }
  return out
}

/**
 * 一个账号的开播记录（顺序同打包时：看板里是按开播时刻倒序）。读开播记录只经这里。
 * 缺包（null / 没有这个字段）当没有开播记录：地区标尺的入参允许不带。
 */
export function liveSessionRows(c: { liveSessionPack?: LiveSessionPack | null }): LiveSessionFields[] {
  return c.liveSessionPack ? unpackLiveSessions(c.liveSessionPack) : []
}
```

- [ ] **Step 4: 跑测试，确认通过**

Run: `node --test --experimental-strip-types src/lib/competitors/liveSessionPack.test.ts`
Expected: PASS（12 个 test 全过）。

- [ ] **Step 5: 登记进 `npm test`**

用 Edit 在 `package.json` 的 `scripts.test` 那一行里，把
`src/lib/competitors/liveSessions.test.ts `
替换成
`src/lib/competitors/liveSessions.test.ts src/lib/competitors/liveSessionPack.test.ts `
（这个子串在该行只出现一次；保留原有空格分隔，不重排其它条目）。

Run: `npm test 2>&1 | tail -5`
Expected: `# fail 0`，且 `npm test 2>&1 | grep -c "liveSessionPack\|整分钟：按分钟存"` ≥ 1（新文件确实被跑到）。

- [ ] **Step 6: 类型检查**

Run: `npx tsc --noEmit`
Expected: 无输出（退出码 0）。

- [ ] **Step 7: 提交**

```bash
git branch --show-current   # 必须是 perf/competitor-live-session-pack
git add src/lib/competitors/liveSessionPack.ts src/lib/competitors/liveSessionPack.test.ts package.json
git commit -m "feat(competitors): 开播记录列式紧凑打包 / 解包纯函数

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

**突变探针候选（审查用，在已提交基线上、独立 detached worktree 里跑）：** 单位恒取 60000（去掉退回）；单位恒取 1；`dur` 存成 `end / unitMs`；解包时 `dur` 漏乘 `unitMs`；去掉 NaN 跳过；`liveSessionRows` 去掉缺包守卫；打包时按开播时刻重排；`likes ?? null` 改成 `?? 0`；单位判断只看开播不看下播。每一条都应有测试变红。

---

### Task 2: 看板改挂 `liveSessionPack`，四个消费方经访问器读

本任务必须一次完成：`CompetitorWithHistory` 的字段换名后，所有读取点与测试夹具要同时改，中途 tsc 不会绿。

**Files:**
- Modify: `src/lib/competitors/types.ts`
- Modify: `src/lib/competitors/assemble.ts`
- Modify: `src/lib/competitors/service.ts`
- Modify: `src/lib/competitors/liveBoard.ts`
- Modify: `src/lib/competitors/regionRuler.ts`
- Modify: `src/lib/competitors/ask-context.ts`
- Modify: `src/components/competitors/live/LiveSessionsModal.tsx`
- Modify: `src/components/competitors/LiveSessionImport.tsx`
- Modify（测试）: `src/lib/competitors/shot-window-wiring.test.ts`、`assemble.test.ts`、`liveBoard.test.ts`、`regionRuler.test.ts`、`ask-context.test.ts`、`ask-prompt.test.ts`、`shotWindow.test.ts`
- Create: `src/lib/competitors/live-session-pack-wiring.test.ts`
- Modify: `src/lib/changelog/entries.ts`、`package.json`

**Interfaces:**
- Consumes（Task 1）：`LiveSessionPack`、`LiveSessionFields`、`packLiveSessions`、`unpackLiveSessions`、`liveSessionRows`（`./liveSessionPack.ts`；组件里用 `@/lib/competitors/liveSessionPack`）。
- Produces：
  - `CompetitorWithHistory.liveSessionPack: LiveSessionPack`（替换 `live_sessions`）
  - `export type BoardLiveSession = Pick<CompetitorLiveSession, 'competitor_id' | 'started_at' | 'ended_at' | 'title' | 'likes'>`（`types.ts`）
  - `export const LIVE_SESSION_COLUMNS = 'competitor_id, started_at, ended_at, title, likes'`（`service.ts`）
  - `assembleBoard(..., liveSessions: BoardLiveSession[] = [], meta?)`
  - `RulerInput.liveSessionPack?: LiveSessionPack | null`（替换 `live_sessions`）

- [ ] **Step 1: 写失败的接线测试**

新建 `src/lib/competitors/live-session-pack-wiring.test.ts`：

```ts
// src/lib/competitors/live-session-pack-wiring.test.ts
// 源码断言：开播记录改成列式紧凑格式（liveSessionPack）下发后的接线。
// 打包 / 解包本身在 liveSessionPack.test.ts 单测；这里钉「读开播记录的地方都经 liveSessionRows 解包」，
// 以及没有人再从竞品对象上读已经不存在的旧字段（类型挡得住 .ts 里的写法，挡不住 any 与类型断言）。
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const SRC = fileURLToPath(new URL('../../', import.meta.url)) // src/
const read = (rel: string) => readFileSync(join(SRC, rel), 'utf8')
const SELF = 'lib/competitors/live-session-pack-wiring.test.ts'
// 旧字段名拼出来，不在本文件里写成一个完整的「点 + 字段名」
const OLD_FIELD = new RegExp('\\.' + 'live_' + 'sessions\\b')

/** 取某个函数的函数体（到第一个顶格的 `}` 为止），断言只看函数本身、不看注释。 */
function fnBody(src: string, signature: string): string {
  const start = src.indexOf(signature)
  assert.ok(start >= 0, `找不到 ${signature}`)
  const end = src.indexOf('\n}\n', start)
  assert.ok(end > start, `${signature} 的函数体没有闭合`)
  return src.slice(start, end + 2)
}

test('src 里没有任何地方再从竞品对象上读旧的开播记录字段（liveSpansOf 自己的入参除外）', () => {
  const files = (readdirSync(SRC, { recursive: true }) as string[]).filter((f) => /\.(ts|tsx)$/.test(f))
  assert.ok(files.length > 100, `扫描范围不对：src 下只找到 ${files.length} 个 ts/tsx 文件`)
  const offenders = files
    .filter((f) => f !== SELF && f !== 'lib/competitors/liveSessions.ts')
    .filter((f) => OLD_FIELD.test(readFileSync(join(SRC, f), 'utf8')))
  assert.deepEqual(offenders, [])
})

test('四个读开播记录的地方都经 liveSessionRows 解包', () => {
  assert.match(
    fnBody(read('lib/competitors/liveBoard.ts'), 'export function accountSpans('),
    /liveSpansOf\(\{ live_sessions: liveSessionRows\(c\), shots: c\.sessionShots \}\)/,
  )
  assert.match(
    read('lib/competitors/regionRuler.ts'),
    /liveStartsOf\(\{ live_sessions: liveSessionRows\(c\), shots: c\.sessionShots \?\? \[\] \}\)/,
  )
  assert.match(
    fnBody(read('lib/competitors/ask-context.ts'), 'function startsUpTo('),
    /liveStartsOf\(\{ live_sessions: liveSessionRows\(c\), shots: c\.shots \}\)/,
  )
  const modal = read('components/competitors/live/LiveSessionsModal.tsx')
  assert.match(modal, /const existing = useMemo\(\(\) => liveSessionRows\(competitor\), \[competitor\]\)/)
  assert.match(modal, /existing=\{existing\}/)
})

test('assembleBoard 把每个账号的开播记录打包挂到 liveSessionPack', () => {
  assert.match(fnBody(read('lib/competitors/assemble.ts'), 'export function assembleBoard'), /liveSessionPack: packLiveSessions\(/)
})
```

再用 Edit 把它登记进 `package.json` 的 `scripts.test`：把
`src/lib/competitors/shot-window-wiring.test.ts `
替换成
`src/lib/competitors/shot-window-wiring.test.ts src/lib/competitors/live-session-pack-wiring.test.ts `。

- [ ] **Step 2: 改 `shot-window-wiring.test.ts`（让它先红）**

1. 顶部导入改为：

```ts
import { ASK_SHOT_COLUMNS, LIVE_SESSION_COLUMNS, getCompetitorBoard, getShotsInRange } from './service.ts'
import type { AskShot, BoardLiveSession } from './types.ts'
```

2. 在 `test('问答截图列：与 AskShot 的键集合完全一致', …)` 之后加：

```ts
// BoardLiveSession ↔ LIVE_SESSION_COLUMNS 的联动，写法同上面的 AskShot：
// 类型增删键时这个 Record 让 tsc 报错，列清单漏改时下面的对拍变红。
const boardLiveSessionKeys: Record<keyof BoardLiveSession, true> = {
  competitor_id: true,
  started_at: true,
  ended_at: true,
  title: true,
  likes: true,
}

test('开播记录列：与 BoardLiveSession 的键集合完全一致；service 里不再整表 select(*) 开播记录', () => {
  assert.deepEqual(
    LIVE_SESSION_COLUMNS.split(',').map((s) => s.trim()).sort(),
    Object.keys(boardLiveSessionKeys).sort(),
  )
  assert.doesNotMatch(SERVICE, /competitor_live_sessions'\)\.select\('\*'\)/)
})

test('getCompetitorBoard：开播记录只查 LIVE_SESSION_COLUMNS，仍全量分页（select → order(id 升序) → range，中间不夹过滤）', () => {
  assert.match(
    bodyOf(SERVICE, 'getCompetitorBoard'),
    /db\.from\('competitor_live_sessions'\)\.select\(LIVE_SESSION_COLUMNS\)\s*\.order\('id', \{ ascending: true \}\)\.range\(from, to\)\)/,
  )
})
```

3. 把 `test('getAskBoard：开播记录全量拉取，…')` 整个替换为：

```ts
test('getAskBoard：开播记录全量拉取（只查 LIVE_SESSION_COLUMNS），作为 assembleBoard 的第 6 个实参（问答与卡片同一口径合并场次）', () => {
  const body = bodyOf(SERVICE, 'getAskBoard')
  assert.match(
    body,
    /db\.from\('competitor_live_sessions'\)\.select\(LIVE_SESSION_COLUMNS\)\s*\.order\('id', \{ ascending: true \}\)\.range\(from, to\)\)/,
  )
  assert.match(
    body,
    /assembleBoard\(\s*\(compRes\.data \?\? \[\]\) as Competitor\[\],\s*\(snapRes\.data \?\? \[\]\) as CompetitorSnapshot\[\],\s*\(shotRes\.data \?\? \[\]\) as AskShot\[\],\s*true,\s*\[\],\s*\(liveRes\.data \?\? \[\]\) as BoardLiveSession\[\],?\s*\)/,
  )
  // 截图仍是全量：问答不按相册窗口过滤
  assert.doesNotMatch(body, /loadedRangeOrFilter|\.or\(|\.gte\('shot_on'/)
})
```

4. 在 `test('getCompetitorBoard：索引吃瘦查询的行；…')` 里，把正则中的 `as CompetitorLiveSession\[\]` 改成 `as BoardLiveSession\[\]`（其余不动）。

Run: `node --test --experimental-strip-types src/lib/competitors/shot-window-wiring.test.ts src/lib/competitors/live-session-pack-wiring.test.ts`
Expected: FAIL（`LIVE_SESSION_COLUMNS` 未导出 / 正则不匹配 / 扫描发现旧字段）。

- [ ] **Step 3: `types.ts`**

文件顶部（`export type CompetitorPlatform` 之前）加：

```ts
import type { LiveSessionPack } from './liveSessionPack.ts'

```

`sessionShots` 的注释里，把「直接喂 liveSpansOf 的 shots 入参（与导入的 live_sessions 合并去重）；」改成「直接喂 liveSpansOf 的 shots 入参（与导入的开播记录合并去重）；」。

把

```ts
  /** 开播记录，已按开播时刻倒序（最新在前）。 */
  live_sessions: CompetitorLiveSession[]
```

替换为

```ts
  /**
   * 开播记录（LIVE History 导入），列式紧凑格式，已按开播时刻倒序（最新在前）。
   * 读取只经 liveSessionRows(c)（见 liveSessionPack.ts），别直接读里面的数组。
   */
  liveSessionPack: LiveSessionPack
```

在 `export type BoardShot = …` 那一行之后加：

```ts

/**
 * 看板与问答查开播记录只查这几列（service.ts 的 LIVE_SESSION_COLUMNS）。
 * id / source / created_at / updated_at 没有消费方读，不查不下发。新读一个字段时两边同时加
 * ——shot-window-wiring.test.ts 钉着两边一致。
 */
export type BoardLiveSession = Pick<CompetitorLiveSession, 'competitor_id' | 'started_at' | 'ended_at' | 'title' | 'likes'>
```

- [ ] **Step 4: `assemble.ts`**

类型导入里把 `CompetitorLiveSession` 换成 `BoardLiveSession`：

```ts
import type {
  BoardLiveSession, BoardShot, Competitor, CompetitorSnapshot, CompetitorShot, CompetitorDescription,
  CompetitorBoard, CompetitorWithHistory, HistoryPoint,
} from './types.ts'
import { sortDescriptions } from './descriptions.ts'
import { packLiveSessions } from './liveSessionPack.ts'
```

（其余 import 不动。）入参改为 `liveSessions: BoardLiveSession[] = [],`；`const liveBy = new Map<string, CompetitorLiveSession[]>()` 改为 `new Map<string, BoardLiveSession[]>()`。`build` 里把

```ts
      // 按时刻比而不是按字符串比：timestamptz 读回来的写法（+00:00 / 带不带毫秒）不保证定长。
      live_sessions: (liveBy.get(c.id) ?? []).slice()
        .sort((a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime()),
```

替换为

```ts
      // 先按开播时刻倒序再打包（包里保持这个顺序）。按时刻比而不是按字符串比：
      // timestamptz 读回来的写法（+00:00 / 带不带毫秒）不保证定长。
      liveSessionPack: packLiveSessions((liveBy.get(c.id) ?? []).slice()
        .sort((a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime())),
```

- [ ] **Step 5: `service.ts`**

类型导入里把 `CompetitorLiveSession` 换成 `BoardLiveSession`。在 `getCompetitorBoard` 的文档注释之前加：

```ts
/**
 * 看板与问答查开播记录的列（types.ts 的 BoardLiveSession 的键）。
 * 整表 select('*') 时每场约七成体积是没人读的 id / source / created_at / updated_at；开播记录又占看板的大头，
 * 所以只查这几列，再由 assembleBoard 按账号打包成列式紧凑格式（见 liveSessionPack.ts）。
 * 新读一个开播记录字段时，同时加到这里和 BoardLiveSession——shot-window-wiring.test.ts 钉着两边一致。
 */
export const LIVE_SESSION_COLUMNS = 'competitor_id, started_at, ended_at, title, likes'

```

`getCompetitorBoard` 文档注释第一段改为：

```
 * 第一轮并行整表拉全：竞品、快照、截图索引（瘦查询）、风格描述、开播记录（只查 LIVE_SESSION_COLUMNS）。
 * 开播记录一个号三个月就有几十场，同样很快过千，所以也要分页拉全。
```

两处开播记录查询（`getCompetitorBoard` 与 `getAskBoard`）都从

```ts
    fetchAllRows((from, to) => db.from('competitor_live_sessions').select('*')
      .order('id', { ascending: true }).range(from, to)),
```

改为

```ts
    fetchAllRows((from, to) => db.from('competitor_live_sessions').select(LIVE_SESSION_COLUMNS)
      .order('id', { ascending: true }).range(from, to)),
```

两处 `(liveRes.data ?? []) as CompetitorLiveSession[],` 都改为 `(liveRes.data ?? []) as BoardLiveSession[],`。`getAskBoard` 文档注释里「开播记录（LIVE History 导入）也要：」改为「开播记录（LIVE History 导入）也要，同样只查 LIVE_SESSION_COLUMNS：」。

（PostgREST 允许按未出现在 select 里的列排序，已用生产只读查询确认：只查这 5 列、`order('id')` 能取回全部行。）

- [ ] **Step 6: `liveBoard.ts`**

import 区加 `import { liveSessionRows } from './liveSessionPack.ts'`。`accountSpans` 的注释与函数体改为：

```ts
/**
 * 一个号的全部场次（导入的 LIVE History + 截图推断，合并去重，降序）。
 * 卡片（CompetitorCard）、开播记录弹窗（LiveSessionsModal）、开播时段页（flattenAccounts）取场次都只经过这里，组件里别再直接对 c 调 liveSpansOf。
 * 导入一侧经 liveSessionRows 解包：看板下发的是列式紧凑格式（liveSessionPack），见 liveSessionPack.ts。
 * 开播场次喂哪批截图只在这里定：读 c.sessionShots——每场一条（开播时刻 + 最后一张截图时刻）的全部历史。
 * 不读 c.shots：相册按日期窗口加载，c.shots 只是已加载的那一段，场次不能跟着相册翻页变。
 * 配对的另一处是 liveCoverage.patrolDaysOfBoard（巡检日的来源）。
 */
export function accountSpans(c: CompetitorWithHistory): LiveSpan[] {
  return liveSpansOf({ live_sessions: liveSessionRows(c), shots: c.sessionShots })
}
```

- [ ] **Step 7: `regionRuler.ts`**

import 区加：

```ts
import { liveSessionRows, type LiveSessionPack } from './liveSessionPack.ts'
```

`RulerInput` 里把

```ts
  /** LIVE History 粘贴导入的开播记录；与 sessionShots 合并后才是这个账号的场次。 */
  live_sessions?: { started_at: string; ended_at: string; likes: number | null; title: string }[] | null
```

替换为

```ts
  /**
   * LIVE History 粘贴导入的开播记录，即 CompetitorWithHistory.liveSessionPack（列式紧凑格式），
   * 经 liveSessionRows 解包；与 sessionShots 合并后才是这个账号的场次。
   */
  liveSessionPack?: LiveSessionPack | null
```

`buildRegionRuler` 里：

```ts
    const starts = liveStartsOf({ live_sessions: liveSessionRows(c), shots: c.sessionShots ?? [] }).filter((iso) => {
```

- [ ] **Step 8: `ask-context.ts`**

import 区（`import { liveStartsOf } from './liveSessions.ts'` 之前）加 `import { liveSessionRows } from './liveSessionPack.ts'`。`startsUpTo` 函数体改为：

```ts
function startsUpTo(c: CompetitorWithHistory<AskShot>, nowMs: number): string[] {
  return liveStartsOf({ live_sessions: liveSessionRows(c), shots: c.shots }).filter((iso) => Date.parse(iso) <= nowMs)
}
```

（问答看板的 `shots` 是全量 `AskShot`，与改动前 `liveStartsOf(c)` 读的是同一批。）

- [ ] **Step 9: `LiveSessionsModal.tsx` 与 `LiveSessionImport.tsx`**

`LiveSessionsModal.tsx`：import 区加 `import { liveSessionRows } from '@/lib/competitors/liveSessionPack'`；在 `const spans = useMemo(() => accountSpans(competitor), [competitor])` 之后加：

```tsx
  // 导入预览的「新增 / 更新」按开播时刻比对已有场次；看板下发的是紧凑格式，先解包。
  const existing = useMemo(() => liveSessionRows(competitor), [competitor])
```

并把 `existing={competitor.live_sessions}` 改为 `existing={existing}`。

`LiveSessionImport.tsx`：删除 `import type { CompetitorLiveSession } from '@/lib/competitors/types'`（先 `grep -n CompetitorLiveSession src/components/competitors/LiveSessionImport.tsx` 确认只剩 prop 这一处用到）；`LiveImportPanel` 的 prop 类型改为：

```tsx
  /** 已导入的场次：只按开播时刻判「新增 / 更新」（diffAgainstExisting）。 */
  existing: { started_at: string }[]
```

- [ ] **Step 10: 改测试夹具**

`src/lib/competitors/assemble.test.ts`：
- 导入改为 `import type { BoardLiveSession, Competitor, CompetitorSnapshot, CompetitorShot } from './types.ts'`，再加 `import { packLiveSessions, unpackLiveSessions } from './liveSessionPack.ts'`。
- `assert.deepEqual(board.competitors[0].live_sessions, [], '不传开播记录时为空数组')` 改为 `assert.deepEqual(board.competitors[0].liveSessionPack, packLiveSessions([]), '不传开播记录时为空包')`。
- 把 `const live = …` 辅助函数与「开播记录按竞品归组、按开播时刻倒序」那条测试整体替换为：

```ts
/** 一条开播记录；用标题当标识（包里没有 id）。 */
const live = (competitor_id: string, started_at: string, title: string): BoardLiveSession => ({
  competitor_id, started_at, ended_at: started_at, title, likes: null,
})
const titlesOf = (c: { liveSessionPack: Parameters<typeof unpackLiveSessions>[0] }) =>
  unpackLiveSessions(c.liveSessionPack).map((s) => s.title)

test('assembleBoard: 开播记录按竞品归组、按开播时刻倒序后打包（按时刻比，不按字符串比）', () => {
  const board = assembleBoard(
    [comp(), comp({ id: 'c2', handle: 'b' })],
    [],
    [],
    true,
    [],
    [
      live('c1', '2026-09-16T07:47:00+00:00', 'old'),
      // 带 +09:00 的写法字符串上「更晚」（10-09 > 10-08），按时刻却是 10-08 23:00Z，
      // 比下面那条早半小时 —— 按字符串排序会把这两条排反。
      live('c1', '2026-10-09T08:00:00+09:00', 'jst'),
      live('c1', '2026-10-08T23:30:00.000Z', 'latest'),
      live('c2', '2026-10-01T00:00:00Z', 'other'),
    ],
  )
  assert.deepEqual(titlesOf(board.competitors[0]), ['latest', 'jst', 'old'])
  assert.deepEqual(titlesOf(board.competitors[1]), ['other'])
  assert.deepEqual(unpackLiveSessions(board.competitors[0].liveSessionPack).map((s) => s.started_at), [
    '2026-10-08T23:30:00.000Z', '2026-10-08T23:00:00.000Z', '2026-09-16T07:47:00.000Z',
  ])
})

test('assembleBoard: 子账号的开播记录打包在子账号自己身上，挂到父的 related 后照样读得到', () => {
  const board = assembleBoard(
    [comp({ id: 'p', handle: 'parent' }), comp({ id: 'k', handle: 'kid', parent_id: 'p' })],
    [],
    [],
    true,
    [],
    [live('k', '2026-10-01T03:00:00Z', 'kid live'), live('p', '2026-10-02T03:00:00Z', 'parent live')],
  )
  assert.equal(board.competitors.length, 1)
  assert.deepEqual(titlesOf(board.competitors[0]), ['parent live'])
  assert.deepEqual(titlesOf(board.competitors[0].related[0]), ['kid live'])
})
```

`src/lib/competitors/liveBoard.test.ts`：加 `import { packLiveSessions } from './liveSessionPack.ts'`；`comp()` 默认值里 `live_sessions: [],` 改为 `liveSessionPack: packLiveSessions([]),`；两处

```ts
    live_sessions: [{ started_at: j('2026-09-01', '12:00'), ended_at: j('2026-09-01', '14:00'), likes: 5, title: 'T' } as CompetitorWithHistory['live_sessions'][number]],
```

都改为

```ts
    liveSessionPack: packLiveSessions([{ started_at: j('2026-09-01', '12:00'), ended_at: j('2026-09-01', '14:00'), likes: 5, title: 'T' }]),
```

并在 `accountSpans: 导入 + 截图推断合并…` 那条测试的 `assert.equal(spans[1].likes, 5)` 之后加 `assert.equal(spans[1].title, 'T', '标题随包下发，弹窗清单照常显示')`。

`src/lib/competitors/regionRuler.test.ts`：加 `import { packLiveSessions } from './liveSessionPack.ts'`；两处 `live_sessions: [ … ],` 改为 `liveSessionPack: packLiveSessions([ … ]),`（数组内容原样）。

`src/lib/competitors/ask-context.test.ts`：加 `import { packLiveSessions } from './liveSessionPack.ts'`；`comp()` 里 `live_sessions: over.live_sessions ?? [],` 改为 `liveSessionPack: over.liveSessionPack ?? packLiveSessions([]),`；三处测试里的 `live_sessions: [ … ]` / `live_sessions: [importedSession(…)]` 改为 `liveSessionPack: packLiveSessions([ … ])`（数组内容原样，`importedSession` 返回的多余字段可以留着）。

`src/lib/competitors/ask-prompt.test.ts`：加同一行 import；`comp()` 里 `live_sessions: over.live_sessions ?? [],` 改为 `liveSessionPack: over.liveSessionPack ?? packLiveSessions([]),`。

`src/lib/competitors/shotWindow.test.ts`：加同一行 import；`node()` 里 `live_sessions: [],` 改为 `liveSessionPack: packLiveSessions([]),`。（第 140 行附近直接调 `liveSpansOf({ live_sessions: … })` 的几处是 `liveSpansOf` 自己的入参，不改。）

- [ ] **Step 11: 跑相关测试与类型检查**

Run:

```bash
node --test --experimental-strip-types src/lib/competitors/liveSessionPack.test.ts src/lib/competitors/live-session-pack-wiring.test.ts src/lib/competitors/shot-window-wiring.test.ts src/lib/competitors/assemble.test.ts src/lib/competitors/liveBoard.test.ts src/lib/competitors/regionRuler.test.ts src/lib/competitors/ask-context.test.ts src/lib/competitors/ask-prompt.test.ts src/lib/competitors/shotWindow.test.ts src/components/competitors/album-windowing-wiring.test.ts
npx tsc --noEmit
```

Expected: 测试 `# fail 0`；tsc 无输出。tsc 若报其它文件读 `live_sessions`，按 Step 6–9 的同一写法改成经 `liveSessionRows`（并在报告里列出是哪个文件）。

- [ ] **Step 12: 更新日志**

在 `src/lib/changelog/entries.ts` 的 `CHANGELOG` 里加一条。顶部那一天如果就是今天，插到该组 `items` 的最前面；顶部日期早于今天，就在数组最前面新建当天的组（`date` 写今天，YYYY-MM-DD）：

```ts
      {
        kind: 'improve',
        scope: '竞品监测',
        title: '竞品页和「开播时段」页打开更快：开播记录的下载量降到原来的约四分之一',
        details:
          '这两个页面每次打开都要下载全部开播记录（目前约 2600 场）。以前每一场都带着几项页面用不到的内部字段，时间也写成很长的文字，开播记录占了整页数据的八成。现在只下载页面要用的开播、下播时刻、点赞和标题，并换成更紧凑的写法，整页数据从约 1MB 降到约 300KB。卡片、开播记录弹窗、开播时段页、地区标尺和问答里的数字都和以前完全一样。',
      },
```

- [ ] **Step 13: 全量检查**

Run:

```bash
npm test 2>&1 | tail -6
npm run test:copy 2>&1 | tail -6
npx tsc --noEmit
```

Expected: `npm test` 为 `# fail 0`，且输出里能找到 `live-session-pack-wiring` 那几条测试名（新文件被跑到）；`test:copy` 全过；tsc 无输出。

- [ ] **Step 14: 提交**

```bash
git branch --show-current   # 必须是 perf/competitor-live-session-pack
git add -A src/lib/competitors src/components/competitors src/lib/changelog/entries.ts package.json
git status --short          # 只应有本任务列出的文件
git commit -m "perf(competitors): 看板开播记录只查 5 列并按账号列式打包下发，读取统一经 liveSessionRows

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

**突变探针候选：** `assembleBoard` 去掉排序；`accountSpans` 的 `live_sessions` 换成 `[]`；地区标尺不解包（`live_sessions: []`）；问答 `startsUpTo` 去掉导入一侧；`getCompetitorBoard` 或 `getAskBoard` 改回 `select('*')`；`LIVE_SESSION_COLUMNS` 删掉 `likes` 或 `title`；弹窗 `existing={[]}`；`assembleBoard` 把子账号的包挂到父账号上。每一条都应有测试变红。

---

### Task 3: 生产只读对拍与体积（主控执行，需要生产只读凭据）

不提交任何文件；脚本与输出都放会话 scratchpad。只读：脚本只调 `getCompetitorBoard` / `getAskBoard` / `getCompanyOfCompetitor`。

- [ ] **Step 1: 建基线 worktree**

```bash
git fetch origin main
git worktree add --detach "$SCRATCH/base" origin/main
ln -s "$PWD/node_modules" "$SCRATCH/base/node_modules"
```

（`$SCRATCH` 是会话 scratchpad；`$PWD` 是本分支 worktree，其 `node_modules` 可用。）

- [ ] **Step 2: 写对拍脚本 `$SCRATCH/parity.mts`**

```ts
// 生产只读对拍：BASE_DIR = origin/main 的 detached worktree，HEAD_DIR = 本分支 worktree。
// 两边各用自己的 lib 从同一份生产数据算出全部派生值，逐项比较 JSON。
import { gzipSync } from 'node:zlib'

const BASE = process.env.BASE_DIR as string
const HEAD = process.env.HEAD_DIR as string
const load = async (root: string) => ({
  service: await import(`${root}/src/lib/competitors/service.ts`),
  liveBoard: await import(`${root}/src/lib/competitors/liveBoard.ts`),
  liveSlots: await import(`${root}/src/lib/competitors/liveSlots.ts`),
  liveStats: await import(`${root}/src/lib/competitors/liveStats.ts`),
  liveCoverage: await import(`${root}/src/lib/competitors/liveCoverage.ts`),
  liveSessions: await import(`${root}/src/lib/competitors/liveSessions.ts`),
  liveHistory: await import(`${root}/src/lib/competitors/liveHistory.ts`),
  regionRuler: await import(`${root}/src/lib/competitors/regionRuler.ts`),
  regions: await import(`${root}/src/lib/competitors/regions.ts`),
  ask: await import(`${root}/src/lib/competitors/ask-context.ts`),
  zoned: await import(`${root}/src/lib/time/zonedTime.ts`),
})
const base = await load(BASE)
const head = await load(HEAD)
const pack = await import(`${HEAD}/src/lib/competitors/liveSessionPack.ts`)

const nowMs = Date.now()
const now = new Date(nowMs)
const [bBoard, hBoard, bAsk, hAsk, companies] = await Promise.all([
  base.service.getCompetitorBoard('parity'), head.service.getCompetitorBoard('parity'),
  base.service.getAskBoard('parity'), head.service.getAskBoard('parity'),
  base.service.getCompanyOfCompetitor(),
])
for (const r of [bBoard, hBoard, bAsk, hAsk, companies]) if (r.error) throw new Error(r.error.message)

const flat = (list: any[], out: any[] = []) => { for (const c of list) { out.push(c); flat(c.related, out) } return out }

function derive(L: any, board: any, askBoard: any, existingOf: (c: any) => { started_at: string }[]) {
  const out: Record<string, unknown> = {}
  const HOME = L.liveBoard.HOME_ZONE
  const todayHome = L.zoned.zonedYmd(nowMs, HOME)
  const patrol = L.liveCoverage.patrolDaysOfBoard(board)
  // 卡片 + 弹窗（每个账号，含子账号）
  for (const c of flat(board.competitors)) {
    const tz = L.liveSessions.regionTimeZone(c.region, 'Asia/Tokyo')
    const today = L.zoned.zonedYmd(nowMs, tz)
    const spans = L.liveBoard.accountSpans(c)
    const starts = spans.map((s: any) => s.startedAt)
    const located = L.liveStats.locateSpans(spans, tz)
    const hasData = L.liveCoverage.coverageOf(located, patrol)
    const earliest = located.reduce((m: string | null, s: any) => (m == null || s.date < m ? s.date : m), null)
    const allFrom = earliest != null && earliest < today ? earliest : today
    const from30 = L.zoned.addDaysYmd(today, -29)
    const parsed = [...spans.filter((s: any) => s.source === 'history').map((s: any) => ({ started_at: s.startedAt })), { started_at: '2099-01-01T00:00:00.000Z' }]
    out[`card:${c.id}`] = {
      spans,
      habit: L.liveSlots.summarizeLiveHabit(starts, tz),
      recent: L.liveSlots.recentSessionStarts(starts, 8),
      w30: L.liveStats.windowStats(located, from30, today, hasData),
      prev30: L.liveStats.windowStats(located, L.zoned.addDaysYmd(today, -59), L.zoned.addDaysYmd(today, -30), hasData),
      all: L.liveStats.windowStats(located, allFrom, today, hasData),
      likes30: L.liveStats.likesSeries(located, from30, today),
      likesAll: L.liveStats.likesSeries(located, allFrom, today),
      importDiff: L.liveHistory.diffAgainstExisting(parsed, existingOf(c)),
    }
  }
  // 开播时段页
  const accounts = L.liveBoard.flattenAccounts(board.competitors, companies.data)
  out.accounts = accounts
  for (const { code } of L.liveBoard.liveCountries(accounts)) {
    const listed = L.liveBoard.countryAccounts(accounts, code)
    const bounds = L.liveBoard.monthBounds(listed, todayHome, HOME)
    for (let m = bounds.from; m <= bounds.to; m = L.liveBoard.shiftMonth(m, 1)) {
      out[`month:${code}:${m}`] = listed.map((a: any) =>
        L.liveBoard.monthRow(a, m, L.liveSessions.regionTimeZone(a.region, HOME), patrol, todayHome))
    }
  }
  for (const a of L.liveBoard.roomAccounts(accounts)) {
    const tz = L.liveSessions.regionTimeZone(a.region, 'Asia/Tokyo')
    const bounds = L.liveBoard.monthBounds([a], todayHome, tz)
    const months: Record<string, unknown> = {}
    for (let m = bounds.from; m <= bounds.to; m = L.liveBoard.shiftMonth(m, 1)) {
      months[m] = { row: L.liveBoard.monthRow(a, m, tz, patrol, todayHome), summary: L.liveBoard.roomMonthSummary(a, m, tz, patrol) }
    }
    out[`room:${a.id}`] = { history: L.liveBoard.roomHistoryRange(a, tz), months }
  }
  const range = L.liveBoard.timetableRange(todayHome)
  for (const mode of ['jst', 'local']) {
    out[`timetable:${mode}`] = accounts.map((a: any) =>
      L.liveBoard.densityColumn(a.spans, { from: range.from, to: range.to, timeZone: L.liveBoard.timetableZone(a.region, mode) }))
  }
  // 地区标尺
  for (const code of L.regions.REGION_CODES) {
    out[`ruler:${code}`] = L.regionRuler.buildRegionRuler({
      competitors: board.competitors, region: code, timeZone: L.liveSessions.REGION_TIME_ZONE[code], now: now.toISOString(),
    })
  }
  // 问答数据包
  for (const locale of ['zh', 'en', 'ja']) out[`ask:${locale}`] = L.ask.buildAskContext(askBoard, now, locale)
  return out
}

const b = derive(base, bBoard.data, bAsk.data, (c) => c.live_sessions)
const h = derive(head, hBoard.data, hAsk.data, (c) => pack.liveSessionRows(c))

let mismatches = 0
const keys = new Set([...Object.keys(b), ...Object.keys(h)])
for (const k of keys) {
  if (JSON.stringify(b[k]) !== JSON.stringify(h[k])) { mismatches += 1; console.log('MISMATCH', k) }
}

// 直接核对无损：每个账号解包后的行 = 基线库行（按时刻、点赞、标题、顺序）
let rows = 0
for (const [bc, hc] of flat(bBoard.data.competitors).map((c, i) => [c, flat(hBoard.data.competitors)[i]])) {
  if (bc.id !== hc.id) throw new Error(`账号顺序不一致 ${bc.id} ${hc.id}`)
  const want = bc.live_sessions.map((s: any) => [Date.parse(s.started_at), Date.parse(s.ended_at), s.likes, s.title])
  const got = pack.liveSessionRows(hc).map((s: any) => [Date.parse(s.started_at), Date.parse(s.ended_at), s.likes, s.title])
  rows += want.length
  if (JSON.stringify(want) !== JSON.stringify(got)) { mismatches += 1; console.log('ROWS MISMATCH', bc.id) }
}

const size = (x: unknown) => { const s = JSON.stringify(x); return `${(Buffer.byteLength(s) / 1024).toFixed(0)}KB raw / ${(gzipSync(s).length / 1024).toFixed(0)}KB gz` }
console.log(`compared ${keys.size} keys, ${rows} session rows, mismatches = ${mismatches}`)
console.log('board base:', size(bBoard.data), '→ head:', size(hBoard.data))
console.log('ask   base:', size(bAsk.data), '→ head:', size(hAsk.data))
process.exit(mismatches ? 1 : 0)
```

- [ ] **Step 3: 跑**

```bash
BASE_DIR="$SCRATCH/base" HEAD_DIR="$PWD" node --env-file=<主仓>/.env.local --experimental-strip-types "$SCRATCH/parity.mts"
```

Expected: `mismatches = 0`；`compared` 的键数 > 100、`session rows` 等于当时库里的场次数；看板体积约 1063KB → 约 300KB raw、157KB → 约 60KB gz。两次读之间如果恰好有人导入了开播记录，会出现成片的 MISMATCH——重跑一次；仍不一致就停下排查，不往下走。

- [ ] **Step 4: 清理基线 worktree**

```bash
git worktree remove --force "$SCRATCH/base"
```

---

### Task 4: 生产构建实看（主控执行）

- [ ] **Step 1: 构建并启动**

```bash
npx next build 2>&1 | tail -25     # 判据看路由表与 .next/BUILD_ID，不只看退出码
npx next start -p 3107
```

- [ ] **Step 2: 浏览器实看（内置浏览器，登录由仓库负责人完成）**

- `/competitors`：任一有导入记录的卡片，「近 30 天 N 场」、常见开播与线上一致；打开开播记录弹窗，清单里有标题、点赞；切「全部」场次数与线上一致；点「粘贴导入」，粘一段已导入过的 History，预览显示「更新」计数（不点导入）。
- 地区标签浮层的标尺正常。
- `/competitors/live`：时段对比、国家月历、单个直播间、趋势总结四个视图都正常渲染，与线上对照一两个数字。
- 用 `read_network_requests` 量 `/competitors` 文档与 `GET /api/competitors` 的响应体积，记入 PR 描述。

- [ ] **Step 3: 停服务**

停掉 `next start` 进程。

---

## 收尾（主控）

- 整个分支走一次全量审查（跨任务整体走查）。
- 推送前重新 `git fetch origin main`，确认 `git merge-base HEAD origin/main` 非空（分支基于重写后的历史）；main 有新提交就 rebase 后重跑 `npm test` / tsc。
- 推功能分支、开 PR（描述写对拍结论与体积数字，不写本机路径）；合并前先征得仓库负责人同意。
- 合并后用 `vercel inspect` 核对生产部署 target / Ready / 两个域名别名，再线上只读量一次体积。
