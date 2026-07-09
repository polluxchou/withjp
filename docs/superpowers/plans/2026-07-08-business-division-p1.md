# 业务分工（P1）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 建一套"公司 → 业务 → 任务 → 事项"WBS 组织结构 + 岗位（角色）维度，并提供 `/team/org`「业务分工」页查看与编辑。

**Architecture:** 全新的 6 张表（岗位/岗位成员/业务/任务/任务-岗位/事项）落在 Supabase Postgres，seed 初始数据。后端分三层：纯函数（建树/校验，`node:test` 单测）→ service（DB 读写 + 管理员写权限，`ServiceResult<T>` 约定）→ API 路由（`authGuard` + `httpStatusForError`）。前端为服务端页面拉整棵树只读渲染 + 客户端岛做编辑。现有 AI 代理 `tasks`、真人 `work_tasks` 均不动。

**Tech Stack:** Next.js 14 App Router、Supabase（service-role server client）、next-intl、TypeScript、`node:test` + `node:assert/strict`、Tailwind。

---

## 命名与约定（全程遵守）

- 人引用（PersonRef）统一形态：`member_type: 'user' | 'creator'` + `user_id` **或** `creator_id`（二选一，另一个为 null）。
- 表名：`positions`、`position_members`、`businesses`、`business_tasks`、`business_task_positions`、`task_items`。
- API 前缀统一 `/api/org/*`（避开现有 `/api/tasks` 之类）。
- 用户表是 `users`（不是 `user_profiles`）；主播表是 `creators`。
- Service 返回 `ServiceResult<T>`（见 `src/lib/venue/service.ts` 里的 `ok`/`err`/`httpStatusForError` 形态，本计划在 `src/lib/org/service.ts` 内自带一份同款）。
- 写操作（改 owner、增删任务/事项/岗位成员、改任务岗位集合）**仅管理员**（`users.is_admin`）；读对所有登录用户开放。

## File Structure

- Create `supabase/migrations/041_org_structure.sql` — 6 表 + RLS + seed。
- Modify `src/lib/types/index.ts` — 新增 org 相关类型。
- Create `src/lib/org/tree.ts` + `src/lib/org/tree.test.ts` — 纯函数（建树 / PersonRef 校验）。
- Create `src/lib/org/service.ts` — DB 读写 + 权限。
- Create API 路由（`src/app/api/org/**`）：
  - `route.ts`（GET 整棵树 + 岗位&成员 + 候选人）
  - `businesses/[id]/route.ts`（PATCH owner）
  - `businesses/[id]/tasks/route.ts`（POST task）
  - `tasks/[id]/route.ts`（PATCH / DELETE task）
  - `tasks/[id]/positions/route.ts`（PUT 岗位集合）
  - `tasks/[id]/items/route.ts`（POST item）
  - `items/[id]/route.ts`（PATCH / DELETE item）
  - `positions/[id]/members/route.ts`（POST member）
  - `positions/[id]/members/[memberId]/route.ts`（DELETE member）
- Create `src/app/[locale]/(app)/team/org/page.tsx` — 服务端页面。
- Create `src/components/org/OrgView.tsx`（客户端树 + 编辑岛）。
- Modify `src/components/layout/Sidebar.tsx` — 团队分组加「业务分工」子项。
- Modify `messages/{zh,en,ja}.json` — i18n。
- Modify `package.json` — 把 `src/lib/org/tree.test.ts` 加进 test 脚本。
- Modify `src/lib/changelog/entries.ts` — 更新日志。

---

## Task 1: 数据库迁移（6 表 + RLS + seed）

**Files:**
- Create: `supabase/migrations/041_org_structure.sql`

- [ ] **Step 1: 写迁移 SQL**

