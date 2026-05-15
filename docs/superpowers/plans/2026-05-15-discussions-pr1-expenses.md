# Discussions PR1 — Expenses Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the first slice of the discussions system: users can open a discussion on a single expense row or on the current expense filter, write messages, and resolve the thread. The expenses table shows `[讨论 N]` badges with a batch-count call.

**Scope boundary:** Only `expenses` integration. No `finance_forecast`, no `creators`, no DELETE message, no agent summary, no `PageDiscussionsEntry`. Those land in PR2/PR3 per the spec.

**Architecture:** Migration 025 adds `service_agents` (with `topic_prefix`), `discussion_topic_sequences`, `discussion_threads`, `discussion_messages`, and the `next_discussion_topic_code` function. Pure logic (subject normalization, permissions) lives under `src/lib/discussions/` with Node tests. Six API routes call a thin service layer. A `DiscussionContext` batches count queries for the expenses list page.

**Tech Stack:** Next.js 14 App Router, React 18 client components, TypeScript, Supabase (Postgres), Tailwind CSS, Node built-in test runner.

**Reference spec:** [`docs/superpowers/specs/2026-05-15-discussions-system-design.md`](../specs/2026-05-15-discussions-system-design.md)

---

## File Map

**Database:**
- Create `supabase/migrations/025_discussions.sql` — schema, FKs, indexes, generator function, service_agents seed.

**Pure logic + tests:**
- Create `src/lib/discussions/types.ts` — shared TS types (`SubjectInput`, `Thread`, `Message`, etc.).
- Create `src/lib/discussions/subject.ts` — filter whitelist, canonical JSON, sha256, normalization.
- Create `src/lib/discussions/subject.test.ts` — Node tests for normalization and hash stability.
- Create `src/lib/discussions/permissions.ts` — `canReadThread`, `canResolveThread`.
- Create `src/lib/discussions/permissions.test.ts` — Node tests for read/resolve gates.

**Service layer:**
- Create `src/lib/discussions/service.ts` — `createThread`, `getThread`, `listThreads`, `listMessages`, `createMessage`, `resolveThread`, `resolveCounts`.

**API routes:**
- Create `src/app/api/discussions/threads/route.ts` — POST create, GET list.
- Create `src/app/api/discussions/threads/[id]/route.ts` — GET detail.
- Create `src/app/api/discussions/threads/[id]/messages/route.ts` — POST append, GET list.
- Create `src/app/api/discussions/threads/[id]/resolve/route.ts` — PATCH resolve.
- Create `src/app/api/discussions/subject/resolve-counts/route.ts` — POST batch counts.

**Frontend:**
- Create `src/components/discussions/DiscussionContext.tsx` — provider + `useDiscussionCount` hook + batch fetcher.
- Create `src/components/discussions/DiscussionBadge.tsx` — `[讨论 N]` / `[已结束 1]` / `[讨论]`.
- Create `src/components/discussions/DiscussionPanel.tsx` — right drawer shell.
- Create `src/components/discussions/ThreadList.tsx` — multi-thread picker.
- Create `src/components/discussions/ThreadView.tsx` — single-thread view: header, stream, input, resolve.
- Modify `src/app/[locale]/(app)/expenses/page.tsx` (or matching expense list location) — wrap in `DiscussionContext`, add filter-subject badge, add per-row badge column.

**Test wiring:**
- Modify `package.json` — extend `npm test` script to include `src/lib/discussions/*.test.ts`.

---

## Task 1: Migration 025

**Files:**
- Create: `supabase/migrations/025_discussions.sql`

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/025_discussions.sql`:

```sql
-- ============================================================
-- Migration 025: Discussions system — service registry,
-- threads, messages, topic_code generator.
-- ============================================================

