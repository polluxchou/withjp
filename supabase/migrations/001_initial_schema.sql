-- ============================================================
-- Creator Guild AI OS — Initial Schema
-- ============================================================

create extension if not exists "uuid-ossp";

-- ── Enums ────────────────────────────────────────────────────
create type creator_status as enum (
  'prospect', 'contacted', 'engaged', 'onboarded', 'live_ready', 'live', 'monetized'
);

create type agent_role as enum ('bd', 'ops', 'finance');

create type task_status as enum ('pending', 'running', 'done', 'failed');

create type knowledge_category as enum (
  'outreach_scripts', 'onboarding_materials', 'live_strategies', 'objection_handling'
);

-- ── Creators ─────────────────────────────────────────────────
create table creators (
  id            uuid primary key default uuid_generate_v4(),
  name          text not null,
  platform      text not null,                         -- e.g. 'douyin', 'bilibili', 'youtube'
  status        creator_status not null default 'prospect',
  contact_info  jsonb not null default '{}',           -- { email, phone, wechat, social_handle }
  profile       jsonb not null default '{}',           -- { niche, followers, avg_views, location }
  notes         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- ── Agents ───────────────────────────────────────────────────
create table agents (
  id               uuid primary key default uuid_generate_v4(),
  name             text not null,
  role             agent_role not null,
  responsibility   text not null,
  input_schema     jsonb not null default '{}',
  output_schema    jsonb not null default '{}',
  prompt_template  text not null,
  is_active        boolean not null default true,
  created_at       timestamptz not null default now()
);

-- ── Tasks ────────────────────────────────────────────────────
create table tasks (
  id             uuid primary key default uuid_generate_v4(),
  creator_id     uuid not null references creators(id) on delete cascade,
  agent_id       uuid not null references agents(id),
  title          text not null,
  status         task_status not null default 'pending',
  input          jsonb not null default '{}',
  output         jsonb,
  next_action    text,
  parent_task_id uuid references tasks(id),          -- for agent chaining
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- ── Finance ──────────────────────────────────────────────────
create table finance (
  id          uuid primary key default uuid_generate_v4(),
  creator_id  uuid not null references creators(id) on delete cascade,
  revenue     numeric(12,2) not null default 0,
  cost        numeric(12,2) not null default 0,
  profit      numeric(12,2) generated always as (revenue - cost) stored,
  roi         numeric(8,4)  generated always as (
                case when cost = 0 then 0
                     else ((revenue - cost) / cost) * 100
                end
              ) stored,
  period      text not null,                          -- e.g. '2024-Q1'
  notes       text,
  created_at  timestamptz not null default now()
);

-- ── Knowledge ────────────────────────────────────────────────
create table knowledge (
  id          uuid primary key default uuid_generate_v4(),
  category    knowledge_category not null,
  title       text not null,
  content     text not null,
  tags        text[] not null default '{}',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ── Config ───────────────────────────────────────────────────
create table config (
  id           uuid primary key default uuid_generate_v4(),
  key          text unique not null,
  value        jsonb not null default '{}',
  description  text not null default '',
  updated_at   timestamptz not null default now()
);

-- ── Lifecycle Transitions (audit trail) ──────────────────────
create table lifecycle_transitions (
  id           uuid primary key default uuid_generate_v4(),
  creator_id   uuid not null references creators(id) on delete cascade,
  from_status  creator_status not null,
  to_status    creator_status not null,
  triggered_at timestamptz not null default now(),
  triggered_by text not null default 'system',
  notes        text
);

-- ── Indexes ──────────────────────────────────────────────────
create index idx_tasks_creator_id     on tasks(creator_id);
create index idx_tasks_status         on tasks(status);
create index idx_tasks_agent_id       on tasks(agent_id);
create index idx_finance_creator_id   on finance(creator_id);
create index idx_lifecycle_creator_id on lifecycle_transitions(creator_id);
create index idx_creators_status      on creators(status);
create index idx_knowledge_category   on knowledge(category);

-- ── updated_at trigger ───────────────────────────────────────
create or replace function update_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger creators_updated_at   before update on creators   for each row execute function update_updated_at();
create trigger tasks_updated_at      before update on tasks      for each row execute function update_updated_at();
create trigger knowledge_updated_at  before update on knowledge  for each row execute function update_updated_at();
