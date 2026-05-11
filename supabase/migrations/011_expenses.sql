-- ============================================================
-- Migration 011: Expense Management
-- Upgrades Device Management into a full Expense Management
-- system covering all operational cost categories.
-- ============================================================

-- ── Enums ────────────────────────────────────────────────────

create type expense_category as enum (
  'tangible_asset',   -- 有形资产（设备、硬件）
  'salary',           -- 薪资成本
  'rent',             -- 租金
  'travel',           -- 差旅费
  'office_supplies',  -- 办公耗材
  'cloud_services'    -- 云服务/网络费用
);

create type expense_payment_method as enum (
  'company_account',  -- 公司公共账户
  'wechat_pay',       -- 微信支付
  'alipay',           -- 支付宝
  'bank_card'         -- 银行卡
);

-- ── Expenses Table ────────────────────────────────────────────

create table expenses (
  id                    uuid              primary key default uuid_generate_v4(),
  expense_category      expense_category  not null default 'tangible_asset',
  item_name             text              not null,
  unit_price            numeric(12,2)     not null default 0,
  quantity              integer           not null default 1,
  total_price           numeric(12,2)     generated always as (unit_price * quantity) stored,
  expense_date          date              not null,
  location              text              not null default '',
  purpose               text              not null default '',
  period                text,             -- e.g. '2025-05', for salary/rent/cloud_services
  user_name             text              not null default '',
  buyer_name            text              not null default '',
  payment_method        expense_payment_method,
  payment_method_legacy text,             -- preserves old free-text value until user overrides
  payment_status        text              not null,
  notes                 text,
  created_at            timestamptz       not null default now(),
  updated_at            timestamptz       not null default now(),

  constraint expenses_unit_price_non_negative check (unit_price >= 0),
  constraint expenses_quantity_positive       check (quantity > 0),
  constraint expenses_payment_status_valid    check (
    payment_status in ('budgeted', 'ordered_unpaid', 'paid', 'refunded', 'partially_refunded')
  ),
  -- When paying via company account, buyer must be one of the 3 authorised payers
  constraint expenses_company_account_buyer   check (
    payment_method is distinct from 'company_account'
    or buyer_name in ('with-new', 'JP-代理陈昊', 'JP-代理小兽')
  )
);

-- ── Indexes ──────────────────────────────────────────────────

create index idx_expenses_category       on expenses(expense_category);
create index idx_expenses_expense_date   on expenses(expense_date);
create index idx_expenses_payment_status on expenses(payment_status);
create index idx_expenses_payment_method on expenses(payment_method);
create index idx_expenses_user_name      on expenses(user_name);
create index idx_expenses_buyer_name     on expenses(buyer_name);
create index idx_expenses_period         on expenses(period);

-- ── updated_at trigger ───────────────────────────────────────

create trigger expenses_updated_at
  before update on expenses
  for each row execute function update_updated_at();

-- ── Migrate existing devices → expenses ──────────────────────
-- All existing device records become 'tangible_asset' expenses.
-- Old free-text payment_method is preserved in payment_method_legacy.

insert into expenses (
  id,
  expense_category,
  item_name,
  unit_price,
  quantity,
  expense_date,
  location,
  purpose,
  user_name,
  buyer_name,
  payment_method_legacy,
  payment_status,
  created_at,
  updated_at
)
select
  id,
  'tangible_asset',
  device_name,
  unit_price,
  quantity,
  purchase_date,
  coalesce(purchase_location, ''),
  coalesce(purchase_purpose, ''),
  coalesce(user_name, ''),
  coalesce(buyer_name, ''),
  nullif(trim(payment_method), ''),
  payment_status,
  created_at,
  updated_at
from devices;
