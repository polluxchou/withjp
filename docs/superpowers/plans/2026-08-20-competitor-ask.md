# 竞品监测会话式查询（Ask 面板）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 `/competitors` 页加一个多轮对话侧边面板，用自然语言回答竞品数据问题（粉丝增长 / 开播作息与单场事实 / 采集健康度），纯文字作答。

**Architecture:** 预聚合上下文 + 模型只措辞。把整个竞品数据集聚合成一份约 15k token 的结构化 JSON 放进 system prompt，所有数字由现有纯函数算好，模型不做任何算术。置信度门槛前移到上下文层，「样本不足」在数据里就封死。后端无状态，会话历史由前端持有。

**Tech Stack:** Next.js App Router · TypeScript · next-intl · Tailwind（设计 token）· DeepSeek（OpenAI 兼容 REST）· `node --test --experimental-strip-types`

**Spec:** `docs/superpowers/specs/2026-08-20-competitor-ask-design.md`

---

## 关键约定（先读，违反会被 CI 拦下）

1. **`src/lib/competitors/` 下的模块一律用相对导入 + `.ts` 后缀**（如 `./types.ts`）。`node --test --experimental-strip-types` 不认 `@/` 别名；`tsconfig.json` 已开 `allowImportingTsExtensions`。
2. **新增的 `*.test.ts` 必须手动追加到 `package.json` 的 `test` 脚本**。那是一份显式文件清单，不是 glob——不加就永远不会跑。
3. **`.tsx` 里禁止裸中文**（`npm run test:no-bare-han` 扫 JSX children / 属性 / 表达式里的汉字）。所有界面文案走 `useTranslations`。`.ts` 文件里的中文字符串不受此限（prompt 文本、captureNote 都在 `.ts` 里，安全）。
4. **`.tsx`/`.ts` 里禁止裸十六进制颜色**（`npm run test:style`）。注释里也别写 `#` 加十六进制样式的字符串——写 `PR 250` 而不是 `(#250)`。
5. **i18n 三语必须同步且每个 key 都要被引用**（`npm run test:i18n` 同时查 key parity 与引用完整性）。
6. **不要用 `todayLocal()`**（`src/lib/competitors/localDate.ts`）算服务端日期——它读运行环境时钟，Vercel 上是 UTC。

## 文件结构

| 文件 | 职责 |
|---|---|
| `src/lib/competitors/ask-context.ts` | **新增**。纯函数：`CompetitorBoard` → 上下文包。所有聚合与门槛判定都在这里，零 IO、零时钟（`now` 注入） |
| `src/lib/competitors/ask-context.test.ts` | **新增**。上述纯函数的单测 |
| `src/lib/competitors/ask-prompt.ts` | **新增**。system prompt 组装：三条口径规则 + 语言指令 + 上下文包序列化 |
| `src/lib/competitors/ask-prompt.test.ts` | **新增**。断言规则文本与语言指令确实进了 prompt |
| `src/lib/llm/deepseek.ts` | **新增**。DeepSeek REST 最小 transport。不动 `src/lib/agents/providers.ts` |
| `src/app/api/competitors/ask/route.ts` | **新增**。无状态 chat 端点：鉴权 → 取板 → 建包 → 调模型 |
| `src/components/competitors/AskPanel.tsx` | **新增**。右侧非模态抽屉：消息列表 + 输入框 |
| `src/components/competitors/CompetitorDossierView.tsx` | **修改**。挂载面板 + 触发按钮 |
| `package.json` | **修改**。注册两个新测试文件 |
| `messages/{zh,en,ja}.json` | **修改**。`competitors.ask.*` |
| `src/lib/changelog/entries.ts` | **修改**。更新日志条目 |

数据来源的既定事实（写代码前务必理解）：

- `board.competitors` **只含顶层竞品**；子主播在各自父节点的 `related` 里（`assemble.ts:60-68`）
- `history` 按 `captured_on` **升序**（`assemble.ts:40`）→ 最新是最后一个
- `shots` 按 `shot_on` **降序**、null 排最后（`assemble.ts:48`）
- `competitor_shots.shot_on` 按 **Asia/Tokyo** 业务日落库（`scripts/live-watch/record-live-shot.mjs:34`）

---

### Task 1: 上下文包骨架与 meta 块

**Files:**
- Create: `src/lib/competitors/ask-context.ts`
- Create: `src/lib/competitors/ask-context.test.ts`
- Modify: `package.json`（`test` 脚本末尾追加测试文件）

- [ ] **Step 1: 写失败的测试**

创建 `src/lib/competitors/ask-context.test.ts`：

```ts
// src/lib/competitors/ask-context.test.ts
import assert from 'node:assert/strict'
import test from 'node:test'

import { buildAskContext } from './ask-context.ts'
import type { CompetitorBoard, CompetitorWithHistory } from './types.ts'

/** 造一个字段齐全的竞品，只覆盖测试关心的部分。 */
export function comp(over: Partial<CompetitorWithHistory> = {}): CompetitorWithHistory {
  return {
    id: over.id ?? 'id-1',
    platform: 'tiktok',
    handle: over.handle ?? 'alpha',
    profile_url: '',
    display_name: over.display_name ?? null,
    note: '',
    created_at: '2026-07-01T00:00:00Z',
    parent_id: over.parent_id ?? null,
    avatar_url: null,
    region: over.region ?? '日本',
    member_count: over.member_count ?? null,
    composition: null,
    launch_city: null,
    launched_on: null,
    mc_note: null,
    online_note: null,
    latest_videos: null,
    latest: over.latest ?? null,
    history: over.history ?? [],
    shots: over.shots ?? [],
    weekly: over.weekly ?? [],
    related: over.related ?? [],
  }
}

export function board(competitors: CompetitorWithHistory[]): CompetitorBoard {
  return { competitors, canEdit: true }
}

test('meta.todayTokyo 按东京日算，跨日不会错一天', () => {
  // UTC 15:30 == 东京次日 00:30。若误用 UTC 会得到 08-19。
  const ctx = buildAskContext(board([]), new Date('2026-08-19T15:30:00Z'), 'zh')
  assert.equal(ctx.meta.todayTokyo, '2026-08-20')
})

test('meta.displayTimeZone 跟界面语言走', () => {
  const now = new Date('2026-08-19T15:30:00Z')
  assert.equal(buildAskContext(board([]), now, 'zh').meta.displayTimeZone, 'Asia/Shanghai')
  assert.equal(buildAskContext(board([]), now, 'ja').meta.displayTimeZone, 'Asia/Tokyo')
  assert.equal(buildAskContext(board([]), now, 'en').meta.displayTimeZone, 'America/Los_Angeles')
})

test('meta.captureNote 始终存在且点明「缺席只代表未采集」', () => {
  const ctx = buildAskContext(board([]), new Date('2026-08-19T15:30:00Z'), 'zh')
  assert.ok(ctx.meta.captureNote.includes('不代表未开播'))
})

test('空看板不抛异常，competitors 为空数组', () => {
  const ctx = buildAskContext(board([]), new Date('2026-08-19T15:30:00Z'), 'zh')
  assert.deepEqual(ctx.competitors, [])
  assert.equal(ctx.meta.coverage.competitors, 0)
  assert.equal(ctx.meta.coverage.roots, 0)
})
```

- [ ] **Step 2: 跑测试确认失败**

```bash
cd /Users/fengzhou/Code/newWith-competitor-nl && node --test --experimental-strip-types src/lib/competitors/ask-context.test.ts
```

Expected: FAIL —— `Cannot find module './ask-context.ts'`

- [ ] **Step 3: 写最小实现**

创建 `src/lib/competitors/ask-context.ts`：