```sql
-- ============================================================
-- Migration 041: 组织结构（业务分工）
-- 公司 → 业务 → 任务 → 事项 四层 WBS + 岗位(角色)正交维度。
-- 业务/事项 各 1 个唯一负责人(人)；任务关联多个岗位；岗位挂成员(人)。
-- 人 = users(内部员工) 或 creators(主播)，二选一。
-- ============================================================

-- 1) 岗位（固定枚举）
create table if not exists positions (
  id          uuid primary key default gen_random_uuid(),
  key         text not null unique,
  name        text not null,
  description text not null default '',
  sort_order  int  not null default 0,
  created_at  timestamptz not null default now()
);

-- 2) 岗位成员（配人）
create table if not exists position_members (
  id          uuid primary key default gen_random_uuid(),
  position_id uuid not null references positions(id) on delete cascade,
  member_type text not null check (member_type in ('user','creator')),
  user_id     uuid references users(id)    on delete cascade,
  creator_id  uuid references creators(id) on delete cascade,
  created_at  timestamptz not null default now(),
  -- 二选一：user 型必须只有 user_id；creator 型必须只有 creator_id
  constraint position_members_ref_ck check (
    (member_type = 'user'    and user_id is not null and creator_id is null) or
    (member_type = 'creator' and creator_id is not null and user_id is null)
  )
);
create unique index if not exists uq_position_members_user
  on position_members(position_id, user_id) where user_id is not null;
create unique index if not exists uq_position_members_creator
  on position_members(position_id, creator_id) where creator_id is not null;

-- 3) 业务（固定枚举，唯一负责人）
create table if not exists businesses (
  id                uuid primary key default gen_random_uuid(),
  key               text not null unique,
  name              text not null,
  sort_order        int  not null default 0,
  owner_member_type text check (owner_member_type in ('user','creator')),
  owner_user_id     uuid references users(id)    on delete set null,
  owner_creator_id  uuid references creators(id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint businesses_owner_ck check (
    owner_member_type is null
    or (owner_member_type = 'user'    and owner_user_id is not null and owner_creator_id is null)
    or (owner_member_type = 'creator' and owner_creator_id is not null and owner_user_id is null)
  )
);

-- 4) 任务（属于业务）
create table if not exists business_tasks (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  name        text not null,
  sort_order  int  not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists idx_business_tasks_business on business_tasks(business_id);

-- 5) 任务 ↔ 岗位（多对多）
create table if not exists business_task_positions (
  id          uuid primary key default gen_random_uuid(),
  task_id     uuid not null references business_tasks(id) on delete cascade,
  position_id uuid not null references positions(id)      on delete cascade,
  created_at  timestamptz not null default now(),
  unique (task_id, position_id)
);
create index if not exists idx_btp_task on business_task_positions(task_id);

-- 6) 事项（最小单位，属于任务，唯一负责人）
create table if not exists task_items (
  id                uuid primary key default gen_random_uuid(),
  task_id           uuid not null references business_tasks(id) on delete cascade,
  name              text not null,
  sort_order        int  not null default 0,
  owner_member_type text check (owner_member_type in ('user','creator')),
  owner_user_id     uuid references users(id)    on delete set null,
  owner_creator_id  uuid references creators(id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint task_items_owner_ck check (
    owner_member_type is null
    or (owner_member_type = 'user'    and owner_user_id is not null and owner_creator_id is null)
    or (owner_member_type = 'creator' and owner_creator_id is not null and owner_user_id is null)
  )
);
create index if not exists idx_task_items_task on task_items(task_id);

-- RLS：登录用户可读写（写权限在 service 层按 is_admin 再收紧），沿用 authenticated_only 约定。
do $$
declare t text;
  tables text[] := array[
    'positions','position_members','businesses',
    'business_tasks','business_task_positions','task_items'
  ];
begin
  foreach t in array tables loop
    execute format('alter table %I enable row level security', t);
    if not exists (
      select 1 from pg_policies where schemaname='public' and tablename=t and policyname='authenticated_only'
    ) then
      execute format(
        'create policy "authenticated_only" on %I for all to authenticated using (auth.uid() is not null)', t
      );
    end if;
  end loop;
end $$;

-- ── Seed：10 岗位 ──
insert into positions (key, name, description, sort_order) values
  ('streamer',     '主播',       '团播成员（出镜）',          1),
  ('mc',           '主持人',     '团播现场调度',              2),
  ('agent',        '主播经纪人', '招募、管理、汰换主播',      3),
  ('group_ops',    '团播运营',   '团播现场运营、调度、策划',  4),
  ('makeup',       '化妆师',     '团播主播造型',              5),
  ('dance_coach',  '舞蹈培训师', '舞蹈培训',                  6),
  ('video_editor', '短视频剪辑', '短视频剪辑',                7),
  ('photographer', '摄影师',     '摄影',                      8),
  ('guild_leader', '公会长',     '公会负责人',                9),
  ('finance_tax',  '财税师',     '财务 / 税务',              10)
on conflict (key) do nothing;

-- ── Seed：4 业务 ──
insert into businesses (key, name, sort_order) values
  ('live_ops',     '直播运营', 1),
  ('streamer_ops', '主播运营', 2),
  ('company_mgmt', '公司管理', 3),
  ('offline_ops',  '线下运营', 4)
on conflict (key) do nothing;

-- ── Seed：11 任务 + 任务↔岗位 ──
do $$
declare
  b_live  uuid; b_str uuid; b_com uuid; b_off uuid;
  t_id    uuid;
begin
  select id into b_live from businesses where key='live_ops';
  select id into b_str  from businesses where key='streamer_ops';
  select id into b_com  from businesses where key='company_mgmt';
  select id into b_off  from businesses where key='offline_ops';

  -- helper inline: 建任务并挂岗位
  -- 直播运营
  insert into business_tasks (business_id,name,sort_order) values (b_live,'团播执行',1) returning id into t_id;
  insert into business_task_positions (task_id,position_id)
    select t_id, id from positions where key in ('streamer','mc','photographer');

  insert into business_tasks (business_id,name,sort_order) values (b_live,'团播策划',2) returning id into t_id;
  insert into business_task_positions (task_id,position_id)
    select t_id, id from positions where key in ('dance_coach','makeup');

  insert into business_tasks (business_id,name,sort_order) values (b_live,'社群管理',3) returning id into t_id;
  insert into business_task_positions (task_id,position_id)
    select t_id, id from positions where key in ('group_ops');

  -- 主播运营
  insert into business_tasks (business_id,name,sort_order) values (b_str,'短视频运营',1) returning id into t_id;
  insert into business_task_positions (task_id,position_id)
    select t_id, id from positions where key in ('group_ops');

  insert into business_tasks (business_id,name,sort_order) values (b_str,'主播招募',2) returning id into t_id;
  insert into business_task_positions (task_id,position_id)
    select t_id, id from positions where key in ('agent');

  insert into business_tasks (business_id,name,sort_order) values (b_str,'主播培训',3) returning id into t_id;
  insert into business_task_positions (task_id,position_id)
    select t_id, id from positions where key in ('guild_leader','dance_coach','mc');

  -- 公司管理
  insert into business_tasks (business_id,name,sort_order) values (b_com,'场地管理',1) returning id into t_id;
  insert into business_task_positions (task_id,position_id)
    select t_id, id from positions where key in ('guild_leader');

  insert into business_tasks (business_id,name,sort_order) values (b_com,'薪资管理',2) returning id into t_id;
  insert into business_task_positions (task_id,position_id)
    select t_id, id from positions where key in ('guild_leader');

  insert into business_tasks (business_id,name,sort_order) values (b_com,'税务管理',3) returning id into t_id;
  insert into business_task_positions (task_id,position_id)
    select t_id, id from positions where key in ('finance_tax');

  -- 线下运营
  insert into business_tasks (business_id,name,sort_order) values (b_off,'商单合作',1) returning id into t_id;
  insert into business_task_positions (task_id,position_id)
    select t_id, id from positions where key in ('guild_leader');
end $$;
```

- [ ] **Step 2: 语法自检（本地无 DB 时靠肉眼 + psql dry-run 可选）**

Run: `grep -c "create table if not exists" supabase/migrations/041_org_structure.sql`
Expected: `6`

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/041_org_structure.sql
git commit -m "feat(org): 041 迁移 — 业务分工 6 表 + RLS + seed"
```

---

## Task 2: TypeScript 类型

**Files:**
- Modify: `src/lib/types/index.ts`（在文件末尾追加 org 段）

- [ ] **Step 1: 追加类型**

在 `src/lib/types/index.ts` 末尾追加：

```typescript
// ── Org Structure (业务分工) ──────────────────────────────

export type MemberType = 'user' | 'creator'

// 统一"人引用"：二选一
export interface PersonRef {
  member_type: MemberType
  user_id: string | null
  creator_id: string | null
}

export interface Position {
  id: string
  key: string
  name: string
  description: string
  sort_order: number
}

export interface PositionMember extends PersonRef {
  id: string
  position_id: string
  // joined 展示名（service 拼装）
  display_name?: string
}

export interface TaskItem {
  id: string
  task_id: string
  name: string
  sort_order: number
  owner_member_type: MemberType | null
  owner_user_id: string | null
  owner_creator_id: string | null
  owner_name?: string | null   // joined
}

export interface BusinessTask {
  id: string
  business_id: string
  name: string
  sort_order: number
  position_ids: string[]       // 关联岗位（service 拼装）
  items: TaskItem[]            // 事项（service 拼装）
}

export interface Business {
  id: string
  key: string
  name: string
  sort_order: number
  owner_member_type: MemberType | null
  owner_user_id: string | null
  owner_creator_id: string | null
  owner_name?: string | null   // joined
  tasks: BusinessTask[]        // service 拼装
}

// 选人候选：员工 + 主播
export interface PersonOption {
  member_type: MemberType
  id: string        // user_id 或 creator_id
  name: string
}

// GET /api/org 的整包返回
export interface OrgSnapshot {
  businesses: Business[]
  positions: (Position & { members: PositionMember[] })[]
  people: PersonOption[]       // 候选人（选负责人/配岗位成员用）
  canEdit: boolean
}
```

- [ ] **Step 2: 类型检查**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: 无报错

- [ ] **Step 3: Commit**

```bash
git add src/lib/types/index.ts
git commit -m "feat(org): 业务分工相关 TS 类型"
```

---

## Task 3: 纯函数（建树 + PersonRef 校验）— TDD

**Files:**
- Create: `src/lib/org/tree.ts`
- Test: `src/lib/org/tree.test.ts`
- Modify: `package.json`（test 脚本追加该测试文件）

- [ ] **Step 1: 写失败测试**

Create `src/lib/org/tree.test.ts`:

```typescript
import assert from 'node:assert/strict'
import test from 'node:test'

import { validatePersonRef, ownerNameOf, sortByOrder } from './tree.ts'
import type { PersonOption } from '../types/index.ts'

const people: PersonOption[] = [
  { member_type: 'user',    id: 'u1', name: '张三' },
  { member_type: 'creator', id: 'c1', name: '主播A' },
]

test('validatePersonRef: user 型必须只有 user_id', () => {
  assert.equal(validatePersonRef({ member_type: 'user', user_id: 'u1', creator_id: null }), true)
  assert.equal(validatePersonRef({ member_type: 'user', user_id: null, creator_id: null }), false)
  assert.equal(validatePersonRef({ member_type: 'user', user_id: 'u1', creator_id: 'c1' }), false)
})

