# 截图放大页「同期在播」实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 相册放大页对扩展上传的截图显示「同期在播 N 家 · 本号第 k 位」摘要与可展开的同一秒各家人数名单。

**Architecture:** 判定逻辑全部放在 `src/lib/competitors/coLive.ts` 纯函数（排序、名次、本号回退、条形归一化），组件只做按 shot_id 取数、缓存与渲染。新增一个只读接口按 `shot_id` 查 `competitor_viewer_readings` 并 join 竞品名；渐变层开关 `shotOverlaySections` 加一项 `coLive`。不改表、不改采集端。

**Tech Stack:** Next.js App Router（route handler + 'use client' 组件）、Supabase（服务端 client）、next-intl 三语文案、`node --test --experimental-strip-types` 单测、Tailwind。

**Spec:** `docs/superpowers/specs/2026-10-12-shot-colive-readings-design.md`

## Global Constraints

- 仓库是 PUBLIC：代码、注释、提交信息里不放真实竞品账号、内部人名、本机绝对路径。测试夹具用 `a`、`b`、`c` 这类占位 handle。
- 注释里引用 PR 写成 `PR 318`，不写 `(#318)`，否则 `check-style-tokens` 把它当裸 hex 挂 CI。
- `node --test` 不做类型检查：纯类型 import 必须写 `import type`；新测试文件必须登记进 `package.json` 的 `test` 脚本。
- 组件目录没有 DOM 测试环境，所有可判定逻辑进 lib 纯函数。
- 三语文案 key 同时加进 `messages/zh.json`、`messages/en.json`、`messages/ja.json` 的 `competitors` 命名空间，`npm run test:i18n` 会核对三份一致。tsx 源码里不出现裸汉字（`npm run test:no-bare-han`）。
- `npm run test:lint`（`--max-warnings=0`）零警告。
- 视觉与交互验证走生产构建 `npm run build && npm start`，不信 `next dev`（StrictMode 下批量取数会永久卡 loading）。
- 提交信息末尾带 `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`。

## Review Focus

1. 同一张截图在 `competitor_viewer_readings` 里同时有本号的 `sidebar` 行和 `current` 行：名单里本号只出现一次、用 sidebar 行的数。→ Task 1 测试「本号同时有两行」。
2. 两家并列第一、本号第三：本号名次是 3 不是 2（竞赛名次）。→ Task 1 测试「并列名次」。
3. 所有行的 `viewer_count` 都是 null（页面改版导致解析全失败）：不除零、不画条、摘要不报名次、名单仍按原文显示。→ Task 1 测试「全部解析失败」。
4. 快速连续翻图，前一张的请求晚于后一张返回：缓存按 shot_id 写入，不会把 A 的名单画到 B 上。→ Task 4 实现里按 shot_id 写缓存，真机验收第 6 项。
5. 接口收到非 uuid 的 shotId（手改 URL）：400，不打到数据库。→ Task 3 测试 `parseShotId`。

---

### Task 1: 纯函数 `buildCoLiveView`

**Files:**
- Create: `src/lib/competitors/coLive.ts`
- Create: `src/lib/competitors/coLive.test.ts`
- Modify: `package.json`（`test` 脚本末尾追加 ` src/lib/competitors/coLive.test.ts`）

**Interfaces:**
- Consumes: 无。
- Produces:
  - `interface CoLiveReading { competitorId: string; handle: string; displayName: string | null; source: 'current' | 'sidebar'; viewerCount: number | null; viewerText: string | null }`
  - `interface CoLiveRow { competitorId: string; label: string; viewerCount: number | null; viewerText: string | null; rank: number | null; isSelf: boolean; barRatio: number }`
  - `interface CoLiveView { rows: CoLiveRow[]; total: number; selfRank: number | null; selfFromCurrent: boolean }`
  - `function buildCoLiveView(readings: CoLiveReading[], selfCompetitorId: string): CoLiveView | null`

- [ ] **Step 1: 写失败的测试**