-- ── service_agents: service registry + agent routing ─────────
create table service_agents (
  service_key   text primary key,
  topic_prefix  text not null check (topic_prefix ~ '^[A-Z]{2,5}$'),
  agent_id      uuid not null references agents(id),
  display_name  text not null,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create trigger service_agents_updated_at before update on service_agents
  for each row execute function update_updated_at();

-- ── Seed three v1 services bound to existing agents ──────────
insert into service_agents (service_key, topic_prefix, agent_id, display_name) values
  ('expenses',         'EXP',
    (select id from agents where name = 'Morgan (Finance Agent)'),
    '费用协作 Agent'),
  ('finance_forecast', 'FIN',
    (select id from agents where name = 'Casey (Growth Agent)'),
    '财务预测 Agent'),
  ('creators',         'CRE',
    (select id from agents where name = 'Jordan (Ops Agent)'),
    '达人协作 Agent');

-- ── Per-(service, year) sequence ─────────────────────────────
create table discussion_topic_sequences (
  service_key         text not null references service_agents(service_key),
  year                int  not null,
  last_issued_number  bigint not null default 0,
  updated_at          timestamptz not null default now(),
  primary key (service_key, year)
);

-- ── Enums with stable value sets ─────────────────────────────
create type discussion_subject_type as enum ('record', 'filter', 'saved_view');
create type discussion_status       as enum ('open', 'resolved');
create type discussion_sender_type  as enum ('user', 'agent', 'external');
create type discussion_channel      as enum ('web', 'email', 'im');

-- ── Threads ──────────────────────────────────────────────────
create table discussion_threads (
  id                  uuid primary key default uuid_generate_v4(),
  topic_code          text not null unique,
  service_key         text not null references service_agents(service_key),
  assigned_agent_id   uuid not null references agents(id),
  subject_type        discussion_subject_type not null,
  entity_type         text not null,
  entity_id           uuid,
  subject_hash        text,
  subject_payload     jsonb not null,
  title               text not null,
  status              discussion_status not null default 'open',
  created_by_user_id  uuid not null references users(id),
  resolved_by_user_id uuid references users(id),
  resolved_at         timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  check (
    (subject_type = 'filter'                  and subject_hash is not null and entity_id is null) or
    (subject_type in ('record','saved_view')  and entity_id   is not null and subject_hash is null)
  )
);

create index idx_threads_record on discussion_threads
  (service_key, subject_type, entity_type, entity_id, status)
  where subject_type in ('record','saved_view');

create index idx_threads_filter on discussion_threads
  (service_key, subject_type, entity_type, subject_hash, status)
  where subject_type = 'filter';

create trigger threads_updated_at before update on discussion_threads
  for each row execute function update_updated_at();

-- ── Messages ─────────────────────────────────────────────────
create table discussion_messages (
  id              uuid primary key default uuid_generate_v4(),
  thread_id       uuid not null references discussion_threads(id) on delete cascade,
  parent_id       uuid references discussion_messages(id),
  sender_type     discussion_sender_type not null,
  sender_user_id  uuid references users(id),
  sender_agent_id uuid references agents(id),
  channel         discussion_channel not null default 'web',
  body            text not null,
  metadata        jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz,
  check (
    (sender_type = 'user'  and sender_user_id  is not null) or
    (sender_type = 'agent' and sender_agent_id is not null) or
    (sender_type = 'external')
  )
);

create index idx_messages_thread on discussion_messages (thread_id, created_at)
  where deleted_at is null;

create trigger messages_updated_at before update on discussion_messages
  for each row execute function update_updated_at();

-- ── topic_code generator (concurrency-safe via row lock) ─────
create or replace function next_discussion_topic_code(p_service_key text)
returns text language plpgsql as $$
declare
  v_year   int := extract(year from now())::int;
  v_num    bigint;
  v_prefix text;
begin
  select topic_prefix into v_prefix
  from service_agents
  where service_key = p_service_key and is_active;
  if v_prefix is null then
    raise exception 'unknown or inactive service_key: %', p_service_key;
  end if;

  insert into discussion_topic_sequences (service_key, year, last_issued_number)
  values (p_service_key, v_year, 1)
  on conflict (service_key, year) do update
    set last_issued_number = discussion_topic_sequences.last_issued_number + 1,
        updated_at = now()
  returning last_issued_number into v_num;

  return format('%s-%s-%s', v_prefix, v_year, lpad(v_num::text, 6, '0'));
end $$;
```

- [ ] **Step 2: Apply locally and verify**

Run the migration against local Supabase. Verify:

```sql
-- Returns 3 rows, agent_id matches Morgan / Casey / Jordan
select sa.service_key, sa.topic_prefix, a.name from service_agents sa
join agents a on a.id = sa.agent_id;

-- Returns 'EXP-2026-000001' then '000002' on consecutive calls
select next_discussion_topic_code('expenses');
select next_discussion_topic_code('expenses');

-- Unknown key raises
select next_discussion_topic_code('nonsense');
```

- [ ] **Step 3: Verify constraints fire**

Insert a thread row with `subject_type='filter'` but no `subject_hash` — expect the check constraint to reject. Same for `subject_type='record'` with no `entity_id`.

---

## Task 2: Subject Normalization (Pure Logic)

**Files:**
- Create: `src/lib/discussions/types.ts`
- Create: `src/lib/discussions/subject.ts`
- Create: `src/lib/discussions/subject.test.ts`
- Modify: `package.json`

- [ ] **Step 1: Define types**

Create `src/lib/discussions/types.ts`:

```ts
export type ServiceKey = 'expenses' | 'finance_forecast' | 'creators'

export type SubjectInput =
  | { subjectType: 'record';     serviceKey: ServiceKey; entityType: string; entityId: string; label: string; route: string }
  | { subjectType: 'filter';     serviceKey: ServiceKey; entityType: string; filters: Record<string, unknown>; label: string; route: string }
  | { subjectType: 'saved_view'; serviceKey: ServiceKey; entityType: string; entityId: string; label: string; route: string }

export interface NormalizedSubject {
  serviceKey: ServiceKey
  subjectType: 'record' | 'filter' | 'saved_view'
  entityType: string
  entityId: string | null
  subjectHash: string | null
  subjectPayload: {
    label: string
    route: string
    filters?: Record<string, unknown>
  }
}

export type Thread = {
  id: string
  topicCode: string
  serviceKey: ServiceKey
  assignedAgentId: string
  subjectType: 'record' | 'filter' | 'saved_view'
  entityType: string
  entityId: string | null
  subjectHash: string | null
  subjectPayload: Record<string, unknown>
  title: string
  status: 'open' | 'resolved'
  createdByUserId: string
  resolvedByUserId: string | null
  resolvedAt: string | null
  createdAt: string
  updatedAt: string
}

export type Message = {
  id: string
  threadId: string
  parentId: string | null
  senderType: 'user' | 'agent' | 'external'
  senderUserId: string | null
  senderAgentId: string | null
  channel: 'web' | 'email' | 'im'
  body: string
  metadata: Record<string, unknown>
  createdAt: string
  updatedAt: string
  deletedAt: string | null
}
```

- [ ] **Step 2: Write failing tests for subject normalization**

Create `src/lib/discussions/subject.test.ts`:

```ts
import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizeSubject } from './subject.ts'

