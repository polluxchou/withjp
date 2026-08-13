# 竞品监测（Competitor Monitoring · TikTok）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 newWith 中新增「竞品监测」能力——把每次采集竞品 TikTok 主页指标（followers/likes/videos + 基础信息）落成「一天一条」的时间序列打点，并在独立页面展示基础信息 + 历史趋势（mini sparkline）。

**Architecture:** 沿用 newWith 既有分层：`supabase/migrations` 建表（app 级全局 + `authenticated_only` RLS，写权限在 service 层按 `is_admin` 收紧）→ `src/lib/competitors/` 放纯函数与 `service.ts`（返回 `ServiceResult<T>`）→ `src/app/api/competitors/**/route.ts` 暴露 REST（`authGuard` → service → `NextResponse.json({data,error})`，无 server action / 无 `revalidatePath`）→ server component `page.tsx` 加载数据交给 client `CompetitorMonitoringView`。快照写入**只走 service-role 脚本**（Claude 用内置浏览器读数后跑），清单增删走 API（UI 用）。趋势图为**手写 SVG polyline sparkline**，零新依赖。

**Tech Stack:** Next.js App Router（`src/app/[locale]/(app)`）、next-intl（zh/en/ja 三语，parity 守卫）、Supabase（`@supabase/supabase-js` service-role + `@supabase/ssr` cookie 客户端）、`node:test` + `--experimental-strip-types`、lucide-react 图标。

---

## Key Decisions（相对 LHH 设计稿的落地适配 —— 评审时可推翻）

| 维度 | 决策 | 说明 |
| --- | --- | --- |
| 写库路径 | 快照 = service-role `.ts` 脚本；清单 CRUD = REST API | newWith 无 server action，改走 route handler |
| 幂等 | competitors `unique(platform, handle)`；snapshots `unique(competitor_id, captured_on)` | 同日重采覆盖 |
| RLS | 建表后启用 RLS + `authenticated_only`（`for all to authenticated using (auth.uid() is not null)`） | 与 038/041 一致 |
| **写权限** | **清单 CRUD 收敛到 admin（`is_admin`）；`canEdit = is_admin`** | 沿用 newWith service 层约定（org/venue/items）。⚠️ 与 LHH「任意登录用户可编辑」不同——若要放开为所有登录用户，去掉各 mutation 的 `requireAdmin` 并把 `canEdit` 设为 `true` |
| 读权限 | service 用 service-role 客户端读，页面用 `authGuard` 兜底 | 任意登录用户可看板 |
| 趋势图 | 手写 SVG `<polyline>`，几何计算为纯函数单测 | 零新依赖（不动 recharts） |
| 三语 | zh(基准)/en/ja 全量 key；文案走 `messages/*.json`，禁止 JSX 硬编码中文 | `test:i18n` + `test:no-bare-han` 守卫 |
| 路由/入口 | `/{locale}/competitors`；入口加进 `Sidebar` NAV（newWith 无账号子菜单） | |
| 平台 | 只做 TikTok；表留 `platform` 字段 + check 便于扩展 | 直播间实时数据 = 非目标 |

**File Structure**

```
supabase/migrations/042_competitor_monitoring.sql        建表 + RLS
src/lib/competitors/
  metrics.ts        纯函数：parseCount / formatCount（脚本+视图共用，无 import）
  metrics.test.ts
  chart.ts          纯函数：buildSparklinePoints（几何）
  chart.test.ts
  types.ts          Competitor / CompetitorSnapshot / CompetitorWithHistory / CompetitorBoard
  assemble.ts       纯函数：parseHandleFromUrl / assembleBoard
  assemble.test.ts
  service.ts        ServiceResult + getCompetitorBoard / add / update / delete / upsertSnapshot
src/app/api/competitors/route.ts        GET(list) + POST(add)
src/app/api/competitors/[id]/route.ts   PATCH(update) + DELETE
src/app/[locale]/(app)/competitors/page.tsx   server page
src/components/competitors/
  CompetitorMonitoringView.tsx   client 主视图
  Sparkline.tsx                  纯 SVG mini 折线
scripts/record-competitor-snapshot.ts   Claude 采集写库（唯一快照写入口）
src/components/layout/Sidebar.tsx        + NAV 入口（修改）
messages/{zh,en,ja}.json                 + competitors 命名空间 + nav.competitors（修改）
package.json                             + 新增 *.test.ts 到 "test"（修改）
```

---

### Task 1: 数据库迁移

**Files:**
- Create: `supabase/migrations/042_competitor_monitoring.sql`

- [ ] **Step 1: 写迁移 SQL**

```sql
-- 042_competitor_monitoring.sql
-- 竞品监测：竞品清单 + 每日打点快照。App 级全局参考数据（非空间隔离）。
-- 所有登录用户可读；清单写入在 service 层按 is_admin 收紧；快照写入只走 service-role 脚本。

create table if not exists competitors (
  id           uuid        primary key default gen_random_uuid(),
  platform     text        not null default 'tiktok'
               constraint competitors_platform_ck check (platform in ('tiktok')),
  handle       text        not null,
  profile_url  text        not null,
  display_name text,
  note         text        not null default '',
  created_at   timestamptz not null default now(),
  constraint competitors_platform_handle_uk unique (platform, handle)
);

create table if not exists competitor_snapshots (
  id            uuid        primary key default gen_random_uuid(),
  competitor_id uuid        not null references competitors(id) on delete cascade,
  captured_on   date        not null,
  followers     bigint,
  likes         bigint,
  videos        integer,
  following     bigint,
  display_name  text,
  bio           text,
  region        text,
  verified      boolean,
  raw           jsonb,
  captured_at   timestamptz not null default now(),
  constraint competitor_snapshots_daily_uk unique (competitor_id, captured_on)
);

create index if not exists idx_competitor_snapshots_competitor
  on competitor_snapshots(competitor_id, captured_on);

-- RLS：登录用户可读写（写权限在 service 层按 is_admin 再收紧），沿用 authenticated_only 约定。
do $$
declare
  t text;
  tables text[] := array['competitors', 'competitor_snapshots'];
begin
  foreach t in array tables loop
    execute format('alter table %I enable row level security', t);
    if not exists (
      select 1 from pg_policies
      where schemaname = 'public' and tablename = t and policyname = 'authenticated_only'
    ) then
      execute format(
        'create policy "authenticated_only" on %I for all to authenticated using (auth.uid() is not null)', t
      );
    end if;
  end loop;
end $$;
```

- [ ] **Step 2: 校验 SQL 与既有约定一致**