```ts
// src/lib/competitors/coLive.test.ts
import test from 'node:test'
import assert from 'node:assert/strict'

import { buildCoLiveView, type CoLiveReading } from './coLive.ts'

const SELF = 'self-id'

function r(over: Partial<CoLiveReading> & { competitorId: string }): CoLiveReading {
  return {
    handle: over.competitorId,
    displayName: null,
    source: 'sidebar',
    viewerCount: null,
    viewerText: null,
    ...over,
  }
}

test('按人数降序，并列同名次、下一名次跳过（212/117/117/67 → 1/2/2/4）', () => {
  const v = buildCoLiveView([
    r({ competitorId: 'c', viewerCount: 117, viewerText: '117' }),
    r({ competitorId: SELF, viewerCount: 67, viewerText: '67' }),
    r({ competitorId: 'a', viewerCount: 212, viewerText: '212' }),
    r({ competitorId: 'b', viewerCount: 117, viewerText: '117' }),
  ], SELF)
  assert.ok(v)
  assert.deepEqual(v.rows.map((x) => [x.competitorId, x.rank]), [['a', 1], ['b', 2], ['c', 2], [SELF, 4]])
  assert.equal(v.total, 4)
  assert.equal(v.selfRank, 4)
  assert.equal(v.selfFromCurrent, false)
})

test('本号同时有 sidebar 行与 current 行：只出现一次，用 sidebar 行的数', () => {
  const v = buildCoLiveView([
    r({ competitorId: 'a', viewerCount: 100 }),
    r({ competitorId: SELF, source: 'current', viewerCount: 999 }),
    r({ competitorId: SELF, viewerCount: 50 }),
  ], SELF)
  assert.ok(v)
  const self = v.rows.filter((x) => x.isSelf)
  assert.equal(self.length, 1)
  assert.equal(self[0].viewerCount, 50)
  assert.equal(v.selfFromCurrent, false)
})

test('本号不在 Following 里：退回 current 行，selfFromCurrent 为 true', () => {
  const v = buildCoLiveView([
    r({ competitorId: 'a', viewerCount: 100 }),
    r({ competitorId: SELF, source: 'current', viewerCount: 80 }),
  ], SELF)
  assert.ok(v)
  assert.equal(v.selfFromCurrent, true)
  assert.equal(v.selfRank, 2)
  assert.equal(v.rows.find((x) => x.isSelf)?.viewerCount, 80)
})

test('别家的 current 行不参与（只有本号才能用 current 回退）', () => {
  const v = buildCoLiveView([
    r({ competitorId: 'a', source: 'current', viewerCount: 100 }),
    r({ competitorId: 'b', viewerCount: 60 }),
    r({ competitorId: SELF, viewerCount: 40 }),
  ], SELF)
  assert.ok(v)
  assert.deepEqual(v.rows.map((x) => x.competitorId), ['b', SELF])
})

test('解析失败的行排末尾、rank 为 null、barRatio 为 0、保留原文', () => {
  const v = buildCoLiveView([
    r({ competitorId: 'a', viewerCount: null, viewerText: '1.2K' }),
    r({ competitorId: SELF, viewerCount: 40, viewerText: '40' }),
    r({ competitorId: 'b', viewerCount: 60, viewerText: '60' }),
  ], SELF)
  assert.ok(v)
  const last = v.rows[v.rows.length - 1]
  assert.equal(last.competitorId, 'a')
  assert.equal(last.rank, null)
  assert.equal(last.barRatio, 0)
  assert.equal(last.viewerText, '1.2K')
  assert.equal(v.selfRank, 2)
})

test('全部解析失败：不除零、全员 rank null、selfRank null、名单仍在', () => {
  const v = buildCoLiveView([
    r({ competitorId: 'a', viewerText: '1.2K' }),
    r({ competitorId: SELF, viewerText: '?' }),
  ], SELF)
  assert.ok(v)
  assert.equal(v.total, 2)
  assert.equal(v.selfRank, null)
  assert.ok(v.rows.every((x) => x.rank === null && x.barRatio === 0))
})

test('barRatio 以本批最大值为分母', () => {
  const v = buildCoLiveView([
    r({ competitorId: 'a', viewerCount: 200 }),
    r({ competitorId: SELF, viewerCount: 50 }),
  ], SELF)
  assert.ok(v)
  assert.equal(v.rows[0].barRatio, 1)
  assert.equal(v.rows[1].barRatio, 0.25)
})

test('最大值为 0：全员 barRatio 为 0，不出 NaN', () => {
  const v = buildCoLiveView([
    r({ competitorId: 'a', viewerCount: 0 }),
    r({ competitorId: SELF, viewerCount: 0 }),
  ], SELF)
  assert.ok(v)
  assert.ok(v.rows.every((x) => x.barRatio === 0))
})

test('label 取 displayName，空则 handle', () => {
  const v = buildCoLiveView([
    r({ competitorId: 'a', handle: 'a_handle', displayName: 'A 社', viewerCount: 10 }),
    r({ competitorId: SELF, handle: 'self_handle', displayName: '', viewerCount: 5 }),
  ], SELF)
  assert.ok(v)
  assert.equal(v.rows[0].label, 'A 社')
  assert.equal(v.rows[1].label, 'self_handle')
})

test('空输入返回 null', () => {
  assert.equal(buildCoLiveView([], SELF), null)
})

test('只有本号一行返回 null（没有可比对象）', () => {
  assert.equal(buildCoLiveView([r({ competitorId: SELF, viewerCount: 10 })], SELF), null)
  assert.equal(buildCoLiveView([r({ competitorId: SELF, source: 'current', viewerCount: 10 })], SELF), null)
})

test('只有别家、本号一行都没有：名单照出，selfRank null', () => {
  const v = buildCoLiveView([
    r({ competitorId: 'a', viewerCount: 10 }),
    r({ competitorId: 'b', viewerCount: 20 }),
  ], SELF)
  assert.ok(v)
  assert.equal(v.total, 2)
  assert.equal(v.selfRank, null)
  assert.ok(v.rows.every((x) => !x.isSelf))
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `node --test --experimental-strip-types src/lib/competitors/coLive.test.ts`
Expected: 失败，报找不到模块 `./coLive.ts`。

- [ ] **Step 3: 写实现**

```ts
// src/lib/competitors/coLive.ts
// 截图放大页「同期在播」的判定：把一张截图关联的读数行变成排好序、算好名次的名单。
// 纯函数、不读时钟、不碰 DOM。设计稿：docs/superpowers/specs/2026-10-12-shot-colive-readings-design.md
//
// 口径（已定，改之前先改设计稿）：
// - 横向比较只用 source='sidebar'（Following 侧栏同一秒横截面）。
// - 本号若也在 Following 里就用它的 sidebar 行；没有才退回 current 行（房间内读数）并标 selfFromCurrent。
//   别家的 current 行一律不看——那是别人截别的房间时的口径。
// - 竞赛名次：并列同名次，下一名次跳过。解析失败（viewerCount 为 null）排末尾、不计名次。
// - 名单为空或只有本号一行返回 null：没有可比对象，放大页整段不画。

