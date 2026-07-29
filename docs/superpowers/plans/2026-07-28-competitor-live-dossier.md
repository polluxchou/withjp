# 竞品团播档案（Competitor Live Dossier）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在已上线的 `competitors` 模块上扩展出「团播档案」——手动上传直播间截图、补齐 Lark 团级字段、首页改版为图为主（1:3 双栏：左按周粉丝曲线 + 右截图墙），并把写权限从仅管理员放开为所有登录用户。

**Architecture:** 沿用现有分层：`supabase/migrations` 加表/列（`043`）→ `src/lib/competitors/` 纯函数 + `service.ts`（`ServiceResult<T>`）→ `src/app/api/competitors/**/route.ts`（`authGuard` → service → `NextResponse.json({data,error})`）→ server `page.tsx` → client 组件。粉丝曲线数据源用已有的 `competitor_snapshots` 按 ISO 周聚合；截图新建 `competitor_shots` 表 + `competitor-shots` Storage 桶，上传照搬 `src/app/api/items/photo/route.ts`。

**Tech Stack:** Next.js App Router、next-intl（zh/en/ja 三语 + parity 守卫）、Supabase（`@supabase/ssr` cookie 客户端）、`node:test` + `--experimental-strip-types`、lucide-react、Tailwind。

**设计文档:** `docs/superpowers/specs/2026-07-28-competitor-live-dossier-design.md`

---

### Task 1: 数据库迁移 043（扩 competitors + 建 competitor_shots + RLS）

**Files:**
- Create: `supabase/migrations/043_competitor_dossier.sql`

> main 当前最大迁移号为 042。⚠️ 跨分支冲突：并行 `feat/worktask-taskitem-link` 分支也有 042/043（内容不同）——合并靠后的一方需重编号，落地时与主仓核对。本仓库无法本地 push 迁移，正确性靠 SQL 评审 + 与 Supabase 同步时验证。

- [ ] **Step 1: 写迁移 SQL**

```sql
-- 043_competitor_dossier.sql
-- 团播档案扩展：给 competitors 补团级字段；新建 competitor_shots（手动上传截图）。
-- 写权限在 service 层放开为所有登录用户；沿用 authenticated_only RLS。

-- A. competitors 团级稳定属性（均可空，不破坏现有行）
alter table competitors add column if not exists avatar_url    text;
alter table competitors add column if not exists region        text not null default 'JP';
alter table competitors add column if not exists member_count  integer;
alter table competitors add column if not exists composition   text;
alter table competitors add column if not exists launch_city   text;
alter table competitors add column if not exists launched_on   date;
alter table competitors add column if not exists mc_note       text;
alter table competitors add column if not exists online_note   text;
alter table competitors add column if not exists latest_videos jsonb;

-- B. 截图表
create table if not exists competitor_shots (
  id            uuid        primary key default gen_random_uuid(),
  competitor_id uuid        not null references competitors(id) on delete cascade,
  image_url     text        not null,
  shot_on       date,
  tag           text,
  caption       text        not null default '',
  sort_order    integer     not null default 0,
  created_at    timestamptz not null default now()
);
create index if not exists idx_competitor_shots_competitor
  on competitor_shots(competitor_id, shot_on);

-- C. RLS：登录用户可读写（沿用 authenticated_only）
do $$
begin
  execute 'alter table competitor_shots enable row level security';
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'competitor_shots' and policyname = 'authenticated_only'
  ) then
    execute 'create policy "authenticated_only" on competitor_shots for all to authenticated using (auth.uid() is not null)';
  end if;
end $$;
```

- [ ] **Step 2: 校验 SQL 与既有约定一致**

Run: `grep -nE "add column if not exists|competitor_shots|authenticated_only" supabase/migrations/043_competitor_dossier.sql`
Expected: 输出含 9 条 `add column`、`competitor_shots` 表与索引、`authenticated_only` policy —— 措辞与 `042_competitor_monitoring.sql` 一致。

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/043_competitor_dossier.sql
git commit -m "feat(competitors): 043 migration — competitor_shots + team fields + RLS"
```

---

### Task 2: 截图上传路由（照搬 items/photo，新桶）

**Files:**
- Create: `src/app/api/competitors/upload/route.ts`

> 需在 Supabase 建 public bucket `competitor-shots`（控制台/API，非 SQL）。本步只写路由；桶不存在时上传会返回 500，手测前先建桶。

- [ ] **Step 1: 写上传路由**

```ts
// src/app/api/competitors/upload/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'
import { authGuard } from '@/lib/auth/guard'
import { createServerClient } from '@/lib/supabase/server'

const BUCKET = 'competitor-shots'
const MAX_BYTES = 5 * 1024 * 1024 // 5MB
const ALLOWED = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif'])

export async function POST(req: NextRequest) {
  const user = await authGuard()
  if (user instanceof NextResponse) return user

  let form: FormData
  try {
    form = await req.formData()
  } catch {
    return NextResponse.json({ data: null, error: 'Invalid form data' }, { status: 400 })
  }

  const file = form.get('file')
  if (!(file instanceof File)) {
    return NextResponse.json({ data: null, error: 'file is required' }, { status: 400 })
  }
  if (!ALLOWED.has(file.type)) {
    return NextResponse.json({ data: null, error: '仅支持 PNG/JPEG/WebP/GIF 图片' }, { status: 400 })
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ data: null, error: '图片不能超过 5MB' }, { status: 400 })
  }

  const ext = file.name.includes('.') ? file.name.split('.').pop() : 'png'
  const path = `${randomUUID()}.${ext}`
  const buffer = Buffer.from(await file.arrayBuffer())

  const db = createServerClient()
  const { error } = await db.storage.from(BUCKET).upload(path, buffer, {
    contentType: file.type,
    upsert: false,
  })
  if (error) {
    return NextResponse.json({ data: null, error: error.message }, { status: 500 })
  }

  const { data } = db.storage.from(BUCKET).getPublicUrl(path)
  return NextResponse.json({ data: { url: data.publicUrl }, error: null }, { status: 201 })
}
```

- [ ] **Step 2: 类型检查**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: 无 `upload/route.ts` 相关报错。

- [ ] **Step 3: Commit**

```bash
git add src/app/api/competitors/upload/route.ts
git commit -m "feat(competitors): add screenshot upload route (competitor-shots bucket)"
```

---

### Task 3: 扩展领域类型 `types.ts`

**Files:**
- Modify: `src/lib/competitors/types.ts`

- [ ] **Step 1: 用下面内容整体替换 `types.ts`**

```ts
export type CompetitorPlatform = 'tiktok'

