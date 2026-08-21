# 单直播间分钟级打点 · 第一期（采集链路）实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 交付一个能全程跟完一场竞品直播、每分钟落一个数据点到本地 JSONL 的采集器，并在这一场里跑出 spec 第 11 节三项验证的明确结论。

**Architecture:** 纯逻辑（页面数据规范化、看门狗状态机、下播判定、路径生成、探针源码）放 `src/lib/competitors/`，用 `node --test` 覆盖；CDP 胶水放 `scripts/live-watch/track-room.ts`，靠一场真实直播验证。探针以字符串注入直播间页面，因此写成「工厂函数源码」——注入时用真 `window`/`document` 调用，测试时用假 DOM 调用，同一份代码两边跑。

**Tech Stack:** Node 26 内置 test runner（`node --test --experimental-strip-types`）、Chrome DevTools Protocol（裸 WebSocket，无 puppeteer）、TypeScript 类型剥离运行（不编译）。

**本期不做：** 数据库、截图内容去重、LLM 打标、报表页。全部留给第二、三期，且第二三期的计划要等本期三项验证有结论后再写——验证结果会改变它们的形状。

---

## 前置说明（实现者必读）

**1. 测试文件必须登记到 `package.json`。** 本仓的 `test` 脚本是一份**显式文件清单**（`package.json:16` 那一行很长的 `node --test ...`），新增 `.test.ts` 不会被自动发现。忘了加，测试就是没跑。这一行也是本仓历史上最容易产生 PR 冲突的地方——rebase 时优先检查它。

**2. 纯函数模块的约定。** 看 `src/lib/competitors/metrics.ts` 开头那句注释：「纯函数，零 import：供采集脚本（`--experimental-strip-types`）与视图共用」。新建的 lib 文件遵守同一约定——可以 import 同目录的其它纯函数模块，不要 import React、Supabase、Next 的任何东西，否则脚本侧会炸。

**3. 脚本用 TS 直跑，不编译。** 参照 `scripts/record-competitor-snapshot.ts` 的头部注释：运行方式是 `node --env-file=.env.local --experimental-strip-types scripts/xxx.ts`，import lib 时**必须带 `.ts` 后缀**（`from '../../src/lib/competitors/liveTrack.ts'`），不能用 `@/` 别名——那是 Next 的 tsconfig paths，node 不认。

**4. 提交前跑门禁。** `npm run test:copy`（含 i18n / 裸中文 / 设计 token / lint 四项）。注意 `check-style-tokens.mjs` 只扫 `src/`，且它会把注释里形如 `#249` 的东西误判成裸 hex 色值——写 PR 编号一律写成 `PR 249`，别带井号。

**5. `sweep-live.mjs` 未入库。** 它只存在于 pollux 主仓的工作区（`/Users/fengzhou/Code/newWith/scripts/live-watch/sweep-live.mjs`），origin/main 上没有。本计划**不修改它**，而是把要复用的两段逻辑（下播判定、静音+精裁）作为新代码写进 `src/lib/competitors/`，附测试。将来 `sweep-live.mjs` 入库时应改成 import 这两份共享实现，那是另一个 PR 的事。

---

## 文件结构

**新建**

| 文件 | 职责 |
| --- | --- |
| `src/lib/competitors/liveTrack.ts` | 纯逻辑：下播判定、采样点规范化、看门狗状态机、本地路径生成 |
| `src/lib/competitors/liveTrack.test.ts` | 上述四组函数的单测 |
| `src/lib/competitors/liveProbe.ts` | 页内探针源码（工厂函数文本）+ 静音精裁 eval 源码 + 选择器候选表 |
| `src/lib/competitors/liveProbe.test.ts` | 用假 DOM 驱动探针，验证计数/去重/清零/选择器回退/幂等 |
| `scripts/live-watch/track-room.ts` | runner：建链、注入、每分钟排空、定时截图、看门狗、收工汇总 |

**修改**

| 文件 | 改动 |
| --- | --- |
| `package.json:16` | `test` 清单追加两个新测试文件 |

**边界**：`liveTrack.ts` 与 `liveProbe.ts` 之间零依赖。`liveProbe.ts` 只产出**字符串**（要注入页面的源码），不执行任何 DOM 操作；`liveTrack.ts` 只处理**已经取回 Node 侧的数据**。runner 是唯一同时依赖两者、且唯一碰 CDP 的文件。

---

## Task 1: 下播判定 `roomEnded`

直播结束页会展示「推荐直播」信息流，里面别人直播间的缩略 `<video>` 会被误判成本人在播。可靠的判法是房间状态码：rehydration JSON 里 `"status":2` = 在播，`"status":4` = 已结束；**只有拿到 4 且没有 2 才算真结束**。

**Files:**
- Create: `src/lib/competitors/liveTrack.ts`
- Create: `src/lib/competitors/liveTrack.test.ts`
- Modify: `package.json:16`

- [ ] **Step 1: 写失败的测试**

创建 `src/lib/competitors/liveTrack.test.ts`：

```ts
// src/lib/competitors/liveTrack.test.ts
import assert from 'node:assert/strict'
import test from 'node:test'

import { roomEnded } from './liveTrack.ts'

test('roomEnded: 只有 status 4 且无 2 才算结束', () => {
  assert.equal(roomEnded('{"status":4}'), true)
})

test('roomEnded: 同时出现 2 和 4 视为在播（结束页混着别人的在播卡片）', () => {
  assert.equal(roomEnded('{"status":4} ... {"status":2}'), false)
})

test('roomEnded: 只有 status 2 是在播', () => {
  assert.equal(roomEnded('{"status":2}'), false)
})

test('roomEnded: 认 liveStatus / live_status 两种写法', () => {
  assert.equal(roomEnded('{"liveStatus":4}'), true)
  assert.equal(roomEnded('{"live_status":4}'), true)
})

test('roomEnded: 读不到任何状态码时不下结论（返回 false，交给其它信号）', () => {
  assert.equal(roomEnded(''), false)
  assert.equal(roomEnded('<html><body>whatever</body></html>'), false)
})

test('roomEnded: 容忍冒号两侧空格', () => {
  assert.equal(roomEnded('{"status" : 4}'), true)
})
```

- [ ] **Step 2: 跑测试，确认它失败**

```bash
node --test --experimental-strip-types src/lib/competitors/liveTrack.test.ts
```

预期：报错 `Cannot find module .../liveTrack.ts`。

- [ ] **Step 3: 写最小实现**

创建 `src/lib/competitors/liveTrack.ts`：

```ts
// 纯函数，只 import 同目录纯函数模块：供采集脚本（--experimental-strip-types）与视图共用。
// 单直播间分钟级打点的 Node 侧逻辑。页内探针源码在 liveProbe.ts，两者零依赖。

/**
 * 页面是否已下播。
 * rehydration JSON 里 "status":2=在播、4=已结束。结束页会混入「推荐直播」信息流，
 * 那里面别人的在播卡片同样带 status 2 —— 所以只有「有 4 且没有 2」才判结束。
 * 一个状态码都读不到时返回 false：不下结论，交给看门狗的其它信号。
 */
export function roomEnded(html: string): boolean {
  const codes = new Set<number>()
  for (const m of html.matchAll(/"(?:status|liveStatus|live_status)"\s*:\s*(\d)/g)) {
    codes.add(Number(m[1]))
  }
  return codes.has(4) && !codes.has(2)
}
```

- [ ] **Step 4: 跑测试，确认全绿**

```bash
node --test --experimental-strip-types src/lib/competitors/liveTrack.test.ts
```

预期：`# pass 6`、`# fail 0`。

- [ ] **Step 5: 把测试文件登记进 `package.json`**

在 `package.json:16` 的 `test` 值里，紧跟在 `src/lib/competitors/shotUptime.test.ts` 之后插入一个空格加 `src/lib/competitors/liveTrack.test.ts`。改完确认整份测试仍然全绿：

