-- ============================================================
-- Migration 009: Device Management
-- ============================================================

create table devices (
  id                uuid        primary key default uuid_generate_v4(),
  device_name       text        not null,
  unit_price        numeric(12,2) not null default 0,
  quantity          integer     not null default 1,
  total_price       numeric(12,2) generated always as (unit_price * quantity) stored,
  purchase_date     date        not null,
  purchase_location text        not null default '',
  purchase_purpose  text        not null default '',
  user_name         text        not null default '',
  buyer_name        text        not null default '',
  payment_method    text        not null default '',
  payment_status    text        not null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  constraint devices_unit_price_non_negative check (unit_price >= 0),
  constraint devices_quantity_positive       check (quantity > 0),
  constraint devices_payment_status_valid    check (
    payment_status in ('budgeted', 'ordered_unpaid', 'paid', 'refunded', 'partially_refunded')
  )
);

-- ── Indexes ──────────────────────────────────────────────────
create index idx_devices_device_name    on devices(device_name);
create index idx_devices_purchase_date  on devices(purchase_date);
create index idx_devices_payment_status on devices(payment_status);
create index idx_devices_user_name      on devices(user_name);
create index idx_devices_buyer_name     on devices(buyer_name);
create index idx_devices_payment_method on devices(payment_method);

-- ── updated_at trigger ───────────────────────────────────────
create trigger devices_updated_at
  before update on devices
  for each row execute function update_updated_at();