test('validatePersonRef: creator 型必须只有 creator_id', () => {
  assert.equal(validatePersonRef({ member_type: 'creator', user_id: null, creator_id: 'c1' }), true)
  assert.equal(validatePersonRef({ member_type: 'creator', user_id: 'u1', creator_id: null }), false)
})

test('ownerNameOf: 按 member_type 从候选人里查名字，查不到返回 null', () => {
  assert.equal(ownerNameOf({ member_type: 'user', user_id: 'u1', creator_id: null }, people), '张三')
  assert.equal(ownerNameOf({ member_type: 'creator', user_id: null, creator_id: 'c1' }, people), '主播A')
  assert.equal(ownerNameOf({ member_type: 'user', user_id: 'uX', creator_id: null }, people), null)
  assert.equal(ownerNameOf({ member_type: 'user', user_id: null, creator_id: null }, people), null)
})

test('sortByOrder: 按 sort_order 升序（稳定）', () => {
  const input = [{ sort_order: 2, name: 'b' }, { sort_order: 1, name: 'a' }, { sort_order: 2, name: 'c' }]
  assert.deepEqual(sortByOrder(input).map((x) => x.name), ['a', 'b', 'c'])
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `node --test --experimental-strip-types src/lib/org/tree.test.ts`
Expected: FAIL（`Cannot find module './tree.ts'` 或函数未定义）

- [ ] **Step 3: 实现纯函数**

Create `src/lib/org/tree.ts`:

```typescript
import type { MemberType, PersonOption } from '../types/index.ts'

interface RefLike {
  member_type: MemberType | null
  user_id: string | null
  creator_id: string | null
}

// 二选一校验：user→只有 user_id；creator→只有 creator_id
export function validatePersonRef(ref: RefLike): boolean {
  if (ref.member_type === 'user')    return !!ref.user_id && !ref.creator_id
  if (ref.member_type === 'creator') return !!ref.creator_id && !ref.user_id
  return false
}

// 从候选人里解析 owner 显示名；无 owner 或查不到 → null
export function ownerNameOf(ref: RefLike, people: PersonOption[]): string | null {
  if (ref.member_type === 'user' && ref.user_id) {
    return people.find((p) => p.member_type === 'user' && p.id === ref.user_id)?.name ?? null
  }
  if (ref.member_type === 'creator' && ref.creator_id) {
    return people.find((p) => p.member_type === 'creator' && p.id === ref.creator_id)?.name ?? null
  }
  return null
}

// 升序稳定排序（不改原数组）
export function sortByOrder<T extends { sort_order: number }>(rows: T[]): T[] {
  return rows
    .map((row, i) => ({ row, i }))
    .sort((a, b) => a.row.sort_order - b.row.sort_order || a.i - b.i)
    .map(({ row }) => row)
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `node --test --experimental-strip-types src/lib/org/tree.test.ts`
Expected: PASS（4 tests）

- [ ] **Step 5: 把测试文件加入 package.json 的 test 脚本**

Modify `package.json` 的 `"test"`：在末尾（`src/lib/venue/translate.test.ts` 后）追加 ` src/lib/org/tree.test.ts`（注意前面有空格，仍是同一行字符串）。

- [ ] **Step 6: Commit**

```bash
git add src/lib/org/tree.ts src/lib/org/tree.test.ts package.json
git commit -m "feat(org): 建树/PersonRef 校验纯函数 + 单测"
```

---

## Task 4: Service 层（DB 读写 + 权限）

**Files:**
- Create: `src/lib/org/service.ts`

- [ ] **Step 1: 写 service（读整棵树 + 各写操作）**

Create `src/lib/org/service.ts`:

```typescript
import { createServerClient } from '@/lib/supabase/server'
import { ownerNameOf, sortByOrder, validatePersonRef } from './tree'
import type {
  Business, BusinessTask, MemberType, OrgSnapshot, PersonOption,
  Position, PositionMember, TaskItem,
} from '@/lib/types'

export type ServiceErrorCode = 'invalid_input' | 'forbidden' | 'not_found' | 'db_error'
export interface ServiceError { code: ServiceErrorCode; message: string }
export type ServiceResult<T> = { data: T; error: null } | { data: null; error: ServiceError }

const ok = <T,>(data: T): ServiceResult<T> => ({ data, error: null })
const err = <T = never,>(code: ServiceErrorCode, message: string): ServiceResult<T> =>
  ({ data: null, error: { code, message } })

export function httpStatusForError(code: ServiceErrorCode): number {
  switch (code) {
    case 'invalid_input': return 400
    case 'forbidden':     return 403
    case 'not_found':     return 404
    case 'db_error':      return 500
  }
}

type DB = ReturnType<typeof createServerClient>

async function isAdminUser(db: DB, userId: string): Promise<boolean> {
  const { data } = await db.from('users').select('is_admin').eq('id', userId).maybeSingle()
  return !!data?.is_admin
}

async function requireAdmin(userId: string): Promise<ServiceError | null> {
  const db = createServerClient()
  return (await isAdminUser(db, userId)) ? null : { code: 'forbidden', message: 'admin only' }
}

// 候选人：内部员工 + 主播
async function loadPeople(db: DB): Promise<PersonOption[]> {
  const [{ data: users }, { data: creators }] = await Promise.all([
    db.from('users').select('id, name').order('name'),
    db.from('creators').select('id, name').order('name'),
  ])
  return [
    ...(users ?? []).map((u): PersonOption => ({ member_type: 'user', id: u.id as string, name: (u.name as string) ?? '' })),
    ...(creators ?? []).map((c): PersonOption => ({ member_type: 'creator', id: c.id as string, name: (c.name as string) ?? '' })),
  ]
}

// GET 整棵树
export async function getOrgSnapshot(userId: string): Promise<ServiceResult<OrgSnapshot>> {
  const db = createServerClient()
  const [
    bizRes, taskRes, btpRes, itemRes, posRes, memRes,
  ] = await Promise.all([
    db.from('businesses').select('*'),
    db.from('business_tasks').select('*'),
    db.from('business_task_positions').select('task_id, position_id'),
    db.from('task_items').select('*'),
    db.from('positions').select('*'),
    db.from('position_members').select('*'),
  ])
  if (bizRes.error || taskRes.error || btpRes.error || itemRes.error || posRes.error || memRes.error) {
    return err('db_error', 'failed to load org')
  }

  const people = await loadPeople(db)
  const canEdit = await isAdminUser(db, userId)

  const positionsRows = sortByOrder((posRes.data ?? []) as Position[])
  const members = (memRes.data ?? []) as PositionMember[]
  const positions = positionsRows.map((p) => ({
    ...p,
    members: members
      .filter((m) => m.position_id === p.id)
      .map((m) => ({ ...m, display_name: ownerNameOf(m, people) ?? '' })),
  }))

  const btp = (btpRes.data ?? []) as { task_id: string; position_id: string }[]
  const items = (itemRes.data ?? []) as TaskItem[]
  const tasksRaw = (taskRes.data ?? []) as Omit<BusinessTask, 'position_ids' | 'items'>[]

  const tasks: BusinessTask[] = sortByOrder(tasksRaw as unknown as (BusinessTask & { sort_order: number })[]).map((t) => ({
    id: t.id, business_id: t.business_id, name: t.name, sort_order: t.sort_order,
    position_ids: btp.filter((x) => x.task_id === t.id).map((x) => x.position_id),
    items: sortByOrder(items.filter((it) => it.task_id === t.id))
      .map((it) => ({ ...it, owner_name: ownerNameOf(it, people) })),
  }))

  const businesses: Business[] = sortByOrder((bizRes.data ?? []) as Business[]).map((b) => ({
    ...b,
    owner_name: ownerNameOf(b, people),
    tasks: tasks.filter((t) => t.business_id === b.id),
  }))

  return ok({ businesses, positions, people, canEdit })
}

// 业务：设/清 owner（唯一）
export async function setBusinessOwner(
  userId: string, businessId: string,
  owner: { member_type: MemberType; user_id: string | null; creator_id: string | null } | null,
): Promise<ServiceResult<{ id: string }>> {
  const forbidden = await requireAdmin(userId); if (forbidden) return { data: null, error: forbidden }
  if (owner && !validatePersonRef(owner)) return err('invalid_input', 'bad person ref')
  const db = createServerClient()
  const patch = owner
    ? { owner_member_type: owner.member_type, owner_user_id: owner.user_id, owner_creator_id: owner.creator_id, updated_at: new Date().toISOString() }
    : { owner_member_type: null, owner_user_id: null, owner_creator_id: null, updated_at: new Date().toISOString() }
  const { error } = await db.from('businesses').update(patch).eq('id', businessId)
  return error ? err('db_error', error.message) : ok({ id: businessId })
}

// 任务：增
export async function createTask(userId: string, businessId: string, name: string): Promise<ServiceResult<{ id: string }>> {
  const forbidden = await requireAdmin(userId); if (forbidden) return { data: null, error: forbidden }
  if (!name.trim()) return err('invalid_input', 'name required')
  const db = createServerClient()
  const { data: maxRow } = await db.from('business_tasks').select('sort_order').eq('business_id', businessId).order('sort_order', { ascending: false }).limit(1).maybeSingle()
  const nextOrder = ((maxRow?.sort_order as number) ?? 0) + 1
  const { data, error } = await db.from('business_tasks').insert({ business_id: businessId, name: name.trim(), sort_order: nextOrder }).select('id').single()
  return error ? err('db_error', error.message) : ok({ id: data!.id as string })
}

// 任务：改名
export async function renameTask(userId: string, taskId: string, name: string): Promise<ServiceResult<{ id: string }>> {
  const forbidden = await requireAdmin(userId); if (forbidden) return { data: null, error: forbidden }
  if (!name.trim()) return err('invalid_input', 'name required')
  const db = createServerClient()
  const { error } = await db.from('business_tasks').update({ name: name.trim(), updated_at: new Date().toISOString() }).eq('id', taskId)
  return error ? err('db_error', error.message) : ok({ id: taskId })
}

// 任务：删
export async function deleteTask(userId: string, taskId: string): Promise<ServiceResult<{ id: string }>> {
  const forbidden = await requireAdmin(userId); if (forbidden) return { data: null, error: forbidden }
  const db = createServerClient()
  const { error } = await db.from('business_tasks').delete().eq('id', taskId)
  return error ? err('db_error', error.message) : ok({ id: taskId })
}

// 任务：整体覆盖岗位集合
export async function setTaskPositions(userId: string, taskId: string, positionIds: string[]): Promise<ServiceResult<{ id: string }>> {
  const forbidden = await requireAdmin(userId); if (forbidden) return { data: null, error: forbidden }
  const db = createServerClient()
  const { error: delErr } = await db.from('business_task_positions').delete().eq('task_id', taskId)
  if (delErr) return err('db_error', delErr.message)
  const unique = Array.from(new Set(positionIds))
  if (unique.length > 0) {
    const rows = unique.map((position_id) => ({ task_id: taskId, position_id }))
    const { error } = await db.from('business_task_positions').insert(rows)
    if (error) return err('db_error', error.message)
  }
  return ok({ id: taskId })
}

// 事项：增
export async function createItem(userId: string, taskId: string, name: string): Promise<ServiceResult<{ id: string }>> {
  const forbidden = await requireAdmin(userId); if (forbidden) return { data: null, error: forbidden }
  if (!name.trim()) return err('invalid_input', 'name required')
  const db = createServerClient()
  const { data: maxRow } = await db.from('task_items').select('sort_order').eq('task_id', taskId).order('sort_order', { ascending: false }).limit(1).maybeSingle()
  const nextOrder = ((maxRow?.sort_order as number) ?? 0) + 1
  const { data, error } = await db.from('task_items').insert({ task_id: taskId, name: name.trim(), sort_order: nextOrder }).select('id').single()
  return error ? err('db_error', error.message) : ok({ id: data!.id as string })
}

// 事项：改（名 + owner，二者可选）
export async function updateItem(
  userId: string, itemId: string,
  patch: { name?: string; owner?: { member_type: MemberType; user_id: string | null; creator_id: string | null } | null },
): Promise<ServiceResult<{ id: string }>> {
  const forbidden = await requireAdmin(userId); if (forbidden) return { data: null, error: forbidden }
  const db = createServerClient()
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (patch.name !== undefined) {
    if (!patch.name.trim()) return err('invalid_input', 'name required')
    update.name = patch.name.trim()
  }
  if (patch.owner !== undefined) {
    if (patch.owner && !validatePersonRef(patch.owner)) return err('invalid_input', 'bad person ref')
    update.owner_member_type = patch.owner?.member_type ?? null
    update.owner_user_id     = patch.owner?.user_id ?? null
    update.owner_creator_id  = patch.owner?.creator_id ?? null
  }
  const { error } = await db.from('task_items').update(update).eq('id', itemId)
  return error ? err('db_error', error.message) : ok({ id: itemId })
}

// 事项：删
export async function deleteItem(userId: string, itemId: string): Promise<ServiceResult<{ id: string }>> {
  const forbidden = await requireAdmin(userId); if (forbidden) return { data: null, error: forbidden }
  const db = createServerClient()
  const { error } = await db.from('task_items').delete().eq('id', itemId)
  return error ? err('db_error', error.message) : ok({ id: itemId })
}

// 岗位成员：增
export async function addPositionMember(
  userId: string, positionId: string,
  ref: { member_type: MemberType; user_id: string | null; creator_id: string | null },
): Promise<ServiceResult<{ id: string }>> {
  const forbidden = await requireAdmin(userId); if (forbidden) return { data: null, error: forbidden }
  if (!validatePersonRef(ref)) return err('invalid_input', 'bad person ref')
  const db = createServerClient()
  const { data, error } = await db.from('position_members')
    .insert({ position_id: positionId, member_type: ref.member_type, user_id: ref.user_id, creator_id: ref.creator_id })
    .select('id').single()
  return error ? err('db_error', error.message) : ok({ id: data!.id as string })
}

// 岗位成员：删
export async function removePositionMember(userId: string, memberId: string): Promise<ServiceResult<{ id: string }>> {
  const forbidden = await requireAdmin(userId); if (forbidden) return { data: null, error: forbidden }
  const db = createServerClient()
  const { error } = await db.from('position_members').delete().eq('id', memberId)
  return error ? err('db_error', error.message) : ok({ id: memberId })
}
```

- [ ] **Step 2: 类型检查**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: 无报错

- [ ] **Step 3: Commit**

```bash
git add src/lib/org/service.ts
git commit -m "feat(org): service 层(读整棵树 + 各写操作 + 管理员权限)"
```

---

## Task 5: API — GET 整棵树

**Files:**
- Create: `src/app/api/org/route.ts`

- [ ] **Step 1: 写路由**

Create `src/app/api/org/route.ts`:

```typescript
import { NextResponse } from 'next/server'
import { authGuard } from '@/lib/auth/guard'
import { getOrgSnapshot, httpStatusForError } from '@/lib/org/service'

export const dynamic = 'force-dynamic'

// GET /api/org → OrgSnapshot（业务树 + 岗位&成员 + 候选人 + canEdit）
export async function GET() {
  const user = await authGuard()
  if (user instanceof NextResponse) return user
  const result = await getOrgSnapshot(user.id)
  if (result.error) return NextResponse.json({ data: null, error: result.error.message }, { status: httpStatusForError(result.error.code) })
  return NextResponse.json({ data: result.data, error: null })
}
```

- [ ] **Step 2: 类型检查**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: 无报错

- [ ] **Step 3: Commit**

```bash
git add src/app/api/org/route.ts
git commit -m "feat(org): GET /api/org 整棵树"
```

---

## Task 6: API — 业务 owner

**Files:**
- Create: `src/app/api/org/businesses/[id]/route.ts`

- [ ] **Step 1: 写路由**

Create `src/app/api/org/businesses/[id]/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { authGuard } from '@/lib/auth/guard'
import { setBusinessOwner, httpStatusForError } from '@/lib/org/service'
import type { MemberType } from '@/lib/types'

// PATCH /api/org/businesses/[id] — body { owner: {member_type,user_id,creator_id} | null }
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await authGuard()
  if (user instanceof NextResponse) return user
  let body: { owner?: { member_type: MemberType; user_id: string | null; creator_id: string | null } | null }
  try { body = await req.json() } catch { return NextResponse.json({ data: null, error: 'Invalid JSON body' }, { status: 400 }) }
  const result = await setBusinessOwner(user.id, params.id, body.owner ?? null)
  if (result.error) return NextResponse.json({ data: null, error: result.error.message }, { status: httpStatusForError(result.error.code) })
  return NextResponse.json({ data: result.data, error: null })
}
```

- [ ] **Step 2: 类型检查** — `npx tsc --noEmit -p tsconfig.json`（无报错）

- [ ] **Step 3: Commit**

```bash
git add src/app/api/org/businesses
git commit -m "feat(org): PATCH 业务 owner"
```

---

## Task 7: API — 任务（增/改名/删/岗位集合）

**Files:**
- Create: `src/app/api/org/businesses/[id]/tasks/route.ts`
- Create: `src/app/api/org/tasks/[id]/route.ts`
- Create: `src/app/api/org/tasks/[id]/positions/route.ts`

- [ ] **Step 1: 建任务路由（POST）**

Create `src/app/api/org/businesses/[id]/tasks/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { authGuard } from '@/lib/auth/guard'
import { createTask, httpStatusForError } from '@/lib/org/service'

// POST /api/org/businesses/[id]/tasks — body { name }
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await authGuard()
  if (user instanceof NextResponse) return user
  let body: { name?: string }
  try { body = await req.json() } catch { return NextResponse.json({ data: null, error: 'Invalid JSON body' }, { status: 400 }) }
  if (!body.name) return NextResponse.json({ data: null, error: 'name required' }, { status: 400 })
  const result = await createTask(user.id, params.id, body.name)
  if (result.error) return NextResponse.json({ data: null, error: result.error.message }, { status: httpStatusForError(result.error.code) })
  return NextResponse.json({ data: result.data, error: null })
}
```

- [ ] **Step 2: 任务改名/删路由（PATCH/DELETE）**

Create `src/app/api/org/tasks/[id]/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { authGuard } from '@/lib/auth/guard'
import { renameTask, deleteTask, httpStatusForError } from '@/lib/org/service'

