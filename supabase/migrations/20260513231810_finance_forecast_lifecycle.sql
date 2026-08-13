-- ============================================================
-- Migration 023: Finance Forecast — Account lifecycle templates
--
-- Pre-canned 12-month broadcasting trajectories that users can
-- apply when adding a new account in the forecast. Each user owns
-- 5 templates keyed by the starting stage; each template is 12 row
-- entries (month offsets 0..11) defining how the account progresses.
--
-- The starting-stage label is just an organisational handle — within
-- a template, each month can carry its own account_type so a template
-- can model genuine progression (e.g. 测试 → 新 → 成长 → 成熟).
--
-- App layer enforces the per-user scope (consistent with the rest of
-- this schema — no RLS).
-- ============================================================

create table finance_forecast_lifecycle_templates (
  user_id                uuid          not null references users(id) on delete cascade,
  starting_stage         text          not null,
  month_offset           integer       not null,
  account_type_at_month  text          not null,
  live_days              numeric(8,2)  not null default 0,
  avg_daily_hours        numeric(8,2)  not null default 0,
  revenue_per_minute_usd numeric(12,4) not null default 0,
  share_ratio_pct        numeric(5,2)  not null default 0,
  created_at             timestamptz   not null default now(),
  updated_at             timestamptz   not null default now(),

  primary key (user_id, starting_stage, month_offset),

  constraint finance_forecast_lifecycle_start_stage_valid check (
    starting_stage in ('key', 'mature', 'growing', 'newbie', 'test')
  ),
  constraint finance_forecast_lifecycle_month_offset_range check (
    month_offset between 0 and 11
  ),
  constraint finance_forecast_lifecycle_account_type_valid check (
    account_type_at_month in ('key', 'mature', 'growing', 'newbie', 'test', 'other')
  ),
  constraint finance_forecast_lifecycle_live_days_non_negative check (live_days >= 0),
  constraint finance_forecast_lifecycle_hours_non_negative check (avg_daily_hours >= 0),
  constraint finance_forecast_lifecycle_minute_revenue_non_negative check (revenue_per_minute_usd >= 0),
  constraint finance_forecast_lifecycle_share_ratio_range check (
    share_ratio_pct >= 0 and share_ratio_pct <= 100
  )
);

create index idx_finance_forecast_lifecycle_user on finance_forecast_lifecycle_templates(user_id);

create trigger finance_forecast_lifecycle_templates_updated_at
  before update on finance_forecast_lifecycle_templates
  for each row execute function update_updated_at();