```bash
npm test 2>&1 | tail -5
```

预期：`# fail 0`。

- [ ] **Step 6: 提交**

```bash
git add src/lib/competitors/liveTrack.ts src/lib/competitors/liveTrack.test.ts package.json
git commit -m "feat(live-track): 下播判定 roomEnded(状态码 4 且无 2)+ 单测"
```

---

## Task 2: 采样点规范化 `normalizeSample`

探针交回来的是页面上的原始文本（`"1.2K"`、`"34.5M"`）。Node 侧统一转成数字、算出距开播秒数、保留自检信息。

**Files:**
- Modify: `src/lib/competitors/liveTrack.ts`
- Modify: `src/lib/competitors/liveTrack.test.ts`

- [ ] **Step 1: 写失败的测试**

追加到 `src/lib/competitors/liveTrack.test.ts` 末尾：

```ts
import { normalizeSample, type ProbeSample } from './liveTrack.ts'

const probeSample = (over: Partial<ProbeSample> = {}): ProbeSample => ({
  t: 1_755_000_600_000, // 2026-08-12T12:10:00Z
  viewer: '1.2K',
  followers: '34.5M',
  likes: '2,340',
  msgs: 17,
  speakers: 9,
  observerAlive: true,
  selectorsOk: { viewer: '[data-e2e="x"]', followers: null, likes: null, chatHost: '.chat' },
  ...over,
})

test('normalizeSample: 文本计数转数字，算出距开播秒数', () => {
  const s = normalizeSample(probeSample(), 1_755_000_000) // 开播比采样早 600 秒
  assert.equal(s.viewer_count, 1200)
  assert.equal(s.follower_count, 34_500_000)
  assert.equal(s.like_total, 2340)
  assert.equal(s.chat_msgs, 17)
  assert.equal(s.chat_speakers, 9)
  assert.equal(s.elapsed_seconds, 600)
  assert.equal(s.sampled_at, '2026-08-12T12:10:00.000Z')
})

test('normalizeSample: 开播时间未知则 elapsed_seconds 为 null，不猜', () => {
  assert.equal(normalizeSample(probeSample(), null).elapsed_seconds, null)
})

test('normalizeSample: 读不到的字段是 null，不是 0', () => {
  const s = normalizeSample(probeSample({ viewer: null, followers: '', likes: 'N/A' }), 1_755_000_000)
  assert.equal(s.viewer_count, null)
  assert.equal(s.follower_count, null)
  assert.equal(s.like_total, null)
})

test('normalizeSample: 自检信息原样带进 raw，供报表判可信度', () => {
  const s = normalizeSample(probeSample({ observerAlive: false }), 1_755_000_000)
  assert.equal(s.raw.observer_alive, false)
  assert.equal(s.raw.selectors_ok.viewer, '[data-e2e="x"]')
  assert.equal(s.raw.selectors_ok.followers, null)
})

test('normalizeSample: 采样早于开播时间时 elapsed 不为负，钳到 0', () => {
  const s = normalizeSample(probeSample(), 1_755_000_900) // 开播晚于采样 300 秒
  assert.equal(s.elapsed_seconds, 0)
})
```

- [ ] **Step 2: 跑测试，确认它失败**

```bash
node --test --experimental-strip-types src/lib/competitors/liveTrack.test.ts
```

预期：`SyntaxError` 或 `normalizeSample is not a function` —— 因为 `liveTrack.ts` 还没导出它。

- [ ] **Step 3: 写最小实现**

在 `src/lib/competitors/liveTrack.ts` 顶部加 import，并追加以下内容：

```ts
import { parseCount } from './metrics.ts'
```

```ts
/** 探针从页面交回的一条原始读数。字段都可能读不到 —— 读不到就是 null。 */
export type ProbeSample = {
  /** 探针打点时刻，epoch 毫秒 */
  t: number
  viewer: string | null
  followers: string | null
  likes: string | null
  /** 本分钟弹幕条数 */
  msgs: number
  /** 本分钟去重后的发言人数 */
  speakers: number
  observerAlive: boolean
  /** 每个字段实际命中了候选表里的哪个选择器；没命中是 null */
  selectorsOk: Record<string, string | null>
}

/** 规范化后的一分钟采样点。落 JSONL 用的就是这个形状。 */
export type Sample = {
  sampled_at: string
  elapsed_seconds: number | null
  viewer_count: number | null
  follower_count: number | null
  like_total: number | null
  chat_msgs: number
  chat_speakers: number
  raw: {
    observer_alive: boolean
    selectors_ok: Record<string, string | null>
    viewer_text: string | null
    followers_text: string | null
    likes_text: string | null
  }
}

/**
 * 探针原始读数 → 规范化采样点。
 * startedAt 为本场开播的 epoch 秒（runner 侧读到并持有）；未知时 elapsed_seconds 留 null
 * 而不是猜一个值 —— 报表 x 轴靠它，猜错整条曲线就错位。
 */
export function normalizeSample(p: ProbeSample, startedAt: number | null): Sample {
  const elapsed =
    startedAt == null ? null : Math.max(0, Math.round(p.t / 1000) - startedAt)
  return {
    sampled_at: new Date(p.t).toISOString(),
    elapsed_seconds: elapsed,
    viewer_count: parseCount(p.viewer),
    follower_count: parseCount(p.followers),
    like_total: parseCount(p.likes),
    chat_msgs: p.msgs,
    chat_speakers: p.speakers,
    raw: {
      observer_alive: p.observerAlive,
      selectors_ok: p.selectorsOk,
      viewer_text: p.viewer,
      followers_text: p.followers,
      likes_text: p.likes,
    },
  }
}
```

- [ ] **Step 4: 跑测试，确认全绿**

```bash
node --test --experimental-strip-types src/lib/competitors/liveTrack.test.ts
```

预期：`# pass 11`、`# fail 0`。

- [ ] **Step 5: 提交**

```bash
git add src/lib/competitors/liveTrack.ts src/lib/competitors/liveTrack.test.ts
git commit -m "feat(live-track): 采样点规范化(文本计数转数字/距开播秒数)+ 单测"
```

---

## Task 3: 看门狗状态机 `nextWatchdog`

每分钟排空之后判断：继续、重注入探针、还是判定下播收工。做成纯状态机，因为这是最容易写错、又最难在真实直播里复现的部分。

规则：
- 读到 `status:4` 且无 `2` → 立即 `end`（这是最可靠的下播信号）
- 本轮有采样点、observer 活着、`<video>` 还在 → 计数器归零，`ok`
- 否则算一次不健康：重注入次数还没到 2 次 → `reinject`；已经到 2 次 → `end`

**Files:**
- Modify: `src/lib/competitors/liveTrack.ts`
- Modify: `src/lib/competitors/liveTrack.test.ts`

- [ ] **Step 1: 写失败的测试**

追加到 `src/lib/competitors/liveTrack.test.ts` 末尾：

