-- ============================================================
-- Migration 018: Finance Forecast Inputs
-- Stores monthly forecast assumptions separately from synced
-- expense budgets. Budget costs continue to come from expenses.
-- ============================================================

create table finance_forecast_months (
  year               integer     not null,
  month              text        not null,
  actual_revenue_usd numeric(12,2) not null default 0,
  note               text        not null default '',
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),

  primary key (year, month),
  constraint finance_forecast_month_format check (month ~ '^\d{4}-\d{2}$'),
  constraint finance_forecast_month_year_match check (left(month, 4)::integer = year),
  constraint finance_forecast_actual_non_negative check (actual_revenue_usd >= 0)
);

create table finance_forecast_accounts (
  id                     text        primary key,
  year                   integer     not null,
  month                  text        not null,
  account_name           text        not null default '',
  account_type           text        not null,
  live_days              numeric(8,2)  not null default 0,
  avg_daily_hours        numeric(8,2)  not null default 0,
  revenue_per_minute_usd numeric(12,4) not null default 0,
  share_ratio_pct        numeric(5,2)  not null default 0,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),

  constraint finance_forecast_account_type_valid check (
    account_type in ('key', 'mature', 'growing', 'newbie', 'test', 'other')
  ),
  constraint finance_forecast_live_days_non_negative check (live_days >= 0),
  constraint finance_forecast_hours_non_negative check (avg_daily_hours >= 0),
  constraint finance_forecast_minute_revenue_non_negative check (revenue_per_minute_usd >= 0),
  constraint finance_forecast_share_ratio_range check (share_ratio_pct >= 0 and share_ratio_pct <= 100),
  constraint finance_forecast_accounts_month_fk
    foreign key (year, month)
    references finance_forecast_months(year, month)
    on delete cascade
);

create index idx_finance_forecast_accounts_year_month on finance_forecast_accounts(year, month);
create index idx_finance_forecast_accounts_type on finance_forecast_accounts(account_type);

create trigger finance_forecast_months_updated_at
  before update on finance_forecast_months
  for each row execute function update_updated_at();

create trigger finance_forecast_accounts_updated_at
  before update on finance_forecast_accounts
  for each row execute function update_updated_at();