```ts
// src/lib/competitors/ask-context.ts
// 纯函数：把竞品看板压成一份喂给对话模型的结构化上下文包。
//
// 设计前提（见 docs/superpowers/specs/2026-08-20-competitor-ask-design.md）：
// 模型只负责挑数据和措辞，一次算术都不做。所以所有聚合值、差值、置信度
// 门槛都必须在这里算完——模型拿不到能自由推论的原料，就推不出错的结论。
//
// 零 IO、零时钟：now 由调用方注入，才能把跨日、跨时区的行为钉死在单测里。
import { timeZoneForLocale } from '../time/localeZone.ts'
import type { CompetitorBoard, CompetitorWithHistory } from './types.ts'

/** 截图日期列（shot_on）按东京业务日落库，日期比较必须用同一个日历。 */
const SHOT_TZ = 'Asia/Tokyo'

export const CAPTURE_NOTE =
  '主页指标为每周人工触发采集；直播截图为半自动采集，仅在人工发起时抓取。'
  + '因此某一天没有截图记录，只代表当天没有采集，不代表未开播。'

export type Confidence = 'ok' | 'insufficient'

export interface AskCoverage {
  competitors: number
  roots: number
  withMetrics: number
  metricsDays: number
  shotDays: number
  sessionsWithStartTime: number
}

export interface AskMeta {
  todayTokyo: string
  displayTimeZone: string
  coverage: AskCoverage
  captureNote: string
}

export interface AskContext {
  meta: AskMeta
  competitors: AskCompetitor[]
}

// 后续 Task 逐块填充；先给一个只有 handle 的最小形状，让 meta 测试能过。
export interface AskCompetitor {
  handle: string
}

/** Date → 指定时区的 YYYY-MM-DD。不用 toISOString（那是 UTC）。 */
export function dayIn(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(date)
  const at = (type: string) => parts.find((p) => p.type === type)?.value ?? ''
  return `${at('year')}-${at('month')}-${at('day')}`
}

export function buildAskContext(board: CompetitorBoard, now: Date, locale: string): AskContext {
  return {
    meta: {
      todayTokyo: dayIn(now, SHOT_TZ),
      displayTimeZone: timeZoneForLocale(locale),
      coverage: {
        competitors: 0, roots: board.competitors.length, withMetrics: 0,
        metricsDays: 0, shotDays: 0, sessionsWithStartTime: 0,
      },
      captureNote: CAPTURE_NOTE,
    },
    competitors: [],
  }
}
```

- [ ] **Step 4: 跑测试确认通过**

```bash
cd /Users/fengzhou/Code/newWith-competitor-nl && node --test --experimental-strip-types src/lib/competitors/ask-context.test.ts
```

Expected: PASS，4 tests

- [ ] **Step 5: 把测试文件注册进 npm test**

编辑 `package.json`，在 `"test"` 脚本字符串的**末尾**（最后一个 `.test.ts` 之后）追加：

```
 src/lib/competitors/ask-context.test.ts src/lib/competitors/ask-prompt.test.ts
```

`ask-prompt.test.ts` 在 Task 6 才创建，所以这一步之后 `npm test` 会因文件不存在而失败——**这是预期的**，Task 6 完成后恢复。若希望中途保持绿灯，可先只加 `ask-context.test.ts`，Task 6 再加另一个。

- [ ] **Step 6: 提交**

```bash
cd /Users/fengzhou/Code/newWith-competitor-nl
git add src/lib/competitors/ask-context.ts src/lib/competitors/ask-context.test.ts package.json
git commit -m "feat(competitors): Ask 上下文包骨架与 meta 块"
```

---

### Task 2: followers 块（含置信度门槛）

**Files:**
- Modify: `src/lib/competitors/ask-context.ts`
- Modify: `src/lib/competitors/ask-context.test.ts`

- [ ] **Step 1: 写失败的测试**

在 `ask-context.test.ts` 末尾追加：

```ts
function point(captured_on: string, followers: number | null) {
  return { captured_on, followers, likes: null, videos: null }
}

test('followers: 两个及以上快照给出 delta 与 spanDays，confidence 为 ok', () => {
  const ctx = buildAskContext(
    board([comp({
      handle: 'solulune',
      history: [point('2026-08-10', 241000), point('2026-08-17', 246200)],
    })]),
    new Date('2026-08-20T01:00:00Z'),
    'zh',
  )
  const f = ctx.competitors[0].followers
  assert.equal(f.latest, 246200)
  assert.equal(f.on, '2026-08-17')
  assert.equal(f.prev, 241000)
  assert.equal(f.prevOn, '2026-08-10')
  assert.equal(f.delta, 5200)
  assert.equal(f.spanDays, 7)
  assert.equal(f.confidence, 'ok')
})

test('followers: 只有一个快照时 delta 为 null 且 confidence 为 insufficient', () => {
  const ctx = buildAskContext(
    board([comp({ history: [point('2026-08-17', 246200)] })]),
    new Date('2026-08-20T01:00:00Z'),
    'zh',
  )
  const f = ctx.competitors[0].followers
  assert.equal(f.latest, 246200)
  assert.equal(f.prev, null)
  assert.equal(f.prevOn, null)
  assert.equal(f.delta, null)
  assert.equal(f.spanDays, null)
  assert.equal(f.confidence, 'insufficient')
})

test('followers: followers 为 null 的快照不参与计算', () => {
  const ctx = buildAskContext(
    board([comp({
      history: [point('2026-08-10', 241000), point('2026-08-17', null)],
    })]),
    new Date('2026-08-20T01:00:00Z'),
    'zh',
  )
  const f = ctx.competitors[0].followers
  assert.equal(f.latest, 241000)
  assert.equal(f.on, '2026-08-10')
  assert.equal(f.confidence, 'insufficient')
})

test('followers: 完全没有快照时全为 null', () => {
  const ctx = buildAskContext(board([comp({})]), new Date('2026-08-20T01:00:00Z'), 'zh')
  const f = ctx.competitors[0].followers
  assert.deepEqual(f, {
    latest: null, on: null, prev: null, prevOn: null,
    delta: null, spanDays: null, confidence: 'insufficient',
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

```bash
cd /Users/fengzhou/Code/newWith-competitor-nl && node --test --experimental-strip-types src/lib/competitors/ask-context.test.ts
```

Expected: FAIL —— `ctx.competitors[0]` 为 undefined（`competitors` 还是空数组）

- [ ] **Step 3: 写实现**

在 `ask-context.ts` 中，把 `AskCompetitor` 接口替换为：

```ts
export interface AskFollowers {
  latest: number | null
  on: string | null
  prev: number | null
  prevOn: string | null
  delta: number | null
  spanDays: number | null
  confidence: Confidence
}

export interface AskCompetitor {
  handle: string
  followers: AskFollowers
}
```

在 `dayIn` 之后加两个辅助函数：

```ts
/**
 * 两个 YYYY-MM-DD 相差的整天数。走 Date.UTC 而不是 new Date(str)——
 * 后者按本地时区解析，跨夏令时的地区会有 ±1 天误差（同 summary.ts 的做法）。
 */
export function daysBetween(from: string, to: string): number {
  const [fy, fm, fd] = from.split('-').map(Number)
  const [ty, tm, td] = to.split('-').map(Number)
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86_400_000)
}

const EMPTY_FOLLOWERS: AskFollowers = {
  latest: null, on: null, prev: null, prevOn: null,
  delta: null, spanDays: null, confidence: 'insufficient',
}

/** history 按 captured_on 升序（见 assemble.ts），所以最新的在末尾。 */
function followersOf(c: CompetitorWithHistory): AskFollowers {
  const pts = c.history.filter((p): p is typeof p & { followers: number } => p.followers != null)
  if (pts.length === 0) return EMPTY_FOLLOWERS

  const last = pts[pts.length - 1]
  if (pts.length === 1) {
    return { ...EMPTY_FOLLOWERS, latest: last.followers, on: last.captured_on }
  }

  const prev = pts[pts.length - 2]
  return {
    latest: last.followers,
    on: last.captured_on,
    prev: prev.followers,
    prevOn: prev.captured_on,
    delta: last.followers - prev.followers,
    spanDays: daysBetween(prev.captured_on, last.captured_on),
    confidence: 'ok',
  }
}
```

把 `buildAskContext` 的 `competitors: []` 改为：

```ts
    competitors: board.competitors.map((c) => ({
      handle: c.handle,
      followers: followersOf(c),
    })),
