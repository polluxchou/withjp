-- ============================================================
-- Migration 025: Discussions system
--
-- Adds service-agent registry, per-(service,year) topic sequences,
-- threads (record / filter / saved_view subjects), messages, and a
-- concurrency-safe topic_code generator.
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

create trigger service_agents_updated_at
  before update on service_agents
  for each row execute function update_updated_at();

-- Seed three v1 services bound to existing agents.
-- Reuses Morgan / Casey / Jordan; agent prompt_template adaptation
-- for discussion-mode summary is deferred to PR3.
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

-- ── Per-(service, year) topic counter ────────────────────────
create table discussion_topic_sequences (
  service_key         text not null references service_agents(service_key),
  year                int  not null,
  last_issued_number  bigint not null default 0,
  updated_at          timestamptz not null default now(),
  primary key (service_key, year)
);

-- ── Enums (value sets are stable; use enum, not text) ────────
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
    (subject_type = 'filter'
       and subject_hash is not null
       and entity_id is null)
    or
    (subject_type in ('record', 'saved_view')
       and entity_id is not null
       and subject_hash is null)
  )
);

create index idx_threads_record on discussion_threads
  (service_key, subject_type, entity_type, entity_id, status)
  where subject_type in ('record', 'saved_view');

create index idx_threads_filter on discussion_threads
  (service_key, subject_type, entity_type, subject_hash, status)
  where subject_type = 'filter';

create trigger discussion_threads_updated_at
  before update on discussion_threads
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
    (sender_type = 'user'     and sender_user_id  is not null) or
    (sender_type = 'agent'    and sender_agent_id is not null) or
    (sender_type = 'external')
  )
);

create index idx_messages_thread on discussion_messages (thread_id, created_at)
  where deleted_at is null;

create trigger discussion_messages_updated_at
  before update on discussion_messages
  for each row execute function update_updated_at();

-- ── topic_code generator ─────────────────────────────────────
-- Format: <PREFIX>-<YEAR>-<6-digit-seq>, e.g. EXP-2026-000001.
-- Concurrency safety: ON CONFLICT DO UPDATE takes a row-level lock
-- on (service_key, year), serializing concurrent claims.
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
        updated_at         = now()
  returning last_issued_number into v_num;

  return format('%s-%s-%s', v_prefix, v_year, lpad(v_num::text, 6, '0'));
end $$;