Run: `grep -n "authenticated_only\|unique\|check" supabase/migrations/042_competitor_monitoring.sql`
Expected: 输出包含两个 `unique` 约束、`platform` 的 `check`、`authenticated_only` policy —— 与 `038_enable_rls_all_tables.sql` 措辞一致。
（本仓库无法在本地 push 迁移；正确性靠 SQL 评审 + 后续与 Supabase 同步时验证。）

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/042_competitor_monitoring.sql
git commit -m "feat(competitors): add 042 migration — competitors + snapshots tables + RLS"
```

---

### Task 2: 指标解析纯函数 `metrics.ts`

**Files:**
- Create: `src/lib/competitors/metrics.ts`
- Test: `src/lib/competitors/metrics.test.ts`

> `metrics.ts` **不得引入任何 import**（脚本用 `--experimental-strip-types` 以相对路径 `.ts` 引它，且不经 tsconfig `paths` 解析）。

- [ ] **Step 1: 写失败测试**

```ts
// src/lib/competitors/metrics.test.ts
import assert from 'node:assert/strict'
import test from 'node:test'

import { parseCount, formatCount } from './metrics.ts'

test('parseCount: 缩写后缀 K/M/B', () => {
  assert.equal(parseCount('1.2M'), 1_200_000)
  assert.equal(parseCount('34M'), 34_000_000)
  assert.equal(parseCount('34K'), 34_000)
  assert.equal(parseCount('1.2B'), 1_200_000_000)
  assert.equal(parseCount('812'), 812)
})

test('parseCount: 千分位逗号与空白', () => {
  assert.equal(parseCount('1,234'), 1234)
  assert.equal(parseCount('  56 '), 56)
})

test('parseCount: 已是数字直接返回', () => {
  assert.equal(parseCount(1200000), 1_200_000)
})

test('parseCount: 空/非法返回 null', () => {
  assert.equal(parseCount(''), null)
  assert.equal(parseCount(null), null)
  assert.equal(parseCount(undefined), null)
  assert.equal(parseCount('abc'), null)
})

