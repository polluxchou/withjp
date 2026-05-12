-- ============================================================
-- Migration 021: Account-level access control
-- Admin: full CRUD on all entries
-- Non-admin: CRUD only on own entries; read-only on others'
-- Null created_by_user_id (historical) → admin-only for writes
-- ============================================================

-- ── 1. Admin flag on users ───────────────────────────────────

alter table users add column if not exists is_admin boolean not null default false;

-- Set the designated admin account
update users
set is_admin = true
from auth.users au
where users.id = au.id
  and lower(au.email) = 'hkiaowzf@gmail.com';

-- ── 2. Ownership tracking on content tables ──────────────────

alter table expenses
  add column if not exists created_by_user_id uuid references users(id) on delete set null;

alter table creators
  add column if not exists created_by_user_id uuid references users(id) on delete set null;

alter table knowledge
  add column if not exists created_by_user_id uuid references users(id) on delete set null;

alter table milestones
  add column if not exists created_by_user_id uuid references users(id) on delete set null;

-- work_tasks already has owner_user_id — no separate column needed

-- ── 3. Indexes ────────────────────────────────────────────────

create index if not exists idx_expenses_created_by   on expenses(created_by_user_id);
create index if not exists idx_creators_created_by   on creators(created_by_user_id);
create index if not exists idx_knowledge_created_by  on knowledge(created_by_user_id);
create index if not exists idx_milestones_created_by on milestones(created_by_user_id);