```ts
import { nextWatchdog, initialWatchdog, type DrainHealth } from './liveTrack.ts'

const health = (over: Partial<DrainHealth> = {}): DrainHealth => ({
  samples: 1,
  observerAlive: true,
  hasVideo: true,
  roomEnded: false,
  ...over,
})

test('nextWatchdog: 一切正常 → ok', () => {
  const r = nextWatchdog(initialWatchdog(), health())
  assert.equal(r.action, 'ok')
  assert.equal(r.state.reinjects, 0)
})

test('nextWatchdog: 页面判定已结束 → 立即 end，不重注入', () => {
  const r = nextWatchdog(initialWatchdog(), health({ roomEnded: true, samples: 5 }))
  assert.equal(r.action, 'end')
})

test('nextWatchdog: 排空为空 → 先重注入', () => {
  const r = nextWatchdog(initialWatchdog(), health({ samples: 0 }))
  assert.equal(r.action, 'reinject')
  assert.equal(r.state.reinjects, 1)
})

test('nextWatchdog: observer 掉了 → 重注入', () => {
  assert.equal(nextWatchdog(initialWatchdog(), health({ observerAlive: false })).action, 'reinject')
})

test('nextWatchdog: video 没了 → 重注入', () => {
  assert.equal(nextWatchdog(initialWatchdog(), health({ hasVideo: false })).action, 'reinject')
})

test('nextWatchdog: 连续三轮不健康 → 第三轮判 end', () => {
  let st = initialWatchdog()
  const bad = health({ samples: 0 })
  let r = nextWatchdog(st, bad)
  assert.equal(r.action, 'reinject')
  r = nextWatchdog(r.state, bad)
  assert.equal(r.action, 'reinject')
  r = nextWatchdog(r.state, bad)
  assert.equal(r.action, 'end')
})

test('nextWatchdog: 重注入后恢复健康 → 计数器清零，能再扛两次', () => {
  let r = nextWatchdog(initialWatchdog(), health({ samples: 0 }))
  assert.equal(r.state.reinjects, 1)
  r = nextWatchdog(r.state, health())
  assert.equal(r.action, 'ok')
  assert.equal(r.state.reinjects, 0)
  r = nextWatchdog(r.state, health({ samples: 0 }))
  assert.equal(r.action, 'reinject')
})
```

- [ ] **Step 2: 跑测试，确认它失败**

```bash
node --test --experimental-strip-types src/lib/competitors/liveTrack.test.ts
```

预期：`nextWatchdog is not a function`。

- [ ] **Step 3: 写最小实现**

追加到 `src/lib/competitors/liveTrack.ts`：

```ts
/** 一轮排空之后观察到的健康状况。 */
export type DrainHealth = {
  /** 本轮从探针取回几个采样点 */
  samples: number
  observerAlive: boolean
  hasVideo: boolean
  /** roomEnded() 的结论 */
  roomEnded: boolean
}

export type WatchdogState = { reinjects: number }
export type WatchdogAction = 'ok' | 'reinject' | 'end'

const MAX_REINJECTS = 2

export function initialWatchdog(): WatchdogState {
  return { reinjects: 0 }
}

/**
 * 看门狗一步。
 * status 码判结束最可靠，命中就立即收工，不浪费两轮重注入。
 * 其余异常一律先试重注入 —— 探针掉了比直播结束常见得多（页面局部重渲染就够）。
 * 重注入两次仍然没数据，才判下播。
 */
export function nextWatchdog(
  state: WatchdogState,
  h: DrainHealth,
): { state: WatchdogState; action: WatchdogAction } {
  if (h.roomEnded) return { state, action: 'end' }
  const healthy = h.samples > 0 && h.observerAlive && h.hasVideo
  if (healthy) return { state: { reinjects: 0 }, action: 'ok' }
  if (state.reinjects >= MAX_REINJECTS) return { state, action: 'end' }
  return { state: { reinjects: state.reinjects + 1 }, action: 'reinject' }
}
```

- [ ] **Step 4: 跑测试，确认全绿**

```bash
node --test --experimental-strip-types src/lib/competitors/liveTrack.test.ts
```

预期：`# pass 18`、`# fail 0`。

- [ ] **Step 5: 提交**

```bash
git add src/lib/competitors/liveTrack.ts src/lib/competitors/liveTrack.test.ts
git commit -m "feat(live-track): 看门狗状态机(重注入两次仍无数据才判下播)+ 单测"
```

---

## Task 4: 本地落盘路径 `sessionPaths`

一场一个目录。日期按**日本时间**取——竞品全是日区团播，深夜档跨 UTC 日界，用 `toISOString()` 会把 JST 次日 00:00–09:00 的场次归到前一天（`record-live-shot.mjs` 里已经踩过这个坑并写了注释）。

**Files:**
- Modify: `src/lib/competitors/liveTrack.ts`
- Modify: `src/lib/competitors/liveTrack.test.ts`

- [ ] **Step 1: 写失败的测试**

追加到 `src/lib/competitors/liveTrack.test.ts` 末尾：

```ts
import { sessionPaths } from './liveTrack.ts'

test('sessionPaths: 目录名用日本时间的 YYYYMMDD-HHmm', () => {
  // 1755000000 = 2026-08-12T11:20:00Z = JST 20:20
  const p = sessionPaths('/base', 'blank.s9', 1_755_000_000)
  assert.equal(p.dir, '/base/blank.s9/20260812-2020')
  assert.equal(p.samples, '/base/blank.s9/20260812-2020/samples.jsonl')
  assert.equal(p.frames, '/base/blank.s9/20260812-2020/frames')
  assert.equal(p.meta, '/base/blank.s9/20260812-2020/session.json')
})

test('sessionPaths: JST 深夜档归到 JST 当天，不被 UTC 拉回前一天', () => {
  // 1755014400 = 2026-08-12T15:20:00Z = JST 08-13 00:20
  assert.equal(sessionPaths('/base', 'x', 1_755_014_400).dir, '/base/x/20260813-0020')
})

test('sessionPaths: handle 里的危险字符换成下划线', () => {
  assert.equal(sessionPaths('/base', 'a/b c', 1_755_000_000).dir, '/base/a_b_c/20260812-2020')
})

test('sessionPaths: 开播时间未知时用 unknown 占位，仍然能落盘', () => {
  assert.equal(sessionPaths('/base', 'x', null).dir, '/base/x/unknown')
})
```

- [ ] **Step 2: 跑测试，确认它失败**

```bash
node --test --experimental-strip-types src/lib/competitors/liveTrack.test.ts
```

预期：`sessionPaths is not a function`。

- [ ] **Step 3: 写最小实现**

追加到 `src/lib/competitors/liveTrack.ts`：

```ts
/**
 * 目录名的时间戳按日本时间取，不用 toISOString()（那是 UTC）。
 * 竞品全是日区团播，深夜档落在 JST 次日 00:00–09:00 —— 走 UTC 会把它归到前一天，
 * 走本机时区（PDT）又会把傍晚场归到次日。同 record-live-shot.mjs 的处理。
 */
const SESSION_TZ = 'Asia/Tokyo'

function stampInTokyo(epochSec: number): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: SESSION_TZ,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(new Date(epochSec * 1000))
  const at = (type: string) => parts.find((p) => p.type === type)!.value
  return `${at('year')}${at('month')}${at('day')}-${at('hour')}${at('minute')}`
}

export type SessionPaths = {
  dir: string
  samples: string
  frames: string
  meta: string
}

/** 一场一个目录：<base>/<handle>/<JST 时间戳>/{samples.jsonl, frames/, session.json} */
export function sessionPaths(
  baseDir: string,
  handle: string,
  startedAt: number | null,
): SessionPaths {
  const safe = handle.replace(/[^a-z0-9._-]/gi, '_')
  const stamp = startedAt == null ? 'unknown' : stampInTokyo(startedAt)
  const dir = `${baseDir}/${safe}/${stamp}`
  return {
    dir,
    samples: `${dir}/samples.jsonl`,
    frames: `${dir}/frames`,
    meta: `${dir}/session.json`,
  }
}
```

- [ ] **Step 4: 跑测试，确认全绿**

```bash
node --test --experimental-strip-types src/lib/competitors/liveTrack.test.ts
```

预期：`# pass 22`、`# fail 0`。

- [ ] **Step 5: 提交**

```bash
git add src/lib/competitors/liveTrack.ts src/lib/competitors/liveTrack.test.ts
git commit -m "feat(live-track): 场次落盘路径(JST 时间戳目录)+ 单测"
```

---

## Task 5: 页内探针源码 `liveProbe.ts`