test('record subjects produce entityId and no hash', () => {
  const out = normalizeSubject({
    subjectType: 'record',
    serviceKey: 'expenses',
    entityType: 'expense',
    entityId: 'a1b2',
    label: 'Expense 2026-05-01',
    route: '/expenses/a1b2',
  })
  assert.equal(out.entityId, 'a1b2')
  assert.equal(out.subjectHash, null)
  assert.equal(out.subjectPayload.label, 'Expense 2026-05-01')
})

test('filter subjects produce stable hash regardless of key order', () => {
  const a = normalizeSubject({
    subjectType: 'filter',
    serviceKey: 'expenses',
    entityType: 'expense',
    filters: { status: 'unpaid', date_from: '2026-05-01', amount_min: 1000 },
    label: '未付 ≥ ¥1000',
    route: '/expenses',
  })
  const b = normalizeSubject({
    subjectType: 'filter',
    serviceKey: 'expenses',
    entityType: 'expense',
    filters: { amount_min: 1000, status: 'unpaid', date_from: '2026-05-01' },
    label: '未付 ≥ ¥1000',
    route: '/expenses',
  })
  assert.equal(a.subjectHash, b.subjectHash)
  assert.equal(a.entityId, null)
})

test('filter normalization drops nulls and non-whitelist keys', () => {
  const a = normalizeSubject({
    subjectType: 'filter',
    serviceKey: 'expenses',
    entityType: 'expense',
    filters: { status: 'unpaid', randomKey: 'foo', amount_min: null },
    label: '未付',
    route: '/expenses',
  })
  const b = normalizeSubject({
    subjectType: 'filter',
    serviceKey: 'expenses',
    entityType: 'expense',
    filters: { status: 'unpaid' },
    label: '未付',
    route: '/expenses',
  })
  assert.equal(a.subjectHash, b.subjectHash)
})