// PATCH /api/org/tasks/[id] — body { name }
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await authGuard()
  if (user instanceof NextResponse) return user
  let body: { name?: string }
  try { body = await req.json() } catch { return NextResponse.json({ data: null, error: 'Invalid JSON body' }, { status: 400 }) }
  if (!body.name) return NextResponse.json({ data: null, error: 'name required' }, { status: 400 })
  const result = await renameTask(user.id, params.id, body.name)
  if (result.error) return NextResponse.json({ data: null, error: result.error.message }, { status: httpStatusForError(result.error.code) })
  return NextResponse.json({ data: result.data, error: null })
}

// DELETE /api/org/tasks/[id]
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const user = await authGuard()
  if (user instanceof NextResponse) return user
  const result = await deleteTask(user.id, params.id)
  if (result.error) return NextResponse.json({ data: null, error: result.error.message }, { status: httpStatusForError(result.error.code) })
  return NextResponse.json({ data: result.data, error: null })
}
```

- [ ] **Step 3: 任务岗位集合路由（PUT）**

Create `src/app/api/org/tasks/[id]/positions/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { authGuard } from '@/lib/auth/guard'
import { setTaskPositions, httpStatusForError } from '@/lib/org/service'

// PUT /api/org/tasks/[id]/positions — body { positionIds: string[] } 整体覆盖
export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await authGuard()
  if (user instanceof NextResponse) return user
  let body: { positionIds?: string[] }
  try { body = await req.json() } catch { return NextResponse.json({ data: null, error: 'Invalid JSON body' }, { status: 400 }) }
  if (!Array.isArray(body.positionIds)) return NextResponse.json({ data: null, error: 'positionIds required' }, { status: 400 })
  const result = await setTaskPositions(user.id, params.id, body.positionIds)
  if (result.error) return NextResponse.json({ data: null, error: result.error.message }, { status: httpStatusForError(result.error.code) })
  return NextResponse.json({ data: result.data, error: null })
}
```

- [ ] **Step 4: 类型检查** — `npx tsc --noEmit -p tsconfig.json`（无报错）

- [ ] **Step 5: Commit**

```bash
git add src/app/api/org/businesses src/app/api/org/tasks
git commit -m "feat(org): 任务 CRUD + 岗位集合接口"
```

---

## Task 8: API — 事项（增/改/删）

**Files:**
- Create: `src/app/api/org/tasks/[id]/items/route.ts`
- Create: `src/app/api/org/items/[id]/route.ts`

- [ ] **Step 1: 建事项路由（POST）**

Create `src/app/api/org/tasks/[id]/items/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { authGuard } from '@/lib/auth/guard'
import { createItem, httpStatusForError } from '@/lib/org/service'