探针要以字符串注入页面，页面上下文没有模块系统。所以写成**工厂函数的源码文本**：注入时 `(工厂)(window, document, cfg)`，测试时用假 `win`/`doc` 调用同一份源码。工厂只碰传进来的 `win`/`doc`/`cfg`，绝不引用全局——这既是可测性要求，也保证注入后不污染页面。

选择器写成**候选数组，按顺序试，命中即用，并把命中的那个报回来**。spec 第 11 节验证项①还没有结论（迁移注释说 room-header 有 `person-count`，`sweep-live.mjs` 的注释说要走侧栏），候选表让第一次真实运行本身成为验证。

**Files:**
- Create: `src/lib/competitors/liveProbe.ts`
- Create: `src/lib/competitors/liveProbe.test.ts`
- Modify: `package.json:16`

- [ ] **Step 1: 写失败的测试**

创建 `src/lib/competitors/liveProbe.test.ts`：

```ts
// src/lib/competitors/liveProbe.test.ts
import assert from 'node:assert/strict'
import test from 'node:test'

import { PROBE_FACTORY_SRC, PROBE_VERSION, defaultProbeConfig } from './liveProbe.ts'

// ---- 假 DOM ----------------------------------------------------------------
// Node 没有 MutationObserver / document，工厂只碰传进来的 win/doc，所以这里手搓够用的替身。

type FakeEl = { textContent: string }

function el(textContent: string): FakeEl {
  return { textContent }
}

function makeDoc(map: Record<string, FakeEl>) {
  return {
    querySelector: (s: string) => map[s] ?? null,
    contains: (node: unknown) => Object.values(map).includes(node as FakeEl),
    documentElement: { outerHTML: '' },
  }
}

function makeWin(nowMs = 1_000_000) {
  const observers: { target: unknown; cb: (recs: unknown[]) => void }[] = []
  return {
    observers,
    now: nowMs,
    Date: { now: () => nowMs },
    setInterval: () => 0,
    MutationObserver: class {
      cb: (recs: unknown[]) => void
      constructor(cb: (recs: unknown[]) => void) { this.cb = cb }
      observe(target: unknown) { observers.push({ target, cb: this.cb }) }
      disconnect() {}
    },
  } as Record<string, unknown> & { observers: typeof observers }
}

/** 把源码文本变成可调用的工厂 —— 和注入页面时走的是同一份字符串。 */
const factory = new Function(`return (${PROBE_FACTORY_SRC})`)() as (
  win: unknown, doc: unknown, cfg: unknown,
) => { reused: boolean; attached: boolean }

/** 造一条弹幕节点：没有 querySelector，探针会退化成「首个冒号之前当发言人」。 */
function msgNode(speaker: string): FakeEl {
  return { textContent: speaker + ': hi' }
}

const cfg = (over: Record<string, unknown> = {}) => ({
  ...defaultProbeConfig(),
  intervalMs: 0, // 测试里不起定时器，手动调 tick()
  ...over,
})

// ---- 测试 ------------------------------------------------------------------

test('探针：累计弹幕条数，tick 后清零', () => {
  const chat = el('')
  const doc = makeDoc({ '.chat': chat })
  const win = makeWin()
  factory(win, doc, cfg({ chatHost: ['.chat'], viewer: [], followers: [], likes: [], speaker: [] }))
  const lw = (win as Record<string, any>).__lw

  win.observers[0].cb([{ addedNodes: [msgNode('a'), msgNode('b')] }])
  win.observers[0].cb([{ addedNodes: [msgNode('c')] }])
  lw.tick()
  assert.equal(lw.drain()[0].msgs, 3)

  lw.tick()
  assert.equal(lw.drain()[0].msgs, 0, 'tick 之后计数器必须归零，否则会累加成单调递增')
})

test('探针：发言人去重，按 tick 分桶', () => {
  const chat = el('')
  const doc = makeDoc({ '.chat': chat })
  const win = makeWin()
  // speaker 选择器留空 → 退化成用整条文本冒号前的部分当发言人标识
  factory(win, doc, cfg({ chatHost: ['.chat'], viewer: [], followers: [], likes: [], speaker: [] }))
  const lw = (win as Record<string, any>).__lw

  win.observers[0].cb([{ addedNodes: [msgNode('ann'), msgNode('ann'), msgNode('bob')] }])
  lw.tick()
  const s = lw.drain()[0]
  assert.equal(s.msgs, 3)
  assert.equal(s.speakers, 2, '同一个人刷三条只算一个发言人')
})

test('探针：选择器候选表按顺序回退，并报回命中的那个', () => {
  const doc = makeDoc({ '.chat': el(''), '[data-e2e="live-people-count"]': el('1.2K') })
  const win = makeWin()
  factory(win, doc, cfg({
    chatHost: ['.chat'],
    viewer: ['.does-not-exist', '[data-e2e="live-people-count"]'],
    followers: [], likes: [], speaker: [],
  }))
  const lw = (win as Record<string, any>).__lw
  lw.tick()
  const s = lw.drain()[0]
  assert.equal(s.viewer, '1.2K')
  assert.equal(s.selectorsOk.viewer, '[data-e2e="live-people-count"]')
})

test('探针：一个候选都没命中时该字段为 null，selectorsOk 记 null', () => {
  const doc = makeDoc({ '.chat': el('') })
  const win = makeWin()
  factory(win, doc, cfg({ chatHost: ['.chat'], viewer: ['.nope'], followers: [], likes: [], speaker: [] }))
  const lw = (win as Record<string, any>).__lw
  lw.tick()
  const s = lw.drain()[0]
  assert.equal(s.viewer, null)
  assert.equal(s.selectorsOk.viewer, null)
})

test('探针：同版本重复注入不重复挂 observer', () => {
  const doc = makeDoc({ '.chat': el('') })
  const win = makeWin()
  const c = cfg({ chatHost: ['.chat'], viewer: [], followers: [], likes: [], speaker: [] })
  factory(win, doc, c)
  const again = factory(win, doc, c)
  assert.equal(again.reused, true)
  assert.equal(win.observers.length, 1, '重复注入挂两个 observer 会让弹幕double count')
})

test('探针：找不到弹幕容器时仍然安装、仍能采数字，只是 attached=false', () => {
  const doc = makeDoc({ '[data-e2e="live-people-count"]': el('88') })
  const win = makeWin()
  const r = factory(win, doc, cfg({
    chatHost: ['.chat-not-here'],
    viewer: ['[data-e2e="live-people-count"]'],
    followers: [], likes: [], speaker: [],
  }))
  assert.equal(r.attached, false)
  const lw = (win as Record<string, any>).__lw
  lw.tick()
  const s = lw.drain()[0]
  assert.equal(s.viewer, '88', '弹幕挂不上不该拖累核心指标')
  assert.equal(s.observerAlive, false)
})

test('探针：drain 取走后缓冲区清空', () => {
  const doc = makeDoc({ '.chat': el('') })
  const win = makeWin()
  factory(win, doc, cfg({ chatHost: ['.chat'], viewer: [], followers: [], likes: [], speaker: [] }))
  const lw = (win as Record<string, any>).__lw
  lw.tick(); lw.tick()
  assert.equal(lw.drain().length, 2)
  assert.equal(lw.drain().length, 0)
})

test('PROBE_VERSION 是正整数（重注入幂等靠它）', () => {
  assert.ok(Number.isInteger(PROBE_VERSION) && PROBE_VERSION > 0)
})
```

- [ ] **Step 2: 跑测试，确认它失败**

```bash
node --test --experimental-strip-types src/lib/competitors/liveProbe.test.ts
```

预期：`Cannot find module .../liveProbe.ts`。

- [ ] **Step 3: 写最小实现**

创建 `src/lib/competitors/liveProbe.ts`：

