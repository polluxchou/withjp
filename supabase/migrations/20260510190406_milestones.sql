-- ============================================================
-- Migration 003: Master Timeline — Milestones
-- ============================================================

create type milestone_type as enum (
  'campaign', 'launch', 'recruitment', 'finance', 'review'
);

create type milestone_level as enum ('company', 'department', 'creator');

create type milestone_status as enum (
  'planned', 'active', 'at_risk', 'completed', 'missed'
);

create type milestone_priority as enum ('high', 'medium', 'low');

create type risk_level as enum ('low', 'medium', 'high');

-- ── Milestones ───────────────────────────────────────────────
create table milestones (
  id                  uuid primary key default uuid_generate_v4(),
  title               text not null,
  description         text,
  type                milestone_type not null,
  level               milestone_level not null default 'company',
  owner_agent_id      uuid references agents(id) on delete set null,
  involved_agent_ids  uuid[] not null default '{}',
  linked_creator_ids  uuid[] not null default '{}',
  linked_task_ids     uuid[] not null default '{}',
  parent_milestone_id uuid references milestones(id) on delete set null,
  start_date          timestamptz not null,
  target_date         timestamptz not null,
  status              milestone_status not null default 'planned',
  priority            milestone_priority not null default 'medium',
  success_metric      jsonb not null default '{}',
  risk_level          risk_level not null default 'low',
  notes               text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  constraint milestones_date_order check (target_date > start_date)
);

-- ── Indexes ──────────────────────────────────────────────────
create index idx_milestones_status      on milestones(status);
create index idx_milestones_type        on milestones(type);
create index idx_milestones_target_date on milestones(target_date);
create index idx_milestones_parent      on milestones(parent_milestone_id);
create index idx_milestones_owner_agent on milestones(owner_agent_id);

-- ── updated_at trigger ───────────────────────────────────────
create trigger milestones_updated_at
  before update on milestones
  for each row execute function update_updated_at();