test('formatCount: 数字转紧凑显示', () => {
  assert.equal(formatCount(1_200_000), '1.2M')
  assert.equal(formatCount(34_000), '34K')
  assert.equal(formatCount(1_200_000_000), '1.2B')
  assert.equal(formatCount(812), '812')
  assert.equal(formatCount(null), '—')
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `node --test --experimental-strip-types src/lib/competitors/metrics.test.ts`
Expected: FAIL — `Cannot find module './metrics.ts'`。

- [ ] **Step 3: 写最小实现**

```ts
// src/lib/competitors/metrics.ts
// 纯函数，零 import：供采集脚本（--experimental-strip-types）与视图共用。

const SUFFIX: Record<string, number> = { k: 1e3, m: 1e6, b: 1e9 }

/** "1.2M" / "34K" / "1,234" / 1200000 → number；无法解析返回 null。 */
export function parseCount(input: string | number | null | undefined): number | null {
  if (typeof input === 'number') return Number.isFinite(input) ? input : null
  if (input == null) return null
  const s = String(input).trim().replace(/,/g, '')
  if (s === '') return null
  const m = s.match(/^([0-9]*\.?[0-9]+)\s*([kmb])?$/i)
  if (!m) return null
  const n = parseFloat(m[1])
  if (!Number.isFinite(n)) return null
  const suf = m[2]?.toLowerCase()
  return suf ? Math.round(n * SUFFIX[suf]) : n
}

/** number → 紧凑显示 "1.2M"；null → "—"。 */
export function formatCount(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—'
  const abs = Math.abs(n)
  const fmt = (v: number, suf: string) => {
    const r = Math.round(v * 10) / 10
    return (Number.isInteger(r) ? String(r) : r.toFixed(1)) + suf
  }
  if (abs >= 1e9) return fmt(n / 1e9, 'B')
  if (abs >= 1e6) return fmt(n / 1e6, 'M')
  if (abs >= 1e3) return fmt(n / 1e3, 'K')
  return String(n)
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `node --test --experimental-strip-types src/lib/competitors/metrics.test.ts`
Expected: PASS（全部用例通过）。

- [ ] **Step 5: Commit**

```bash
git add src/lib/competitors/metrics.ts src/lib/competitors/metrics.test.ts
git commit -m "feat(competitors): add parseCount/formatCount pure helpers"
```

---

### Task 3: Sparkline 几何纯函数 `chart.ts`

**Files:**
- Create: `src/lib/competitors/chart.ts`
- Test: `src/lib/competitors/chart.test.ts`

- [ ] **Step 1: 写失败测试**

```ts
// src/lib/competitors/chart.test.ts
import assert from 'node:assert/strict'
import test from 'node:test'

import { buildSparklinePoints } from './chart.ts'

test('buildSparklinePoints: 空/单点返回空串', () => {
  assert.equal(buildSparklinePoints([], 100, 20), '')
  assert.equal(buildSparklinePoints([5], 100, 20), '')
})

test('buildSparklinePoints: 首尾 x 贴边，y 归一化（大值在上）', () => {
  const pts = buildSparklinePoints([0, 10], 100, 20).split(' ')
  assert.equal(pts.length, 2)
  const [x0, y0] = pts[0].split(',').map(Number)
  const [x1, y1] = pts[1].split(',').map(Number)
  assert.equal(x0, 0)
  assert.equal(x1, 100)
  assert.equal(y0, 20) // 最小值 → 底部（y 最大）
  assert.equal(y1, 0)  // 最大值 → 顶部（y 最小）
})

test('buildSparklinePoints: 全相等时走中线', () => {
  const pts = buildSparklinePoints([7, 7, 7], 100, 20).split(' ')
  assert.equal(pts.length, 3)
  for (const p of pts) assert.equal(Number(p.split(',')[1]), 10)
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `node --test --experimental-strip-types src/lib/competitors/chart.test.ts`
Expected: FAIL — `Cannot find module './chart.ts'`。

- [ ] **Step 3: 写最小实现**

```ts
// src/lib/competitors/chart.ts
// 纯函数：把一串数值映射为 <polyline points="x,y x,y ..."> 字符串。

/** 至少 2 个点才画线；y 反转（值越大越靠上）。全相等时走中线。 */
export function buildSparklinePoints(values: number[], width: number, height: number): string {
  if (!Array.isArray(values) || values.length < 2) return ''
  const max = Math.max(...values)
  const min = Math.min(...values)
  const span = max - min
  const stepX = width / (values.length - 1)
  return values
    .map((v, i) => {
      const x = Math.round(i * stepX * 100) / 100
      const norm = span === 0 ? 0.5 : (v - min) / span
      const y = Math.round((height - norm * height) * 100) / 100
      return `${x},${y}`
    })
    .join(' ')
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `node --test --experimental-strip-types src/lib/competitors/chart.test.ts`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add src/lib/competitors/chart.ts src/lib/competitors/chart.test.ts
git commit -m "feat(competitors): add sparkline geometry helper"
```

---

### Task 4: 领域类型 `types.ts`

**Files:**
- Create: `src/lib/competitors/types.ts`

- [ ] **Step 1: 写类型（无测试，纯声明）**

```ts
// src/lib/competitors/types.ts

export type CompetitorPlatform = 'tiktok'

export interface Competitor {
  id: string
  platform: CompetitorPlatform
  handle: string
  profile_url: string
  display_name: string | null
  note: string
  created_at: string
}

export interface CompetitorSnapshot {
  id: string
  competitor_id: string
  captured_on: string // YYYY-MM-DD
  followers: number | null
  likes: number | null
  videos: number | null
  following: number | null
  display_name: string | null
  bio: string | null
  region: string | null
  verified: boolean | null
  raw: Record<string, unknown> | null
  captured_at: string
}

/** 历史序列里每天挑出的轻量点，供 sparkline / 表格用。 */
export interface HistoryPoint {
  captured_on: string
  followers: number | null
  likes: number | null
  videos: number | null
}

export interface CompetitorWithHistory extends Competitor {
  latest: CompetitorSnapshot | null
  history: HistoryPoint[]
}

export interface CompetitorBoard {
  competitors: CompetitorWithHistory[]
  canEdit: boolean
}
```

- [ ] **Step 2: 类型检查**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: 无与 `types.ts` 相关的报错。

- [ ] **Step 3: Commit**

```bash
git add src/lib/competitors/types.ts
git commit -m "feat(competitors): add domain types"
```

---

### Task 5: 组装/解析纯函数 `assemble.ts`

**Files:**
- Create: `src/lib/competitors/assemble.ts`
- Test: `src/lib/competitors/assemble.test.ts`

- [ ] **Step 1: 写失败测试**

```ts
// src/lib/competitors/assemble.test.ts
import assert from 'node:assert/strict'
import test from 'node:test'

import { parseHandleFromUrl, assembleBoard } from './assemble.ts'
import type { Competitor, CompetitorSnapshot } from './types.ts'

test('parseHandleFromUrl: 从主页 URL 抽 handle', () => {
  assert.equal(parseHandleFromUrl('https://www.tiktok.com/@example'), 'example')
  assert.equal(parseHandleFromUrl('https://www.tiktok.com/@example?lang=en'), 'example')
  assert.equal(parseHandleFromUrl('tiktok.com/@Foo_Bar/'), 'Foo_Bar')
})

test('parseHandleFromUrl: 裸 @handle 或 handle', () => {
  assert.equal(parseHandleFromUrl('@example'), 'example')
  assert.equal(parseHandleFromUrl('example'), 'example')
})

test('parseHandleFromUrl: 非法返回 null', () => {
  assert.equal(parseHandleFromUrl(''), null)
  assert.equal(parseHandleFromUrl('   '), null)
})

test('assembleBoard: 每个竞品挑最新快照 + 历史升序', () => {
  const competitors: Competitor[] = [
    { id: 'c1', platform: 'tiktok', handle: 'a', profile_url: 'u', display_name: 'A', note: '', created_at: '2026-07-01T00:00:00Z' },
  ]
  const snap = (captured_on: string, followers: number): CompetitorSnapshot => ({
    id: 's-' + captured_on, competitor_id: 'c1', captured_on, followers,
    likes: null, videos: null, following: null, display_name: null, bio: null,
    region: null, verified: null, raw: null, captured_at: captured_on + 'T00:00:00Z',
  })
  const snapshots = [snap('2026-07-03', 30), snap('2026-07-01', 10), snap('2026-07-02', 20)]

  const board = assembleBoard(competitors, snapshots, true)

  assert.equal(board.canEdit, true)
  assert.equal(board.competitors.length, 1)
  assert.equal(board.competitors[0].latest?.captured_on, '2026-07-03')
  assert.deepEqual(board.competitors[0].history.map((h) => h.captured_on), ['2026-07-01', '2026-07-02', '2026-07-03'])
  assert.deepEqual(board.competitors[0].history.map((h) => h.followers), [10, 20, 30])
})

test('assembleBoard: 无快照的竞品 latest=null history=[]', () => {
  const competitors: Competitor[] = [
    { id: 'c9', platform: 'tiktok', handle: 'z', profile_url: 'u', display_name: null, note: '', created_at: '2026-07-01T00:00:00Z' },
  ]
  const board = assembleBoard(competitors, [], false)
  assert.equal(board.competitors[0].latest, null)
  assert.deepEqual(board.competitors[0].history, [])
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `node --test --experimental-strip-types src/lib/competitors/assemble.test.ts`
Expected: FAIL — `Cannot find module './assemble.ts'`。

- [ ] **Step 3: 写最小实现**

```ts
// src/lib/competitors/assemble.ts
import type { Competitor, CompetitorSnapshot, CompetitorBoard, HistoryPoint } from './types.ts'

/** 从 URL / @handle / handle 中抽出不含 @ 的 handle；失败返回 null。 */
export function parseHandleFromUrl(input: string): string | null {
  const s = (input ?? '').trim()
  if (s === '') return null
  const at = s.match(/@([A-Za-z0-9_.]+)/)
  if (at) return at[1]
  const bare = s.match(/^[A-Za-z0-9_.]+$/)
  return bare ? s : null
}

/** 把竞品 + 全部快照组装成看板：每个竞品挑最新快照，历史按 captured_on 升序。 */
export function assembleBoard(
  competitors: Competitor[],
  snapshots: CompetitorSnapshot[],
  canEdit: boolean,
): CompetitorBoard {
  const byCompetitor = new Map<string, CompetitorSnapshot[]>()
  for (const s of snapshots) {
    const arr = byCompetitor.get(s.competitor_id) ?? []
    arr.push(s)
    byCompetitor.set(s.competitor_id, arr)
  }
  return {
    canEdit,
    competitors: competitors.map((c) => {
      const rows = (byCompetitor.get(c.id) ?? [])
        .slice()
        .sort((a, b) => a.captured_on.localeCompare(b.captured_on))
      const history: HistoryPoint[] = rows.map((r) => ({
        captured_on: r.captured_on,
        followers: r.followers,
        likes: r.likes,
        videos: r.videos,
      }))
      const latest = rows.length ? rows[rows.length - 1] : null
      return { ...c, latest, history }
    }),
  }
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `node --test --experimental-strip-types src/lib/competitors/assemble.test.ts`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add src/lib/competitors/assemble.ts src/lib/competitors/assemble.test.ts
git commit -m "feat(competitors): add board assembly + handle parsing"
```

---

### Task 6: Service 层 `service.ts`

**Files:**
- Create: `src/lib/competitors/service.ts`

> 触库函数不做单测（纯逻辑已在 assemble/metrics 覆盖）；行为以本任务代码 + API 任务的手测记录为准。`ServiceResult`/`ok`/`err`/`httpStatusForError` 按 newWith 每域自带的约定在本文件内定义（对齐 `src/lib/org/service.ts`）。

- [ ] **Step 1: 写 service（含 CRUD + 快照 upsert + 看板加载）**

```ts
// src/lib/competitors/service.ts
import { createServerClient } from '@/lib/supabase/server'
import { getActorProfile } from '@/lib/auth/actor'
import { assembleBoard, parseHandleFromUrl } from './assemble'
import type { Competitor, CompetitorSnapshot, CompetitorBoard, CompetitorPlatform } from './types'

export type ServiceErrorCode = 'invalid_input' | 'forbidden' | 'not_found' | 'db_error'
export interface ServiceError { code: ServiceErrorCode; message: string }
export type ServiceResult<T> = { data: T; error: null } | { data: null; error: ServiceError }

const ok = <T,>(data: T): ServiceResult<T> => ({ data, error: null })
const err = <T = never,>(code: ServiceErrorCode, message: string): ServiceResult<T> => ({
  data: null,
  error: { code, message },
})

export function httpStatusForError(code: ServiceErrorCode): number {
  switch (code) {
    case 'invalid_input': return 400
    case 'forbidden':     return 403
    case 'not_found':     return 404
    case 'db_error':      return 500
  }
}

async function requireAdmin(userId: string): Promise<ServiceError | null> {
  const actor = await getActorProfile(userId)
  return actor?.is_admin ? null : { code: 'forbidden', message: 'admin only' }
}

/** 加载看板：任意登录用户可读；canEdit 取决于 is_admin。 */
export async function getCompetitorBoard(userId: string): Promise<ServiceResult<CompetitorBoard>> {
  const db = createServerClient()
  const [compRes, snapRes] = await Promise.all([
    db.from('competitors').select('*').order('created_at', { ascending: true }),
    db.from('competitor_snapshots').select('*'),
  ])
  if (compRes.error || snapRes.error) {
    return err('db_error', compRes.error?.message ?? snapRes.error?.message ?? 'load failed')
  }
  const actor = await getActorProfile(userId)
  return ok(assembleBoard(
    (compRes.data ?? []) as Competitor[],
    (snapRes.data ?? []) as CompetitorSnapshot[],
    Boolean(actor?.is_admin),
  ))
}

/** 加入清单：入参 url 或 handle 二选一；解析出 handle 后按 (platform, handle) upsert。 */
export async function addCompetitor(
  userId: string,
  input: { url?: string; handle?: string; platform?: CompetitorPlatform; note?: string },
): Promise<ServiceResult<{ id: string }>> {
  const forbidden = await requireAdmin(userId)
  if (forbidden) return { data: null, error: forbidden }

  const platform: CompetitorPlatform = input.platform ?? 'tiktok'
  const raw = (input.url ?? input.handle ?? '').trim()
  const handle = parseHandleFromUrl(raw)
  if (!handle) return err('invalid_input', 'valid url or @handle required')
  const profile_url = /^https?:\/\//i.test(raw) ? raw : `https://www.tiktok.com/@${handle}`

  const db = createServerClient()
  const { data, error } = await db
    .from('competitors')
    .upsert(
      { platform, handle, profile_url, note: input.note ?? '' },
      { onConflict: 'platform,handle' },
    )
    .select('id')
    .single()
  if (error) return err('db_error', error.message)
  return ok({ id: (data as { id: string }).id })
}

export async function updateCompetitor(
  userId: string,
  id: string,
  fields: { note?: string; display_name?: string },
): Promise<ServiceResult<{ id: string }>> {
  const forbidden = await requireAdmin(userId)
  if (forbidden) return { data: null, error: forbidden }

  const patch: Record<string, unknown> = {}
  if (fields.note !== undefined) patch.note = fields.note
  if (fields.display_name !== undefined) patch.display_name = fields.display_name
  if (Object.keys(patch).length === 0) return err('invalid_input', 'nothing to update')

  const db = createServerClient()
  const { error } = await db.from('competitors').update(patch).eq('id', id)
  if (error) return err('db_error', error.message)
  return ok({ id })
}

export async function deleteCompetitor(userId: string, id: string): Promise<ServiceResult<{ id: string }>> {
  const forbidden = await requireAdmin(userId)
  if (forbidden) return { data: null, error: forbidden }

  const db = createServerClient()
  const { error } = await db.from('competitors').delete().eq('id', id)
  if (error) return err('db_error', error.message)
  return ok({ id })
}

/** 快照 upsert —— 只给 service-role 脚本用（无 admin 检查，脚本本身持 service-role）。 */
export interface SnapshotInput {
  competitor_id: string
  captured_on: string
  followers?: number | null
  likes?: number | null
  videos?: number | null
  following?: number | null
  display_name?: string | null
  bio?: string | null
  region?: string | null
  verified?: boolean | null
  raw?: Record<string, unknown> | null
}

export async function upsertSnapshot(input: SnapshotInput): Promise<ServiceResult<{ competitor_id: string; captured_on: string }>> {
  const db = createServerClient()
  const { error } = await db
    .from('competitor_snapshots')
    .upsert(input, { onConflict: 'competitor_id,captured_on' })
  if (error) return err('db_error', error.message)
  return ok({ competitor_id: input.competitor_id, captured_on: input.captured_on })
}
```

- [ ] **Step 2: 类型检查**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: 无 `service.ts` 相关报错（确认 `getActorProfile`、`createServerClient` 导入路径正确）。

- [ ] **Step 3: Commit**

```bash
git add src/lib/competitors/service.ts
git commit -m "feat(competitors): add service layer (board load + CRUD + snapshot upsert)"
```

---

### Task 7: REST API 路由

**Files:**
- Create: `src/app/api/competitors/route.ts`
- Create: `src/app/api/competitors/[id]/route.ts`

> 参照 `src/app/api/org/tasks/[id]/route.ts`：`authGuard()` → service → `NextResponse.json({ data, error })`。`authGuard` 失败时返回的是 `NextResponse`（401），用 `instanceof NextResponse` 判定。

- [ ] **Step 1: 写 collection 路由（GET 看板 / POST 新增）**

```ts
// src/app/api/competitors/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { authGuard } from '@/lib/auth/guard'
import { getCompetitorBoard, addCompetitor, httpStatusForError } from '@/lib/competitors/service'

// GET /api/competitors — 返回看板（含 canEdit）
export async function GET() {
  const user = await authGuard()
  if (user instanceof NextResponse) return user
  const result = await getCompetitorBoard(user.id)
  if (result.error) {
    return NextResponse.json({ data: null, error: result.error.message }, { status: httpStatusForError(result.error.code) })
  }
  return NextResponse.json({ data: result.data, error: null })
}

// POST /api/competitors — body { url? | handle?, note?, platform? }
export async function POST(req: NextRequest) {
  const user = await authGuard()
  if (user instanceof NextResponse) return user
  let body: { url?: string; handle?: string; note?: string; platform?: 'tiktok' }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ data: null, error: 'Invalid JSON body' }, { status: 400 })
  }
  const result = await addCompetitor(user.id, body)
  if (result.error) {
    return NextResponse.json({ data: null, error: result.error.message }, { status: httpStatusForError(result.error.code) })
  }
  return NextResponse.json({ data: result.data, error: null })
}
```

- [ ] **Step 2: 写单条路由（PATCH 更新 / DELETE 删除）**

```ts
// src/app/api/competitors/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { authGuard } from '@/lib/auth/guard'
import { updateCompetitor, deleteCompetitor, httpStatusForError } from '@/lib/competitors/service'

// PATCH /api/competitors/[id] — body { note?, display_name? }
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await authGuard()
  if (user instanceof NextResponse) return user
  let body: { note?: string; display_name?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ data: null, error: 'Invalid JSON body' }, { status: 400 })
  }
  const result = await updateCompetitor(user.id, params.id, body)
  if (result.error) {
    return NextResponse.json({ data: null, error: result.error.message }, { status: httpStatusForError(result.error.code) })
  }
  return NextResponse.json({ data: result.data, error: null })
}