```ts
// 纯字符串产出，零 import：这里的东西是要注入直播间页面执行的源码，
// 不在 Node 里跑，所以不能有任何 import / TS 语法进入字符串内部。
// 测试用假 DOM 调用同一份源码，保证「测的就是注入的」。

export const PROBE_VERSION = 1

export type ProbeConfig = {
  version: number
  /** 探针自己打点的间隔；<=0 表示不起定时器（测试用，由外部手动 tick） */
  intervalMs: number
  /** 在线人数的候选选择器，按顺序试 */
  viewer: string[]
  /** 主播粉丝数 */
  followers: string[]
  /** 累计点赞 */
  likes: string[]
  /** 弹幕列表容器 */
  chatHost: string[]
  /** 弹幕节点内的发言人元素；留空则退化为「整条文本首个冒号之前」 */
  speaker: string[]
  /** 弹幕容器是否需要监听子树（容器频繁重建时打开） */
  chatSubtree: boolean
}

/**
 * 候选选择器的初始猜测。这些值 spec 第 11 节验证项①还没定论 ——
 * 迁移注释记的是 room-header 的 person-count，sweep-live.mjs 的注释说右侧面板不稳、
 * 要走左侧已关注侧栏。所以这里给候选表按顺序试，第一次真实运行会把命中的那个
 * 通过 selectorsOk 报回来，那就是验证结论。
 */
export function defaultProbeConfig(): ProbeConfig {
  return {
    version: PROBE_VERSION,
    intervalMs: 60_000,
    viewer: [
      '[data-e2e="live-people-count"]',
      '[data-e2e="person-count"]',
      '[data-e2e="live-room-people-count"]',
    ],
    followers: [
      '[data-e2e="live-anchor-follower-count"]',
      '[data-e2e="followers-count"]',
    ],
    likes: [
      '[data-e2e="live-like-count"]',
      '[data-e2e="like-count"]',
    ],
    chatHost: [
      '[data-e2e="chat-room"]',
      '[data-e2e="live-chat-list"]',
    ],
    speaker: [
      '[data-e2e="message-owner-name"]',
    ],
    chatSubtree: false,
  }
}

/**
 * 页内探针的工厂函数源码。
 * 只接触 win / doc / cfg 三个参数，不引用任何全局 —— 既保证可测，
 * 也保证注入后除了 win.__lw 之外不碰页面上的任何东西。
 */
export const PROBE_FACTORY_SRC = `function (win, doc, cfg) {
  if (win.__lw && win.__lw.version === cfg.version) {
    return { reused: true, attached: !!win.__lw.attached, version: cfg.version }
  }
  function textOf(node) {
    return node && node.textContent ? String(node.textContent).trim() : ''
  }
  function firstText(cands) {
    for (var i = 0; i < cands.length; i++) {
      var t = textOf(doc.querySelector(cands[i]))
      if (t) return { sel: cands[i], text: t }
    }
    return { sel: null, text: null }
  }
  function firstEl(cands) {
    for (var i = 0; i < cands.length; i++) {
      var e = doc.querySelector(cands[i])
      if (e) return { sel: cands[i], el: e }
    }
    return { sel: null, el: null }
  }
  var st = { msgs: 0, seen: Object.create(null), nSpeakers: 0, buf: [], host: null, hostSel: null }
  function speakerOf(node) {
    for (var i = 0; i < cfg.speaker.length; i++) {
      if (node && node.querySelector) {
        var w = textOf(node.querySelector(cfg.speaker[i]))
        if (w) return w
      }
    }
    var whole = textOf(node)
    var c = whole.indexOf(':')
    return c > 0 ? whole.slice(0, c).trim() : null
  }
  function count(node) {
    st.msgs += 1
    var who = speakerOf(node)
    if (who && !st.seen[who]) { st.seen[who] = 1; st.nSpeakers += 1 }
  }
  function attach() {
    var f = firstEl(cfg.chatHost)
    if (!f.el) return false
    st.host = f.el
    st.hostSel = f.sel
    var obs = new win.MutationObserver(function (recs) {
      for (var i = 0; i < recs.length; i++) {
        var added = recs[i].addedNodes || []
        for (var j = 0; j < added.length; j++) count(added[j])
      }
    })
    obs.observe(f.el, { childList: true, subtree: !!cfg.chatSubtree })
    return true
  }
  function alive() {
    if (!st.host) return false
    return doc.contains ? !!doc.contains(st.host) : true
  }
  function tick() {
    var v = firstText(cfg.viewer)
    var f = firstText(cfg.followers)
    var l = firstText(cfg.likes)
    st.buf.push({
      t: win.Date.now(),
      viewer: v.text,
      followers: f.text,
      likes: l.text,
      msgs: st.msgs,
      speakers: st.nSpeakers,
      observerAlive: alive(),
      selectorsOk: { viewer: v.sel, followers: f.sel, likes: l.sel, chatHost: st.hostSel }
    })
    st.msgs = 0
    st.seen = Object.create(null)
    st.nSpeakers = 0
  }
  var ok = attach()
  win.__lw = {
    version: cfg.version,
    attached: ok,
    tick: tick,
    reattach: attach,
    alive: alive,
    drain: function () { var out = st.buf; st.buf = []; return out }
  }
  if (cfg.intervalMs > 0) win.setInterval(tick, cfg.intervalMs)
  return { reused: false, attached: ok, version: cfg.version }
}`

/** 拼出注入用的完整表达式。 */
export function probeSource(cfg: ProbeConfig): string {
  return `(${PROBE_FACTORY_SRC})(window, document, ${JSON.stringify(cfg)})`
}
```

- [ ] **Step 4: 跑测试，确认全绿**

```bash
node --test --experimental-strip-types src/lib/competitors/liveProbe.test.ts
```

预期：`# pass 8`、`# fail 0`。

- [ ] **Step 5: 把测试文件登记进 `package.json`**

在 `package.json:16` 的 `test` 值里，紧跟在刚加的 `src/lib/competitors/liveTrack.test.ts` 之后插入 ` src/lib/competitors/liveProbe.test.ts`。然后：

```bash
npm test 2>&1 | tail -5
```

预期：`# fail 0`。

- [ ] **Step 6: 提交**

```bash
git add src/lib/competitors/liveProbe.ts src/lib/competitors/liveProbe.test.ts package.json
git commit -m "feat(live-track): 页内探针源码(候选选择器/弹幕计数/幂等注入)+ 假 DOM 单测"
```

---

## Task 6: 静音与精裁矩形源码 `CLIP_EVAL_SRC`

截图要裁到真实画面区域：`<video>` 元素的盒子和视频画面不是一回事，`object-fit: contain/cover` 加 `object-position` 决定了画面在盒子里的实际矩形。同时把播放器静音——挂一整场不能出声。

这段逻辑在 pollux 本地的 `sweep-live.mjs` 里已经实测可用，但那个文件未入库（见「前置说明」第 5 条）。这里作为共享实现写进 lib，附纯计算测试。

**Files:**
- Modify: `src/lib/competitors/liveProbe.ts`
- Modify: `src/lib/competitors/liveProbe.test.ts`

- [ ] **Step 1: 写失败的测试**

追加到 `src/lib/competitors/liveProbe.test.ts` 末尾：