export interface CoLiveReading {
  competitorId: string
  handle: string
  displayName: string | null
  source: 'current' | 'sidebar'
  viewerCount: number | null
  viewerText: string | null
}

export interface CoLiveRow {
  competitorId: string
  /** displayName，空则 handle。 */
  label: string
  viewerCount: number | null
  /** 页面原文（如 1.2K）；viewerCount 为 null 时界面显示它。 */
  viewerText: string | null
  /** 竞赛名次；解析失败为 null。 */
  rank: number | null
  isSelf: boolean
  /** viewerCount / 本批最大值，0..1；解析失败或最大值为 0 时为 0。 */
  barRatio: number
}

export interface CoLiveView {
  /** 已排序：人数降序，解析失败的在末尾。 */
  rows: CoLiveRow[]
  /** 名单行数（含本号）。 */
  total: number
  /** 本号名次；本号没有可用读数或解析失败时为 null。 */
  selfRank: number | null
  /** 本号的数来自 current 行（本号不在 Following 里）。 */
  selfFromCurrent: boolean
}

export function buildCoLiveView(readings: CoLiveReading[], selfCompetitorId: string): CoLiveView | null {
  const sidebar = readings.filter((x) => x.source === 'sidebar')
  let selfFromCurrent = false
  let pool = sidebar
  if (!sidebar.some((x) => x.competitorId === selfCompetitorId)) {
    const current = readings.find((x) => x.source === 'current' && x.competitorId === selfCompetitorId)
    if (current) {
      pool = [...sidebar, current]
      selfFromCurrent = true
    }
  }
  if (pool.length < 2) return null

  const sorted = [...pool].sort((p, q) => {
    if (p.viewerCount == null && q.viewerCount == null) return 0
    if (p.viewerCount == null) return 1
    if (q.viewerCount == null) return -1
    return q.viewerCount - p.viewerCount
  })
  const counts = sorted.map((x) => x.viewerCount).filter((n): n is number => n != null)
  const max = counts.length ? Math.max(...counts) : 0

  const rows: CoLiveRow[] = []
  let rank = 0
  let prev: number | null = null
  sorted.forEach((x, i) => {
    let myRank: number | null = null
    if (x.viewerCount != null) {
      // 竞赛名次：与前一行同值就沿用前一行的名次，否则名次 = 当前位置（从 1 起）
      if (prev === null || x.viewerCount !== prev) rank = i + 1
      prev = x.viewerCount
      myRank = rank
    }
    rows.push({
      competitorId: x.competitorId,
      label: x.displayName?.trim() ? x.displayName : x.handle,
      viewerCount: x.viewerCount,
      viewerText: x.viewerText,
      rank: myRank,
      isSelf: x.competitorId === selfCompetitorId,
      barRatio: x.viewerCount != null && max > 0 ? x.viewerCount / max : 0,
    })
  })
  const self = rows.find((x) => x.isSelf)
  return { rows, total: rows.length, selfRank: self?.rank ?? null, selfFromCurrent }
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `node --test --experimental-strip-types src/lib/competitors/coLive.test.ts`
Expected: 12 个用例全过。

- [ ] **Step 5: 登记测试文件**

在 `package.json` 的 `"test"` 脚本字符串末尾（`src/lib/markdown/miniMarkdown.test.ts` 之后）追加 ` src/lib/competitors/coLive.test.ts`。然后：

Run: `npm test 2>&1 | tail -5`
Expected: 全过，总数比之前多 12。

- [ ] **Step 6: 提交**

```bash
git add src/lib/competitors/coLive.ts src/lib/competitors/coLive.test.ts package.json
git commit -m "feat(competitors): 同期在播名单纯函数 buildCoLiveView

排序、竞赛名次、本号 current 回退、条形归一化，全部纯函数并有测试。

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: 渐变层开关 `coLive`

**Files:**
- Modify: `src/lib/competitors/shotOverlay.ts:14-56`
- Modify: `src/lib/competitors/shotOverlay.test.ts`

**Interfaces:**
- Consumes: 无。
- Produces: `shotOverlaySections(shot, canEdit, total, coLive = false)` 返回值多一项 `coLive: boolean`，`footer` 为 `live || caption || strip || edit || coLive`。第四参默认 false，现有调用方不改也不变行为。

- [ ] **Step 1: 写失败的测试**

在 `src/lib/competitors/shotOverlay.test.ts` 末尾追加：

```ts
test('coLive 为 true：只读 + 人工上传 + 仅此一张也要画渐变层，承载「同期」段', () => {
  const s = shotOverlaySections(manual, false, 1, true)
  assert.equal(s.coLive, true)
  assert.equal(s.footer, true)
  assert.equal(s.live, false)
  assert.equal(s.caption, false)
})

test('coLive 省略或 false：返回值与改动前一致，footer 不受影响', () => {
  assert.deepEqual(shotOverlaySections(manual, false, 1), {
    live: false, caption: false, strip: false, edit: false, coLive: false, footer: false,
  })
  assert.equal(shotOverlaySections(auto, true, 3, false).coLive, false)
})

test('没有选中项时 coLive 也不画：这一段的作用对象就是选中项', () => {
  assert.equal(shotOverlaySections(null, true, 3, true).coLive, false)
})
```

同时把文件里现有两个 `assert.deepEqual(... { live, caption, strip, edit, footer })` 的期望对象各加一项 `coLive: false`（在 `edit` 之后、`footer` 之前）。

- [ ] **Step 2: 跑测试确认失败**

Run: `node --test --experimental-strip-types src/lib/competitors/shotOverlay.test.ts`
Expected: deepEqual 用例因缺少 `coLive` 键失败；新用例因 `s.coLive` 为 undefined 失败。

- [ ] **Step 3: 改实现**

`src/lib/competitors/shotOverlay.ts`：

```ts
export interface ShotOverlaySections {
  /** 直播态 chips：在线人数 / 开播时刻 / 已播时长。 */
  live: boolean
  /** 人眼核实截图时写的一句话概括；人工上传的图这个字段是空串。 */
  caption: boolean
  /** 胶片条：当天不止一张时才有，承担"共几张 / 现在第几张 / 跳转"。 */
  strip: boolean
  /** 改日期 + 删除的入口。 */
  edit: boolean
  /** 「同期在播」：这张截图有同一秒别家的读数（或读数请求失败要报一句）时才有。 */
  coLive: boolean
  /** 五段全空 —— 渐变层整个不画，图上只剩左上角那两颗胶囊。 */
  footer: boolean
}

export function shotOverlaySections(
  shot: OverlayInput | null | undefined,
  canEdit: boolean,
  total: number,
  coLiveAvailable = false,
): ShotOverlaySections {
  const has = Boolean(shot)
  const live = has && (shot!.viewer_count != null || shot!.stream_started_at != null)
  const caption = Boolean(shot?.caption?.trim())
  const strip = has && total > 1
  const edit = has && canEdit
  // 同期段由调用方告知有没有东西可画（读数来自另一次请求，不在 shot 字段里）
  const coLive = has && coLiveAvailable
  return { live, caption, strip, edit, coLive, footer: live || caption || strip || edit || coLive }
}
```

保留文件里原有的注释（`has`、`viewer_count != null`、胶片条那几段），只改签名、加字段、改 footer。

- [ ] **Step 4: 跑测试确认通过**

Run: `node --test --experimental-strip-types src/lib/competitors/shotOverlay.test.ts`
Expected: 全过。

- [ ] **Step 5: 提交**

```bash
git add src/lib/competitors/shotOverlay.ts src/lib/competitors/shotOverlay.test.ts
git commit -m "feat(competitors): 渐变层开关加 coLive 段，默认关、现有调用不变

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: 读数接口 `GET /api/competitors/shots/[shotId]/readings`

**Files:**
- Modify: `src/lib/competitors/coLive.ts`（加 `parseShotId`）
- Modify: `src/lib/competitors/coLive.test.ts`
- Modify: `src/lib/competitors/service.ts`（加 `getShotReadings`，放在 `getShotsInRange` 之后）
- Create: `src/app/api/competitors/shots/[shotId]/readings/route.ts`

**Interfaces:**
- Consumes: Task 1 的 `CoLiveReading`。
- Produces:
  - `parseShotId(raw: unknown): string | null`（coLive.ts）：uuid 小写化后返回，不是 uuid 返回 null。
  - `getShotReadings(shotId: string): Promise<ServiceResult<{ capturedAt: string | null; rows: CoLiveReading[] }>>`（service.ts）。
  - HTTP：`{ data: { capturedAt, rows }, error: null }`；非 uuid 400；查库失败 500。

- [ ] **Step 1: 写失败的测试**

在 `src/lib/competitors/coLive.test.ts` 顶部 import 改为 `import { buildCoLiveView, parseShotId, type CoLiveReading } from './coLive.ts'`，末尾追加：

```ts
test('parseShotId：合法 uuid 原样小写返回，其它一律 null', () => {
  assert.equal(parseShotId('3F2504E0-4F89-11D3-9A0C-0305E82C3301'), '3f2504e0-4f89-11d3-9a0c-0305e82c3301')
  assert.equal(parseShotId('not-a-uuid'), null)
  assert.equal(parseShotId(''), null)
  assert.equal(parseShotId(undefined), null)
  assert.equal(parseShotId(123), null)
  assert.equal(parseShotId('3f2504e0-4f89-11d3-9a0c-0305e82c3301; drop table x'), null)
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `node --test --experimental-strip-types src/lib/competitors/coLive.test.ts`
Expected: 报 `parseShotId` 不是函数（或 import 失败）。

- [ ] **Step 3: 实现 parseShotId**

`src/lib/competitors/coLive.ts` 末尾追加：

```ts
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

/** 路由参数里的 shotId：是 uuid 就小写返回，否则 null（400，不打到数据库）。 */
export function parseShotId(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const s = raw.trim().toLowerCase()
  return UUID_RE.test(s) ? s : null
}
```

Run: `node --test --experimental-strip-types src/lib/competitors/coLive.test.ts`
Expected: 全过。

- [ ] **Step 4: 加服务函数**

`src/lib/competitors/service.ts`，import 区加 `import type { CoLiveReading } from './coLive.ts'`，在 `getShotsInRange` 之后加：

```ts
/**
 * 一张截图关联的全部人数读数（扩展上传时写的 current + sidebar 行），带竞品名。
 * 单张最多几十行，不分页。截图不存在或没有读数都回空数组，不是错误——
 * 自动巡检的老截图本来就没有读数行，放大页据此整段不画。
 */
export async function getShotReadings(
  shotId: string,
): Promise<ServiceResult<{ capturedAt: string | null; rows: CoLiveReading[] }>> {
  const db = createServerClient()
  const { data, error } = await db
    .from('competitor_viewer_readings')
    .select('competitor_id, captured_at, source, viewer_count, viewer_text, competitors(handle, display_name)')
    .eq('shot_id', shotId)
  if (error) return err('db_error', error.message)
  type Row = {
    competitor_id: string
    captured_at: string
    source: 'current' | 'sidebar'
    viewer_count: number | null
    viewer_text: string | null
    competitors: { handle: string; display_name: string | null } | null
  }
  const rows: CoLiveReading[] = []
  for (const r of (data ?? []) as Row[]) {
    // 竞品被删后外键级联会把读数一起删掉，这里的 null 只是类型上的保险
    if (!r.competitors) continue
    rows.push({
      competitorId: r.competitor_id,
      handle: r.competitors.handle,
      displayName: r.competitors.display_name,
      source: r.source,
      viewerCount: r.viewer_count,
      viewerText: r.viewer_text,
    })
  }
  const capturedAt = (data ?? []).length ? ((data as Row[])[0].captured_at ?? null) : null
  return ok({ capturedAt, rows })
}
```

- [ ] **Step 5: 加路由**

```ts
// src/app/api/competitors/shots/[shotId]/readings/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { authGuard } from '@/lib/auth/guard'
import { parseShotId } from '@/lib/competitors/coLive'
import { getShotReadings, httpStatusForError } from '@/lib/competitors/service'

// GET /api/competitors/shots/[shotId]/readings — 放大页按需取这张截图的同期人数读数
export async function GET(_req: NextRequest, { params }: { params: { shotId: string } }) {
  const user = await authGuard()
  if (user instanceof NextResponse) return user
  const shotId = parseShotId(params.shotId)
  if (!shotId) return NextResponse.json({ data: null, error: 'shotId must be a uuid' }, { status: 400 })
  const result = await getShotReadings(shotId)
  if (result.error) {
    return NextResponse.json({ data: null, error: result.error.message }, { status: httpStatusForError(result.error.code) })
  }
  return NextResponse.json({ data: result.data, error: null })
}
```

- [ ] **Step 6: 类型与 lint**

Run: `npx tsc --noEmit -p . 2>&1 | tail -5 && npm run test:lint 2>&1 | tail -3`
Expected: 都零报错。若 tsc 对 `competitors(handle, display_name)` 的 select 推断报错，把 `data` 先断言为 `unknown` 再断言 `Row[]`。

- [ ] **Step 7: 本地打一次接口**

Run（另开终端跑 `npm run dev`，用浏览器登录后在 DevTools 控制台执行）：

```js
await (await fetch('/api/competitors/shots/00000000-0000-0000-0000-000000000000/readings')).json()
```

Expected: `{ data: { capturedAt: null, rows: [] }, error: null }`。再用一张扩展上传截图的真实 id 打一次，`rows` 里有 `source: 'sidebar'` 的行且 `handle` 非空。用 `/api/competitors/shots/abc/readings` 打一次得 400。

- [ ] **Step 8: 提交**

```bash
git add src/lib/competitors/coLive.ts src/lib/competitors/coLive.test.ts src/lib/competitors/service.ts "src/app/api/competitors/shots/[shotId]/readings/route.ts"
git commit -m "feat(competitors): 按 shot_id 读同期人数读数的只读接口

GET /api/competitors/shots/[shotId]/readings，join 竞品名，非 uuid 400，无读数回空数组。

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: 放大页渲染「同期」段 + 三语文案

**Files:**
- Modify: `messages/zh.json`、`messages/en.json`、`messages/ja.json`（`competitors` 命名空间，紧跟 `shotUptimeMin` 之后）
- Modify: `src/components/competitors/ShotLightbox.tsx`

**Interfaces:**
- Consumes: Task 1 `buildCoLiveView`、`CoLiveReading`；Task 2 `shotOverlaySections(..., coLive)`；Task 3 接口响应形状；现有 `scrollToCompetitorCard`（`./scrollToCard`）、`zonedHm`（`@/lib/time/zonedTime`）。
- Produces: 无（终端组件）。

- [ ] **Step 1: 加三语文案**

`messages/zh.json`，在 `"shotUptimeMin": "已播 {m}分",` 之后插入：

```json
    "coLiveSummary": "同期在播 {total} 家 · 本号第 {rank} 位",
    "coLiveSummaryNoRank": "同期在播 {total} 家",
    "coLiveScopeHint": "仅限截图人关注且侧栏可见的在库账号，不是全市场",
    "coLiveSelfFromRoom": "本号按房间内读数",
    "coLiveFootnote": "{time} 同一秒读数",
    "coLiveLoadFailed": "同期数据读取失败",
    "coLiveExpand": "展开名单",
    "coLiveCollapse": "收起名单",
```

`messages/en.json` 同位置：

```json
    "coLiveSummary": "{total} live at the same time · ranked #{rank}",
    "coLiveSummaryNoRank": "{total} live at the same time",
    "coLiveScopeHint": "Only tracked accounts the uploader follows and the sidebar showed; not the whole market",
    "coLiveSelfFromRoom": "This account uses the in-room count",
    "coLiveFootnote": "Same-second readings at {time}",
    "coLiveLoadFailed": "Couldn't load co-live data",
    "coLiveExpand": "Show list",
    "coLiveCollapse": "Hide list",
```

`messages/ja.json` 同位置：

```json
    "coLiveSummary": "同時配信 {total} 件 · 本アカウント {rank} 位",
    "coLiveSummaryNoRank": "同時配信 {total} 件",
    "coLiveScopeHint": "撮影者がフォロー中でサイドバーに表示されていた登録アカウントのみ。市場全体ではありません",
    "coLiveSelfFromRoom": "本アカウントは配信画面内の数値",
    "coLiveFootnote": "{time} 時点の同時刻データ",
    "coLiveLoadFailed": "同時配信データを読み込めませんでした",
    "coLiveExpand": "一覧を表示",
    "coLiveCollapse": "一覧を閉じる",
```

Run: `npm run test:i18n 2>&1 | tail -3`
Expected: 通过（三份 key 集合一致）。

- [ ] **Step 2: 组件加 import 与状态**

`src/components/competitors/ShotLightbox.tsx`：

import 区：
- lucide 那行加 `ChevronDown, Info`（保持字母序）。
- 加 `import { buildCoLiveView, type CoLiveReading } from '@/lib/competitors/coLive'`
- 加 `import { scrollToCompetitorCard } from './scrollToCard'`
- `import { formatDayTimeInZone } from '@/lib/time/zonedTime'` 改为 `import { formatDayTimeInZone, zonedHm } from '@/lib/time/zonedTime'`

在 `const [saving, setSaving] = useState<...>(null)` 之后加：

```tsx
  // 同期读数按 shot_id 缓存。读数来自另一次请求，不在 shot 字段里；缓存键是 shot_id，
  // 快速翻图时晚到的响应只会写进它自己那张的槽位，不会把 A 的名单画到 B 上。
  // 失败的不进缓存（记在 coLiveFailedId 里）：切走再切回来时 effect 看到缓存没有就重取。
  const [coLiveCache, setCoLiveCache] = useState<Map<string, CoLiveReading[]>>(() => new Map())
  const [coLiveFailedId, setCoLiveFailedId] = useState<string | null>(null)
  // 名单默认折叠；换一张图重置为折叠。
  const [coLiveOpen, setCoLiveOpen] = useState(false)
```

- [ ] **Step 3: 取数 effect 与派生值**

在现有 `useEffect(() => { setDateInput(selectedShotOn) ... }, [selectedId, selectedShotOn])` 里加一行 `setCoLiveOpen(false)`。

紧接着加新的 effect：

```tsx
  // 选中项换了且缓存里没有：取一次。失败只记 coLiveFailedId、不进缓存，
  // 所以切走再切回来 effect 会再取一次（依赖里的 coLiveCache 失败时不变，不会原地死循环）。
  // 不做竞态取消：响应按自己的 shot_id 落槽，晚到也只影响它自己那张；
  // 选中项已换时照样写进缓存，下次翻回来直接有。
  useEffect(() => {
    if (!selectedId || coLiveCache.has(selectedId)) return
    const id = selectedId
    fetch(`/api/competitors/shots/${id}/readings`)
      .then(async (res) => {
        if (!res.ok) throw new Error(String(res.status))
        const body = (await res.json()) as { data: { rows: CoLiveReading[] } | null }
        return body.data?.rows ?? []
      })
      .then(
        (rows) => {
          setCoLiveCache((m) => new Map(m).set(id, rows))
          setCoLiveFailedId((f) => (f === id ? null : f))
        },
        () => setCoLiveFailedId(id),
      )
  }, [selectedId, coLiveCache])
```

把现有的 `const ov = shotOverlaySections(selected, canEdit, shots.length)` 改为：

```tsx
  const coLiveRaw = selectedId ? coLiveCache.get(selectedId) : undefined
  const coLiveFailed = coLiveRaw === undefined && coLiveFailedId === selectedId
  const coLiveView = coLiveRaw && selected ? buildCoLiveView(coLiveRaw, selected.competitor_id) : null
  // 渐变层渲染哪几段。五段全空(只读 + 人工上传 + 当天仅此一张 + 无同期)时整层不画,
  // 画面上只剩左上角那两颗胶囊。
  const ov = shotOverlaySections(selected, canEdit, shots.length, coLiveView != null || coLiveFailed)
```

在 `const uptime = shotUptimeParts(...)` 之后加：

```tsx
  const coLiveTime = zonedHm(selected.captured_at ?? '', zone)
  const jumpToCard = (competitorId: string) => {
    onClose()
    // 灯箱卸载时才释放滚动锁(lockViewportScroll 的清理在 effect cleanup 里)，
    // 本帧直接 scrollTo 会被锁吞掉；推迟到下一帧再滚。
    requestAnimationFrame(() => scrollToCompetitorCard(competitorId))
  }
```

- [ ] **Step 4: 渲染「同期」段**

在渐变层里，`{ov.live && (<div className="flex flex-wrap ...">...</div>)}` 那段**之后**、`{/* 画面内容备注 */}` **之前**插入：

```tsx
                  {/* 同期在播：扩展上传时从 Following 侧栏抄下的同一秒别家人数。
                      默认折叠成一行摘要；没有读数的截图(自动巡检的老图)整段不出现。
                      判定全在 lib/competitors/coLive.ts，这里只画。 */}
                  {ov.coLive && (
                    <div className="text-white/90">
                      {coLiveFailed || !coLiveView ? (
                        <p className="text-white/60">{t('coLiveLoadFailed')}</p>
                      ) : (
                        <>
                          <button
                            type="button"
                            onClick={() => setCoLiveOpen((v) => !v)}
                            aria-expanded={coLiveOpen}
                            aria-label={coLiveOpen ? t('coLiveCollapse') : t('coLiveExpand')}
                            className="flex w-full items-center justify-between gap-2 rounded-btn text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-ring"
                          >
                            <span className="inline-flex items-center gap-1 tabular-nums">
                              {coLiveView.selfRank != null
                                ? t('coLiveSummary', { total: coLiveView.total, rank: coLiveView.selfRank })
                                : t('coLiveSummaryNoRank', { total: coLiveView.total })}
                              <Info className="h-3.5 w-3.5 text-white/50" aria-hidden="true" />
                              <span className="sr-only">{t('coLiveScopeHint')}</span>
                            </span>
                            <ChevronDown
                              className={`h-4 w-4 shrink-0 text-white/60 transition-transform ${coLiveOpen ? 'rotate-180' : ''}`}
                              aria-hidden="true"
                            />
                          </button>
                          {coLiveOpen && (
                            <div className="mt-1.5">
                              {/* 手机上最多露 8 行(8 × 1.5rem)，超出内部滚动；≥sm 不限高。 */}
                              <ul className="grid max-h-[12rem] grid-cols-[minmax(0,7rem)_2.75rem_minmax(0,1fr)] items-center gap-x-2 gap-y-1 overflow-y-auto tabular-nums sm:max-h-none">
                                {coLiveView.rows.map((r) => (
                                  <li key={r.competitorId} className="contents">
                                    {r.isSelf ? (
                                      <span className="truncate font-medium text-amber-300">
                                        {r.label}
                                        {coLiveView.selfFromCurrent && (
                                          <span
                                            title={t('coLiveSelfFromRoom')}
                                            aria-label={t('coLiveSelfFromRoom')}
                                            className="ml-1 inline-block h-1.5 w-1.5 rounded-full bg-amber-300 align-middle"
                                          />
                                        )}
                                      </span>
                                    ) : (
                                      <button
                                        type="button"
                                        onClick={() => jumpToCard(r.competitorId)}
                                        className="truncate rounded-btn text-left text-white/80 underline-offset-2 hover:text-white hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-ring"
                                      >
                                        {r.label}
                                      </button>
                                    )}
                                    <span className={`text-right ${r.isSelf ? 'font-medium text-amber-300' : ''}`}>
                                      {r.viewerCount ?? r.viewerText ?? ''}
                                    </span>
                                    <div className="h-1.5 overflow-hidden rounded-full bg-white/15">
                                      <div
                                        className={`h-full rounded-full ${r.isSelf ? 'bg-amber-400' : 'bg-white/60'}`}
                                        style={{ width: `${Math.round(r.barRatio * 100)}%` }}
                                      />
                                    </div>
                                  </li>
                                ))}
                              </ul>
                              <p className="mt-1 text-[11px] text-white/50">
                                {coLiveTime ? `${t('coLiveFootnote', { time: coLiveTime })} · ` : ''}
                                {t('coLiveScopeHint')}
                              </p>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  )}
```

注意：`sr-only` 与 `title` 的提示文案都走 `t()`，源码里不出现裸汉字；`'—'` 之类占位符不写，解析失败且原文也空就显示空串。

- [ ] **Step 5: 类型、lint、裸汉字、样式门禁**

Run: `npx tsc --noEmit -p . 2>&1 | tail -5 && npm run test:copy 2>&1 | tail -5`
Expected: 全部零报错。`test:style` 若报新加 class（如 `text-amber-300`）不在允许清单，改用 `text-warning`/`bg-warning` 这类项目令牌（看 `scripts/check-style-tokens.mjs` 的报错指向哪一行、允许哪些）。

- [ ] **Step 6: 生产构建真机验证**

Run: `npm run build 2>&1 | tail -3 && npm start`
判据看路由表里有 `/api/competitors/shots/[shotId]/readings`，不看退出码（dev 刚跑过的 `.next` 上 build 可能退出码 0 却没产物）。

浏览器登录后到 `/competitors`，逐项核对：

1. 放大一张扩展上传、Following 里有多家在播的截图（10-12 下午那几张）：摘要行「同期在播 N 家 · 本号第 k 位」，N 等于库里该 `shot_id` 的 sidebar 行数（本号在 sidebar 里时）；点开名单，顺序与人数和库里一致，本号高亮。
2. 放大一张本号不在 Following 里的截图：本号名字旁有小点，悬停显示「本号按房间内读数」。
3. 放大一张自动巡检的老截图：没有「同期」段，底部与改动前一致。
4. 点别家一行：灯箱关闭，页面滚到该竞品卡片（卡片顶部贴在吸顶块下方）。
5. 用 DevTools 把窗口拉到 375 宽：名单超过 8 行时内部滚动，摘要行始终可见。
6. 用 DevTools Network 把网速调到 Slow 3G，快速连按「下一张」三次：最后停住那张的名单与它自己的 shot_id 一致（对照控制台 `fetch('/api/competitors/shots/<id>/readings')`）。
7. DevTools 把 `/readings` 请求 block 掉再放大一张：摘要位置显示「同期数据读取失败」，看图、备注、胶片条照常。

断言用 JS 读 DOM，截图只用来留档（截图滞后于点击）。每项留一张截图到 scratchpad。

- [ ] **Step 7: 提交**

```bash
git add messages/zh.json messages/en.json messages/ja.json src/components/competitors/ShotLightbox.tsx
git commit -m "feat(competitors): 截图放大页显示「同期在播 N 家 · 本号第 k 位」与同一秒各家人数名单

按 shot_id 按需取读数、缓存；默认折叠，点开名单本号高亮，点别家跳卡片；
无读数的截图整段不画，请求失败只在摘要位置提示一句。

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: 更新日志、突变探针、整体复核

**Files:**
- Modify: `src/lib/changelog/entries.ts:28-31`（`2026-10-12` 那天的 `items` 顶部）

**Interfaces:**
- Consumes: 全部前序任务已提交。
- Produces: 无。

- [ ] **Step 1: 加更新日志条目**

`src/lib/changelog/entries.ts`，`date: '2026-10-12'` 那个对象的 `items` 数组**最前面**插入：

```ts
      {
        kind: 'feat',
        scope: '竞品监测',
        title: '放大截图时能看到同一秒其他在播竞品的人数和本号排位',
        details:
          '用截图插件上传的截图，放大后在「在线 / 开播 / 已播」那行下面多一行「同期在播 N 家 · 本号第 k 位」。点开是同一秒各家人数的名单，本号高亮，点别家名字跳到它的卡片。名单只覆盖截图人关注且侧栏当时显示出来的在库账号，不是全市场；本号不在关注列表里时用房间内读数参与排名并标一个小点。自动巡检的老截图没有这份数据，放大页和以前一样。',
      },
```

Run: `npx tsc --noEmit -p . 2>&1 | tail -3`
Expected: 零报错。

- [ ] **Step 2: 突变探针（在已提交基线上跑）**

先确认工作区干净（`git status --short` 为空），然后每条各改坏一次、跑测试、必须红、`git checkout -- src/lib/competitors/coLive.ts` 还原：

| 改坏 | 预期红的用例 |
| --- | --- |
| 排序比较 `q.viewerCount - p.viewerCount` 改成 `p.viewerCount - q.viewerCount` | 「按人数降序…」 |
| 名次 `if (prev === null \|\| x.viewerCount !== prev) rank = i + 1` 改成无条件 `rank = i + 1` | 「按人数降序…」（并列应为 2/2） |
| current 回退条件 `!sidebar.some(...)` 改成恒 `true` | 「本号同时有 sidebar 行与 current 行」 |
| `pool.length < 2` 改成 `< 1` | 「只有本号一行返回 null」 |
| `max > 0` 改成 `max >= 0` | 「最大值为 0」（出 NaN） |

Run（每次）: `node --test --experimental-strip-types src/lib/competitors/coLive.test.ts 2>&1 | tail -3`
Expected: 对应用例 fail；还原后全过。把五行「改坏 → 哪条红」的击杀表写进 PR 描述。

- [ ] **Step 3: 全量验证**

Run: `npm test 2>&1 | tail -3 && npm run test:copy 2>&1 | tail -3 && npx tsc --noEmit -p . 2>&1 | tail -3`
Expected: 全绿、零警告。

- [ ] **Step 4: 提交并推送**

```bash
git add src/lib/changelog/entries.ts
git commit -m "docs(changelog): 截图放大页同期在播

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
git push -u origin feat/shot-colive-readings
```

- [ ] **Step 5: 更新 PR 描述**

PR 331 目前只含设计稿。推送实现后把 PR 标题改为 `feat(competitors): 截图放大页「同期在播」`，描述里加：改动摘要、Task 4 Step 6 的七项真机验收结果（各附截图）、Task 5 Step 2 的突变击杀表、生产构建路由表里有新接口的证据。末尾保留 `🤖 Generated with [Claude Code](https://claude.com/claude-code)`。合并前问 pollux。