// DELETE /api/competitors/[id]
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const user = await authGuard()
  if (user instanceof NextResponse) return user
  const result = await deleteCompetitor(user.id, params.id)
  if (result.error) {
    return NextResponse.json({ data: null, error: result.error.message }, { status: httpStatusForError(result.error.code) })
  }
  return NextResponse.json({ data: result.data, error: null })
}
```

- [ ] **Step 3: 类型检查**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: 无 route 相关报错。

- [ ] **Step 4: Commit**

```bash
git add src/app/api/competitors/route.ts src/app/api/competitors/[id]/route.ts
git commit -m "feat(competitors): add REST routes (GET/POST/PATCH/DELETE)"
```

---

### Task 8: 采集脚本 `record-competitor-snapshot.ts`

**Files:**
- Create: `scripts/record-competitor-snapshot.ts`

> 与 `.mjs` seed 脚本不同：本脚本用 `--experimental-strip-types` 运行，以便相对路径 `.ts` 复用已测的 `parseCount`。脚本直接持 service-role 客户端（不经 `@/` 别名——node 不解析 tsconfig paths，故用相对导入）。工作流：Claude 用内置浏览器打开 TikTok 主页 → `read_page`/`get_page_text` 读指标 → 组装 JSON → 跑本脚本写库。

- [ ] **Step 1: 写脚本**

```ts
// scripts/record-competitor-snapshot.ts
// 竞品每日打点写库（唯一快照写入口）。Claude 采集后跑。
// Run: node --env-file=.env.local --experimental-strip-types scripts/record-competitor-snapshot.ts '<json>'
//   <json> 为单个对象或数组；也可从 stdin 读。字段见下方 Row。
//   node --env-file=.env.local --experimental-strip-types scripts/record-competitor-snapshot.ts < payload.json