```

- [ ] **Step 4: 跑测试确认通过**

```bash
cd /Users/fengzhou/Code/newWith-competitor-nl && node --test --experimental-strip-types src/lib/competitors/ask-context.test.ts
```

Expected: PASS，8 tests

- [ ] **Step 5: 提交**

```bash
cd /Users/fengzhou/Code/newWith-competitor-nl
git add src/lib/competitors/ask-context.ts src/lib/competitors/ask-context.test.ts
git commit -m "feat(competitors): Ask 上下文的粉丝块与两快照门槛"
```

---

### Task 3: liveHabit 块（复用 summarizeLiveHabit）

**Files:**
- Modify: `src/lib/competitors/ask-context.ts`
- Modify: `src/lib/competitors/ask-context.test.ts`

- [ ] **Step 1: 写失败的测试**

先把 `CompetitorShot` 类型加进 `ask-context.test.ts` **顶部已有的** import 行（ES 模块的 import 会被提升，写在文件中间虽然能跑，但 lint 的 `import/first` 会报）：

```ts
import type { CompetitorBoard, CompetitorShot, CompetitorWithHistory } from './types.ts'
```

然后追加到文件末尾：

```ts
function shot(over: Partial<CompetitorShot> = {}): CompetitorShot {
  return {
    id: over.id ?? 'shot-1',
    competitor_id: 'id-1',
    image_url: 'https://example.test/a.jpg',
    shot_on: over.shot_on ?? null,
    tag: null,
    caption: '',
    sort_order: over.sort_order ?? 0,
    created_at: '2026-08-19T13:00:00Z',
    viewer_count: over.viewer_count ?? null,
    stream_started_at: over.stream_started_at ?? null,
    captured_at: over.captured_at ?? null,
  }
}

test('liveHabit: 三场同档达到门槛，confidence 为 ok', () => {
  // 三场都在东京 21:2x → zh 界面（上海，比东京晚一小时）应显示 20:2x。
  const ctx = buildAskContext(
    board([comp({
      shots: [
        shot({ id: 's1', stream_started_at: '2026-08-19T12:28:00Z' }),
        shot({ id: 's2', stream_started_at: '2026-08-18T12:30:00Z' }),
        shot({ id: 's3', stream_started_at: '2026-08-17T12:26:00Z' }),
      ],
    })]),
    new Date('2026-08-20T01:00:00Z'),
    'zh',
  )
  const h = ctx.competitors[0].liveHabit
  assert.equal(h.confidence, 'ok')
  assert.equal(h.slots.length, 1)
  assert.equal(h.slots[0].at, '20:28')
  assert.equal(h.slots[0].sessions, 3)
  assert.equal(h.sessions, 3)
  assert.equal(h.latestStartedAt, '2026-08-19T12:28:00Z')
})

test('liveHabit: 同一场的多张截图只算一次场次', () => {
  const ctx = buildAskContext(
    board([comp({
      shots: [
        shot({ id: 's1', stream_started_at: '2026-08-19T12:28:00Z' }),
        shot({ id: 's2', stream_started_at: '2026-08-19T12:28:00Z' }),
      ],
    })]),
    new Date('2026-08-20T01:00:00Z'),
    'zh',
  )
  assert.equal(ctx.competitors[0].liveHabit.sessions, 1)
})

test('liveHabit: 不足三场时 slots 为空且 confidence 为 insufficient，但保留最近一场', () => {
  const ctx = buildAskContext(
    board([comp({ shots: [shot({ stream_started_at: '2026-08-19T12:28:00Z' })] })]),
    new Date('2026-08-20T01:00:00Z'),
    'zh',
  )
  const h = ctx.competitors[0].liveHabit
  assert.equal(h.confidence, 'insufficient')
  assert.deepEqual(h.slots, [])
  assert.equal(h.latestStartedAt, '2026-08-19T12:28:00Z')
})

test('liveHabit: 钟点随界面语言换算，同一时刻中日相差一小时', () => {
  const shots = [
    shot({ id: 's1', stream_started_at: '2026-08-19T12:28:00Z' }),
    shot({ id: 's2', stream_started_at: '2026-08-18T12:30:00Z' }),
    shot({ id: 's3', stream_started_at: '2026-08-17T12:26:00Z' }),
  ]
  const now = new Date('2026-08-20T01:00:00Z')
  const zh = buildAskContext(board([comp({ shots })]), now, 'zh')
  const ja = buildAskContext(board([comp({ shots })]), now, 'ja')
  assert.equal(zh.competitors[0].liveHabit.slots[0].at, '20:28')
  assert.equal(ja.competitors[0].liveHabit.slots[0].at, '21:28')
})
```

- [ ] **Step 2: 跑测试确认失败**

```bash
cd /Users/fengzhou/Code/newWith-competitor-nl && node --test --experimental-strip-types src/lib/competitors/ask-context.test.ts
```

Expected: FAIL —— `liveHabit` 为 undefined

- [ ] **Step 3: 写实现**

在 `ask-context.ts` 顶部 import 区加：

```ts
import { summarizeLiveHabit } from './liveSlots.ts'
```

加接口：

```ts
export interface AskLiveSlot {
  /** HH:mm，已按 meta.displayTimeZone 换算。 */
  at: string
  sessions: number
}

export interface AskLiveHabit {
  slots: AskLiveSlot[]
  /** 去重后的总场次（同一场的多张截图只算一次）。 */
  sessions: number
  latestStartedAt: string | null
  confidence: Confidence
}
```

在 `AskCompetitor` 里加 `liveHabit: AskLiveHabit`。

加聚合函数：

```ts
/**
 * 开播作息。门槛沿用 liveSlots 的 SLOT_MIN_SESSIONS（默认 3 场才成档）——
 * 不达标时 slots 为空，模型就没有任何可用来谈"规律"的原料，只剩最近一场这个硬事实。
 */
function liveHabitOf(c: CompetitorWithHistory, timeZone: string): AskLiveHabit {
  const habit = summarizeLiveHabit(c.shots.map((s) => s.stream_started_at), timeZone)
  return {
    slots: habit.slots.map((s) => ({ at: s.label, sessions: s.count })),
    sessions: habit.sessions,
    latestStartedAt: habit.latestStartedAt,
    confidence: habit.slots.length > 0 ? 'ok' : 'insufficient',
  }
}
```

在 `buildAskContext` 里，`map` 之前先取时区，并把 `liveHabit` 加进每条：

```ts
export function buildAskContext(board: CompetitorBoard, now: Date, locale: string): AskContext {
  const displayTimeZone = timeZoneForLocale(locale)
  return {
    meta: {
      todayTokyo: dayIn(now, SHOT_TZ),
      displayTimeZone,
      coverage: {
        competitors: 0, roots: board.competitors.length, withMetrics: 0,
        metricsDays: 0, shotDays: 0, sessionsWithStartTime: 0,
      },
      captureNote: CAPTURE_NOTE,
    },
    competitors: board.competitors.map((c) => ({
      handle: c.handle,
      followers: followersOf(c),
      liveHabit: liveHabitOf(c, displayTimeZone),
    })),
  }
}
```

- [ ] **Step 4: 跑测试确认通过**

```bash
cd /Users/fengzhou/Code/newWith-competitor-nl && node --test --experimental-strip-types src/lib/competitors/ask-context.test.ts
```

Expected: PASS，12 tests

- [ ] **Step 5: 提交**

```bash
cd /Users/fengzhou/Code/newWith-competitor-nl
git add src/lib/competitors/ask-context.ts src/lib/competitors/ask-context.test.ts
git commit -m "feat(competitors): Ask 上下文的开播作息块与成档门槛"
```

---

### Task 4: shots 块（完整日期列表是「没采到 ≠ 没开播」的物证）

**Files:**
- Modify: `src/lib/competitors/ask-context.ts`
- Modify: `src/lib/competitors/ask-context.test.ts`

- [ ] **Step 1: 写失败的测试**

追加：

```ts
test('shots: capturedDates 去重降序，不截断，null 日期不进列表', () => {
  const ctx = buildAskContext(
    board([comp({
      shots: [
        shot({ id: 'a', shot_on: '2026-08-19' }),
        shot({ id: 'b', shot_on: '2026-08-19' }),
        shot({ id: 'c', shot_on: '2026-08-17' }),
        shot({ id: 'd', shot_on: null }),
      ],
    })]),
    new Date('2026-08-20T01:00:00Z'),
    'zh',
  )
  const s = ctx.competitors[0].shots
  assert.equal(s.total, 4)
  assert.deepEqual(s.capturedDates, ['2026-08-19', '2026-08-17'])
  assert.equal(s.lastOn, '2026-08-19')
})

test('shots: peakViewers 取最大值，全 null 时为 null', () => {
  const withViewers = buildAskContext(
    board([comp({
      shots: [shot({ id: 'a', viewer_count: 312 }), shot({ id: 'b', viewer_count: 934 })],
    })]),
    new Date('2026-08-20T01:00:00Z'), 'zh',
  )
  assert.equal(withViewers.competitors[0].shots.peakViewers, 934)

  const none = buildAskContext(
    board([comp({ shots: [shot({ id: 'a' })] })]),
    new Date('2026-08-20T01:00:00Z'), 'zh',
  )
  assert.equal(none.competitors[0].shots.peakViewers, null)
})

