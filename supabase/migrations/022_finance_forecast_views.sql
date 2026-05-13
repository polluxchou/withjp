-- ============================================================
-- Migration 022: Finance Forecast — User-scoped views
--
-- Lets each user own up to 3 forecast scenarios (e.g. conservative
-- vs aggressive). Admins can flip any view's is_public flag to make
-- it visible to everyone. Existing single-tenant forecast data is
-- preserved by attaching it to a public "全员视角" with NULL owner.
--
-- App layer enforces the 3-per-user quota and visibility/edit rules
-- (consistent with the rest of the schema — no RLS).
-- ============================================================

create table finance_forecast_views (
  id          uuid        primary key default uuid_generate_v4(),
  owner_id    uuid        references users(id) on delete cascade,
  name        text        not null check (char_length(name) between 1 and 60),
  note        text        not null default '',
  is_public   boolean     not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index idx_finance_forecast_views_owner on finance_forecast_views(owner_id);
create index idx_finance_forecast_views_public on finance_forecast_views(is_public) where is_public;

create trigger finance_forecast_views_updated_at
  before update on finance_forecast_views
  for each row execute function update_updated_at();

-- ── Attach view_id to existing forecast tables ────────────────

alter table finance_forecast_months  add column view_id uuid;
alter table finance_forecast_accounts add column view_id uuid;

-- Migrate legacy single-tenant data into a public "全员视角" with
-- NULL owner so it does not consume any user's 3-view quota.
do $$
declare
  legacy_view_id uuid;
  legacy_rows    integer;
begin
  select count(*) into legacy_rows from finance_forecast_months;
  if legacy_rows = 0 then
    select count(*) into legacy_rows from finance_forecast_accounts;
  end if;

  if legacy_rows > 0 then
    insert into finance_forecast_views (owner_id, name, note, is_public)
    values (null, '全员视角', '初始迁移：单视角时代的全公司预测数据。', true)
    returning id into legacy_view_id;

    update finance_forecast_months  set view_id = legacy_view_id where view_id is null;
    update finance_forecast_accounts set view_id = legacy_view_id where view_id is null;
  end if;
end $$;

alter table finance_forecast_months  alter column view_id set not null;
alter table finance_forecast_accounts alter column view_id set not null;

alter table finance_forecast_months
  add constraint finance_forecast_months_view_fk
  foreign key (view_id) references finance_forecast_views(id) on delete cascade;

-- The accounts → months FK previously joined on (year, month); it must
-- now include view_id so cross-view month rows don't collide.
alter table finance_forecast_accounts drop constraint finance_forecast_accounts_month_fk;

-- Months were uniquely (year, month); they must now be unique per view.
alter table finance_forecast_months drop constraint finance_forecast_months_pkey;
alter table finance_forecast_months add primary key (view_id, year, month);

alter table finance_forecast_accounts
  add constraint finance_forecast_accounts_month_fk
  foreign key (view_id, year, month)
  references finance_forecast_months(view_id, year, month)
  on delete cascade;

create index idx_finance_forecast_accounts_view_year_month
  on finance_forecast_accounts(view_id, year, month);