// POST /api/org/tasks/[id]/items — body { name }
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await authGuard()
  if (user instanceof NextResponse) return user
  let body: { name?: string }
  try { body = await req.json() } catch { return NextResponse.json({ data: null, error: 'Invalid JSON body' }, { status: 400 }) }
  if (!body.name) return NextResponse.json({ data: null, error: 'name required' }, { status: 400 })
  const result = await createItem(user.id, params.id, body.name)
  if (result.error) return NextResponse.json({ data: null, error: result.error.message }, { status: httpStatusForError(result.error.code) })
  return NextResponse.json({ data: result.data, error: null })
}
```

- [ ] **Step 2: 事项改/删路由（PATCH/DELETE）**

Create `src/app/api/org/items/[id]/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { authGuard } from '@/lib/auth/guard'
import { updateItem, deleteItem, httpStatusForError } from '@/lib/org/service'
import type { MemberType } from '@/lib/types'

// PATCH /api/org/items/[id] — body { name?, owner?: {member_type,user_id,creator_id} | null }
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await authGuard()
  if (user instanceof NextResponse) return user
  let body: { name?: string; owner?: { member_type: MemberType; user_id: string | null; creator_id: string | null } | null }
  try { body = await req.json() } catch { return NextResponse.json({ data: null, error: 'Invalid JSON body' }, { status: 400 }) }
  const result = await updateItem(user.id, params.id, { name: body.name, owner: body.owner })
  if (result.error) return NextResponse.json({ data: null, error: result.error.message }, { status: httpStatusForError(result.error.code) })
  return NextResponse.json({ data: result.data, error: null })
}

