-- ============================================================
-- Migration 010: PMO Agent foundation
--   - activity_events    (heavy event stream: mutations + messages)
--   - view_sessions      (lightweight read-behavior aggregation)
--   - activity_summaries (archival rollups, 7-day hot window)
--   - pmo_instances      (multi-instance PMO configuration)
--   - record_activity()  trigger function + per-table triggers
--
-- Idempotent: safe to re-run after a partial execution.
-- See docs/pmo-agent-design.md for design rationale.
-- ============================================================

-- ── Add 'pmo' to agent_role enum ─────────────────────────────
do $$ begin
  alter type agent_role add value if not exists 'pmo';
exception when duplicate_object then null; end $$;

-- ── Enums for activity stream ─────────────────────────────────
-- Wrapped in DO blocks so re-runs skip already-existing types.
do $$ begin
  create type activity_actor_type as enum ('user', 'agent', 'system');
exception when duplicate_object then null; end $$;

do $$ begin
  create type activity_action as enum (
    'create', 'update', 'delete', 'status_change', 'execute',
    'message_sent', 'message_received'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type activity_entity as enum (
    'creator', 'task', 'milestone', 'finance', 'device',
    'conversation', 'broadcast_account', 'user', 'knowledge', 'agent'
  );
exception when duplicate_object then null; end $$;

-- ── activity_events (heavy stream) ───────────────────────────
create table if not exists activity_events (
  id             uuid primary key default uuid_generate_v4(),
  actor_type     activity_actor_type not null,
  actor_user_id  uuid references users(id) on delete set null,
  actor_agent_id uuid references agents(id) on delete set null,

  entity_type    activity_entity not null,
  entity_id      uuid not null,
  action         activity_action not null,

  before         jsonb,
  after          jsonb,
  diff           jsonb,
  content        text,

  context        jsonb not null default '{}',

  created_at     timestamptz not null default now(),
  archived_at    timestamptz
);

create index if not exists idx_events_entity
  on activity_events(entity_type, entity_id, created_at desc);
create index if not exists idx_events_actor_user
  on activity_events(actor_user_id, created_at desc);
create index if not exists idx_events_action_created
  on activity_events(action, created_at desc);
create index if not exists idx_events_hot
  on activity_events(created_at desc) where archived_at is null;

-- ── view_sessions (lightweight read aggregation) ─────────────
create table if not exists view_sessions (
  id          uuid primary key default uuid_generate_v4(),
  user_id     uuid not null references users(id) on delete cascade,
  started_at  timestamptz not null,
  ended_at    timestamptz not null,
  views       jsonb not null default '{}',
  routes      text[] not null default '{}',
  created_at  timestamptz not null default now()
);

create index if not exists idx_view_sessions_user_time
  on view_sessions(user_id, started_at desc);

-- ── activity_summaries (archive rollup) ──────────────────────
create table if not exists activity_summaries (
  id           uuid primary key default uuid_generate_v4(),
  entity_type  activity_entity not null,
  entity_id    uuid not null,
  window_start timestamptz not null,
  window_end   timestamptz not null,
  event_count  integer not null default 0,
  actions      jsonb not null default '{}',
  actors       jsonb not null default '{}',
  highlights   text,
  created_at   timestamptz not null default now(),

  constraint activity_summaries_unique_window
    unique (entity_type, entity_id, window_start)
);

create index if not exists idx_summaries_entity_window
  on activity_summaries(entity_type, entity_id, window_start desc);

-- ── pmo_instances (multi-instance PMO configuration) ─────────
create table if not exists pmo_instances (
  id              uuid primary key default uuid_generate_v4(),
  name            text not null,
  description     text,
  agent_id        uuid not null references agents(id) on delete cascade,
  filter_config   jsonb not null default '{}',
  reminder_config jsonb not null default '{}',
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists idx_pmo_instances_active on pmo_instances(is_active);

drop trigger if exists pmo_instances_updated_at on pmo_instances;
create trigger pmo_instances_updated_at
  before update on pmo_instances
  for each row execute function update_updated_at();

-- ── record_activity() — generic trigger for business tables ──
-- Uses TG_ARGV[0] as the entity_type tag so one function serves all tables.
--
-- Actor resolution:
--   1. auth.uid()  — populated when the API call goes through PostgREST with a user JWT
--   2. NULL        — when service role is used (current default for /api/* routes)
--
-- Note: most /api/* routes currently use the service-role client, so actor_user_id
-- will be NULL and actor_type='system' for mutations. Phase 1.5 plan: migrate
-- mutation API routes to the auth-aware client so auth.uid() returns the real user.
-- View-session and conversation-message events get actor info from the row data
-- itself, so they are unaffected.
create or replace function record_activity() returns trigger
language plpgsql as $$
declare
  v_entity   activity_entity := tg_argv[0]::activity_entity;
  v_action   activity_action;
  v_actor_id uuid;
  v_diff     jsonb;
  v_before   jsonb;
  v_after    jsonb;
begin
  -- auth.uid() returns NULL outside of an authenticated PostgREST request.
  begin
    v_actor_id := auth.uid();
  exception when others then
    v_actor_id := null;
  end;

  if tg_op = 'INSERT' then
    v_action := 'create';
    v_after  := to_jsonb(new);
  elsif tg_op = 'DELETE' then
    v_action := 'delete';
    v_before := to_jsonb(old);
  elsif tg_op = 'UPDATE' then
    v_before := to_jsonb(old);
    v_after  := to_jsonb(new);

    -- Detect status_change for tables that have a status column
    if v_after ? 'status' and v_before ? 'status'
       and v_before->>'status' is distinct from v_after->>'status' then
      v_action := 'status_change';
    else
      v_action := 'update';
    end if;

    -- Build diff: keys whose values differ
    select jsonb_object_agg(
             key,
             jsonb_build_object('before', v_before -> key, 'after', v_after -> key)
           )
      into v_diff
      from (
        select key
        from jsonb_object_keys(v_after) as key
        where v_after -> key is distinct from v_before -> key
      ) changed_keys;
  end if;

  insert into activity_events (
    actor_type, actor_user_id,
    entity_type, entity_id, action,
    before, after, diff
  ) values (
    case when v_actor_id is not null then 'user' else 'system' end,
    v_actor_id,
    v_entity,
    coalesce((v_after ->> 'id')::uuid, (v_before ->> 'id')::uuid),
    v_action,
    v_before,
    v_after,
    v_diff
  );

  return coalesce(new, old);
end$$;

-- ── Attach triggers to business tables ───────────────────────
-- DROP IF EXISTS first so re-runs replace cleanly.

drop trigger if exists creators_activity on creators;
create trigger creators_activity
  after insert or update or delete on creators
  for each row execute function record_activity('creator');

drop trigger if exists tasks_activity on tasks;
create trigger tasks_activity
  after insert or update or delete on tasks
  for each row execute function record_activity('task');

drop trigger if exists milestones_activity on milestones;
create trigger milestones_activity
  after insert or update or delete on milestones
  for each row execute function record_activity('milestone');

drop trigger if exists finance_activity on finance;
create trigger finance_activity
  after insert or update or delete on finance
  for each row execute function record_activity('finance');

drop trigger if exists devices_activity on devices;
create trigger devices_activity
  after insert or update or delete on devices
  for each row execute function record_activity('device');

drop trigger if exists broadcast_accounts_activity on broadcast_accounts;
create trigger broadcast_accounts_activity
  after insert or update or delete on broadcast_accounts
  for each row execute function record_activity('broadcast_account');

drop trigger if exists knowledge_activity on knowledge;
create trigger knowledge_activity
  after insert or update or delete on knowledge
  for each row execute function record_activity('knowledge');

drop trigger if exists agents_activity on agents;
create trigger agents_activity
  after insert or update or delete on agents
  for each row execute function record_activity('agent');

drop trigger if exists users_activity on users;
create trigger users_activity
  after insert or update or delete on users
  for each row execute function record_activity('user');

-- ── Conversation messages → message_sent / message_received ──
-- Conversations themselves get the standard trigger above; messages need
-- content + correct action, so handle separately.
create or replace function record_message_activity() returns trigger
language plpgsql as $$
declare
  v_actor_id uuid;
  v_action   activity_action;
begin
  begin
    v_actor_id := auth.uid();
  exception when others then
    v_actor_id := null;
  end;

  v_action := case
    when new.sender_type = 'user'  then 'message_sent'
    when new.sender_type = 'agent' then 'message_received'
    else 'message_sent'
  end;

  insert into activity_events (
    actor_type,
    actor_user_id,
    actor_agent_id,
    entity_type, entity_id, action,
    content, context
  ) values (
    case when new.sender_type = 'agent' then 'agent'
         when v_actor_id is not null    then 'user'
         else 'system' end,
    v_actor_id,
    new.agent_id,
    'conversation',
    new.conversation_id,
    v_action,
    new.content,
    jsonb_build_object('message_id', new.id)
  );

  return new;
end$$;

drop trigger if exists conversation_messages_activity on conversation_messages;
create trigger conversation_messages_activity
  after insert on conversation_messages
  for each row execute function record_message_activity();

-- ── RLS ──────────────────────────────────────────────────────
-- Activity stream is admin-only by default; PMO reads via service role.
alter table activity_events       enable row level security;
alter table view_sessions         enable row level security;
alter table activity_summaries    enable row level security;
alter table pmo_instances         enable row level security;

-- Drop before recreate so re-runs are safe.
drop policy if exists "authenticated read activity_events"    on activity_events;
drop policy if exists "authenticated read activity_summaries" on activity_summaries;
drop policy if exists "authenticated read pmo_instances"      on pmo_instances;
drop policy if exists "users read own view_sessions"          on view_sessions;
drop policy if exists "users insert own view_sessions"        on view_sessions;
drop policy if exists "users update own view_sessions"        on view_sessions;

-- Read policies (authenticated users can read; tighten later as needed)
create policy "authenticated read activity_events"
  on activity_events for select using (auth.role() = 'authenticated');

create policy "authenticated read activity_summaries"
  on activity_summaries for select using (auth.role() = 'authenticated');

create policy "authenticated read pmo_instances"
  on pmo_instances for select using (auth.role() = 'authenticated');

-- Users can read/write their own view_sessions
create policy "users read own view_sessions"
  on view_sessions for select using (auth.uid() = user_id);

create policy "users insert own view_sessions"
  on view_sessions for insert with check (auth.uid() = user_id);

create policy "users update own view_sessions"
  on view_sessions for update using (auth.uid() = user_id);