test('filter array values are sorted for hash stability', () => {
  const a = normalizeSubject({
    subjectType: 'filter',
    serviceKey: 'expenses',
    entityType: 'expense',
    filters: { tags: ['b', 'a', 'c'] },
    label: 'tags',
    route: '/expenses',
  })
  const b = normalizeSubject({
    subjectType: 'filter',
    serviceKey: 'expenses',
    entityType: 'expense',
    filters: { tags: ['a', 'b', 'c'] },
    label: 'tags',
    route: '/expenses',
  })
  assert.equal(a.subjectHash, b.subjectHash)
})

test('saved_view behaves like record', () => {
  const out = normalizeSubject({
    subjectType: 'saved_view',
    serviceKey: 'expenses',
    entityType: 'expense_saved_view',
    entityId: 'view-1',
    label: 'My View',
    route: '/expenses?view=view-1',
  })
  assert.equal(out.entityId, 'view-1')
  assert.equal(out.subjectHash, null)
})
```

- [ ] **Step 3: Implement normalization**

Create `src/lib/discussions/subject.ts`:

```ts
import { createHash } from 'node:crypto'
import type { SubjectInput, NormalizedSubject } from './types.ts'

const FILTER_WHITELIST: Record<string, string[]> = {
  expense: [
    'status', 'date_from', 'date_to', 'category_id', 'creator_id',
    'currency', 'amount_min', 'amount_max', 'tags',
  ],
}

function isMeaningful(v: unknown): boolean {
  if (v === null || v === undefined) return false
  if (typeof v === 'string' && v.trim() === '') return false
  if (Array.isArray(v) && v.length === 0) return false
  return true
}

function normalizeValue(v: unknown): unknown {
  if (Array.isArray(v)) return [...v].map(normalizeValue).sort(stableCompare)
  if (typeof v === 'string') return v.trim()
  return v
}

function stableCompare(a: unknown, b: unknown): number {
  return String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0
}

function canonicalJSON(obj: Record<string, unknown>): string {
  const sortedKeys = Object.keys(obj).sort()
  const ordered: Record<string, unknown> = {}
  for (const k of sortedKeys) ordered[k] = obj[k]
  return JSON.stringify(ordered)
}

