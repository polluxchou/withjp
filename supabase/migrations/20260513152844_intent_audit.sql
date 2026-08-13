-- ============================================================
-- Migration 022: Intent-layer audit
--
-- Adds an audit channel for events where the intent pipeline
-- rejected a request — input-gate failures, parser failures,
-- classifier/extractor mismatches, schema refinements, and
-- authz rejections at stage- or apply-time.
--
-- These are the signals we need to spot abuse:
--   * one user sees a spike in rejections
--   * a particular stage starts failing at unusual rates
--   * the same raw_text shape recurs (probe / fuzzer)
--
-- Successful queries continue to land in `query_log`; the new
-- `flagged` flag there is set when a query was let through but
-- exhibited "wide" properties worth eyeballing later.
-- ============================================================

-- ── 1. flagged columns on query_log ──────────────────────────

alter table query_log
  add column if not exists flagged     boolean not null default false,
  add column if not exists flag_reason text;

create index if not exists idx_query_log_flagged
  on query_log (created_at desc)
  where flagged = true;

-- ── 2. intent_violations ─────────────────────────────────────

create table if not exists intent_violations (
  id            uuid        primary key default uuid_generate_v4(),
  -- user_id may be null when the request was rejected before auth resolved,
  -- but our current /api/intent route always authenticates first so in
  -- practice this column is populated.
  user_id       uuid,
  channel       text        not null default 'web',
  -- Which layer rejected the request. Keep as text (not enum) so we can add
  -- new stages without a migration.
  stage         text        not null,
  reason        text        not null,
  -- Original user input AFTER the route's NFKC/control-char scrub. Capped
  -- by the input gate so storing it is bounded.
  raw_text      text,
  -- When available, the LLM-parsed intent that triggered the rejection.
  intent_json   jsonb,
  created_at    timestamptz not null default now()
);

create index if not exists idx_intent_violations_user_created
  on intent_violations (user_id, created_at desc);

create index if not exists idx_intent_violations_stage_created
  on intent_violations (stage, created_at desc);