```ts
import { CLIP_FACTORY_SRC, clipRect } from './liveProbe.ts'

test('clipRect: contain 且画面比盒子更宽 → 左右满、上下留黑边', () => {
  // 盒子 800x600（比例 1.333），画面 1920x1080（比例 1.778）→ 宽度吃满，高度 800/1.778=450
  const r = clipRect({ x: 0, y: 0, width: 800, height: 600 }, 1920, 1080, 'contain', '50% 50%')
  assert.deepEqual(r, { x: 0, y: 75, width: 800, height: 450 })
})

test('clipRect: contain 且画面更高 → 上下满、左右留黑边', () => {
  // 盒子 800x600，画面 1080x1920（比例 0.5625）→ 高度吃满 600，宽度 600*0.5625=337.5→338
  const r = clipRect({ x: 0, y: 0, width: 800, height: 600 }, 1080, 1920, 'contain', '50% 50%')
  assert.deepEqual(r, { x: 231, y: 0, width: 338, height: 600 })
})

test('clipRect: cover 会溢出盒子（裁掉两侧），矩形比盒子大是预期行为', () => {
  const r = clipRect({ x: 0, y: 0, width: 800, height: 600 }, 1920, 1080, 'cover', '50% 50%')
  assert.equal(r.height, 600)
  assert.ok(r.width > 800, 'cover 下宽度应溢出')
})

test('clipRect: fill 直接等于盒子', () => {
  const r = clipRect({ x: 10, y: 20, width: 800, height: 600 }, 1920, 1080, 'fill', '50% 50%')
  assert.deepEqual(r, { x: 10, y: 20, width: 800, height: 600 })
})

test('clipRect: object-position 靠上时黑边全落在下方', () => {
  const r = clipRect({ x: 0, y: 0, width: 800, height: 600 }, 1920, 1080, 'contain', '50% 0%')
  assert.equal(r.y, 0)
})

test('clipRect: object-position 解析不出来才退回居中（显式 0% 不能被当成假值）', () => {
  // 'center' 解析不出数字 → 两轴都退回 50%，等同居中
  const fallback = clipRect({ x: 0, y: 0, width: 800, height: 600 }, 1920, 1080, 'contain', 'center')
  assert.equal(fallback.y, 75)
  // 显式 0% 必须真的贴顶，不能被 `|| 50` 改判成居中
  const top = clipRect({ x: 0, y: 0, width: 800, height: 600 }, 1920, 1080, 'contain', '50% 0%')
  assert.equal(top.y, 0)
})

test('clipRect: 带上元素在页面里的偏移', () => {
  const r = clipRect({ x: 100, y: 50, width: 800, height: 600 }, 1920, 1080, 'contain', '50% 50%')
  assert.deepEqual(r, { x: 100, y: 125, width: 800, height: 450 })
})

test('CLIP_FACTORY_SRC 是可解析的 JS', () => {
  assert.doesNotThrow(() => new Function(`return (${CLIP_FACTORY_SRC})`))
})
```

- [ ] **Step 2: 跑测试，确认它失败**

```bash
node --test --experimental-strip-types src/lib/competitors/liveProbe.test.ts
```

预期：`clipRect is not a function`。

- [ ] **Step 3: 写最小实现**

追加到 `src/lib/competitors/liveProbe.ts`：

```ts
export type Rect = { x: number; y: number; width: number; height: number }

/** object-position 的一个分量，解析不出来退回 50（CSS 默认居中）。 */
function pct(s: string | undefined): number {
  const n = parseFloat(s ?? '')
  return Number.isFinite(n) ? n : 50
}

/**
 * 由 <video> 的盒子矩形 + 视频原始尺寸 + object-fit/object-position，
 * 算出画面在页面坐标系里的真实矩形。截图 clip 用它，避免把播放器的黑边也截进去。
 * 抽成纯函数是为了能测 —— 页面里那份（CLIP_FACTORY_SRC）走同样的算式。
 */
export function clipRect(
  box: Rect,
  videoWidth: number,
  videoHeight: number,
  objectFit: string,
  objectPosition: string,
): Rect {
  const boxRatio = box.width / box.height
  const imgRatio = videoWidth / videoHeight
  let w: number
  let h: number
  if (objectFit === 'cover') {
    if (imgRatio > boxRatio) { h = box.height; w = box.height * imgRatio }
    else { w = box.width; h = box.width / imgRatio }
  } else if (objectFit === 'fill') {
    w = box.width; h = box.height
  } else {
    if (imgRatio > boxRatio) { w = box.width; h = box.width / imgRatio }
    else { h = box.height; w = box.height * imgRatio }
  }
  // 解析不出来才退回 50%（CSS 默认居中）。不能写 `parseFloat(x) || 50` ——
  // 那会把显式的 0%（画面靠上/靠左）当成假值改判成居中。
  const p = objectPosition.split(' ')
  const fx = pct(p[0]) / 100
  const fy = pct(p[1]) / 100
  return {
    x: Math.round(box.x + (box.width - w) * fx),
    y: Math.round(box.y + (box.height - h) * fy),
    width: Math.round(w),
    height: Math.round(h),
  }
}

/**
 * 页面里执行的版本：顺手把播放器静音（挂一整场不能出声），
 * 并回报 video 是否就绪。videoWidth>0 且 readyState>=2 才算能截。
 * 算式与 clipRect 保持一致 —— 改一处必须改两处。
 */
export const CLIP_FACTORY_SRC = `function (win, doc) {
  function pct(s) { var n = parseFloat(s); return isFinite(n) ? n : 50 }
  var v = doc.querySelector('video')
  if (!v) return { hasVideo: false, ready: false, clip: null }
  v.muted = true
  v.volume = 0
  var r = v.getBoundingClientRect()
  var cs = win.getComputedStyle(v)
  var iw = v.videoWidth, ih = v.videoHeight
  if (!iw || !ih) return { hasVideo: true, ready: false, clip: null }
  var boxRatio = r.width / r.height, imgRatio = iw / ih
  var fit = cs.objectFit || 'contain'
  var w, h
  if (fit === 'cover') {
    if (imgRatio > boxRatio) { h = r.height; w = r.height * imgRatio }
    else { w = r.width; h = r.width / imgRatio }
  } else if (fit === 'fill') {
    w = r.width; h = r.height
  } else {
    if (imgRatio > boxRatio) { w = r.width; h = r.width / imgRatio }
    else { h = r.height; w = r.height * imgRatio }
  }
  var p = (cs.objectPosition || '50% 50%').split(' ')
  var fx = pct(p[0]) / 100
  var fy = pct(p[1]) / 100
  return {
    hasVideo: true,
    ready: v.readyState >= 2,
    muted: !!v.muted,
    clip: {
      x: Math.round(r.x + (r.width - w) * fx),
      y: Math.round(r.y + (r.height - h) * fy),
      width: Math.round(w),
      height: Math.round(h)
    }
  }
}`

/** 拼出注入用的完整表达式。 */
export function clipSource(): string {
  return `(${CLIP_FACTORY_SRC})(window, document)`
}
```

- [ ] **Step 4: 跑测试，确认全绿**

```bash
node --test --experimental-strip-types src/lib/competitors/liveProbe.test.ts
```

预期：`# pass 16`、`# fail 0`。

- [ ] **Step 5: 提交**

```bash
git add src/lib/competitors/liveProbe.ts src/lib/competitors/liveProbe.test.ts
git commit -m "feat(live-track): 静音与 object-fit 精裁矩形(纯函数+页内源码)+ 单测"
```

---

## Task 7: runner 骨架 —— 建链、注入、每分钟排空落盘

到这里所有纯逻辑都有测试了。runner 是 CDP 胶水，没有单测（要测就得起一个真 Chrome，成本远大于收益），靠 Task 10 的真实运行验证。

**Files:**
- Create: `scripts/live-watch/track-room.ts`

- [ ] **Step 1: 写 runner**

创建 `scripts/live-watch/track-room.ts`：

