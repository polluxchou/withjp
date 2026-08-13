-- ============================================================
-- Users Table for Profile Management
-- ============================================================

create table if not exists users (
  id            uuid primary key references auth.users(id) on delete cascade,
  name          text not null check (char_length(name) <= 30),
  role          agent_role not null,
  avatar_url    text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- Index for faster lookups
create index if not exists idx_users_role on users(role);

-- Trigger for updated_at
create trigger users_updated_at
  before update on users
  for each row
  execute function update_updated_at();

-- RLS policies
alter table users enable row level security;

-- Users can read all profiles
create policy "Users can view all profiles"
  on users for select
  using (true);

-- Users can update their own profile
create policy "Users can update own profile"
  on users for update
  using (auth.uid() = id);