import { createClient } from '@supabase/supabase-js'
import { parseCount } from '../src/lib/competitors/metrics.ts'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in env.')
  console.error('Run: node --env-file=.env.local --experimental-strip-types scripts/record-competitor-snapshot.ts <json>')
  process.exit(1)
}
const db = createClient(url, key, { auth: { persistSession: false } })

type Row = {
  platform?: string
  handle: string
  profile_url?: string
  followers?: number | string
  likes?: number | string
  videos?: number | string
  following?: number | string
  display_name?: string
  bio?: string
  region?: string
  verified?: boolean
  raw?: Record<string, unknown>
  captured_on?: string // 默认今天（UTC）
}

async function readInput(): Promise<Row[]> {
  const arg = process.argv[2]
  const text = arg && arg.trim() !== '' ? arg : await new Promise<string>((resolve) => {
    let buf = ''
    process.stdin.setEncoding('utf8')
    process.stdin.on('data', (c) => (buf += c))
    process.stdin.on('end', () => resolve(buf))
  })
  const parsed = JSON.parse(text)
  return Array.isArray(parsed) ? parsed : [parsed]
}

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

async function run() {
  const rows = await readInput()
  for (const r of rows) {
    const platform = r.platform ?? 'tiktok'
    const handle = r.handle
    if (!handle) { console.error('skip: row missing handle', r); continue }
    const profile_url = r.profile_url ?? `https://www.tiktok.com/@${handle}`

    // 1) upsert competitor，拿 id
    const { data: comp, error: cErr } = await db
      .from('competitors')
      .upsert({ platform, handle, profile_url, display_name: r.display_name ?? null }, { onConflict: 'platform,handle' })
      .select('id')
      .single()
    if (cErr || !comp) { console.error('competitor upsert failed', handle, cErr?.message); continue }

    // 2) upsert 当日快照（数字缺失时用 raw 里的缩写解析）
    const captured_on = r.captured_on ?? today()
    const snap = {
      competitor_id: (comp as { id: string }).id,
      captured_on,
      followers: parseCount(r.followers ?? (r.raw?.followers as string | undefined)),
      likes: parseCount(r.likes ?? (r.raw?.likes as string | undefined)),
      videos: parseCount(r.videos ?? (r.raw?.videos as string | undefined)),
      following: parseCount(r.following ?? (r.raw?.following as string | undefined)),
      display_name: r.display_name ?? null,
      bio: r.bio ?? null,
      region: r.region ?? null,
      verified: r.verified ?? null,
      raw: r.raw ?? null,
    }
    const { error: sErr } = await db
      .from('competitor_snapshots')
      .upsert(snap, { onConflict: 'competitor_id,captured_on' })
    if (sErr) { console.error('snapshot upsert failed', handle, sErr.message); continue }

    console.log(`✓ ${platform}/@${handle} ${captured_on} — followers=${snap.followers} likes=${snap.likes} videos=${snap.videos}`)
  }
}