// DELETE /api/org/items/[id]
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const user = await authGuard()
  if (user instanceof NextResponse) return user
  const result = await deleteItem(user.id, params.id)
  if (result.error) return NextResponse.json({ data: null, error: result.error.message }, { status: httpStatusForError(result.error.code) })
  return NextResponse.json({ data: result.data, error: null })
}
```

- [ ] **Step 3: 类型检查** — `npx tsc --noEmit -p tsconfig.json`（无报错）

- [ ] **Step 4: Commit**

```bash
git add src/app/api/org/tasks src/app/api/org/items
git commit -m "feat(org): 事项 CRUD 接口"
```

---

## Task 9: API — 岗位成员（增/删）

**Files:**
- Create: `src/app/api/org/positions/[id]/members/route.ts`
- Create: `src/app/api/org/positions/[id]/members/[memberId]/route.ts`

- [ ] **Step 1: 配人路由（POST）**

Create `src/app/api/org/positions/[id]/members/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { authGuard } from '@/lib/auth/guard'
import { addPositionMember, httpStatusForError } from '@/lib/org/service'
import type { MemberType } from '@/lib/types'

// POST /api/org/positions/[id]/members — body { member_type, user_id?, creator_id? }
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await authGuard()
  if (user instanceof NextResponse) return user
  let body: { member_type?: MemberType; user_id?: string | null; creator_id?: string | null }
  try { body = await req.json() } catch { return NextResponse.json({ data: null, error: 'Invalid JSON body' }, { status: 400 }) }
  if (body.member_type !== 'user' && body.member_type !== 'creator') {
    return NextResponse.json({ data: null, error: 'member_type required' }, { status: 400 })
  }
  const result = await addPositionMember(user.id, params.id, {
    member_type: body.member_type, user_id: body.user_id ?? null, creator_id: body.creator_id ?? null,
  })
  if (result.error) return NextResponse.json({ data: null, error: result.error.message }, { status: httpStatusForError(result.error.code) })
  return NextResponse.json({ data: result.data, error: null })
}
```

- [ ] **Step 2: 移除成员路由（DELETE）**

Create `src/app/api/org/positions/[id]/members/[memberId]/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { authGuard } from '@/lib/auth/guard'
import { removePositionMember, httpStatusForError } from '@/lib/org/service'

// DELETE /api/org/positions/[id]/members/[memberId]
export async function DELETE(_req: NextRequest, { params }: { params: { id: string; memberId: string } }) {
  const user = await authGuard()
  if (user instanceof NextResponse) return user
  const result = await removePositionMember(user.id, params.memberId)
  if (result.error) return NextResponse.json({ data: null, error: result.error.message }, { status: httpStatusForError(result.error.code) })
  return NextResponse.json({ data: result.data, error: null })
}
```

- [ ] **Step 3: 类型检查** — `npx tsc --noEmit -p tsconfig.json`（无报错）

- [ ] **Step 4: Commit**

```bash
git add src/app/api/org/positions
git commit -m "feat(org): 岗位成员增删接口"
```

---

## Task 10: 侧边栏子菜单 + nav i18n

**Files:**
- Modify: `src/components/layout/Sidebar.tsx`
- Modify: `messages/zh.json`、`messages/en.json`、`messages/ja.json`

- [ ] **Step 1: 侧边栏团队分组加「业务分工」子项**

在 `src/components/layout/Sidebar.tsx` 顶部 lucide 导入里加 `Network`（用作图标；若已导入则跳过）：找到 `ClipboardList,` 一行，在其后加一行 `  Network,`。

然后找到团队分组的 `children` 数组（含 `{ href: '/team', ... }` 与 `{ href: '/team/assignments', ... }`），在其后追加一项：

```tsx
      { href: '/team/org', key: 'teamOrg', icon: Network },
```

- [ ] **Step 2: 三语加 nav 键**

`messages/zh.json` 的 `nav` 里，`"teamAssignments": "任务分配",` 之后加：
```json
    "teamOrg": "业务分工",
```
`messages/en.json` 的 `nav` 里，`"teamAssignments": "Task Assignment",` 之后加：
```json
    "teamOrg": "Org & Roles",
```
`messages/ja.json` 的 `nav` 里，`"teamAssignments": "タスク割り当て",` 之后加：
```json
    "teamOrg": "業務分担",
```

- [ ] **Step 3: 校验 i18n + 类型**

Run: `npm run test:copy && npx tsc --noEmit -p tsconfig.json`
Expected: `i18n key parity OK`、无裸中文违规、tsc 无报错

- [ ] **Step 4: Commit**

```bash
git add src/components/layout/Sidebar.tsx messages/zh.json messages/en.json messages/ja.json
git commit -m "feat(org): 团队分组新增「业务分工」子菜单 + nav 三语"
```

---

## Task 11: 页面 i18n（team.org.*）

**Files:**
- Modify: `messages/zh.json`、`messages/en.json`、`messages/ja.json`

- [ ] **Step 1: 三语加 `team.org` 段**

在每个文件的 `team` 对象里、`assignments` 段之后追加（注意逗号）：

zh：
```json
    "org": {
      "title": "业务分工",
      "subtitle": "公司 → 业务 → 任务 → 事项；岗位与配人",
      "positionsTitle": "岗位与成员",
      "owner": "负责人",
      "noOwner": "未指定",
      "positions": "岗位",
      "items": "事项",
      "addTask": "添加任务",
      "addItem": "添加事项",
      "addMember": "添加成员",
      "editPositions": "编辑岗位",
      "setOwner": "设置负责人",
      "clearOwner": "清除负责人",
      "rename": "重命名",
      "delete": "删除",
      "confirmDelete": "确认删除？",
      "sourceUser": "员工",
      "sourceCreator": "主播",
      "namePlaceholder": "名称",
      "empty": "暂无",
      "readonlyHint": "只读（需管理员权限编辑）"
    }
```

en：
```json
    "org": {
      "title": "Org & Roles",
      "subtitle": "Company → Business → Task → Item; positions & members",
      "positionsTitle": "Positions & members",
      "owner": "Owner",
      "noOwner": "Unassigned",
      "positions": "Positions",
      "items": "Items",
      "addTask": "Add task",
      "addItem": "Add item",
      "addMember": "Add member",
      "editPositions": "Edit positions",
      "setOwner": "Set owner",
      "clearOwner": "Clear owner",
      "rename": "Rename",
      "delete": "Delete",
      "confirmDelete": "Delete?",
      "sourceUser": "Staff",
      "sourceCreator": "Streamer",
      "namePlaceholder": "Name",
      "empty": "None",
      "readonlyHint": "Read-only (admin required to edit)"
    }
```

ja：
```json
    "org": {
      "title": "業務分担",
      "subtitle": "会社 → 業務 → タスク → 事項；ポジションとメンバー",
      "positionsTitle": "ポジションとメンバー",
      "owner": "担当者",
      "noOwner": "未指定",
      "positions": "ポジション",
      "items": "事項",
      "addTask": "タスク追加",
      "addItem": "事項追加",
      "addMember": "メンバー追加",
      "editPositions": "ポジション編集",
      "setOwner": "担当者を設定",
      "clearOwner": "担当者をクリア",
      "rename": "名称変更",
      "delete": "削除",
      "confirmDelete": "削除しますか？",
      "sourceUser": "社員",
      "sourceCreator": "ライバー",
      "namePlaceholder": "名称",
      "empty": "なし",
      "readonlyHint": "読み取り専用（編集は管理者のみ）"
    }
