-- ============================================================
-- Migration 019: Expense saved views (per-user)
--
-- Stores named filter combinations for the expense list so they
-- sync across devices. Scoped per auth user; the API layer enforces
-- the user_id constraint (consistent with the rest of this schema,
-- no RLS).
-- ============================================================

create table expense_saved_views (
  id          uuid        primary key default uuid_generate_v4(),
  user_id     uuid        not null references auth.users(id) on delete cascade,
  name        text        not null,
  filters     jsonb       not null default '{}',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index idx_expense_saved_views_user on expense_saved_views(user_id, created_at desc);

create trigger expense_saved_views_updated_at
  before update on expense_saved_views
  for each row execute function update_updated_at();