run().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) })
```

- [ ] **Step 2: 干跑校验（无 env 时应友好报错，不写库）**

Run: `node --experimental-strip-types scripts/record-competitor-snapshot.ts '{"handle":"x"}'`
Expected: 打印 `Missing NEXT_PUBLIC_SUPABASE_URL ...` 并以非零码退出（确认脚本能被 strip-types 解析、`parseCount` 导入成功、env 守卫生效）。

- [ ] **Step 3: Commit**

```bash
git add scripts/record-competitor-snapshot.ts
git commit -m "feat(competitors): add service-role snapshot recording script"
```

---

### Task 9: 三语文案 + 导航 key

**Files:**
- Modify: `messages/zh.json`
- Modify: `messages/en.json`
- Modify: `messages/ja.json`

> 三语必须 key 完全对齐，否则 `npm run test:i18n` 失败。基准语言是 `zh`。新增顶层命名空间 `competitors`，并在 `nav` 命名空间加 `competitors`。下面给出各语言应插入的 JSON 片段（合并进对应文件，注意保持合法 JSON 逗号）。

- [ ] **Step 1: `messages/zh.json` —— 在 `nav` 对象内加一行**

```json
"competitors": "竞品监测"
```

- [ ] **Step 2: `messages/zh.json` —— 新增顶层 `competitors` 命名空间**

```json
"competitors": {
  "title": "竞品监测",
  "subtitle": "记录竞品 TikTok 主页指标，形成增长趋势",
  "addPlaceholder": "粘贴 TikTok 主页链接或 @handle",
  "addButton": "添加竞品",
  "addFailed": "添加失败",
  "empty": "还没有竞品，粘贴一个 TikTok 主页链接开始",
  "readOnly": "只有管理员可以增删竞品",
  "colFollowers": "粉丝",
  "colLikes": "获赞",
  "colVideos": "作品",
  "region": "地区",
  "verified": "已认证",
  "latestOn": "最近采集 {date}",
  "noData": "暂无采集数据",
  "history": "历史打点",
  "colDate": "日期",
  "delete": "删除",
  "deleteConfirm": "确定删除该竞品及其全部打点？",
  "notePlaceholder": "备注"
}
```

- [ ] **Step 3: `messages/en.json` —— `nav` 内加一行 + 顶层命名空间**

`nav` 内：
```json
"competitors": "Competitors"
```
顶层：
```json
"competitors": {
  "title": "Competitor Monitoring",
  "subtitle": "Track competitors' TikTok profile metrics over time",
  "addPlaceholder": "Paste a TikTok profile URL or @handle",
  "addButton": "Add competitor",
  "addFailed": "Failed to add",
  "empty": "No competitors yet — paste a TikTok profile URL to start",
  "readOnly": "Only admins can add or remove competitors",
  "colFollowers": "Followers",
  "colLikes": "Likes",
  "colVideos": "Videos",
  "region": "Region",
  "verified": "Verified",
  "latestOn": "Last captured {date}",
  "noData": "No data captured yet",
  "history": "History",
  "colDate": "Date",
  "delete": "Delete",
  "deleteConfirm": "Delete this competitor and all its snapshots?",
  "notePlaceholder": "Note"
}
```

- [ ] **Step 4: `messages/ja.json` —— `nav` 内加一行 + 顶层命名空间**

`nav` 内：
```json
"competitors": "競合モニタリング"
```
顶层：
```json
"competitors": {
  "title": "競合モニタリング",
  "subtitle": "競合の TikTok プロフィール指標を時系列で記録",
  "addPlaceholder": "TikTok のプロフィール URL か @handle を貼り付け",
  "addButton": "競合を追加",
  "addFailed": "追加に失敗しました",
  "empty": "まだ競合がありません。TikTok プロフィール URL を貼り付けて開始",
  "readOnly": "競合の追加・削除は管理者のみ可能です",
  "colFollowers": "フォロワー",
  "colLikes": "いいね",
  "colVideos": "動画",
  "region": "地域",
  "verified": "認証済み",
  "latestOn": "最終取得 {date}",
  "noData": "取得データがありません",
  "history": "履歴",
  "colDate": "日付",
  "delete": "削除",
  "deleteConfirm": "この競合とすべての記録を削除しますか？",
  "notePlaceholder": "メモ"
}
```

- [ ] **Step 5: 核对三语 key 完全一致**

三语 `competitors` 命名空间应包含且仅包含这组 key（顺序不限，key 名逐一相同）：`title, subtitle, addPlaceholder, addButton, addFailed, empty, readOnly, colFollowers, colLikes, colVideos, region, verified, latestOn, noData, history, colDate, delete, deleteConfirm, notePlaceholder`。`nav.competitors` 三语各一条。

- [ ] **Step 6: 运行 i18n 守卫**

Run: `npm run test:i18n`
Expected: PASS（无 missing/extra key，无空值）。

- [ ] **Step 7: Commit**

```bash
git add messages/zh.json messages/en.json messages/ja.json
git commit -m "feat(competitors): add zh/en/ja copy + nav entry key"
```

---

### Task 10: Sparkline 组件

**Files:**
- Create: `src/components/competitors/Sparkline.tsx`

- [ ] **Step 1: 写组件**

```tsx
// src/components/competitors/Sparkline.tsx
import { buildSparklinePoints } from '@/lib/competitors/chart'

export default function Sparkline({
  values,
  width = 120,
  height = 28,
  className,
}: {
  values: number[]
  width?: number
  height?: number
  className?: string
}) {
  const points = buildSparklinePoints(values, width, height)
  if (!points) return null
  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={className}
      preserveAspectRatio="none"
      role="img"
    >
      <polyline
        points={points}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  )
}
```

- [ ] **Step 2: 类型检查**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: 无 `Sparkline.tsx` 相关报错。

- [ ] **Step 3: Commit**

```bash
git add src/components/competitors/Sparkline.tsx
git commit -m "feat(competitors): add pure-SVG sparkline component"
```

---

### Task 11: 主视图 `CompetitorMonitoringView`

**Files:**
- Create: `src/components/competitors/CompetitorMonitoringView.tsx`

> Client 组件。初始数据由 server page 以 `initial` 传入；增删改后 `fetch('/api/competitors')` 重新拉取（无 `revalidatePath`）。文案全走 `useTranslations('competitors')`，禁止 JSX 内硬编码中文（`test:no-bare-han` 把关）。用 `@/i18n/navigation` 的 `Link`（本视图无跳转则可不引）。

- [ ] **Step 1: 写视图**

```tsx
// src/components/competitors/CompetitorMonitoringView.tsx
'use client'