export interface Competitor {
  id: string
  platform: CompetitorPlatform
  handle: string
  profile_url: string
  display_name: string | null
  note: string
  created_at: string
  // 043 团级档案字段
  avatar_url: string | null
  region: string
  member_count: number | null
  composition: string | null
  launch_city: string | null
  launched_on: string | null
  mc_note: string | null
  online_note: string | null
  latest_videos: { url: string; title?: string }[] | null
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

export interface HistoryPoint {
  captured_on: string
  followers: number | null
  likes: number | null
  videos: number | null
}

export interface CompetitorShot {
  id: string
  competitor_id: string
  image_url: string
  shot_on: string | null
  tag: string | null
  caption: string
  sort_order: number
  created_at: string
}

/** 按 ISO 周聚合的粉丝点（week_start = 周一 YYYY-MM-DD）。 */
export interface WeeklyPoint {
  week_start: string
  followers: number
}

export interface CompetitorWithHistory extends Competitor {
  latest: CompetitorSnapshot | null
  history: HistoryPoint[]
  shots: CompetitorShot[]
  weekly: WeeklyPoint[]
}

export interface CompetitorBoard {
  competitors: CompetitorWithHistory[]
  canEdit: boolean
}
```

- [ ] **Step 2: 类型检查（此时 assemble/service 会因签名不匹配报错——预期，后续任务修复）**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep -c "competitors"`
Expected: 输出一个 >0 的数字（assemble.ts/service.ts 引用了尚未补齐的 `shots`/`weekly`）。这些在 Task 5/6 修复。

- [ ] **Step 3: Commit**

```bash
git add src/lib/competitors/types.ts
git commit -m "feat(competitors): extend types with team fields, shots, weekly points"
```

---

### Task 4: 按周聚合纯函数 `weekly.ts`

**Files:**
- Create: `src/lib/competitors/weekly.ts`
- Test: `src/lib/competitors/weekly.test.ts`

- [ ] **Step 1: 写失败测试**

```ts
// src/lib/competitors/weekly.test.ts
import assert from 'node:assert/strict'
import test from 'node:test'

import { weekStartOf, bucketFollowersByWeek } from './weekly.ts'

test('weekStartOf: 归一化到本周周一（UTC）', () => {
  assert.equal(weekStartOf('2026-07-29'), '2026-07-27') // 周三 → 周一
  assert.equal(weekStartOf('2026-07-27'), '2026-07-27') // 周一 → 自身
  assert.equal(weekStartOf('2026-08-02'), '2026-07-27') // 周日 → 上周一
})

test('weekStartOf: 跨年 ISO 边界', () => {
  assert.equal(weekStartOf('2026-01-01'), '2025-12-29') // 周四 → 上一年周一
})

test('bucketFollowersByWeek: 同周多点取最后一次', () => {
  const pts = bucketFollowersByWeek([
    { captured_on: '2026-07-27', followers: 100 },
    { captured_on: '2026-07-29', followers: 130 },
    { captured_on: '2026-07-28', followers: 120 },
  ])
  assert.deepEqual(pts, [{ week_start: '2026-07-27', followers: 130 }])
})

test('bucketFollowersByWeek: 跨周分桶并按周升序', () => {
  const pts = bucketFollowersByWeek([
    { captured_on: '2026-07-27', followers: 100 }, // W-A
    { captured_on: '2026-08-03', followers: 200 }, // W-B
  ])
  assert.deepEqual(pts, [
    { week_start: '2026-07-27', followers: 100 },
    { week_start: '2026-08-03', followers: 200 },
  ])
})

test('bucketFollowersByWeek: 该周最后一次为空则跳过该周', () => {
  const pts = bucketFollowersByWeek([
    { captured_on: '2026-07-27', followers: 100 },
    { captured_on: '2026-07-29', followers: null },
  ])
  assert.deepEqual(pts, [])
})

test('bucketFollowersByWeek: 空输入返回 []', () => {
  assert.deepEqual(bucketFollowersByWeek([]), [])
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `node --test --experimental-strip-types src/lib/competitors/weekly.test.ts`
Expected: FAIL — `Cannot find module './weekly.ts'`。

- [ ] **Step 3: 写实现**

```ts
// src/lib/competitors/weekly.ts
// 纯函数：把日快照按 ISO 周（周一起）聚合为粉丝点。
import type { WeeklyPoint } from './types.ts'

export interface WeekBucketInput {
  captured_on: string
  followers: number | null
}

/** 把 YYYY-MM-DD 归一化到本周周一（UTC）的 YYYY-MM-DD。 */
export function weekStartOf(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00Z')
  const day = d.getUTCDay() // 0=周日 .. 6=周六
  const diff = day === 0 ? -6 : 1 - day
  d.setUTCDate(d.getUTCDate() + diff)
  return d.toISOString().slice(0, 10)
}

/** 每周取该周最后一次快照的 followers；为空则跳过该周。输出按周升序。 */
export function bucketFollowersByWeek(history: WeekBucketInput[]): WeeklyPoint[] {
  const byWeek = new Map<string, WeekBucketInput[]>()
  for (const h of history) {
    if (!h || !h.captured_on) continue
    const wk = weekStartOf(h.captured_on)
    const arr = byWeek.get(wk) ?? []
    arr.push(h)
    byWeek.set(wk, arr)
  }
  const points: WeeklyPoint[] = []
  for (const [week_start, rows] of Array.from(byWeek.entries())) {
    rows.sort((a, b) => a.captured_on.localeCompare(b.captured_on))
    const last = rows[rows.length - 1]
    if (last.followers == null) continue
    points.push({ week_start, followers: last.followers })
  }
  points.sort((a, b) => a.week_start.localeCompare(b.week_start))
  return points
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `node --test --experimental-strip-types src/lib/competitors/weekly.test.ts`
Expected: PASS（全部用例）。

- [ ] **Step 5: Commit**

```bash
git add src/lib/competitors/weekly.ts src/lib/competitors/weekly.test.ts
git commit -m "feat(competitors): add ISO-week followers bucketing helper"
```

---

### Task 5: 扩展组装 `assemble.ts`（并入截图 + 周聚合）

**Files:**
- Modify: `src/lib/competitors/assemble.ts`
- Test: `src/lib/competitors/assemble.test.ts`

- [ ] **Step 1: 改测试（更新现有调用 + 新增截图/周断言）**

用下面内容整体替换 `src/lib/competitors/assemble.test.ts`：

```ts
// src/lib/competitors/assemble.test.ts
import assert from 'node:assert/strict'
import test from 'node:test'

import { parseHandleFromUrl, assembleBoard } from './assemble.ts'
import type { Competitor, CompetitorSnapshot, CompetitorShot } from './types.ts'

test('parseHandleFromUrl: 从主页 URL 抽 handle', () => {
  assert.equal(parseHandleFromUrl('https://www.tiktok.com/@example'), 'example')
  assert.equal(parseHandleFromUrl('tiktok.com/@Foo_Bar/'), 'Foo_Bar')
})

test('parseHandleFromUrl: 裸 @handle / handle / 非法', () => {
  assert.equal(parseHandleFromUrl('@example'), 'example')
  assert.equal(parseHandleFromUrl('example'), 'example')
  assert.equal(parseHandleFromUrl('   '), null)
})

const comp = (over: Partial<Competitor> = {}): Competitor => ({
  id: 'c1', platform: 'tiktok', handle: 'a', profile_url: 'u', display_name: 'A',
  note: '', created_at: '2026-07-01T00:00:00Z',
  avatar_url: null, region: 'JP', member_count: null, composition: null,
  launch_city: null, launched_on: null, mc_note: null, online_note: null, latest_videos: null,
  ...over,
})
const snap = (captured_on: string, followers: number): CompetitorSnapshot => ({
  id: 's-' + captured_on, competitor_id: 'c1', captured_on, followers,
  likes: null, videos: null, following: null, display_name: null, bio: null,
  region: null, verified: null, raw: null, captured_at: captured_on + 'T00:00:00Z',
})
const shot = (id: string, shot_on: string | null, sort_order = 0): CompetitorShot => ({
  id, competitor_id: 'c1', image_url: 'https://x/' + id + '.png', shot_on,
  tag: null, caption: '', sort_order, created_at: '2026-07-01T00:00:00Z',
})

test('assembleBoard: 挑最新快照 + 历史升序 + 周聚合', () => {
  const board = assembleBoard(
    [comp()],
    [snap('2026-07-29', 30), snap('2026-07-27', 10), snap('2026-08-03', 40)],
    [],
    true,
  )
  assert.equal(board.canEdit, true)
  assert.equal(board.competitors[0].latest?.captured_on, '2026-08-03')
  assert.deepEqual(board.competitors[0].history.map((h) => h.captured_on), ['2026-07-27', '2026-07-29', '2026-08-03'])
  // 两周：W(0727) 末点 30、W(0803) 末点 40
  assert.deepEqual(board.competitors[0].weekly, [
    { week_start: '2026-07-27', followers: 30 },
    { week_start: '2026-08-03', followers: 40 },
  ])
})

test('assembleBoard: 截图按 shot_on 倒序（空值垫底）+ sort_order', () => {
  const board = assembleBoard(
    [comp()],
    [],
    [shot('x', null, 5), shot('a', '2026-07-20'), shot('b', '2026-07-25'), shot('c', '2026-07-25', 1)],
    true,
  )
  assert.deepEqual(board.competitors[0].shots.map((s) => s.id), ['b', 'c', 'a', 'x'])
})

test('assembleBoard: 无快照/无截图的竞品', () => {
  const board = assembleBoard([comp({ id: 'c9', handle: 'z' })], [], [], false)
  assert.equal(board.competitors[0].latest, null)
  assert.deepEqual(board.competitors[0].history, [])
  assert.deepEqual(board.competitors[0].shots, [])
  assert.deepEqual(board.competitors[0].weekly, [])
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `node --test --experimental-strip-types src/lib/competitors/assemble.test.ts`
Expected: FAIL —— `assembleBoard` 现签名只接受 3 个参数 / 结果无 `shots`/`weekly`。

- [ ] **Step 3: 用下面内容整体替换 `assemble.ts`**

```ts
// src/lib/competitors/assemble.ts
import type { Competitor, CompetitorSnapshot, CompetitorShot, CompetitorBoard, HistoryPoint } from './types.ts'
import { bucketFollowersByWeek } from './weekly.ts'

/** 从 URL / @handle / handle 中抽出不含 @ 的 handle；失败返回 null。 */
export function parseHandleFromUrl(input: string): string | null {
  const s = (input ?? '').trim()
  if (s === '') return null
  const at = s.match(/@([A-Za-z0-9_.]+)/)
  if (at) return at[1]
  const bare = s.match(/^[A-Za-z0-9_.]+$/)
  return bare ? s : null
}

/** 把竞品 + 快照 + 截图组装成看板。 */
export function assembleBoard(
  competitors: Competitor[],
  snapshots: CompetitorSnapshot[],
  shots: CompetitorShot[],
  canEdit: boolean,
): CompetitorBoard {
  const snapsBy = new Map<string, CompetitorSnapshot[]>()
  for (const s of snapshots) {
    const arr = snapsBy.get(s.competitor_id) ?? []
    arr.push(s)
    snapsBy.set(s.competitor_id, arr)
  }
  const shotsBy = new Map<string, CompetitorShot[]>()
  for (const s of shots) {
    const arr = shotsBy.get(s.competitor_id) ?? []
    arr.push(s)
    shotsBy.set(s.competitor_id, arr)
  }

  return {
    canEdit,
    competitors: competitors.map((c) => {
      const rows = (snapsBy.get(c.id) ?? [])
        .slice()
        .sort((a, b) => a.captured_on.localeCompare(b.captured_on))
      const history: HistoryPoint[] = rows.map((r) => ({
        captured_on: r.captured_on, followers: r.followers, likes: r.likes, videos: r.videos,
      }))
      const latest = rows.length ? rows[rows.length - 1] : null
      const weekly = bucketFollowersByWeek(rows.map((r) => ({ captured_on: r.captured_on, followers: r.followers })))
      const shotRows = (shotsBy.get(c.id) ?? []).slice().sort((a, b) => {
        if (a.shot_on == null && b.shot_on == null) return a.sort_order - b.sort_order
        if (a.shot_on == null) return 1
        if (b.shot_on == null) return -1
        const cmp = b.shot_on.localeCompare(a.shot_on)
        return cmp !== 0 ? cmp : a.sort_order - b.sort_order
      })
      return { ...c, latest, history, weekly, shots: shotRows }
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
git commit -m "feat(competitors): assemble shots + weekly followers into board"
```

---

### Task 6: Service 层（放开写权限 + 加载截图 + 扩字段 + 截图 CRUD）

**Files:**
- Modify: `src/lib/competitors/service.ts`

> 触库函数不做单测；纯逻辑已在 assemble/weekly 覆盖。

- [ ] **Step 1: 用下面内容整体替换 `service.ts`**

```ts
// src/lib/competitors/service.ts
import { createServerClient } from '@/lib/supabase/server'
import { assembleBoard, parseHandleFromUrl } from './assemble'
import type { Competitor, CompetitorSnapshot, CompetitorShot, CompetitorBoard, CompetitorPlatform } from './types'

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

/** 团级可写字段（供 add/update 共用）。 */
export interface CompetitorFields {
  note?: string
  display_name?: string
  avatar_url?: string
  region?: string
  member_count?: number | null
  composition?: string
  launch_city?: string
  launched_on?: string | null
  mc_note?: string
  online_note?: string
  latest_videos?: { url: string; title?: string }[]
}

const FIELD_KEYS: (keyof CompetitorFields)[] = [
  'note', 'display_name', 'avatar_url', 'region', 'member_count',
  'composition', 'launch_city', 'launched_on', 'mc_note', 'online_note', 'latest_videos',
]

function pickFields(input: CompetitorFields): Record<string, unknown> {
  const patch: Record<string, unknown> = {}
  for (const k of FIELD_KEYS) {
    if (input[k] !== undefined) patch[k] = input[k]
  }
  return patch
}

/** 加载看板：任意登录用户可读可写（canEdit 恒 true）。 */
export async function getCompetitorBoard(_userId: string): Promise<ServiceResult<CompetitorBoard>> {
  const db = createServerClient()
  const [compRes, snapRes, shotRes] = await Promise.all([
    db.from('competitors').select('*').order('created_at', { ascending: true }),
    db.from('competitor_snapshots').select('*'),
    db.from('competitor_shots').select('*'),
  ])
  if (compRes.error || snapRes.error || shotRes.error) {
    return err('db_error', compRes.error?.message ?? snapRes.error?.message ?? shotRes.error?.message ?? 'load failed')
  }
  return ok(assembleBoard(
    (compRes.data ?? []) as Competitor[],
    (snapRes.data ?? []) as CompetitorSnapshot[],
    (shotRes.data ?? []) as CompetitorShot[],
    true,
  ))
}

/** 加入清单：入参 url 或 handle 二选一；已存在则返回其 id（确保存在，不覆盖）。 */
export async function addCompetitor(
  _userId: string,
  input: { url?: string; handle?: string; platform?: CompetitorPlatform } & CompetitorFields,
): Promise<ServiceResult<{ id: string }>> {
  const platform: CompetitorPlatform = input.platform ?? 'tiktok'
  if (platform !== 'tiktok') return err('invalid_input', 'unsupported platform')
  const raw = (input.url ?? input.handle ?? '').trim()
  const handle = parseHandleFromUrl(raw)
  if (!handle) return err('invalid_input', 'valid url or @handle required')
  const profile_url = /^https?:\/\//i.test(raw) ? raw : `https://www.tiktok.com/@${handle}`

  const db = createServerClient()
  const { data: existing, error: findErr } = await db
    .from('competitors').select('id').eq('platform', platform).eq('handle', handle).maybeSingle()
  if (findErr) return err('db_error', findErr.message)
  if (existing) return ok({ id: (existing as { id: string }).id })

  const { data, error } = await db
    .from('competitors')
    .insert({ platform, handle, profile_url, note: input.note ?? '', ...pickFields({ ...input, note: undefined }) })
    .select('id').single()
  if (error) return err('db_error', error.message)
  return ok({ id: (data as { id: string }).id })
}

export async function updateCompetitor(
  _userId: string,
  id: string,
  fields: CompetitorFields,
): Promise<ServiceResult<{ id: string }>> {
  const patch = pickFields(fields)
  if (Object.keys(patch).length === 0) return err('invalid_input', 'nothing to update')
  const db = createServerClient()
  const { error } = await db.from('competitors').update(patch).eq('id', id)
  if (error) return err('db_error', error.message)
  return ok({ id })
}

export async function deleteCompetitor(_userId: string, id: string): Promise<ServiceResult<{ id: string }>> {
  const db = createServerClient()
  const { error } = await db.from('competitors').delete().eq('id', id)
  if (error) return err('db_error', error.message)
  return ok({ id })
}

// ---- 截图 CRUD ----

export interface ShotInput {
  image_url: string
  shot_on?: string | null
  tag?: string | null
  caption?: string
  sort_order?: number
}

export async function addShot(competitorId: string, input: ShotInput): Promise<ServiceResult<CompetitorShot>> {
  if (!input?.image_url) return err('invalid_input', 'image_url required')
  const db = createServerClient()
  const { data, error } = await db
    .from('competitor_shots')
    .insert({
      competitor_id: competitorId,
      image_url: input.image_url,
      shot_on: input.shot_on ?? null,
      tag: input.tag ?? null,
      caption: input.caption ?? '',
      sort_order: input.sort_order ?? 0,
    })
    .select('*').single()
  if (error) return err('db_error', error.message)
  return ok(data as CompetitorShot)
}

export async function updateShot(
  shotId: string,
  fields: { shot_on?: string | null; tag?: string | null; caption?: string; sort_order?: number },
): Promise<ServiceResult<{ id: string }>> {
  const patch: Record<string, unknown> = {}
  for (const k of ['shot_on', 'tag', 'caption', 'sort_order'] as const) {
    if (fields[k] !== undefined) patch[k] = fields[k]
  }
  if (Object.keys(patch).length === 0) return err('invalid_input', 'nothing to update')
  const db = createServerClient()
  const { error } = await db.from('competitor_shots').update(patch).eq('id', shotId)
  if (error) return err('db_error', error.message)
  return ok({ id: shotId })
}

export async function deleteShot(shotId: string): Promise<ServiceResult<{ id: string }>> {
  const db = createServerClient()
  const { error } = await db.from('competitor_shots').delete().eq('id', shotId)
  if (error) return err('db_error', error.message)
  return ok({ id: shotId })
}
```

- [ ] **Step 2: 类型检查**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep -E "service.ts|route.ts" | head`
Expected: 仅剩 `route.ts`（Task 7 修）与视图（Task 9+）相关报错；`service.ts` 自身无报错（确认已删除 `getActorProfile`/`requireAdmin` 引用）。

- [ ] **Step 3: Commit**

```bash
git add src/lib/competitors/service.ts
git commit -m "feat(competitors): open writes to all users, load shots, extend fields, shot CRUD"
```

---

### Task 7: API 路由（扩 body 字段 + 截图路由）

**Files:**
- Modify: `src/app/api/competitors/route.ts`
- Modify: `src/app/api/competitors/[id]/route.ts`
- Create: `src/app/api/competitors/[id]/shots/route.ts`
- Create: `src/app/api/competitors/shots/[shotId]/route.ts`

- [ ] **Step 1: 扩 `route.ts` 的 POST body 类型（支持团级字段）**

用下面内容整体替换 `src/app/api/competitors/route.ts`：

```ts
import { NextRequest, NextResponse } from 'next/server'
import { authGuard } from '@/lib/auth/guard'
import { getCompetitorBoard, addCompetitor, httpStatusForError } from '@/lib/competitors/service'
import type { CompetitorFields } from '@/lib/competitors/service'

// GET /api/competitors — 看板（含 canEdit）
export async function GET() {
  const user = await authGuard()
  if (user instanceof NextResponse) return user
  const result = await getCompetitorBoard(user.id)
  if (result.error) {
    return NextResponse.json({ data: null, error: result.error.message }, { status: httpStatusForError(result.error.code) })
  }
  return NextResponse.json({ data: result.data, error: null })
}

// POST /api/competitors — body { url? | handle?, platform?, ...团级字段 }
export async function POST(req: NextRequest) {
  const user = await authGuard()
  if (user instanceof NextResponse) return user
  let body: { url?: string; handle?: string; platform?: 'tiktok' } & CompetitorFields
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

- [ ] **Step 2: 扩 `[id]/route.ts` 的 PATCH body 类型**

用下面内容整体替换 `src/app/api/competitors/[id]/route.ts`：

```ts
import { NextRequest, NextResponse } from 'next/server'
import { authGuard } from '@/lib/auth/guard'
import { updateCompetitor, deleteCompetitor, httpStatusForError } from '@/lib/competitors/service'
import type { CompetitorFields } from '@/lib/competitors/service'

// PATCH /api/competitors/[id] — body: 团级字段
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await authGuard()
  if (user instanceof NextResponse) return user
  let body: CompetitorFields
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

- [ ] **Step 3: 写截图集合路由（POST 加截图）**

```ts
// src/app/api/competitors/[id]/shots/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { authGuard } from '@/lib/auth/guard'
import { addShot, httpStatusForError } from '@/lib/competitors/service'
import type { ShotInput } from '@/lib/competitors/service'

// POST /api/competitors/[id]/shots — body { image_url, shot_on?, tag?, caption?, sort_order? }
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await authGuard()
  if (user instanceof NextResponse) return user
  let body: ShotInput
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ data: null, error: 'Invalid JSON body' }, { status: 400 })
  }
  const result = await addShot(params.id, body)
  if (result.error) {
    return NextResponse.json({ data: null, error: result.error.message }, { status: httpStatusForError(result.error.code) })
  }
  return NextResponse.json({ data: result.data, error: null }, { status: 201 })
}
```

- [ ] **Step 4: 写截图单条路由（PATCH / DELETE）**

```ts
// src/app/api/competitors/shots/[shotId]/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { authGuard } from '@/lib/auth/guard'
import { updateShot, deleteShot, httpStatusForError } from '@/lib/competitors/service'

// PATCH /api/competitors/shots/[shotId] — body { shot_on?, tag?, caption?, sort_order? }
export async function PATCH(req: NextRequest, { params }: { params: { shotId: string } }) {
  const user = await authGuard()
  if (user instanceof NextResponse) return user
  let body: { shot_on?: string | null; tag?: string | null; caption?: string; sort_order?: number }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ data: null, error: 'Invalid JSON body' }, { status: 400 })
  }
  const result = await updateShot(params.shotId, body)
  if (result.error) {
    return NextResponse.json({ data: null, error: result.error.message }, { status: httpStatusForError(result.error.code) })
  }
  return NextResponse.json({ data: result.data, error: null })
}

// DELETE /api/competitors/shots/[shotId]
export async function DELETE(_req: NextRequest, { params }: { params: { shotId: string } }) {
  const user = await authGuard()
  if (user instanceof NextResponse) return user
  const result = await deleteShot(params.shotId)
  if (result.error) {
    return NextResponse.json({ data: null, error: result.error.message }, { status: httpStatusForError(result.error.code) })
  }
  return NextResponse.json({ data: result.data, error: null })
}
```

- [ ] **Step 5: 类型检查**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep -E "api/competitors" | head`
Expected: 无 `api/competitors` 相关报错。

- [ ] **Step 6: Commit**

```bash
git add "src/app/api/competitors/route.ts" "src/app/api/competitors/[id]/route.ts" "src/app/api/competitors/[id]/shots/route.ts" "src/app/api/competitors/shots/[shotId]/route.ts"
git commit -m "feat(competitors): extend competitor body fields + add shots API routes"
```

---

### Task 8: 三语文案

**Files:**
- Modify: `messages/zh.json`
- Modify: `messages/en.json`
- Modify: `messages/ja.json`

> 三语 `competitors` 命名空间必须 key 完全对齐（`test:i18n` 守卫）。下列 key 为**新增**，另 `subtitle` 为**更新**。合并进各文件对应命名空间，注意合法 JSON 逗号。

- [ ] **Step 1: `messages/zh.json` — 更新 `subtitle` + 追加新 key**

`competitors.subtitle` 改为：`"日区 TikTok 团播竞品：主页指标 + 直播间截图 + 按周粉丝趋势"`
在 `competitors` 内追加：

```json
"weeklyFollowers": "粉丝 · 近4周",
"weeklyDelta": "{pct}%/周",
"weeklyEmpty": "暂无粉丝数据",
"viewAll": "查看全部 {count}",
"collapse": "收起",
"upload": "上传",
"uploadFailed": "上传失败",
"noShots": "还没有截图",
"undated": "未标日期",
"bio": "简介",
"fieldMembers": "人数",
"fieldComposition": "构成",
"fieldLaunch": "开团",
"fieldMc": "MC",
"fieldOnline": "在线",
"fieldLatestVideos": "最新视频",
"openProfile": "打开主页",
"expandProfile": "展开档案"
```

- [ ] **Step 2: `messages/en.json` — 同样更新 + 追加**

`competitors.subtitle`：`"JP TikTok group-live competitors: profile metrics, livestream shots, weekly follower trend"`

```json
"weeklyFollowers": "Followers · last 4 wks",
"weeklyDelta": "{pct}%/wk",
"weeklyEmpty": "No follower data",
"viewAll": "View all {count}",
"collapse": "Collapse",
"upload": "Upload",
"uploadFailed": "Upload failed",
"noShots": "No screenshots yet",
"undated": "Undated",
"bio": "Bio",
"fieldMembers": "Members",
"fieldComposition": "Type",
"fieldLaunch": "Started",
"fieldMc": "MC",
"fieldOnline": "Online",
"fieldLatestVideos": "Latest videos",
"openProfile": "Open profile",
"expandProfile": "Toggle dossier"
```

- [ ] **Step 3: `messages/ja.json` — 同样更新 + 追加**

`competitors.subtitle`：`"日本の TikTok 団体配信の競合：プロフィール指標・配信スクショ・週次フォロワー推移"`

```json
"weeklyFollowers": "フォロワー · 直近4週",
"weeklyDelta": "{pct}%/週",
"weeklyEmpty": "フォロワーデータなし",
"viewAll": "すべて表示 {count}",
"collapse": "折りたたむ",
"upload": "アップロード",
"uploadFailed": "アップロード失敗",
"noShots": "スクショはまだありません",
"undated": "日付なし",
"bio": "プロフィール文",
"fieldMembers": "人数",
"fieldComposition": "構成",
"fieldLaunch": "開始",
"fieldMc": "MC",
"fieldOnline": "オンライン",
"fieldLatestVideos": "最新動画",
"openProfile": "プロフィールを開く",
"expandProfile": "詳細を開閉"
```

- [ ] **Step 4: 运行 i18n 守卫**

Run: `npm run test:i18n`
Expected: PASS（三语 key 对齐、无空值）。

- [ ] **Step 5: Commit**

```bash
git add messages/zh.json messages/en.json messages/ja.json
git commit -m "feat(competitors): add zh/en/ja copy for dossier UI"
```

---

### Task 9: 组件 `WeeklyFollowersCurve`

**Files:**
- Create: `src/components/competitors/WeeklyFollowersCurve.tsx`

- [ ] **Step 1: 写组件**

```tsx
// src/components/competitors/WeeklyFollowersCurve.tsx
'use client'

import { useTranslations } from 'next-intl'
import { buildSparklinePoints } from '@/lib/competitors/chart'
import { formatCount } from '@/lib/competitors/metrics'
import type { WeeklyPoint } from '@/lib/competitors/types'

export default function WeeklyFollowersCurve({ weekly }: { weekly: WeeklyPoint[] }) {
  const t = useTranslations('competitors')
  const recent = weekly.slice(-4)
  const values = recent.map((w) => w.followers)
  const latest = values.length ? values[values.length - 1] : null
  const prev = values.length >= 2 ? values[values.length - 2] : null
  const pct = latest != null && prev != null && prev !== 0
    ? Math.round(((latest - prev) / prev) * 1000) / 10
    : null
  const W = 140
  const H = 64
  const points = buildSparklinePoints(values, W, H)

  return (
    <div className="flex flex-col rounded-md bg-neutral-50 p-2.5 dark:bg-neutral-900">
      <span className="text-[11px] text-neutral-500">{t('weeklyFollowers')}</span>
      <span className="text-base font-medium leading-tight tabular-nums">{formatCount(latest)}</span>
      {pct != null && (
        <span className="text-[11px] text-sky-600 dark:text-sky-400">
          {t('weeklyDelta', { pct: `${pct > 0 ? '+' : ''}${pct.toFixed(1)}` })}
        </span>
      )}
      {points ? (
        <svg
          viewBox={`0 0 ${W} ${H + 6}`}
          className="mt-1.5 w-full text-sky-500"
          preserveAspectRatio="none"
          role="img"
          aria-label={t('weeklyFollowers')}
        >
          <polyline points={points} fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
        </svg>
      ) : (
        <span className="mt-1.5 text-[11px] text-neutral-400">{t('weeklyEmpty')}</span>
      )}
    </div>
  )
}
```

- [ ] **Step 2: 类型检查**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep -c "WeeklyFollowersCurve"`
Expected: `0`。

- [ ] **Step 3: Commit**

```bash
git add src/components/competitors/WeeklyFollowersCurve.tsx
git commit -m "feat(competitors): add weekly followers curve component"
```

---

### Task 10: 组件 `ShotUploader`

**Files:**
- Create: `src/components/competitors/ShotUploader.tsx`

- [ ] **Step 1: 写组件**

```tsx
// src/components/competitors/ShotUploader.tsx
'use client'

import { useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Upload } from 'lucide-react'

export default function ShotUploader({ competitorId, onDone }: { competitorId: string; onDone: () => void }) {
  const t = useTranslations('competitors')
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const onPick = async (file: File) => {
    setBusy(true)
    setError(null)
    try {
      const form = new FormData()
      form.append('file', file)
      const up = await fetch('/api/competitors/upload', { method: 'POST', body: form })
      const upJson = await up.json().catch(() => ({ error: 'parse' }))
      if (!up.ok || upJson.error) { setError(t('uploadFailed')); return }
      const today = new Date().toISOString().slice(0, 10)
      const res = await fetch(`/api/competitors/${competitorId}/shots`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image_url: upJson.data.url, shot_on: today }),
      })
      if (!res.ok) { setError(t('uploadFailed')); return }
      onDone()
    } catch {
      setError(t('uploadFailed'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex h-[132px] w-[74px] shrink-0 flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-neutral-300 text-neutral-400 dark:border-neutral-700">
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={busy}
        className="flex flex-col items-center gap-1 text-[11px] disabled:opacity-50"
      >
        <Upload size={18} />
        {t('upload')}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) onPick(f); e.target.value = '' }}
      />
      {error && <span className="px-1 text-center text-[9px] text-red-600">{error}</span>}
    </div>
  )
}
```

- [ ] **Step 2: 类型检查**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep -c "ShotUploader"`
Expected: `0`。

- [ ] **Step 3: Commit**

```bash
git add src/components/competitors/ShotUploader.tsx
git commit -m "feat(competitors): add screenshot uploader component"
```

---

### Task 11: 组件 `ShotAlbum`（折叠横滑 / 展开按周网格 + lightbox）

**Files:**
- Create: `src/components/competitors/ShotAlbum.tsx`

- [ ] **Step 1: 写组件**

```tsx
// src/components/competitors/ShotAlbum.tsx
'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { weekStartOf } from '@/lib/competitors/weekly'
import ShotUploader from './ShotUploader'
import type { CompetitorShot } from '@/lib/competitors/types'

function Thumb({ shot, onOpen }: { shot: CompetitorShot; onOpen: () => void }) {
  const label = [shot.shot_on, shot.tag].filter(Boolean).join(' · ')
  return (
    <button
      type="button"
      onClick={onOpen}
      className="relative h-[132px] w-[74px] shrink-0 overflow-hidden rounded-lg bg-neutral-100 dark:bg-neutral-800"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={shot.image_url} alt={shot.caption || shot.tag || ''} className="h-full w-full object-cover" loading="lazy" />
      {label && (
        <span className="absolute inset-x-1 bottom-1 truncate rounded bg-black/50 px-1 py-0.5 text-[9px] text-white">{label}</span>
      )}
    </button>
  )
}

export default function ShotAlbum({
  competitorId, shots, canEdit, onChanged,
}: {
  competitorId: string
  shots: CompetitorShot[]
  canEdit: boolean
  onChanged: () => void
}) {
  const t = useTranslations('competitors')
  const [open, setOpen] = useState(false)
  const [lightbox, setLightbox] = useState<string | null>(null)

  if (shots.length === 0 && !canEdit) {
    return <p className="text-xs text-neutral-500">{t('noShots')}</p>
  }

  const folded = shots.slice(0, 6)

  const groups = new Map<string, CompetitorShot[]>()
  for (const s of shots) {
    const key = s.shot_on ? weekStartOf(s.shot_on) : '—'
    const arr = groups.get(key) ?? []
    arr.push(s)
    groups.set(key, arr)
  }
  const weekKeys = Array.from(groups.keys()).sort((a, b) => {
    if (a === '—') return 1
    if (b === '—') return -1
    return b.localeCompare(a)
  })

  return (
    <div className="min-w-0">
      {!open ? (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {folded.map((s) => <Thumb key={s.id} shot={s} onOpen={() => setLightbox(s.image_url)} />)}
          {canEdit && <ShotUploader competitorId={competitorId} onDone={onChanged} />}
        </div>
      ) : (
        <div className="space-y-3">
          {weekKeys.map((wk) => (
            <div key={wk}>
              <div className="mb-1 text-[11px] text-neutral-500">{wk === '—' ? t('undated') : wk}</div>
              <div className="flex flex-wrap gap-2">
                {groups.get(wk)!.map((s) => <Thumb key={s.id} shot={s} onOpen={() => setLightbox(s.image_url)} />)}
              </div>
            </div>
          ))}
          {canEdit && <ShotUploader competitorId={competitorId} onDone={onChanged} />}
        </div>
      )}

      {shots.length > 6 && (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="mt-2 text-xs text-sky-600 hover:underline dark:text-sky-400"
        >
          {open ? t('collapse') : t('viewAll', { count: shots.length })}
        </button>
      )}

      {lightbox && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6"
          onClick={() => setLightbox(null)}
          role="dialog"
          aria-modal="true"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={lightbox} alt="" className="max-h-full max-w-full rounded-lg" />
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: 类型检查**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep -c "ShotAlbum"`
Expected: `0`。

- [ ] **Step 3: Commit**

```bash
git add src/components/competitors/ShotAlbum.tsx
git commit -m "feat(competitors): add shot album (folded strip / weekly grid / lightbox)"
```

---

### Task 12: 组件 `CompetitorCard`（档案条 + 1:3 双栏 + 展开档案）

**Files:**
- Create: `src/components/competitors/CompetitorCard.tsx`

- [ ] **Step 1: 写组件**

```tsx
// src/components/competitors/CompetitorCard.tsx
'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { ChevronDown, ChevronRight, Trash2, BadgeCheck, ExternalLink } from 'lucide-react'
import WeeklyFollowersCurve from './WeeklyFollowersCurve'
import ShotAlbum from './ShotAlbum'
import { formatCount } from '@/lib/competitors/metrics'
import type { CompetitorWithHistory } from '@/lib/competitors/types'

function Field({ label, value }: { label: string; value: string | null }) {
  if (!value) return null
  return (
    <div className="flex gap-2">
      <span className="w-16 shrink-0 text-neutral-500">{label}</span>
      <span className="text-neutral-700 dark:text-neutral-300">{value}</span>
    </div>
  )
}

export default function CompetitorCard({
  c, canEdit, onChanged, onDelete,
}: {
  c: CompetitorWithHistory
  canEdit: boolean
  onChanged: () => void
  onDelete: () => void
}) {
  const t = useTranslations('competitors')
  const [open, setOpen] = useState(false)
  const name = c.latest?.display_name ?? c.display_name ?? c.handle
  const statLine = [
    `${t('colVideos')} ${formatCount(c.latest?.videos ?? null)}`,
    c.composition ?? null,
    c.online_note ? `${t('fieldOnline')} ${c.online_note}` : null,
    c.latest ? t('latestOn', { date: c.latest.captured_on }) : null,
  ].filter(Boolean).join(' · ')

  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-950">
      <div className="mb-3 flex items-center gap-3">
        {c.avatar_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={c.avatar_url} alt="" className="h-10 w-10 rounded-full object-cover" />
        ) : (
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-sky-100 text-xs font-medium text-sky-700 dark:bg-sky-950 dark:text-sky-300">
            {name.slice(0, 2).toUpperCase()}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="truncate font-medium">{name}</span>
            {c.latest?.verified && <BadgeCheck size={15} className="shrink-0 text-sky-500" />}
            <span className="text-xs text-neutral-500">@{c.handle}</span>
            <span className="rounded-full bg-sky-50 px-1.5 py-0.5 text-[11px] text-sky-700 dark:bg-sky-950 dark:text-sky-300">{c.region}</span>
          </div>
          <div className="mt-0.5 truncate text-xs text-neutral-500">{statLine}</div>
        </div>
        <a href={c.profile_url} target="_blank" rel="noreferrer" aria-label={t('openProfile')} className="text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200">
          <ExternalLink size={16} />
        </a>
        <button onClick={() => setOpen((v) => !v)} aria-label={t('expandProfile')} className="text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200">
          {open ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
        </button>
        {canEdit && (
          <button onClick={onDelete} aria-label={t('delete')} className="text-neutral-400 hover:text-red-600">
            <Trash2 size={16} />
          </button>
        )}
      </div>

      <div className="grid grid-cols-[1fr_3fr] gap-3 max-md:grid-cols-1">
        <WeeklyFollowersCurve weekly={c.weekly} />
        <ShotAlbum competitorId={c.id} shots={c.shots} canEdit={canEdit} onChanged={onChanged} />
      </div>

      {open && (
        <div className="mt-3 space-y-2 border-t border-neutral-100 pt-3 text-xs dark:border-neutral-800">
          <Field label={t('fieldMembers')} value={c.member_count != null ? String(c.member_count) : null} />
          <Field label={t('fieldComposition')} value={c.composition} />
          <Field label={t('fieldLaunch')} value={[c.launch_city, c.launched_on].filter(Boolean).join(' · ') || null} />
          <Field label={t('fieldMc')} value={c.mc_note} />
          <Field label={t('fieldOnline')} value={c.online_note} />
          <Field label={t('region')} value={c.latest?.region ?? null} />
          <Field label={t('bio')} value={c.latest?.bio ?? null} />
          {c.latest_videos?.length ? (
            <div className="flex flex-wrap gap-2 text-sky-600 dark:text-sky-400">
              <span className="text-neutral-500">{t('fieldLatestVideos')}:</span>
              {c.latest_videos.map((v, i) => (
                <a key={i} href={v.url} target="_blank" rel="noreferrer" className="hover:underline">#{i + 1}</a>
              ))}
            </div>
          ) : null}

          {c.history.length > 0 && (
            <table className="mt-2 w-full max-w-xl text-xs" aria-label={t('history')}>
              <caption className="mb-1 text-left font-medium text-neutral-500">{t('history')}</caption>
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
    </div>
  )
}
```

- [ ] **Step 2: 类型检查**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep -c "CompetitorCard"`
Expected: `0`。

- [ ] **Step 3: Commit**

```bash
git add src/components/competitors/CompetitorCard.tsx
git commit -m "feat(competitors): add competitor card (profile bar + 1:3 body + dossier)"
```

---

### Task 13: 主视图 `CompetitorDossierView` + 接页面 + 删旧视图

**Files:**
- Create: `src/components/competitors/CompetitorDossierView.tsx`
- Modify: `src/app/[locale]/(app)/competitors/page.tsx`
- Delete: `src/components/competitors/CompetitorMonitoringView.tsx`

- [ ] **Step 1: 写主视图**

```tsx
// src/components/competitors/CompetitorDossierView.tsx
'use client'

import { useCallback, useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { Plus } from 'lucide-react'
import CompetitorCard from './CompetitorCard'
import type { CompetitorBoard } from '@/lib/competitors/types'

export default function CompetitorDossierView({ initial }: { initial: CompetitorBoard }) {
  const t = useTranslations('competitors')
  const [board, setBoard] = useState<CompetitorBoard>(initial)
  const [input, setInput] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/competitors', { cache: 'no-store' })
      if (!res.ok) throw new Error('load failed')
      const json = await res.json()
      if (json.data) setBoard(json.data as CompetitorBoard)
    } catch {
      setError(t('actionFailed'))
    }
  }, [t])

  const add = useCallback(() => {
    const value = input.trim()
    if (!value) return
    setError(null)
    startTransition(async () => {
      try {
        const res = await fetch('/api/competitors', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: value }),
        })
        const json = await res.json().catch(() => ({ error: 'parse' }))
        if (!res.ok || json.error) { setError(t('addFailed')); return }
        setInput('')
        await refresh()
      } catch {
        setError(t('addFailed'))
      }
    })
  }, [input, refresh, t])

  const remove = useCallback((id: string) => {
    if (!confirm(t('deleteConfirm'))) return
    setError(null)
    startTransition(async () => {
      try {
        const res = await fetch(`/api/competitors/${id}`, { method: 'DELETE' })
        if (!res.ok) { setError(t('actionFailed')); return }
        await refresh()
      } catch {
        setError(t('actionFailed'))
      }
    })
  }, [refresh, t])

  return (
    <div className="space-y-4">
      {board.canEdit && (
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
      )}
      {error && <p className="text-sm text-red-600">{error}</p>}

      {board.competitors.length === 0 ? (
        <p className="text-sm text-neutral-500">{t('empty')}</p>
      ) : (
        <div className="space-y-3">
          {board.competitors.map((c) => (
            <CompetitorCard key={c.id} c={c} canEdit={board.canEdit} onChanged={refresh} onDelete={() => remove(c.id)} />
          ))}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: 改 `page.tsx` 引用新视图**

在 `src/app/[locale]/(app)/competitors/page.tsx` 中把
`import CompetitorMonitoringView from '@/components/competitors/CompetitorMonitoringView'`
改为
`import CompetitorDossierView from '@/components/competitors/CompetitorDossierView'`
并把 JSX 里 `<CompetitorMonitoringView initial={board} />` 改为 `<CompetitorDossierView initial={board} />`。

- [ ] **Step 3: 删除旧视图**

```bash
git rm src/components/competitors/CompetitorMonitoringView.tsx
```

- [ ] **Step 4: 类型检查 + 无裸中文守卫**

Run: `npx tsc --noEmit -p tsconfig.json && npm run test:no-bare-han`
Expected: 无类型报错；`test:no-bare-han` PASS（所有中文经 `t()`，无裸中文）。

- [ ] **Step 5: Commit**

```bash
git add "src/app/[locale]/(app)/competitors/page.tsx" src/components/competitors/CompetitorDossierView.tsx
git commit -m "feat(competitors): screenshot-first dossier view, replace monitoring view"
```

---

### Task 14: 更新模块文档 `docs/competitors.md`

**Files:**
- Modify: `docs/competitors.md`

- [ ] **Step 1: 更新文档要点**

在 `docs/competitors.md` 落实以下改动（保持原有结构，改写相关小节）：
- 模块定位（第 1 节）：从「主页指标监测」升级为「主页指标 + 团播档案」；补一句：支持手动上传直播间截图（按团归档、按周分组）、Lark 团级字段（人数构成 / 开团 / MC / 在线观察 / 最新视频）、按周粉丝曲线。
- 写权限（第 3.4 / 7 节）：由「仅管理员」改为「**所有登录用户可增删改**」。
- 数据模型（第 5 节）：补 `competitor_shots` 表与 `competitors` 新增列；新增 migration `043_competitor_dossier.sql`；补 `weekly.ts`（按周聚合）与新组件（`CompetitorDossierView` / `CompetitorCard` / `ShotAlbum` / `ShotUploader` / `WeeklyFollowersCurve`）、API（`/upload`、`/[id]/shots`、`/shots/[shotId]`）。
- 边界（第 7 节）：明确「截图为人工归档、非直播间实时数据」；「一周妆造网格」列为后续方向（第 8 节）。

- [ ] **Step 2: Commit**

```bash
git add docs/competitors.md
git commit -m "docs(competitors): update for dossier extension (shots, team fields, weekly curve, open writes)"
```

---

### Task 15: 接入测试清单 + 全量校验

**Files:**
- Modify: `package.json`

- [ ] **Step 1: 把 `weekly.test.ts` 追加到 `"test"` 脚本末尾**

在 `package.json` 的 `"test": "node --test --experimental-strip-types ... src/lib/competitors/assemble.test.ts"` 结尾追加（同一行，空格分隔）：

```
src/lib/competitors/weekly.test.ts
```

- [ ] **Step 2: 运行全量单测**

Run: `npm test`
Expected: PASS（含新增 `weekly.test.ts`、改写后的 `assemble.test.ts`，无失败）。

- [ ] **Step 3: 文案守卫**

Run: `npm run test:copy`
Expected: PASS（`test:i18n` 三语对齐 + `test:no-bare-han` 无裸中文）。

- [ ] **Step 4: Lint + 构建**

Run: `npm run lint && npm run build`
Expected: lint 无 error；`next build` 成功（`/[locale]/competitors` 与 `/api/competitors/**` 路由编译通过）。

- [ ] **Step 5: Commit**

```bash
git add package.json
git commit -m "test(competitors): wire weekly.test.ts into test script"
```

---

### Task 16: 浏览器验证（dev server）

**Files:** 无（仅验证）

> 前置：在 Supabase 建 public bucket `competitor-shots`；迁移 `043` 已同步到目标库；用管理员或普通账号登录均可（写权限已放开）。

- [ ] **Step 1: 起 dev 并访问**

用 preview 工具起 dev（`.claude/launch.json` 的 dev 配置或 `npm run dev`），登录后访问 `/zh/competitors`：
- 空态显示 `empty` 文案；任意登录用户都能看到添加框（不再有 `readOnly`）。
- 粘贴一个 `@handle` 添加 → 出现团卡（暂无快照 → 曲线显示 `weeklyEmpty`，截图墙只有「上传」格）。
- 传 1~2 张截图 → 右栏截图墙出现缩略图（角标日期）；点图 → lightbox 放大。
- 造 ≥2 周的快照（跑 `scripts/record-competitor-snapshot.ts` 或手工插数据）→ 刷新后左栏出现按周粉丝曲线 + 环比。
- 点 `⌄` 展开 → 团级字段 + 保留的每日历史打点表可见。
- 超过 6 张截图 → 出现「查看全部」→ 展开为按周分组网格。

- [ ] **Step 2: 检查控制台/网络无错误**

用 `read_console_messages` / `read_network_requests` 确认 `/api/competitors`、`/api/competitors/upload`、`/api/competitors/[id]/shots` 返回 2xx，无报错。截图留证。

---

## Self-Review

**Spec coverage（对照设计文档各节）：**
- §3.1 迁移（扩 competitors + competitor_shots + RLS）→ Task 1 ✅
- §3.2 Storage 桶 + 上传路由 → Task 2 ✅
- §4.1 types → Task 3 ✅；§4.2 weekly.ts → Task 4 ✅；§4.3 assemble → Task 5 ✅；§4.4 service（放权限/加载/扩字段/截图 CRUD）→ Task 6 ✅
- §5 API（扩 body + 截图路由）→ Task 7 ✅
- §6 视图（WeeklyFollowersCurve/ShotUploader/ShotAlbum/CompetitorCard/DossierView，1:3 双栏、混合浏览、lightbox、展开档案保留日历史表）→ Task 9–13 ✅
- 三语文案 → Task 8 ✅
- §9 文档更新 → Task 14 ✅
- §8 测试接入 + 全量校验 → Task 15；浏览器验证 → Task 16 ✅
- 写权限放开、迁移编号 043 冲突提示 → Task 1/6 已标注 ✅

**Placeholder scan**：无 TODO/TBD；每个代码步骤含完整可运行代码；Task 14 为文档改写（给出逐节要点，非代码步骤）。

**Type consistency**：`assembleBoard(competitors, snapshots, shots, canEdit)` 四参签名在 Task 5 定义、Task 6 调用一致；`CompetitorFields` / `ShotInput` 在 service（Task 6）定义、routes（Task 7）引用一致；`WeeklyPoint{week_start,followers}` 在 types（Task 3）、weekly（Task 4）、assemble（Task 5）、WeeklyFollowersCurve（Task 9）一致；`weekStartOf` 在 weekly（Task 4）定义、ShotAlbum（Task 11）复用；组件属性 `onChanged` / `onDone` / `onDelete` 在 Card/Album/Uploader/DossierView 间一致。

**非目标符合**：无实时直播采集、无定时跑数、无成员级建档、无「一周妆造」网格（仅备好带 `shot_on` 的截图数据）。