```ts
// 单直播间分钟级打点采集器。人工启动，跟到下播自动收工。
// 全程只读页面已有内容，不发弹幕/不点赞/不关注。
//
// 前置：专用 Chrome 已带 --remote-debugging-port=9222 启动。
// Run:
//   node --experimental-strip-types scripts/live-watch/track-room.ts \
//     --handle <handle> [--port 9222] [--base-dir ~/live-watch] [--shot-every 150]
//
// 产出：<base-dir>/<handle>/<JST 时间戳>/{samples.jsonl, frames/*.png, session.json}
// 本期不写数据库 —— 入库是第二期的事。

import { appendFile, mkdir, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'

import {
  initialWatchdog, nextWatchdog, normalizeSample, roomEnded, sessionPaths,
  type ProbeSample, type WatchdogState,
} from '../../src/lib/competitors/liveTrack.ts'
import { clipSource, defaultProbeConfig, probeSource } from '../../src/lib/competitors/liveProbe.ts'

const args = process.argv.slice(2)
function opt(name: string, fallback: string | null = null): string | null {
  const i = args.indexOf(`--${name}`)
  if (i === -1) return fallback
  const v = args[i + 1]
  return v === undefined || v.startsWith('--') ? 'true' : v
}

const handle = opt('handle')
const port = Number(opt('port', '9222'))
const baseDir = opt('base-dir', `${homedir()}/live-watch`)!
const shotEvery = Number(opt('shot-every', '150')) * 1000
const drainEvery = 60_000

if (!handle) {
  console.error('usage: track-room.ts --handle <handle> [--port 9222] [--base-dir DIR] [--shot-every 150]')
  process.exit(2)
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

// ---- 极简 CDP 客户端（同 sweep-live 的写法，不引 puppeteer）--------------------
type Conn = { ws: WebSocket; ready: Promise<void>; send: (m: string, p?: object, t?: number) => Promise<any> }
function conn(wsUrl: string): Conn {
  const ws = new WebSocket(wsUrl)
  let id = 0
  const pend = new Map<number, { res: (v: any) => void; rej: (e: Error) => void }>()
  ws.addEventListener('message', (e) => {
    const m = JSON.parse(String((e as MessageEvent).data))
    if (m.id && pend.has(m.id)) {
      const { res, rej } = pend.get(m.id)!
      pend.delete(m.id)
      m.error ? rej(new Error(m.error.message)) : res(m.result)
    }
  })
  const ready = new Promise<void>((res, rej) => {
    ws.addEventListener('open', () => res(), { once: true })
    ws.addEventListener('error', () => rej(new Error('ws fail')), { once: true })
  })
  const send = (method: string, params: object = {}, t = 20_000) =>
    new Promise<any>((res, rej) => {
      const mid = ++id
      const timer = setTimeout(() => { pend.delete(mid); rej(new Error(method + ' timeout')) }, t)
      pend.set(mid, {
        res: (v) => { clearTimeout(timer); res(v) },
        rej: (e) => { clearTimeout(timer); rej(e) },
      })
      ws.send(JSON.stringify({ id: mid, method, params }))
    })
  return { ws, ready, send }
}

async function evaluate(pc: Conn, expression: string): Promise<any> {
  const { result } = await pc.send('Runtime.evaluate', { expression, returnByValue: true })
  return result?.value ?? null
}

/** 整页 HTML —— 下播判定与开播时间都从这里取。较重，所以只在需要时读。 */
async function pageHtml(pc: Conn): Promise<string> {
  const { root } = await pc.send('DOM.getDocument', { depth: 1 })
  const { outerHTML } = await pc.send('DOM.getOuterHTML', { nodeId: root.nodeId })
  return outerHTML as string
}

function readStartTime(html: string): number | null {
  const m = html.match(/"startTime":(\d{10})/)
  return m ? Number(m[1]) : null
}

// ---- 主流程 -----------------------------------------------------------------
async function main() {
  const ver = await (await fetch(`http://localhost:${port}/json/version`)).json()
  const bc = conn(ver.webSocketDebuggerUrl)
  await bc.ready
  const { targetId } = await bc.send('Target.createTarget', { url: 'about:blank' })
  const list = await (await fetch(`http://localhost:${port}/json/list`)).json()
  const pc = conn(list.find((t: any) => t.id === targetId).webSocketDebuggerUrl)
  await pc.ready

  await pc.send('Page.navigate', { url: `https://www.tiktok.com/@${handle}/live` })
  // 前台，否则视频不渲染、页内定时器还会被节流
  await bc.send('Target.activateTarget', { targetId })

  // 等 video 就绪（最多 ~26s）
  let clip: any = null
  for (let i = 0; i < 13; i++) {
    await sleep(2000)
    const info = await evaluate(pc, clipSource())
    if (info?.hasVideo && info.ready && info.clip?.width > 50) { clip = info.clip; break }
  }
  if (!clip) {
    console.error(`✗ @${handle}: 未在播或视频未就绪，退出`)
    process.exit(3)
  }

  const html0 = await pageHtml(pc)
  if (roomEnded(html0)) {
    console.error(`✗ @${handle}: 页面已结束（拦下一次 video 误判），退出`)
    process.exit(3)
  }
  const startedAt = readStartTime(html0)
  const paths = sessionPaths(baseDir, handle!, startedAt)
  await mkdir(paths.frames, { recursive: true })
  console.error(`✓ @${handle}: 开始跟踪 → ${paths.dir}`)

  await evaluate(pc, probeSource(defaultProbeConfig()))

  let wd: WatchdogState = initialWatchdog()
  let total = 0
  let lastShotAt = 0
  const startedTracking = Date.now()

  for (;;) {
    await sleep(drainEvery)

    const batch: ProbeSample[] = (await evaluate(pc, 'window.__lw ? window.__lw.drain() : []')) ?? []
    for (const p of batch) {
      const s = normalizeSample(p, startedAt)
      await appendFile(paths.samples, JSON.stringify(s) + '\n')
      total += 1
      console.error(
        `  ${s.elapsed_seconds ?? '?'}s 在线${s.viewer_count ?? '?'} 粉${s.follower_count ?? '?'} 弹幕${s.chat_msgs}/${s.chat_speakers}人`,
      )
    }

    // 每 10 分钟读一次整页：下播判定 + 校验开播时间没变（变了说明是新的一场）
    const heavy = total % 10 === 0
    const html = heavy ? await pageHtml(pc) : ''
    const info = await evaluate(pc, clipSource())
    if (info?.clip?.width > 50) clip = info.clip

    if (heavy && startedAt != null && readStartTime(html) !== startedAt) {
      console.error('！开播时间变了 —— 对方重开了一场，本场收工（新场次请重新启动）')
      break
    }

    const alive = (await evaluate(pc, 'window.__lw ? window.__lw.alive() : false')) === true
    const step = nextWatchdog(wd, {
      samples: batch.length,
      observerAlive: alive,
      hasVideo: !!info?.hasVideo,
      roomEnded: heavy ? roomEnded(html) : false,
    })
    wd = step.state
    if (step.action === 'reinject') {
      console.error('！探针失联，重注入')
      await evaluate(pc, probeSource(defaultProbeConfig()))
    } else if (step.action === 'end') {
      console.error('✓ 判定下播，收工')
      break
    }
  }

  await writeFile(paths.meta, JSON.stringify({
    handle,
    stream_started_at: startedAt,
    tracking_started_at: new Date(startedTracking).toISOString(),
    tracking_ended_at: new Date().toISOString(),
    sample_count: total,
    expected_count: Math.round((Date.now() - startedTracking) / drainEvery),
  }, null, 2))
  console.error(`✓ 收工：${total} 个采样点 → ${paths.samples}`)

  await bc.send('Target.closeTarget', { targetId }).catch(() => {})
  pc.ws.close()
  bc.ws.close()
}