import { useCallback, useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { Plus, Trash2, ChevronDown, ChevronRight, BadgeCheck } from 'lucide-react'
import Sparkline from './Sparkline'
import { formatCount } from '@/lib/competitors/metrics'
import type { CompetitorBoard, CompetitorWithHistory } from '@/lib/competitors/types'

export default function CompetitorMonitoringView({ initial }: { initial: CompetitorBoard }) {
  const t = useTranslations('competitors')
  const [board, setBoard] = useState<CompetitorBoard>(initial)
  const [input, setInput] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [pending, startTransition] = useTransition()

  const refresh = useCallback(async () => {
    const res = await fetch('/api/competitors', { cache: 'no-store' })
    const json = await res.json()
    if (json.data) setBoard(json.data as CompetitorBoard)
  }, [])

  const add = useCallback(() => {
    const value = input.trim()
    if (!value) return
    setError(null)
    startTransition(async () => {
      const res = await fetch('/api/competitors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: value }),
      })
      const json = await res.json()
      if (json.error) { setError(t('addFailed')); return }
      setInput('')
      await refresh()
    })
  }, [input, refresh, t])

  const remove = useCallback((id: string) => {
    if (!confirm(t('deleteConfirm'))) return
    startTransition(async () => {
      await fetch(`/api/competitors/${id}`, { method: 'DELETE' })
      await refresh()
    })
  }, [refresh, t])

  return (
    <div className="space-y-6">
      {board.canEdit ? (
        <div className="flex items-center gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') add() }}
            placeholder={t('addPlaceholder')}
            className="flex-1 rounded-md border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900"
          />
          <button
            onClick={add}
            disabled={pending}
            className="inline-flex items-center gap-1 rounded-md bg-neutral-900 px-3 py-2 text-sm text-white disabled:opacity-50 dark:bg-white dark:text-neutral-900"
          >
            <Plus size={16} /> {t('addButton')}
          </button>
        </div>
      ) : (
        <p className="text-sm text-neutral-500">{t('readOnly')}</p>
      )}
      {error && <p className="text-sm text-red-600">{error}</p>}

      {board.competitors.length === 0 ? (
        <p className="text-sm text-neutral-500">{t('empty')}</p>
      ) : (
        <ul className="divide-y divide-neutral-200 dark:divide-neutral-800">
          {board.competitors.map((c) => (
            <CompetitorRow
              key={c.id}
              c={c}
              canEdit={board.canEdit}
              open={!!expanded[c.id]}
              onToggle={() => setExpanded((s) => ({ ...s, [c.id]: !s[c.id] }))}
              onDelete={() => remove(c.id)}
            />
          ))}
        </ul>
      )}
    </div>
  )
}