export function normalizeSubject(input: SubjectInput): NormalizedSubject {
  const base = {
    serviceKey: input.serviceKey,
    subjectType: input.subjectType,
    entityType: input.entityType,
  }

  if (input.subjectType === 'record' || input.subjectType === 'saved_view') {
    return {
      ...base,
      entityId: input.entityId,
      subjectHash: null,
      subjectPayload: { label: input.label, route: input.route },
    }
  }

  const allowed = FILTER_WHITELIST[input.entityType] ?? []
  const cleaned: Record<string, unknown> = {}
  for (const key of allowed) {
    const v = (input.filters as Record<string, unknown>)[key]
    if (isMeaningful(v)) cleaned[key] = normalizeValue(v)
  }
  const canonical = canonicalJSON(cleaned)
  const subjectHash = createHash('sha256').update(canonical).digest('hex')

  return {
    ...base,
    entityId: null,
    subjectHash,
    subjectPayload: { label: input.label, route: input.route, filters: cleaned },
  }
}
```

- [ ] **Step 4: Wire test into `npm test`**

Add `src/lib/discussions/subject.test.ts` to the test script in `package.json` alongside existing entries.

- [ ] **Step 5: Run tests, all pass**

---

## Task 3: Permissions (Pure Logic)

**Files:**
- Create: `src/lib/discussions/permissions.ts`
- Create: `src/lib/discussions/permissions.test.ts`
- Modify: `package.json`

- [ ] **Step 1: Failing tests**

Create `src/lib/discussions/permissions.test.ts` covering:

- Admin always passes `canReadThread`.
- Non-admin passes `canReadThread` for `record` and `filter`.
- For `saved_view` with `entity_type='expense_saved_view'`, only the owner passes (uses an injected view-loader).
- `canResolveThread`: only creator or admin.

The functions take an injected fetcher so the unit tests don't need a DB:

```ts
canReadThread(actor, thread, { loadSavedView })
```

- [ ] **Step 2: Implement**

Create `src/lib/discussions/permissions.ts`. Mirror the spec; keep the fetcher injected so the API layer wires Supabase but tests use stubs.

For PR1 (expenses only) the `saved_view` branch can return `false` for unknown entity types — finance_forecast and creators come in PR2.

- [ ] **Step 3: Wire test into `npm test`** and run.

---

## Task 4: Service Layer

**Files:**
- Create: `src/lib/discussions/service.ts`

- [ ] **Step 1: Implement the 7 functions**

Create `src/lib/discussions/service.ts` exporting:

- `createThread(supabase, actor, input: { subject: SubjectInput; title: string; firstMessage: string }): Promise<{ thread; firstMessage }>` — transactional. Calls `next_discussion_topic_code(serviceKey)` via `rpc`, looks up `assigned_agent_id` from `service_agents`, inserts thread, inserts first message, returns both.
- `getThread(supabase, actor, id): Promise<Thread | null>` — applies `canReadThread`.
- `listThreads(supabase, actor, query): Promise<Thread[]>` — accepts `{ serviceKey, entityType, entityId? | filters? + label/route, status? }`. If `filters` given, normalize first to derive `subjectHash`. Filter results by `canReadThread`.
- `listMessages(supabase, actor, threadId): Promise<Message[]>` — gates on `canReadThread`; excludes soft-deleted.
- `createMessage(supabase, actor, threadId, { body, parentId? }): Promise<Message>` — gates on `canReadThread`; rejects on resolved threads (PR1 decision: no posting to resolved threads; revisit later).
- `resolveThread(supabase, actor, threadId): Promise<Thread>` — gates on `canResolveThread`.
- `resolveCounts(supabase, actor, subjects: SubjectInput[]): Promise<Array<{ key: string; openCount: number; resolvedCount: number }>>` — normalize each subject server-side, query in a single grouped call, apply `canReadThread` filter (for `saved_view` subjects load owner before counting). `key` is a stable client-supplied identifier; pass it back so the UI can map results.

Use a single Supabase client per request; do not open per-call connections. Rely on `supabase.rpc('next_discussion_topic_code', { p_service_key })` for code generation.

---

## Task 5: API Routes

**Files:**
- Create: `src/app/api/discussions/threads/route.ts`
- Create: `src/app/api/discussions/threads/[id]/route.ts`
- Create: `src/app/api/discussions/threads/[id]/messages/route.ts`
- Create: `src/app/api/discussions/threads/[id]/resolve/route.ts`
- Create: `src/app/api/discussions/subject/resolve-counts/route.ts`

- [ ] **Step 1: Thin route handlers**

Each route:

1. Resolves the actor via the existing session/auth helper.
2. Parses the request body with a small per-route guard (no zod added just for this; mirror nearby routes like `api/work-tasks/route.ts`).
3. Delegates to `src/lib/discussions/service.ts`.
4. Maps service errors to HTTP: `403` on permission deny, `404` on missing thread, `400` on validation, `500` otherwise.

- [ ] **Step 2: Smoke test each route by hand**

After implementing, exercise from the browser DevTools console against the local server:

```js
// Create
await fetch('/api/discussions/threads', {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({
    subject: { subjectType: 'record', serviceKey: 'expenses', entityType: 'expense',
               entityId: '<real expense uuid>', label: 'Expense X', route: '/expenses/X' },
    title: '为什么还没付款？',
    firstMessage: '这条 5/1 的云服务账单状态一直是未付，能确认下吗？',
  }),
}).then(r => r.json())
```

Verify `topic_code` is `EXP-2026-000001` on first run.

---

## Task 6: Frontend — Context + Badge

**Files:**
- Create: `src/components/discussions/DiscussionContext.tsx`
- Create: `src/components/discussions/DiscussionBadge.tsx`

- [ ] **Step 1: Context with batched count fetcher**

`DiscussionContext`:

- Maintains a `Map<key, { openCount; resolvedCount }>` of counts.
- Maintains a queued set of subjects pending count resolution.
- Debounces (~50ms) and flushes the queue to `POST /api/discussions/subject/resolve-counts`.
- Exposes `useDiscussionCount(subject)` which subscribes the consumer and triggers a queue entry if not yet resolved.
- Exposes `invalidateSubject(key)` so the panel can refresh badges after a create/resolve action.

- [ ] **Step 2: Badge component**

`DiscussionBadge`:

- Reads from `useDiscussionCount`.
- Renders one of: `[讨论]` (no threads → primary action create), `[讨论 N]` (open count > 0), `[已结束 N]` (only resolved threads).
- Mixed state (some open + some resolved): show open count, prefer "open" framing.
- onClick opens the right-side `DiscussionPanel` scoped to that subject.

---

## Task 7: Frontend — Panel + ThreadList + ThreadView

**Files:**
- Create: `src/components/discussions/DiscussionPanel.tsx`
- Create: `src/components/discussions/ThreadList.tsx`
- Create: `src/components/discussions/ThreadView.tsx`

- [ ] **Step 1: Panel shell**

Right-side drawer. Takes a `subject: SubjectInput`. On open:

- Calls `GET /api/discussions/threads?...` to load all threads for the subject.
- If 0 threads → render "新建讨论" inline composer (title + first message).
- If 1 thread → render `ThreadView` directly.
- If >1 threads → render `ThreadList`; clicking an item drills into `ThreadView`.

The composer's submit calls `POST /api/discussions/threads`, then invalidates the subject's count and switches to `ThreadView` for the new thread.

- [ ] **Step 2: ThreadList**

Each row: `topic_code`, title, status pill, last-message-at, message count. Sort `open` first, then by `updated_at` desc.

- [ ] **Step 3: ThreadView**

Layout:

```
[← 返回]  EXP-2026-000001                       [结束讨论]
─────────────────────────────────────────────────────────
绑定对象: <subject_payload.label>     • Morgan (Finance Agent)
状态: 进行中