main().catch((e) => { console.error('✗', e.message); process.exit(1) })
```

- [ ] **Step 2: 确认类型剥离能跑通（不连 Chrome，只验证语法与 import）**

```bash
node --experimental-strip-types scripts/live-watch/track-room.ts 2>&1 | head -3
```

预期：打印 usage 行并以退出码 2 结束（因为没传 `--handle`）。**不应该**出现 `Cannot find module` 或 `SyntaxError` —— 出现就是 import 路径或 `.ts` 后缀写错了。

- [ ] **Step 3: 提交**

```bash
git add scripts/live-watch/track-room.ts
git commit -m "feat(live-track): 采集器 runner(建链/注入/每分钟排空落 JSONL/看门狗)"
```

---

## Task 8: runner 补截图节奏与黑屏重试

第一版 runner 还没截图。补上：每 `--shot-every` 秒截一张精裁图落本地 `frames/<elapsed>.png`；小于 120KB 视为画面还没渲染出来，重试。

**Files:**
- Modify: `scripts/live-watch/track-room.ts`

- [ ] **Step 1: 加截图函数**

在 `main()` 之前、`readStartTime` 之后插入：

```ts
/**
 * 精裁一张直播画面。黑屏时字节数会异常小（实测阈值 120KB），重试几次。
 * 返回 null 表示这一轮没截到 —— 不阻塞采集，下一轮再说。
 */
async function capture(pc: Conn, clip: any): Promise<Buffer | null> {
  for (let a = 0; a < 3; a++) {
    const { data } = await pc.send('Page.captureScreenshot', { format: 'png', clip: { ...clip, scale: 1 } })
    const buf = Buffer.from(data, 'base64')
    if (buf.length >= 120 * 1024) return buf
    await sleep(3000)
  }
  return null
}
```

- [ ] **Step 2: 在主循环里接线**

在主循环内、`nextWatchdog` 调用**之前**插入：

```ts
    // 截图：按 --shot-every 的节奏，落本地候选帧。收敛与入库是第二期的事。
    if (Date.now() - lastShotAt >= shotEvery && clip) {
      const buf = await capture(pc, clip)
      if (buf) {
        const elapsed = startedAt != null ? Math.round(Date.now() / 1000) - startedAt : total * 60
        await writeFile(`${paths.frames}/${String(elapsed).padStart(6, '0')}.png`, buf)
        lastShotAt = Date.now()
      }
    }
```

- [ ] **Step 3: 再验证一次语法**

```bash
node --experimental-strip-types scripts/live-watch/track-room.ts 2>&1 | head -3
```

预期：仍然是 usage 行 + 退出码 2，无 `SyntaxError`。

- [ ] **Step 4: 提交**

```bash
git add scripts/live-watch/track-room.ts
git commit -m "feat(live-track): 采集器定时精裁截图落本地候选帧(黑屏字节重试)"
```

---

## Task 9: 门禁与 README

**Files:**
- Modify: `scripts/live-watch/track-room.ts`（仅头部注释，如门禁提出问题）

- [ ] **Step 1: 跑全量测试**

```bash
npm test 2>&1 | tail -8
```

预期：`# fail 0`。

- [ ] **Step 2: 跑文案与样式门禁**

```bash
npm run test:copy
```

预期：四项全过。若 `check-no-bare-han` 报新增文件里的中文字符串：本期新增的中文只应出现在**注释**里，不应出现在会渲染到界面的字符串中——真报了就是有中文字面量混进了 `src/`，把它挪进注释或改成英文常量。

- [ ] **Step 3: 提交（若门禁触发了修改）**

```bash
git add -A
git commit -m "chore(live-track): 过 test:copy 门禁"
```

若无改动可跳过。

---

## Task 10: 真实运行 —— 一场直播，三项结论

这一步不是写代码，是**产出 spec 第 11 节三项验证的结论**。没有结论，第二三期的计划写不了。

**Files:**
- Create: `docs/records/2026-08-XX-live-track-first-run.md`（日期填实际运行日）

- [ ] **Step 1: 准备专用 Chrome**

按现有竞品采集的做法启动专用 Chrome（`--remote-debugging-port=9222`），**保持未登录**（验证项①要先试游客态）。确认能访问：

```bash
curl -s http://localhost:9222/json/version | head -3
```

预期：返回含 `webSocketDebuggerUrl` 的 JSON。

- [ ] **Step 2: 对一个在播的竞品房间跑 5 分钟**

```bash
node --experimental-strip-types scripts/live-watch/track-room.ts --handle <在播的handle> --shot-every 150
```

看 stderr 每分钟输出的那一行。5 分钟后 Ctrl-C。

- [ ] **Step 3: 判验证项①（游客态能否读到在线人数）**

```bash
head -1 ~/live-watch/<handle>/*/samples.jsonl | python3 -m json.tool
```

看 `raw.selectors_ok.viewer`：
- 不是 `null` → **游客态可用**。把命中的那个选择器记进结论文档，`defaultProbeConfig()` 里把它挪到候选表第一位。
- 是 `null` → 游客态读不到。用干净小号登录（**只登录，不关注**）后重跑一次；仍为 `null` 则需要给 `viewer` 候选表补上侧栏那条路径（形如「`live-side-nav-name` 文本等于 handle 的那一项旁边的 `person-count`」，单条 CSS 选择器表达不了，需要给探针加一个「按文本匹配兄弟节点」的取值方式）——这属于计划外改动，先记录，再决定。

- [ ] **Step 4: 判验证项②（弹幕 observer 挂点是否稳定）**

看同一批采样点的 `chat_msgs` 与 `raw.observer_alive`：
- `chat_msgs` 逐分钟有合理非零值、`observer_alive` 恒为 `true` → **稳定**，互动热度字段保留。
- `chat_msgs` 恒为 0 → 弹幕容器选择器没命中（`selectors_ok.chatHost` 会是 `null`）。在浏览器里手动找到真实容器，补进 `chatHost` 候选表重跑。
- `observer_alive` 中途变 `false` → 容器被整体替换。把 `defaultProbeConfig()` 的 `chatSubtree` 改成 `true`、`chatHost` 换成更稳定的祖先节点后重跑；仍不稳则按 spec 第 11 节②的最后一档处理——互动热度整组降级为「尽力而为」，在结论文档里写明，第三期报表不把它当核心指标。

- [ ] **Step 5: 跑满一整场，判验证项③**

对同一个房间从头跑到自动收工。全程留意并记录：是否出现「你还在看吗」类挽留弹窗、画质自动降级、断流重连、页面被动刷新。

- [ ] **Step 6: 核对采样完整度**

```bash
wc -l ~/live-watch/<handle>/*/samples.jsonl
cat ~/live-watch/<handle>/*/session.json
```

`sample_count / expected_count` 应达到 90% 以上（本期验收线）。达不到就看 stderr 里「探针失联，重注入」出现了几次、在什么时间点。

- [ ] **Step 7: 写结论文档**

创建 `docs/records/2026-08-XX-live-track-first-run.md`，逐条写明：

1. 身份：游客态还是登录态，命中的在线人数选择器是哪一条
2. 弹幕：命中的容器选择器、observer 是否全程存活、每分钟弹幕条数的实际量级
3. 连挂：是否被中断、中断形式、看门狗有没有正确恢复
4. 完整度：`sample_count / expected_count`，缺样集中在哪几段
5. 截图：候选帧总数，人眼扫一遍看有多少张是「内容不同」的——这个数直接决定第二期去重阈值怎么定

- [ ] **Step 8: 提交**

```bash
git add docs/records/2026-08-XX-live-track-first-run.md
git commit -m "docs(live-track): 首场真实运行结论(三项验证 + 采样完整度)"
```

---

## 完成之后

第一期到此为止。**不要顺手开始第二期**——第二期（入库与成片）和第三期（报表页）的计划要拿 Task 10 的结论文档重新写：

- 验证项②若判了降级，第三期报表的弹幕热度带就不做，第二期 `chat_msgs` 字段也要标注可信度
- Task 10 第 7 步里「有多少张内容不同」的实际数字，决定第二期 dHash 阈值的起点
- 若验证项①走到了「需要按文本匹配兄弟节点」那一档，探针要先改，第二期才有稳定数据可入库