function CompetitorRow({
  c, canEdit, open, onToggle, onDelete,
}: {
  c: CompetitorWithHistory
  canEdit: boolean
  open: boolean
  onToggle: () => void
  onDelete: () => void
}) {
  const t = useTranslations('competitors')
  const followerSeries = c.history.map((h) => h.followers).filter((n): n is number => n != null)

  return (
    <li className="py-4">
      <div className="flex items-start justify-between gap-4">
        <button onClick={onToggle} className="flex items-start gap-2 text-left">
          {open ? <ChevronDown size={16} className="mt-1" /> : <ChevronRight size={16} className="mt-1" />}
          <div>
            <div className="flex items-center gap-1.5 font-medium">
              {c.latest?.display_name ?? c.display_name ?? c.handle}
              {c.latest?.verified && <BadgeCheck size={14} className="text-sky-500" />}
              <span className="text-sm text-neutral-500">@{c.handle}</span>
            </div>
            {c.latest?.region && <div className="text-xs text-neutral-500">{t('region')}: {c.latest.region}</div>}
            {c.latest?.bio && <div className="mt-0.5 max-w-prose text-xs text-neutral-500">{c.latest.bio}</div>}
          </div>
        </button>

        <div className="flex items-center gap-6">
          <Metric label={t('colFollowers')} value={c.latest?.followers} />
          <Metric label={t('colLikes')} value={c.latest?.likes} />
          <Metric label={t('colVideos')} value={c.latest?.videos} />
          <div className="text-sky-500"><Sparkline values={followerSeries} /></div>
          {canEdit && (
            <button onClick={onDelete} aria-label={t('delete')} className="text-neutral-400 hover:text-red-600">
              <Trash2 size={16} />
            </button>
          )}
        </div>
      </div>

      {open && (
        <div className="mt-3 pl-6">
          {c.history.length === 0 ? (
            <p className="text-xs text-neutral-500">{t('noData')}</p>
          ) : (
            <table className="w-full max-w-xl text-xs">
              <thead className="text-neutral-500">
                <tr>
                  <th className="py-1 text-left font-normal">{t('colDate')}</th>
                  <th className="py-1 text-right font-normal">{t('colFollowers')}</th>
                  <th className="py-1 text-right font-normal">{t('colLikes')}</th>
                  <th className="py-1 text-right font-normal">{t('colVideos')}</th>
                </tr>
              </thead>
              <tbody>
                {c.history.slice().reverse().map((h) => (
                  <tr key={h.captured_on} className="border-t border-neutral-100 dark:border-neutral-800">
                    <td className="py-1">{h.captured_on}</td>
                    <td className="py-1 text-right">{formatCount(h.followers)}</td>
                    <td className="py-1 text-right">{formatCount(h.likes)}</td>
                    <td className="py-1 text-right">{formatCount(h.videos)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </li>
  )
}

function Metric({ label, value }: { label: string; value: number | null | undefined }) {
  return (
    <div className="text-right">
      <div className="text-sm font-semibold tabular-nums">{formatCount(value ?? null)}</div>
      <div className="text-[11px] text-neutral-500">{label}</div>
    </div>
  )
}
```

- [ ] **Step 2: 类型检查 + 无硬编码中文守卫**

Run: `npx tsc --noEmit -p tsconfig.json && npm run test:no-bare-han`
Expected: 无类型报错；`test:no-bare-han` PASS（视图内无裸中文）。

- [ ] **Step 3: Commit**

```bash
git add src/components/competitors/CompetitorMonitoringView.tsx
git commit -m "feat(competitors): add monitoring view (list + metrics + history + sparkline)"
```

---

### Task 12: 页面 `page.tsx`

**Files:**
- Create: `src/app/[locale]/(app)/competitors/page.tsx`

> 参照 `src/app/[locale]/(app)/team/org/page.tsx`：`force-dynamic` + `authGuard` + `instanceof Response → redirect('/login')` + `getTranslations` + `setRequestLocale`。Header 用 `@/components/layout/Header`。

- [ ] **Step 1: 写页面**

```tsx
// src/app/[locale]/(app)/competitors/page.tsx
export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import Header from '@/components/layout/Header'
import CompetitorMonitoringView from '@/components/competitors/CompetitorMonitoringView'
import { authGuard } from '@/lib/auth/guard'
import { getCompetitorBoard } from '@/lib/competitors/service'
import type { CompetitorBoard } from '@/lib/competitors/types'

export default async function CompetitorsPage({ params }: { params: { locale: string } }) {
  setRequestLocale(params.locale)

  const user = await authGuard()
  if (user instanceof Response) redirect('/login')

  const [t, boardRes] = await Promise.all([
    getTranslations('competitors'),
    getCompetitorBoard((user as { id: string }).id),
  ])

  const board: CompetitorBoard = boardRes.data ?? { competitors: [], canEdit: false }

  return (
    <div className="mx-auto max-w-5xl">
      <Header title={t('title')} subtitle={t('subtitle')} />
      <div className="mt-6">
        <CompetitorMonitoringView initial={board} />
      </div>
    </div>
  )
}
```

- [ ] **Step 2: 类型检查**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: 无 `page.tsx` 相关报错。

- [ ] **Step 3: Commit**

```bash
git add "src/app/[locale]/(app)/competitors/page.tsx"
git commit -m "feat(competitors): add /competitors server page"
```

---

### Task 13: 侧边栏入口

**Files:**
- Modify: `src/components/layout/Sidebar.tsx`

> 在 `NAV` 数组里加一个顶层叶子项。图标用 lucide 的 `Radar`（若已导入其它更合适的图标可替换，但需在 import 里加上）。label 走 `nav.competitors`（Task 9 已加）。

- [ ] **Step 1: 在 lucide-react import 里加入 `Radar`**

在 `src/components/layout/Sidebar.tsx` 顶部 `import { ... } from 'lucide-react'` 中追加 `Radar`（与既有图标同一行/同一块）。例如：

```tsx
import { LayoutDashboard, Users, GitBranch, /* …既有… */ Radar } from 'lucide-react'
```

- [ ] **Step 2: 在 `NAV` 数组加入叶子项**

在 `NAV` 中 `{ href: '/creators', key: 'creators', icon: Users }` 之后插入：

```tsx
  { href: '/competitors', key: 'competitors', icon: Radar },
```

- [ ] **Step 3: 类型检查**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: 无报错（`Radar` 已导入、`key` 存在于 `nav` 命名空间三语中）。

- [ ] **Step 4: Commit**

```bash
git add src/components/layout/Sidebar.tsx
git commit -m "feat(competitors): add sidebar nav entry"
```

---

### Task 14: 接入测试清单 + 全量校验

**Files:**
- Modify: `package.json`

- [ ] **Step 1: 把新增测试文件追加到 `"test"` 脚本末尾**

在 `package.json` 的 `"test": "node --test --experimental-strip-types ... src/lib/org/tree.test.ts"` 结尾追加三个路径（同一行，空格分隔）：

```
src/lib/competitors/metrics.test.ts src/lib/competitors/chart.test.ts src/lib/competitors/assemble.test.ts
```

- [ ] **Step 2: 运行全量单测**

Run: `npm test`
Expected: PASS（含新增 3 个 competitors 测试文件，无失败）。

- [ ] **Step 3: 运行文案守卫**

Run: `npm run test:copy`
Expected: PASS（`test:i18n` 三语 key 对齐 + `test:no-bare-han` 无裸中文）。

- [ ] **Step 4: Lint + 构建**

Run: `npm run lint && npm run build`
Expected: lint 无 error；`next build` 成功（`/[locale]/competitors` 与 `/api/competitors` 路由被编译）。

- [ ] **Step 5: 浏览器验证（dev server）**

用 preview 工具起 dev（`.claude/launch.json` 的 dev 配置或 `npm run dev`，端口 3001），登录后访问 `/zh/competitors`：
- 空态显示 `empty` 文案；管理员账号可见添加框，非管理员见 `readOnly`。
- 粘贴一个 `@handle` 添加 → 出现在列表（尚无快照 → 指标显示 `—`、无 sparkline）。
- 跑一次 `record-competitor-snapshot.ts` 造一条打点 → 刷新后指标与 sparkline 出现，展开见历史表。
截图留证。

- [ ] **Step 6: Commit**

```bash
git add package.json
git commit -m "test(competitors): wire unit tests into test script"
```

---

## Self-Review

**Spec coverage（对照 LHH 设计稿各节）：**
- 数据模型（competitors / competitor_snapshots / 唯一键 / RLS）→ Task 1 ✅
- 采集脚本（service-role、幂等 upsert、缩写解析、打印结果）→ Task 8（+ parseCount Task 2）✅
- 域层（metrics / 组装 / 加载）→ Task 2/3/5/6 ✅
- 写库路径（清单走 API、快照只走脚本）→ Task 6/7/8 ✅
- 视图（基础信息 + 最新指标 + 展开历史 + 纯 SVG sparkline）→ Task 10/11 ✅
- 路由 + 入口（独立页 + 导航）→ Task 12/13 ✅
- 双语（→ 三语）字典 + i18n 守卫 → Task 9 ✅
- 测试（parseCount / 组装 / 幂等文档化）→ Task 2/3/5 + Task 8 脚本行为文档 ✅
- 非目标（无定时跑数 / 单平台 / 无直播间实时 / 无单条视频）→ 未建对应能力，符合 ✅

**适配偏差已在「Key Decisions」标注**：server action→API route、`revalidatePath`→client 重取、vitest→node:test、双语→三语、写权限收敛到 admin（可评审推翻）、脚本 `.ts` + strip-types。

**Placeholder scan**：无 TODO/TBD；每个代码步骤含完整可运行代码。Task 9 三语备注占位符 key 统一为 `notePlaceholder`，Step 5 给出完整 key 清单核对。

**Type consistency**：`ServiceResult<T>`/`httpStatusForError` 在 `service.ts` 定义，routes 一致引用；`CompetitorBoard`/`CompetitorWithHistory`/`HistoryPoint` 定义于 `types.ts`，被 assemble/service/view/page 一致使用；`buildSparklinePoints`、`parseCount`、`formatCount`、`parseHandleFromUrl` 命名在定义处与调用处一致。