```

- [ ] **Step 2: 校验 i18n**

Run: `npm run test:copy`
Expected: `i18n key parity OK`、无裸中文违规

- [ ] **Step 3: Commit**

```bash
git add messages/zh.json messages/en.json messages/ja.json
git commit -m "feat(org): 业务分工页 i18n 三语"
```

---

## Task 12: 页面（服务端）+ 客户端视图组件

**Files:**
- Create: `src/app/[locale]/(app)/team/org/page.tsx`
- Create: `src/components/org/OrgView.tsx`

- [ ] **Step 1: 服务端页面（拉数据 + 渲染客户端视图）**

Create `src/app/[locale]/(app)/team/org/page.tsx`:

```tsx
export const dynamic = 'force-dynamic'

import { getTranslations } from 'next-intl/server'
import { authGuard } from '@/lib/auth/guard'
import { redirect } from 'next/navigation'
import { getOrgSnapshot } from '@/lib/org/service'
import Header from '@/components/layout/Header'
import OrgView from '@/components/org/OrgView'

export default async function OrgPage() {
  const user = await authGuard()
  // authGuard 在 API 里返回 NextResponse；页面里若未登录中间件已拦截，这里兜底跳登录。
  if (user instanceof Response) redirect('/login')

  const [snapshotRes, t] = await Promise.all([
    getOrgSnapshot((user as { id: string }).id),
    getTranslations('team'),
  ])
  const snapshot = snapshotRes.data

  return (
    <div>
      <Header title={t('org.title')} subtitle={t('org.subtitle')} />
      {!snapshot ? (
        <div className="bg-white border border-zinc-200 rounded-xl p-10 text-center text-sm text-zinc-400">
          {t('org.empty')}
        </div>
      ) : (
        <OrgView initial={snapshot} />
      )}
    </div>
  )
}
```

- [ ] **Step 2: 客户端视图（只读树 + 编辑：管理员）**

Create `src/components/org/OrgView.tsx`:

```tsx
'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import Badge from '@/components/ui/Badge'
import type { OrgSnapshot, PersonOption } from '@/lib/types'