[message stream — sender name, timestamp, body, optional quoted parent]

[textarea + 发送]
```

Behaviors:

- Posts to `POST /api/discussions/threads/:id/messages`.
- Resolve calls `PATCH /api/discussions/threads/:id/resolve`, hides input, shows banner "讨论已结束 — 由 X 于 T".
- After resolve, invalidates the count for the subject in `DiscussionContext`.

PR1 keeps the stream flat. `parent_id` is captured if the user clicks "回复" on a message (sends `parentId` in the next post body) and renders as a compact quote above the new message; no nested threading tree.

---

## Task 8: Expenses Page Integration

**Files:**
- Modify: `src/app/[locale]/(app)/expenses/page.tsx` (or whichever route renders the expense list — check current file map first)

- [ ] **Step 1: Locate the expense list page**

`grep -r 'expenses' src/app/\[locale\]` to find the actual list component. The existing PRs added saved-views support, so there is already a place where filters are derived — reuse that source-of-truth for the filter subject's `filters` payload.

- [ ] **Step 2: Wrap in DiscussionContext**

Wrap the page in `<DiscussionContext>`. The provider only batches; it makes no requests until a `useDiscussionCount` consumer mounts.

- [ ] **Step 3: Filter-subject badge**

Near the filter bar header, render a `DiscussionBadge` whose subject is:

```ts
{
  subjectType: 'filter',
  serviceKey: 'expenses',
  entityType: 'expense',
  filters: currentFilters,           // same shape the API uses
  label: humanizeFilters(currentFilters),
  route: window.location.pathname + window.location.search,
}
```

The `key` for the context's count map is `'filter:expense:' + JSON.stringify(currentFilters)` — or any stable derivation; the server hash is authoritative, the client key is just a Map key.

- [ ] **Step 4: Per-row badge column**

Append a column to the expense table. Each cell renders a `DiscussionBadge` for:

```ts
{
  subjectType: 'record',
  serviceKey: 'expenses',
  entityType: 'expense',
  entityId: row.id,
  label: `Expense ${row.date} ${row.category}`,
  route: `/expenses/${row.id}`,      // or the canonical detail route
}
```

The `DiscussionContext`'s batch fetcher coalesces these into one round-trip on first paint.

- [ ] **Step 5: Manual verification**

Run the dev server. Verify:

1. Empty state: every row badge renders `[讨论]`.
2. Click `[讨论]` on a row → panel opens with composer. Submit a thread.
3. Badge updates to `[讨论 1]` after invalidation.
4. Reopen panel → ThreadView shows topic_code `EXP-2026-...` and the first message.
5. Send a reply, panel updates in place.
6. Resolve, badge updates to `[已结束 1]`.
7. Network tab: opening the page issues exactly one `resolve-counts` request, not per-row.

---

## Task 9: i18n + Polish

**Files:**
- Modify: locale files used by existing expense pages (`src/i18n/...`)
- Modify: changelog entries per the WithJP version-maintenance convention

- [ ] **Step 1: Add Chinese strings**

Component strings: `讨论`, `已结束`, `结束讨论`, `进行中`, `新建讨论`, `绑定对象`, `回复`, `发送`, `讨论已结束 由 {{name}} 于 {{time}}`, etc. Follow existing i18n setup.

- [ ] **Step 2: Update changelog**

Add a user-visible entry to `src/lib/changelog/entries.ts` describing the new feature: "费用页支持围绕单条费用或当前筛选条件发起讨论"。

---

## Out of Scope for PR1

These are explicitly deferred and must not be implemented in this PR:

- DELETE message endpoint.
- Agent summary (`POST /agent-summary`).
- `finance_forecast` integration (record + saved_view).
- `creators` integration.
- `PageDiscussionsEntry` — landed in PR2 alongside the other two pages.
- Notifications, unread state, inbox.
- Email / IM channel routing.

## Acceptance

- All Node tests pass under `npm test`.
- Migration 025 applies cleanly on a fresh local DB and a copy of staging data.
- A user can: create a thread on an expense row, create a thread on the current filter, reply, resolve, and the badges reflect counts correctly within one round-trip per page paint.
- Permission: a user accessing a thread on someone else's expense saved view receives 403 (when that integration lands in PR2; for PR1 the saved_view branch is intentionally closed).
- No regressions to the existing expense list, saved views, or work-tasks flows.
