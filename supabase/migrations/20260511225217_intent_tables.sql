-- ============================================================
-- Migration 014: Intent Layer
-- Tables that back the natural-language operation pipeline.
--
--   * pending_actions — staged create/update/delete awaiting
--     human confirmation. 10-minute TTL.
--   * query_log       — historical record of read-only queries
--     for analytics and "what did I ask before" lookups.
--
-- The intent parser and executor live in src/lib/intent/* and
-- write to these tables; the existing entity HTTP routes are
-- unchanged.
-- ============================================================

-- ── pending_actions ─────────────────────────────────────────

create type pending_action_status as enum (
  'pending',
  'confirmed',
  'applied',
  'cancelled',
  'expired',
  'failed'
);

create table pending_actions (
  id              uuid                  primary key default uuid_generate_v4(),
  user_id         uuid                  not null,
  channel         text                  not null default 'web',
  channel_msg_id  text,                          -- inbound message id (used by IM adapters)
  entity          text                  not null,-- 'expense' in v1
  op              text                  not null,-- 'create' | 'update' | 'delete'
  intent_json     jsonb                 not null,-- full validated intent payload
  target_id       uuid,                          -- update/delete: id of the matched row
  preview_text    text                  not null,
  status          pending_action_status not null default 'pending',
  applied_id      uuid,                          -- row created/affected on apply
  error_message   text,
  created_at      timestamptz           not null default now(),
  expires_at      timestamptz           not null default (now() + interval '10 minutes'),
  confirmed_at    timestamptz,
  applied_at      timestamptz,

  constraint pending_actions_op_valid     check (op in ('create', 'update', 'delete')),
  constraint pending_actions_entity_valid check (entity in ('expense'))
);

create index idx_pending_actions_user_status on pending_actions(user_id, status);
create index idx_pending_actions_expires_at  on pending_actions(expires_at)
  where status = 'pending';

-- ── query_log ───────────────────────────────────────────────

create table query_log (
  id            uuid        primary key default uuid_generate_v4(),
  user_id       uuid        not null,
  channel       text        not null default 'web',
  entity        text        not null,            -- 'expense' in v1
  raw_text      text        not null,            -- the original user message
  intent_json   jsonb       not null,            -- the parsed query intent
  result_json   jsonb,                           -- numerator/denominator/ratio/list
  breadcrumbs   text,                            -- human-readable filter summary
  duration_ms   integer,                         -- end-to-end latency
  error_message text,
  created_at    timestamptz not null default now()
);

create index idx_query_log_user_created on query_log(user_id, created_at desc);
create index idx_query_log_entity       on query_log(entity);