async function api(path: string, method: string, body?: unknown) {
  const res = await fetch(`/api/org${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
  return res.ok
}

export default function OrgView({ initial }: { initial: OrgSnapshot }) {
  const t = useTranslations('team')
  const [snapshot, setSnapshot] = useState<OrgSnapshot>(initial)
  const canEdit = snapshot.canEdit
  const posName = (id: string) => snapshot.positions.find((p) => p.id === id)?.name ?? id

  const reload = async () => {
    const res = await fetch('/api/org', { cache: 'no-store' })
    const json = await res.json()
    if (json.data) setSnapshot(json.data as OrgSnapshot)
  }

  const addTask = async (businessId: string) => {
    const name = window.prompt(t('org.addTask'))
    if (!name?.trim()) return
    if (await api(`/businesses/${businessId}/tasks`, 'POST', { name })) reload()
  }
  const deleteTask = async (taskId: string) => {
    if (!window.confirm(t('org.confirmDelete'))) return
    if (await api(`/tasks/${taskId}`, 'DELETE')) reload()
  }
  const addItem = async (taskId: string) => {
    const name = window.prompt(t('org.addItem'))
    if (!name?.trim()) return
    if (await api(`/tasks/${taskId}/items`, 'POST', { name })) reload()
  }
  const deleteItem = async (itemId: string) => {
    if (!window.confirm(t('org.confirmDelete'))) return
    if (await api(`/items/${itemId}`, 'DELETE')) reload()
  }

  return (
    <div className="space-y-5">
      {!canEdit && <p className="text-xs text-zinc-400">{t('org.readonlyHint')}</p>}

      {/* 业务树 */}
      <div className="space-y-4">
        {snapshot.businesses.map((b) => (
          <div key={b.id} className="bg-white border border-zinc-200 rounded-xl p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="font-semibold text-zinc-900">{b.name}</div>
              <div className="text-xs text-zinc-500">
                {t('org.owner')}：{b.owner_name ?? t('org.noOwner')}
              </div>
            </div>

            <div className="space-y-3">
              {b.tasks.map((task) => (
                <div key={task.id} className="border border-zinc-100 rounded-lg p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="font-medium text-sm text-zinc-800">{task.name}</div>
                    {canEdit && (
                      <div className="flex gap-2 text-xs">
                        <button className="text-zinc-400 hover:text-rose-600" onClick={() => deleteTask(task.id)}>{t('org.delete')}</button>
                      </div>
                    )}
                  </div>
                  {/* 岗位标签 */}
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {task.position_ids.length === 0
                      ? <span className="text-xs text-zinc-400">{t('org.empty')}</span>
                      : task.position_ids.map((pid) => <Badge key={pid} label={posName(pid)} color="indigo" size="sm" />)}
                  </div>
                  {/* 事项 */}
                  <ul className="mt-3 space-y-1.5">
                    {task.items.map((it) => (
                      <li key={it.id} className="flex items-center justify-between text-sm border border-zinc-100 rounded-md px-2.5 py-1.5">
                        <span className="text-zinc-700">{it.name}</span>
                        <span className="flex items-center gap-2">
                          <span className="text-[11px] text-zinc-400">{it.owner_name ?? t('org.noOwner')}</span>
                          {canEdit && <button className="text-[11px] text-zinc-400 hover:text-rose-600" onClick={() => deleteItem(it.id)}>{t('org.delete')}</button>}
                        </span>
                      </li>
                    ))}
                  </ul>
                  {canEdit && (
                    <button className="mt-2 text-xs text-primary hover:underline" onClick={() => addItem(task.id)}>+ {t('org.addItem')}</button>
                  )}
                </div>
              ))}
            </div>

            {canEdit && (
              <button className="mt-3 text-xs text-primary hover:underline" onClick={() => addTask(b.id)}>+ {t('org.addTask')}</button>
            )}
          </div>
        ))}
      </div>

      {/* 岗位与成员 */}
      <div className="bg-white border border-zinc-200 rounded-xl p-5">
        <p className="text-xs font-medium text-zinc-500 mb-3">{t('org.positionsTitle')}</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {snapshot.positions.map((p) => (
            <div key={p.id} className="border border-zinc-100 rounded-lg p-3">
              <div className="font-medium text-sm text-zinc-800">{p.name}</div>
              {p.description && <div className="text-[11px] text-zinc-400 mb-1">{p.description}</div>}
              <div className="flex flex-wrap gap-1.5 mt-1">
                {p.members.length === 0
                  ? <span className="text-xs text-zinc-400">{t('org.empty')}</span>
                  : p.members.map((m) => (
                      <Badge key={m.id} label={m.display_name || (m.member_type === 'creator' ? t('org.sourceCreator') : t('org.sourceUser'))} color={m.member_type === 'creator' ? 'amber' : 'teal'} size="sm" />
                    ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
```

> 备注：本 P1 的编辑 UI 用 `window.prompt/confirm` 做最小可用版（新增/删除任务与事项）。设置业务/事项负责人、编辑任务岗位集合、岗位配人的**弹窗式选择器**（`OwnerPicker` / `TaskPositionEditor` / `PositionMemberEditor`，从 `snapshot.people` 与 `snapshot.positions` 选择，调用已实现的 PATCH/PUT/POST 接口）作为紧随其后的增量任务（Task 13）实现，不阻塞本任务落地与页面可见。

- [ ] **Step 3: 类型检查**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: 无报错

- [ ] **Step 4: Commit**

```bash
git add "src/app/[locale]/(app)/team/org/page.tsx" src/components/org/OrgView.tsx
git commit -m "feat(org): 业务分工页 + 客户端树视图(读 + 任务/事项增删)"
```

---

## Task 13: 选择器弹窗（负责人 / 任务岗位 / 岗位配人）

**Files:**
- Modify: `src/components/org/OrgView.tsx`（接入三个选择动作）

- [ ] **Step 1: 在 `OrgView.tsx` 顶部加选择用状态与动作**

在 `OrgView` 组件内、`reload` 之后追加：

```tsx
  // —— 选择动作（复用现有 API）——
  const setBusinessOwner = async (businessId: string, person: PersonOption | null) => {
    const owner = person
      ? { member_type: person.member_type, user_id: person.member_type === 'user' ? person.id : null, creator_id: person.member_type === 'creator' ? person.id : null }
      : null
    if (await api(`/businesses/${businessId}`, 'PATCH', { owner })) reload()
  }
  const setItemOwner = async (itemId: string, person: PersonOption | null) => {
    const owner = person
      ? { member_type: person.member_type, user_id: person.member_type === 'user' ? person.id : null, creator_id: person.member_type === 'creator' ? person.id : null }
      : null
    if (await api(`/items/${itemId}`, 'PATCH', { owner })) reload()
  }
  const setTaskPositions = async (taskId: string, positionIds: string[]) => {
    if (await api(`/tasks/${taskId}/positions`, 'PUT', { positionIds })) reload()
  }
  const addMember = async (positionId: string, person: PersonOption) => {
    const body = { member_type: person.member_type, user_id: person.member_type === 'user' ? person.id : null, creator_id: person.member_type === 'creator' ? person.id : null }
    if (await api(`/positions/${positionId}/members`, 'POST', body)) reload()
  }
  const removeMember = async (positionId: string, memberId: string) => {
    if (await api(`/positions/${positionId}/members/${memberId}`, 'DELETE')) reload()
  }

  // 简易选人：用 people 生成一个下拉（value 编码 "type:id"，空串=清除）
  const pickPerson = (): PersonOption | null | undefined => {
    const lines = snapshot.people.map((p, i) => `${i + 1}. [${p.member_type === 'creator' ? t('org.sourceCreator') : t('org.sourceUser')}] ${p.name}`).join('\n')
    const raw = window.prompt(`${t('org.setOwner')}\n0. ${t('org.clearOwner')}\n${lines}`)
    if (raw === null) return undefined            // 取消
    const n = Number(raw.trim())
    if (n === 0) return null                       // 清除
    const person = snapshot.people[n - 1]
    return person ?? undefined
  }
```

- [ ] **Step 2: 业务负责人可点击设置（canEdit 时）**

把业务头部的 owner 显示块替换为可点击版本：找到
```tsx
              <div className="text-xs text-zinc-500">
                {t('org.owner')}：{b.owner_name ?? t('org.noOwner')}
              </div>
```
替换为：
```tsx
              <button
                type="button"
                disabled={!canEdit}
                onClick={async () => { const p = pickPerson(); if (p !== undefined) setBusinessOwner(b.id, p) }}
                className={`text-xs ${canEdit ? 'text-primary hover:underline' : 'text-zinc-500 cursor-default'}`}
              >
                {t('org.owner')}：{b.owner_name ?? t('org.noOwner')}
              </button>
```

- [ ] **Step 3: 事项负责人可点击设置、任务岗位可编辑、岗位可配人**

在事项行的 owner 显示 `<span className="text-[11px] text-zinc-400">{it.owner_name ?? t('org.noOwner')}</span>` 外层改为按钮（canEdit 时可点，调用 `setItemOwner(it.id, pickPerson())`，`undefined` 时不动作）。

在任务标签区（`canEdit` 时）追加一个"编辑岗位"按钮：点击弹出 `window.prompt`，把 `snapshot.positions` 编号列出，输入逗号分隔序号，映射为 `position_ids` 调 `setTaskPositions(task.id, ids)`：
```tsx
{canEdit && (
  <button
    type="button"
    className="text-[11px] text-primary hover:underline"
    onClick={() => {
      const lines = snapshot.positions.map((p, i) => `${i + 1}. ${p.name}`).join('\n')
      const raw = window.prompt(`${t('org.editPositions')}（逗号分隔序号）\n${lines}`, task.position_ids.map((pid) => snapshot.positions.findIndex((p) => p.id === pid) + 1).filter((n) => n > 0).join(','))
      if (raw === null) return
      const ids = raw.split(',').map((s) => Number(s.trim())).filter((n) => n >= 1 && n <= snapshot.positions.length).map((n) => snapshot.positions[n - 1].id)
      setTaskPositions(task.id, ids)
    }}
  >{t('org.editPositions')}</button>
)}
```

在岗位卡（`canEdit` 时）追加"添加成员"按钮：`onClick` 用 `pickPerson()` 选人（这里复用同一函数，`null`/`undefined` 不添加），调用 `addMember(p.id, person)`；每个成员 Badge 旁给管理员一个移除入口调 `removeMember(p.id, m.id)`。

- [ ] **Step 4: 类型检查**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: 无报错

- [ ] **Step 5: Commit**

```bash
git add src/components/org/OrgView.tsx
git commit -m "feat(org): 业务分工编辑(设负责人/改任务岗位/岗位配人)"
```

---

## Task 14: 更新日志 + 全量验证

**Files:**
- Modify: `src/lib/changelog/entries.ts`

- [ ] **Step 1: 加 changelog 条目**

在 `CHANGELOG` 数组顶部新增（日期取当天；若已有当天块则并入其 items）：

```typescript
  {
    date: '2026-07-08',
    items: [
      {
        kind: 'feat',
        scope: '团队',
        title: '新增「业务分工」——公司 / 业务 / 任务 / 事项 与岗位配人',
        details: '「团队（AI 代理）」下新增「业务分工」页：按 公司→业务→任务→事项 的层级展示分工，业务与事项各有唯一负责人、任务关联岗位；并可给 10 个岗位配上员工或主播。管理员可增删任务/事项、设置负责人、编辑任务岗位与岗位成员。',
      },
    ],
  },
```

- [ ] **Step 2: 全量验证**

Run: `npx tsc --noEmit -p tsconfig.json && npm run test:copy && node --test --experimental-strip-types src/lib/org/tree.test.ts`
Expected: tsc 无报错；`i18n key parity OK` + 无裸中文；org 单测全绿

- [ ] **Step 3: Commit**

```bash
git add src/lib/changelog/entries.ts
git commit -m "docs(changelog): 业务分工 P1"
```

---

## 备注：数据库迁移的应用

本仓库迁移文件为 SQL 脚本（`supabase/migrations/`）。041 需在目标 Supabase 实例执行（沿用本项目既有迁移应用流程；本地无 DB 时，后端 service/API 的类型与纯函数仍可通过 tsc + 单测验证）。上线前确保 041 已应用，否则 `/team/org` 读接口会因表不存在报错。

## 自检记录（写完计划的 fresh-eyes 复核）

- Spec 覆盖：岗位枚举(Task1 seed + Task4 读)、业务/任务/事项四层(Task1/4/12)、业务 1 负责人(Task6)、任务多岗位(Task7)、事项 1 负责人(Task8)、岗位配人(Task9)、页面+菜单(Task10/12)、i18n(Task10/11)、seed 明细(Task1) 均有对应任务。P2（开支归属）不在本计划范围，spec 已标注另立 plan。
- 占位符：无 TBD/TODO；每个代码步骤含完整代码。
- 类型/命名一致：service 导出名（`getOrgSnapshot`/`setBusinessOwner`/`createTask`/`renameTask`/`deleteTask`/`setTaskPositions`/`createItem`/`updateItem`/`deleteItem`/`addPositionMember`/`removePositionMember`）与各 API 路由 import 一致；类型（`OrgSnapshot`/`Business`/`BusinessTask`/`TaskItem`/`Position`/`PositionMember`/`PersonOption`/`MemberType`）在 Task2 定义、后续引用一致；表名与 Task1 迁移一致。
```