test('shots: lastUptimeMinutes 取最近一张有完整时刻的截图', () => {
  const ctx = buildAskContext(
    board([comp({
      // shots 已按 shot_on 降序（assemble.ts），这里照此顺序给。
      shots: [
        shot({ id: 'a', shot_on: '2026-08-19', stream_started_at: '2026-08-19T12:00:00Z', captured_at: '2026-08-19T13:36:00Z' }),
        shot({ id: 'b', shot_on: '2026-08-17', stream_started_at: '2026-08-17T12:00:00Z', captured_at: '2026-08-17T12:30:00Z' }),
      ],
    })]),
    new Date('2026-08-20T01:00:00Z'), 'zh',
  )
  assert.equal(ctx.competitors[0].shots.lastUptimeMinutes, 96)
})

test('shots: 没有任何截图时形状完整且不抛异常', () => {
  const ctx = buildAskContext(board([comp({})]), new Date('2026-08-20T01:00:00Z'), 'zh')
  assert.deepEqual(ctx.competitors[0].shots, {
    total: 0, capturedDates: [], lastOn: null, peakViewers: null, lastUptimeMinutes: null,
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

```bash
cd /Users/fengzhou/Code/newWith-competitor-nl && node --test --experimental-strip-types src/lib/competitors/ask-context.test.ts
```

Expected: FAIL —— `shots` 为 undefined

- [ ] **Step 3: 写实现**

import 区加：

```ts
import { shotUptimeParts } from './types.ts'
```

（`types.ts` 已同时导出类型与这个纯函数，合并进原有那行 import 也可以，但 `import type` 与值导入必须分开写。）

加接口与聚合：

```ts
export interface AskShots {
  total: number
  /**
   * 已采集到截图的日期，降序去重，**不截断**。
   * 这是「某天没记录只代表没采集」这条口径的物证：模型必须能看到完整的
   * 采集日历，才能如实回答"那天有没有采到"，而不是被迫猜"有没有开播"。
   */
  capturedDates: string[]
  lastOn: string | null
  peakViewers: number | null
  lastUptimeMinutes: number | null
}
```

在 `AskCompetitor` 里加 `shots: AskShots`。

```ts
function shotsOf(c: CompetitorWithHistory): AskShots {
  const dates = Array.from(
    new Set(c.shots.map((s) => s.shot_on).filter((d): d is string => d != null)),
  ).sort((a, b) => b.localeCompare(a))

  const viewers = c.shots.map((s) => s.viewer_count).filter((v): v is number => v != null)

  // shots 已按 shot_on 降序（assemble.ts），第一张能算出时长的就是最近一场。
  let lastUptimeMinutes: number | null = null
  for (const s of c.shots) {
    const parts = shotUptimeParts(s.stream_started_at, s.captured_at)
    if (parts) { lastUptimeMinutes = parts.h * 60 + parts.m; break }
  }

  return {
    total: c.shots.length,
    capturedDates: dates,
    lastOn: dates[0] ?? null,
    peakViewers: viewers.length ? Math.max(...viewers) : null,
    lastUptimeMinutes,
  }
}
```

在 `buildAskContext` 的 map 里加 `shots: shotsOf(c),`。

- [ ] **Step 4: 跑测试确认通过**

```bash
cd /Users/fengzhou/Code/newWith-competitor-nl && node --test --experimental-strip-types src/lib/competitors/ask-context.test.ts
```

Expected: PASS，16 tests

- [ ] **Step 5: 提交**

```bash
cd /Users/fengzhou/Code/newWith-competitor-nl
git add src/lib/competitors/ask-context.ts src/lib/competitors/ask-context.test.ts
git commit -m "feat(competitors): Ask 上下文的截图块与完整采集日历"
```

---

### Task 5: 身份字段、health 块、父子展开、coverage

**Files:**
- Modify: `src/lib/competitors/ask-context.ts`
- Modify: `src/lib/competitors/ask-context.test.ts`

- [ ] **Step 1: 写失败的测试**

追加：

```ts
test('身份字段：显示名三级回退 快照名 → 竞品名 → handle', () => {
  const now = new Date('2026-08-20T01:00:00Z')
  const bare = buildAskContext(board([comp({ handle: 'alpha' })]), now, 'zh')
  assert.equal(bare.competitors[0].name, 'alpha')

  const named = buildAskContext(
    board([comp({ handle: 'alpha', display_name: 'Alpha 团' })]), now, 'zh',
  )
  assert.equal(named.competitors[0].name, 'Alpha 团')
})

test('health: 超过 7 天未采集算陈旧，正好 7 天不算', () => {
  const now = new Date('2026-08-20T01:00:00Z') // 东京 2026-08-20
  const fresh = buildAskContext(
    board([comp({ history: [point('2026-08-13', 100)] })]), now, 'zh',
  )
  assert.equal(fresh.competitors[0].health.metricsAgeDays, 7)
  assert.equal(fresh.competitors[0].health.stale, false)

  const stale = buildAskContext(
    board([comp({ history: [point('2026-08-12', 100)] })]), now, 'zh',
  )
  assert.equal(stale.competitors[0].health.metricsAgeDays, 8)
  assert.equal(stale.competitors[0].health.stale, true)
})

test('health: 从未采集过指标时 age 为 null 且算陈旧', () => {
  const ctx = buildAskContext(board([comp({})]), new Date('2026-08-20T01:00:00Z'), 'zh')
  assert.deepEqual(ctx.competitors[0].health, { metricsAgeDays: null, stale: true })
})

test('父子：子主播独立成条目并带 parentHandle，isChild 为 true', () => {
  const child = comp({ id: 'c-1', handle: 'kid', parent_id: 'id-1' })
  const ctx = buildAskContext(
    board([comp({ handle: 'alpha', related: [child] })]),
    new Date('2026-08-20T01:00:00Z'), 'zh',
  )
  assert.equal(ctx.competitors.length, 2)
  assert.equal(ctx.competitors[0].handle, 'alpha')
  assert.equal(ctx.competitors[0].isChild, false)
  assert.equal(ctx.competitors[0].parentHandle, null)
  assert.equal(ctx.competitors[1].handle, 'kid')
  assert.equal(ctx.competitors[1].isChild, true)
  assert.equal(ctx.competitors[1].parentHandle, 'alpha')
})

test('coverage: 主竞品与子主播都计入 competitors，roots 只数顶层', () => {
  const child = comp({
    id: 'c-1', handle: 'kid', parent_id: 'id-1',
    shots: [shot({ id: 'k1', shot_on: '2026-08-18', stream_started_at: '2026-08-18T12:00:00Z' })],
  })
  const ctx = buildAskContext(
    board([comp({
      handle: 'alpha',
      history: [point('2026-08-17', 1000)],
      shots: [shot({ id: 'a1', shot_on: '2026-08-19', stream_started_at: '2026-08-19T12:00:00Z' })],
      related: [child],
    })]),
    new Date('2026-08-20T01:00:00Z'), 'zh',
  )
  assert.deepEqual(ctx.meta.coverage, {
    competitors: 2, roots: 1, withMetrics: 1,
    metricsDays: 1, shotDays: 2, sessionsWithStartTime: 2,
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

```bash
cd /Users/fengzhou/Code/newWith-competitor-nl && node --test --experimental-strip-types src/lib/competitors/ask-context.test.ts
```

Expected: FAIL —— `name` / `health` 为 undefined，`competitors.length` 为 1

- [ ] **Step 3: 写实现**

import 区加：

```ts
import { STALE_DAYS, competitorName } from './summary.ts'
```

补全 `AskCompetitor`：

```ts
export interface AskHealth {
  /** 距最近一次主页指标采集的天数；从未采集为 null。 */
  metricsAgeDays: number | null
  stale: boolean
}

export interface AskCompetitor {
  handle: string
  name: string
  region: string
  isChild: boolean
  parentHandle: string | null
  members: number | null
  followers: AskFollowers
  liveHabit: AskLiveHabit
  shots: AskShots
  health: AskHealth
}
```

加展开与 health：

```ts
interface FlatEntry {
  c: CompetitorWithHistory
  parentHandle: string | null
}

/** 把 related 里的子主播摊平成独立条目——它们各有自己的粉丝与开播数据，
 *  嵌套结构会让模型难以做跨账号比较。父子关系用 parentHandle 保留。 */
function flatten(list: CompetitorWithHistory[], parentHandle: string | null): FlatEntry[] {
  const out: FlatEntry[] = []
  for (const c of list) {
    out.push({ c, parentHandle })
    out.push(...flatten(c.related ?? [], c.handle))
  }
  return out
}

function healthOf(f: AskFollowers, todayTokyo: string): AskHealth {
  if (f.on == null) return { metricsAgeDays: null, stale: true }
  const age = daysBetween(f.on, todayTokyo)
  return { metricsAgeDays: age, stale: age > STALE_DAYS }
}
```

把 `buildAskContext` 整体替换为：

```ts
export function buildAskContext(board: CompetitorBoard, now: Date, locale: string): AskContext {
  const displayTimeZone = timeZoneForLocale(locale)
  const todayTokyo = dayIn(now, SHOT_TZ)
  const flat = flatten(board.competitors, null)

  const competitors: AskCompetitor[] = flat.map(({ c, parentHandle }) => {
    const followers = followersOf(c)
    return {
      handle: c.handle,
      name: competitorName(c),
      region: c.region,
      isChild: parentHandle != null,
      parentHandle,
      members: c.member_count,
      followers,
      liveHabit: liveHabitOf(c, displayTimeZone),
      shots: shotsOf(c),
      health: healthOf(followers, todayTokyo),
    }
  })

  const metricsDays = new Set<string>()
  const shotDays = new Set<string>()
  const sessions = new Set<string>()
  for (const { c } of flat) {
    for (const p of c.history) metricsDays.add(p.captured_on)
    for (const s of c.shots) {
      if (s.shot_on != null) shotDays.add(s.shot_on)
      if (s.stream_started_at != null) sessions.add(s.stream_started_at)
    }
  }

  return {
    meta: {
      todayTokyo,
      displayTimeZone,
      coverage: {
        competitors: competitors.length,
        roots: board.competitors.length,
        withMetrics: competitors.filter((x) => x.followers.latest != null).length,
        metricsDays: metricsDays.size,
        shotDays: shotDays.size,
        sessionsWithStartTime: sessions.size,
      },
      captureNote: CAPTURE_NOTE,
    },
    competitors,
  }
}
```

- [ ] **Step 4: 跑测试确认通过**

```bash
cd /Users/fengzhou/Code/newWith-competitor-nl && node --test --experimental-strip-types src/lib/competitors/ask-context.test.ts
```

Expected: PASS，21 tests

- [ ] **Step 5: 类型检查**

```bash
cd /Users/fengzhou/Code/newWith-competitor-nl && npx tsc --noEmit
```

Expected: 无错误

- [ ] **Step 6: 提交**

```bash
cd /Users/fengzhou/Code/newWith-competitor-nl
git add src/lib/competitors/ask-context.ts src/lib/competitors/ask-context.test.ts
git commit -m "feat(competitors): Ask 上下文的身份/健康度/父子展开与覆盖率"
```

---

### Task 6: system prompt 组装

**Files:**
- Create: `src/lib/competitors/ask-prompt.ts`
- Create: `src/lib/competitors/ask-prompt.test.ts`
- Modify: `package.json`（若 Task 1 只注册了 ask-context.test.ts）

- [ ] **Step 1: 写失败的测试**

创建 `src/lib/competitors/ask-prompt.test.ts`：

```ts
// src/lib/competitors/ask-prompt.test.ts
import assert from 'node:assert/strict'
import test from 'node:test'

import { buildAskContext } from './ask-context.ts'
import { ANSWER_LANGUAGE, buildSystemPrompt } from './ask-prompt.ts'

const CTX = buildAskContext({ competitors: [], canEdit: true }, new Date('2026-08-19T15:30:00Z'), 'zh')

test('prompt 内嵌完整上下文包 JSON', () => {
  const p = buildSystemPrompt(CTX, 'zh')
  assert.ok(p.includes('"todayTokyo": "2026-08-20"'))
  assert.ok(p.includes('不代表未开播'))
})

test('prompt 含三条硬规则', () => {
  const p = buildSystemPrompt(CTX, 'zh')
  assert.ok(p.includes('insufficient'), '必须点名 insufficient 字段不可用于推论')
  assert.ok(p.includes('有没有采到截图'), '必须规定开播问题的措辞')
  assert.ok(p.includes('不要做任何算术'), '必须禁止算术')
})

test('语言指令随 locale 切换，未知 locale 回落中文', () => {
  assert.ok(buildSystemPrompt(CTX, 'zh').includes(ANSWER_LANGUAGE.zh))
  assert.ok(buildSystemPrompt(CTX, 'en').includes(ANSWER_LANGUAGE.en))
  assert.ok(buildSystemPrompt(CTX, 'ja').includes(ANSWER_LANGUAGE.ja))
  assert.ok(buildSystemPrompt(CTX, 'fr').includes(ANSWER_LANGUAGE.zh))
})
```

- [ ] **Step 2: 跑测试确认失败**

```bash
cd /Users/fengzhou/Code/newWith-competitor-nl && node --test --experimental-strip-types src/lib/competitors/ask-prompt.test.ts
```

Expected: FAIL —— `Cannot find module './ask-prompt.ts'`

- [ ] **Step 3: 写实现**

创建 `src/lib/competitors/ask-prompt.ts`：

```ts
// src/lib/competitors/ask-prompt.ts
// 竞品问答的 system prompt。
//
// 模型在这套设计里只做三件事：读懂问题、从上下文包里挑出对应字段、说人话。
// 它不查库、不算数、不推论——所有数字与置信度都已由 ask-context.ts 算好。
// 下面三条规则是这个契约的文字化，删任何一条都会让答案开始编造。
import type { AskContext } from './ask-context.ts'

export const ANSWER_LANGUAGE: Record<string, string> = {
  zh: '用简体中文回答。',
  en: 'Answer in English.',
  ja: '日本語で回答してください。',
}

const RULES = `硬规则（违反即为错误回答）：

1. 不要做任何算术。所有数字必须从上下文包中原样引用；上下文里没有的数字就是没有，
   不要相加、相减、求平均或估算。

2. 任何 confidence 为 "insufficient" 的字段，禁止用于比较、排序或趋势结论。
   遇到这类问题，如实说明该账号样本不足（例如只有一次快照、开播场次不足以成档），
   并明确点名是哪些账号被排除在外，不要静默跳过。

3. 涉及「某天/某段时间是否开播」的问题，只能回答有没有采到截图，绝不能推断是否开播。
   shots.capturedDates 是完整的采集日历，某天不在其中只意味着当天没有采集。
   正确措辞：「8 月 19 日没有采到 solulune 的截图」。
   错误措辞：「solulune 8 月 19 日没有开播」。

其他约定：
- meta.todayTokyo 是今天（东京业务日）。「昨天」「上周」一律以它为基准推算，
  因为 shots.capturedDates 就是按东京业务日归档的。
- liveHabit.slots[].at 已按 meta.displayTimeZone 换算，直接引用即可，不要再做时区转换。
- 找不到用户问的账号时，直接说没有收录，并列出几个名字相近的 handle 供确认。
- 回答简洁，直接给结论；只在口径会影响理解时补一句数据来源说明。`

export function buildSystemPrompt(ctx: AskContext, locale: string): string {
  const language = ANSWER_LANGUAGE[locale] ?? ANSWER_LANGUAGE.zh
  return `你是 EchoAmp 内部后台「竞品监测」看板的数据助理。
你只能依据下面这份数据包回答问题，不得引入任何外部知识或猜测。

${RULES}

${language}

数据包：
${JSON.stringify(ctx, null, 2)}`
}
```

- [ ] **Step 4: 跑测试确认通过**

```bash
cd /Users/fengzhou/Code/newWith-competitor-nl && node --test --experimental-strip-types src/lib/competitors/ask-prompt.test.ts
```

Expected: PASS，3 tests

- [ ] **Step 5: 确认 npm test 整体绿灯**

```bash
cd /Users/fengzhou/Code/newWith-competitor-nl && npm test 2>&1 | tail -15
```

Expected: `# fail 0`。若报找不到 `ask-prompt.test.ts` 之外的问题，检查 Task 1 Step 5 的 `package.json` 是否两个文件都注册了。

- [ ] **Step 6: 提交**

```bash
cd /Users/fengzhou/Code/newWith-competitor-nl
git add src/lib/competitors/ask-prompt.ts src/lib/competitors/ask-prompt.test.ts package.json
git commit -m "feat(competitors): Ask 的 system prompt 与三条口径硬规则"
```

---

### Task 7: DeepSeek transport

**Files:**
- Create: `src/lib/llm/deepseek.ts`

无单测：这一层只有网络 IO，没有可测的逻辑分支值得钉死；行为在 Task 8 的端点里通过错误码体现。

- [ ] **Step 1: 写实现**

创建 `src/lib/llm/deepseek.ts`：

```ts
// src/lib/llm/deepseek.ts
// DeepSeek 的最小 chat transport（OpenAI 兼容协议）。
//
// 为什么不走 src/lib/agents/providers.ts：那里的 provider 联合类型绑着数据库的
// model_provider 枚举，为一个内部只读功能去改 DB 枚举不划算。
// src/lib/intent/parser.ts 当初接 Gemini 就是同样的取舍，此处沿用。
//
// 上下文缓存：DeepSeek 对重复的 prompt 前缀自动命中硬盘缓存，所以调用方必须
// 把体积最大、每轮都一样的那部分（数据包）放在 system 消息里、位置固定不变。

export interface ChatTurn {
  role: 'user' | 'assistant'
  content: string
}

export type DeepseekResult =
  | { ok: true; answer: string }
  | { ok: false; code: 'not_configured' | 'upstream'; message: string }

const DEFAULT_MODEL = 'deepseek-chat'
const TIMEOUT_MS = 60_000

export async function deepseekChat(systemPrompt: string, turns: ChatTurn[]): Promise<DeepseekResult> {
  const apiKey = process.env.DEEPSEEK_API_KEY
  if (!apiKey) {
    return { ok: false, code: 'not_configured', message: 'DEEPSEEK_API_KEY is not configured' }
  }
  const baseUrl = (process.env.DEEPSEEK_BASE_URL ?? 'https://api.deepseek.com').replace(/\/$/, '')
  const model = process.env.DEEPSEEK_MODEL ?? DEFAULT_MODEL

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        temperature: 0,
        messages: [{ role: 'system', content: systemPrompt }, ...turns],
      }),
      signal: controller.signal,
    })
    if (!res.ok) {
      const text = await res.text().catch(() => res.statusText)
      return { ok: false, code: 'upstream', message: `DeepSeek ${res.status}: ${text.slice(0, 500)}` }
    }
    const data = await res.json() as { choices?: { message?: { content?: string } }[] }
    const answer = data.choices?.[0]?.message?.content?.trim()
    if (!answer) return { ok: false, code: 'upstream', message: 'DeepSeek returned an empty answer' }
    return { ok: true, answer }
  } catch (err) {
    return { ok: false, code: 'upstream', message: err instanceof Error ? err.message : String(err) }
  } finally {
    clearTimeout(timer)
  }
}
```

- [ ] **Step 2: 类型检查**

```bash
cd /Users/fengzhou/Code/newWith-competitor-nl && npx tsc --noEmit
```

Expected: 无错误

- [ ] **Step 3: 提交**

```bash
cd /Users/fengzhou/Code/newWith-competitor-nl
git add src/lib/llm/deepseek.ts
git commit -m "feat(llm): DeepSeek chat transport 最小实现"
```

---

### Task 8: `/api/competitors/ask` 端点

**Files:**
- Create: `src/app/api/competitors/ask/route.ts`

- [ ] **Step 1: 写实现**

创建 `src/app/api/competitors/ask/route.ts`：

```ts
import { NextRequest, NextResponse } from 'next/server'
import { authGuard } from '@/lib/auth/guard'
import { getCompetitorBoard, httpStatusForError } from '@/lib/competitors/service'
import { buildAskContext } from '@/lib/competitors/ask-context'
import { buildSystemPrompt } from '@/lib/competitors/ask-prompt'
import { deepseekChat, type ChatTurn } from '@/lib/llm/deepseek'

// 历史上限：超出丢最早的一轮。数据包本身约 15k token，再让历史无限增长会顶穿
// 上下文窗口，也会让每轮成本随对话长度线性上涨。
const MAX_TURNS = 20
const MAX_CONTENT = 2000

function isTurn(v: unknown): v is ChatTurn {
  if (typeof v !== 'object' || v === null) return false
  const t = v as { role?: unknown; content?: unknown }
  return (t.role === 'user' || t.role === 'assistant')
    && typeof t.content === 'string'
    && t.content.trim().length > 0
    && t.content.length <= MAX_CONTENT
}

// POST /api/competitors/ask — body { messages: ChatTurn[], locale?: string }
export async function POST(req: NextRequest) {
  const user = await authGuard()
  if (user instanceof NextResponse) return user

  let body: { messages?: unknown; locale?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'bad_request', message: 'Invalid JSON body' }, { status: 400 })
  }

  if (!Array.isArray(body.messages) || body.messages.length === 0 || !body.messages.every(isTurn)) {
    return NextResponse.json({ error: 'bad_request', message: 'messages must be a non-empty ChatTurn[]' }, { status: 400 })
  }
  const all = body.messages as ChatTurn[]
  if (all[all.length - 1].role !== 'user') {
    return NextResponse.json({ error: 'bad_request', message: 'last message must be from the user' }, { status: 400 })
  }
  const turns = all.slice(-MAX_TURNS)
  const locale = typeof body.locale === 'string' ? body.locale : 'zh'

  const boardRes = await getCompetitorBoard(user.id)
  if (boardRes.error) {
    return NextResponse.json(
      { error: 'board', message: boardRes.error.message },
      { status: httpStatusForError(boardRes.error.code) },
    )
  }

  const ctx = buildAskContext(boardRes.data, new Date(), locale)
  const result = await deepseekChat(buildSystemPrompt(ctx, locale), turns)

  // 上游失败按 200 + error code 返回：面板要据此显示不同的可操作提示，
  // 而不是被 fetch 的 !res.ok 分支吞成一句泛化的网络错误（同 CommandBar 的做法）。
  if (!result.ok) {
    return NextResponse.json({ error: result.code, message: result.message }, { status: 200 })
  }
  return NextResponse.json({ answer: result.answer })
}
```

- [ ] **Step 2: 类型检查与 lint**

```bash
cd /Users/fengzhou/Code/newWith-competitor-nl && npx tsc --noEmit && npm run test:lint 2>&1 | tail -5
```

Expected: 均无错误

- [ ] **Step 3: 提交**

```bash
cd /Users/fengzhou/Code/newWith-competitor-nl
git add src/app/api/competitors/ask/route.ts
git commit -m "feat(competitors): Ask 无状态问答端点"
```

---

### Task 9: i18n 文案（三语）

**Files:**
- Modify: `messages/zh.json`
- Modify: `messages/en.json`
- Modify: `messages/ja.json`

先加文案再写组件，这样 Task 10 写 `t('ask.…')` 时 key 已经存在，`npm run test:i18n` 不会因引用缺失报红。

- [ ] **Step 1: 加中文文案**

在 `messages/zh.json` 的 `competitors` 对象内追加：

```json
    "ask": {
      "open": "问数据",
      "title": "问竞品数据",
      "close": "关闭",
      "placeholder": "例：上周谁涨粉最快 / solulune 一般几点开播",
      "send": "发送",
      "thinking": "正在查…",
      "emptyHint": "只回答已采集到的数据，不做推测。可以这样问：",
      "example1": "上周谁涨粉最快",
      "example2": "solulune 一般几点开播",
      "example3": "哪些竞品的数据该更新了",
      "errorNotConfigured": "对话功能尚未配置，请联系管理员设置 DEEPSEEK_API_KEY。",
      "errorUpstream": "没能拿到回答，可以再试一次。",
      "errorBadRequest": "这句话没能发出去，换一句再试。",
      "copyError": "复制报错",
      "copyTooltip": "复制完整错误信息发给开发者",
      "copied": "已复制"
    }
```

- [ ] **Step 2: 加英文文案**

在 `messages/en.json` 的 `competitors` 对象内追加：

```json
    "ask": {
      "open": "Ask the data",
      "title": "Ask about competitors",
      "close": "Close",
      "placeholder": "e.g. Who grew fastest last week / When does solulune usually go live",
      "send": "Send",
      "thinking": "Looking it up…",
      "emptyHint": "Answers come only from captured data — no guessing. Try asking:",
      "example1": "Who grew fastest last week",
      "example2": "When does solulune usually go live",
      "example3": "Which competitors are due for a refresh",
      "errorNotConfigured": "Chat is not configured yet. Ask an admin to set DEEPSEEK_API_KEY.",
      "errorUpstream": "Could not get an answer. Try again.",
      "errorBadRequest": "That message could not be sent. Try rephrasing it.",
      "copyError": "Copy error",
      "copyTooltip": "Copy the full error and send it to a developer",
      "copied": "Copied"
    }
```

- [ ] **Step 3: 加日文文案**

在 `messages/ja.json` 的 `competitors` 对象内追加：

```json
    "ask": {
      "open": "データに聞く",
      "title": "競合データに聞く",
      "close": "閉じる",
      "placeholder": "例：先週いちばん伸びたのは / solulune はいつも何時から配信",
      "send": "送信",
      "thinking": "確認中…",
      "emptyHint": "取得済みのデータだけで答えます。推測はしません。例えば：",
      "example1": "先週いちばん伸びたのは",
      "example2": "solulune はいつも何時から配信",
      "example3": "データの更新が必要な競合は",
      "errorNotConfigured": "チャット機能が未設定です。管理者に DEEPSEEK_API_KEY の設定を依頼してください。",
      "errorUpstream": "回答を取得できませんでした。もう一度お試しください。",
      "errorBadRequest": "このメッセージは送信できませんでした。言い換えてお試しください。",
      "copyError": "エラーをコピー",
      "copyTooltip": "エラー全文をコピーして開発者に送る",
      "copied": "コピーしました"
    }
```

- [ ] **Step 4: 校验三语 key parity**

```bash
cd /Users/fengzhou/Code/newWith-competitor-nl && npm run test:i18n 2>&1 | tail -15
```

Expected: key parity 通过。「unused message」的**警告**会出现（组件还没写），这是预期的，Task 10 后消失。若报的是 parity **错误**，说明三个文件的 key 不一致，修正后重跑。

- [ ] **Step 5: 提交**

```bash
cd /Users/fengzhou/Code/newWith-competitor-nl
git add messages/zh.json messages/en.json messages/ja.json
git commit -m "feat(competitors): Ask 面板三语文案"
```

---

### Task 10: AskPanel 侧边抽屉

**Files:**
- Create: `src/components/competitors/AskPanel.tsx`

设计要点：

- **非模态**。不加遮罩、不锁滚动——用户要一边看看板一边问。`Modal.tsx` 那套（居中 + `lockViewportScroll`）在这里是错的。
- 通过 portal 挂到 `document.body`，避开吸顶容器造成的层叠上下文裁切（同 `Modal.tsx` 的理由）。
- 所有可见文案走 `useTranslations('competitors')`，`.tsx` 里一个裸汉字都不能有。
- **初始聚焦用 `autoFocus` 而不是 ref**：`src/components/ui/Field.tsx:85` 的 `Input` 是普通函数组件、没有 `forwardRef`，`ref` 传不进去。把它改成 `forwardRef` 会动到全站共用组件，不在本任务范围。
- 错误态带「复制报错」按钮，沿用 `CommandBar.tsx:418` 的做法（`navigator.clipboard.writeText`）——出问题时用户能一键把技术细节发给开发者。

- [ ] **Step 1: 写实现**

创建 `src/components/competitors/AskPanel.tsx`：

```tsx
'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useLocale, useTranslations } from 'next-intl'
import { Loader2, Send, X } from 'lucide-react'
import Button from '@/components/ui/Button'
import { Input } from '@/components/ui/Field'
import { FOCUS_RING } from '@/lib/ui/recipes'

interface Turn {
  role: 'user' | 'assistant'
  content: string
}

type ErrorCode = 'not_configured' | 'upstream' | 'bad_request'

/** 空态里的示例问句。文案由调用方传入——见下方注释里 check-i18n 的限制。 */
function ExampleButton({ text, onPick }: { text: string; onPick: (q: string) => void }) {
  return (
    <button
      type="button"
      onClick={() => onPick(text)}
      // ring-inset：本按钮在 overflow-y-auto 容器内，offset 环会被裁掉
      // （design-system.md §4 第二配方）。
      className={`block w-full rounded-btn border border-line-soft px-3 py-2 text-left text-xs
        text-ink-700 hover:bg-line-soft focus:outline-none focus-visible:ring-2
        focus-visible:ring-primary-ring focus-visible:ring-inset`}
    >
      {text}
    </button>
  )
}

export default function AskPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useTranslations('competitors')
  const locale = useLocale()
  const [mounted, setMounted] = useState(false)
  const [turns, setTurns] = useState<Turn[]>([])
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<ErrorCode | null>(null)
  // 技术细节单独存：界面上只显示人话，这一串给「复制报错」按钮用。
  const [errorDetail, setErrorDetail] = useState('')
  const [copied, setCopied] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => { setMounted(true) }, [])

  // Escape 关闭。不锁滚动——面板是非模态的，看板要能继续滚。
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  // 新消息到达后滚到底。依赖长度而不是数组本身：数组每轮都是新引用。
  useEffect(() => { bottomRef.current?.scrollIntoView({ block: 'end' }) }, [turns.length, busy])

  async function send(question: string) {
    const q = question.trim()
    if (!q || busy) return
    const next = [...turns, { role: 'user' as const, content: q }]
    setTurns(next)
    setText('')
    setBusy(true)
    setError(null)
    setCopied(false)
    try {
      const res = await fetch('/api/competitors/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: next, locale }),
      })
      const json = await res.json() as { answer?: string; error?: ErrorCode; message?: string }
      if (json.answer) {
        setTurns([...next, { role: 'assistant', content: json.answer }])
      } else {
        setError(json.error ?? 'upstream')
        setErrorDetail(`[${json.error ?? 'upstream'}] ${json.message ?? ''}\nQ: ${q}`)
      }
    } catch (err) {
      setError('upstream')
      setErrorDetail(`[fetch] ${err instanceof Error ? err.message : String(err)}\nQ: ${q}`)
    } finally {
      setBusy(false)
    }
  }

  async function copyError() {
    await navigator.clipboard.writeText(errorDetail)
    setCopied(true)
  }

  if (!mounted || !open) return null

  const errorText = error === 'not_configured'
    ? t('ask.errorNotConfigured')
    : error === 'bad_request'
      ? t('ask.errorBadRequest')
      : t('ask.errorUpstream')

  return createPortal(
    <aside
      aria-label={t('ask.title')}
      className="fixed right-0 top-0 z-40 flex h-full w-full max-w-md flex-col border-l border-line bg-surface shadow-xl"
    >
      <header className="flex items-center justify-between border-b border-line px-4 py-3">
        <h2 className="text-sm font-medium text-ink-900">{t('ask.title')}</h2>
        <button
          type="button"
          onClick={onClose}
          aria-label={t('ask.close')}
          className={`rounded-btn p-1 text-ink-500 hover:bg-line-soft ${FOCUS_RING}`}
        >
          <X className="h-4 w-4" />
        </button>
      </header>

      <div className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
        {turns.length === 0 && (
          <div className="space-y-2">
            <p className="text-xs text-ink-500">{t('ask.emptyHint')}</p>
            {/* 三条示例逐条写死而不是 map 一个 key 数组：check-i18n.mjs 只认
                t('字面量') 形式，动态 key 会被判成「message 没有被引用」。 */}
            <ExampleButton text={t('ask.example1')} onPick={send} />
            <ExampleButton text={t('ask.example2')} onPick={send} />
            <ExampleButton text={t('ask.example3')} onPick={send} />
          </div>
        )}

        {turns.map((turn, i) => (
          <div
            key={`${turn.role}-${i}`}
            className={turn.role === 'user'
              ? 'ml-auto max-w-[85%] rounded-btn bg-primary-soft px-3 py-2 text-sm text-primary-hover'
              : 'max-w-[95%] whitespace-pre-wrap text-sm text-ink-900'}
          >
            {turn.content}
          </div>
        ))}

        {busy && (
          <p className="flex items-center gap-1.5 text-xs text-ink-500">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            {t('ask.thinking')}
          </p>
        )}

        {error && (
          <div className="flex items-start justify-between gap-2 rounded-btn border border-line bg-muted-soft px-3 py-2">
            <p className="text-xs text-danger-text">{errorText}</p>
            <button
              type="button"
              onClick={() => void copyError()}
              title={t('ask.copyTooltip')}
              className={`shrink-0 rounded-btn border border-line-soft px-2 py-1 text-xs text-ink-700
                hover:bg-line-soft focus:outline-none focus-visible:ring-2
                focus-visible:ring-primary-ring focus-visible:ring-inset`}
            >
              {copied ? t('ask.copied') : t('ask.copyError')}
            </button>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      <form
        className="flex items-center gap-2 border-t border-line px-4 py-3"
        onSubmit={(e) => { e.preventDefault(); void send(text) }}
      >
        <Input
          autoFocus
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={t('ask.placeholder')}
          className="flex-1"
        />
        <Button type="submit" size="sm" loading={busy} disabled={!text.trim()}>
          <Send className="h-3.5 w-3.5" />
          {t('ask.send')}
        </Button>
      </form>
    </aside>,
    document.body,
  )
}
```

- [ ] **Step 2: 跑门禁**

```bash
cd /Users/fengzhou/Code/newWith-competitor-nl && npx tsc --noEmit && npm run test:no-bare-han && npm run test:style && npm run test:lint 2>&1 | tail -8
```

Expected: 全部通过。若 `test:no-bare-han` 报错，说明有裸汉字漏进了 JSX——搬进 `messages/*.json`。

- [ ] **Step 3: 提交**

```bash
cd /Users/fengzhou/Code/newWith-competitor-nl
git add src/components/competitors/AskPanel.tsx
git commit -m "feat(competitors): Ask 侧边抽屉面板"
```

---

### Task 11: 挂载面板与触发按钮

**Files:**
- Modify: `src/components/competitors/CompetitorDossierView.tsx`

- [ ] **Step 1: 加 import 与 state**

在 `CompetitorDossierView.tsx` 的 import 区加（`Plus` 那行附近）：

```tsx
import { MessageSquareText, Plus } from 'lucide-react'
import AskPanel from './AskPanel'
```

（原第 6 行 `import { Plus } from 'lucide-react'` 替换为上面第一行。）

在组件内的 state 声明区（`const [selectedId, setSelectedId] = useState<string | null>(null)` 之后）加：

```tsx
  const [askOpen, setAskOpen] = useState(false)
```

- [ ] **Step 2: 加触发按钮与面板**

把渲染里的这一行：

```tsx
          {summary && <CompetitorSummaryBar summary={summary} />}
```

替换为：

```tsx
          {summary && <CompetitorSummaryBar summary={summary} />}
          <div className="flex justify-end">
            <Button variant="secondary" size="sm" onClick={() => setAskOpen(true)}>
              <MessageSquareText className="h-3.5 w-3.5" />
              {t('ask.open')}
            </Button>
          </div>
```

在组件 return 的最外层 `</div>` 之前（与 `{board.competitors.length === 0 ? … : …}` 同级）加：

```tsx
      <AskPanel open={askOpen} onClose={() => setAskOpen(false)} />
```

- [ ] **Step 3: 跑门禁**

```bash
cd /Users/fengzhou/Code/newWith-competitor-nl && npx tsc --noEmit && npm run test:copy 2>&1 | tail -10
```

Expected: 全绿。此时 Task 9 的「unused message」警告应当消失（所有 `ask.*` key 都已被引用）。

- [ ] **Step 4: 提交**

```bash
cd /Users/fengzhou/Code/newWith-competitor-nl
git add src/components/competitors/CompetitorDossierView.tsx
git commit -m "feat(competitors): 看板挂载 Ask 面板与入口按钮"
```

---

### Task 12: 实机验收

**Files:** 无（仅验证）

前置：`.env.local` 里要有 `DEEPSEEK_API_KEY`。没有的话跳到 Step 3 只验证未配置态。

- [ ] **Step 1: 起 worktree 专用 dev server**

主仓的 `npm run dev` 固定 3001 端口，worktree 要换一个避免撞车：

```bash
cd /Users/fengzhou/Code/newWith-competitor-nl && npx next dev --port 3012
```

- [ ] **Step 2: 走一遍口径清单**

打开 `http://localhost:3012/zh/competitors`，点「问数据」，逐条问并对照预期：

| 问题 | 必须成立 |
|---|---|
| `solulune 昨天开播了吗` | 措辞是「有/没有采到截图」；**不得**出现「没有开播」 |
| `上周谁涨粉最快` | 只在有 ≥2 个快照的账号间比较，被排除的账号要被点名 |
| 挑一个只播过 1 场的账号问「一般几点开播」 | 明说样本不足，不给档次结论 |
| `哪些竞品的数据该更新了` | 与看板「待更新」格子的数字一致 |
| 追问一句 `那上上周呢` | 能接住上下文，不要求重述账号名 |

任何一条不达标 → 回 `src/lib/competitors/ask-prompt.ts` 收紧对应规则，重跑本步。

- [ ] **Step 3: 验证错误态**

临时注释掉 `.env.local` 里的 `DEEPSEEK_API_KEY`、重启 dev server，再问一句：面板应显示「对话功能尚未配置」而不是白屏或 500。验证完恢复。

- [ ] **Step 4: 验证日文界面**

打开 `http://localhost:3012/ja/competitors`，问 `solulune はいつも何時から配信`：答案必须是日文，且钟点比中文界面晚一小时（东京 vs 上海）。

---

### Task 13: 更新日志与收尾

**Files:**
- Modify: `src/lib/changelog/entries.ts`

- [ ] **Step 1: 加更新日志条目**

在 `CHANGELOG` 数组顶部那条 `date: '2026-08-20'` 的 `items` 数组**开头**插入（若当天条目已不存在，则新建一天）：

```ts
      {
        kind: 'feat',
        scope: '竞品监测',
        title: '看板可以直接用一句话问数据了',
        details:
          '竞品页新增「问数据」侧边面板，支持多轮追问：粉丝涨得怎么样、某个账号一般几点开播、哪天采到过截图、哪些账号的数据该更新了，都可以直接问。所有数字来自已采集的数据本身，不做推测——样本不足时会明说「数据不够」而不是给一个看着精确的错数。特别注意措辞上的一条硬规矩：某天没有截图记录只会被回答成「那天没有采到截图」，绝不会说成「那天没开播」，因为截图是半自动采集的，采不到不等于对方没播。',
      },
```

- [ ] **Step 2: 跑全套门禁**

```bash
cd /Users/fengzhou/Code/newWith-competitor-nl && npm test 2>&1 | tail -5 && npm run test:copy 2>&1 | tail -5 && npx tsc --noEmit
```

Expected: `# fail 0`、copy-checks 全绿、tsc 无输出

- [ ] **Step 3: 提交并推分支**

```bash
cd /Users/fengzhou/Code/newWith-competitor-nl
git add src/lib/changelog/entries.ts
git commit -m "docs(changelog): 竞品监测会话式查询上线条目"
git push -u origin feat/competitor-nl-query
```

- [ ] **Step 4: 开 PR**

```bash
cd /Users/fengzhou/Code/newWith-competitor-nl && gh pr create --base main --title "feat(competitors): 竞品看板会话式查询（Ask 面板）" --body "$(cat <<'EOF'
## 做了什么

竞品监测看板新增「问数据」侧边面板，多轮对话问竞品数据。设计见 `docs/superpowers/specs/2026-08-20-competitor-ask-design.md`。

架构是**预聚合上下文 + 模型只措辞**：把整个竞品数据集聚合成一份结构化 JSON 进 system prompt，所有数字由现有纯函数算好，模型不做任何算术。置信度门槛前移到上下文层，样本不足的字段带 `confidence: "insufficient"`，模型拿不到能推论的原料。

## 覆盖范围

- 粉丝规模与增长
- 开播作息与单场事实
- 采集健康度

## 两个口径决定

- **日期比较用 Asia/Tokyo**，对齐 `shot_on` 的落库日历；**钟点按界面语言时区**显示，复用 `localeZone.ts` 既有约定
- **「没采到 ≠ 没开播」**：上下文里给完整采集日历，prompt 里硬性规定只能答「有/没有采到截图」

## 已知限制

- 上面那条措辞规则无法自动化测试，靠 prompt 约束 + 人工验收（验收清单已跑，见下）
- 上下文包约 15k token，随数据增长；超过 30k 时需转 tool-calling
- 两个采集脚本日历不一致（截图东京日 / 快照 UTC）是既有技术债，本 PR 只适配不修正

## 人工验收

- [x] 「昨天开播了吗」答成「有没有采到截图」，未出现「没有开播」
- [x] 涨粉比较排除样本不足账号并点名
- [x] 单场账号问作息会说样本不足
- [x] 健康度答案与看板「待更新」一致
- [x] 多轮追问能接住上下文
- [x] 未配置 API key 时显示配置提示，不白屏
- [x] 日文界面答案为日文且钟点时区正确

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"