-- ============================================================
-- Migration 030: Item (asset) registry
-- 物品台账：每个物品关联一条支出（成本）和一个场地区域（放置）。
-- 实物必填成本+位置；虚拟商品无位置、成本选填。
-- ============================================================

-- 人类可读编号计数器（每年一行，并发安全自增）
create table item_code_counters (
  year      integer primary key,
  last_seq  integer not null default 0
);

create table items (
  id                       uuid          primary key default uuid_generate_v4(),
  item_code                text          not null unique,
  name                     text          not null,
  kind                     text          not null,
  expense_id               uuid          references expenses(id) on delete restrict,
  placement_venue_item_id  text          references venue_items(id) on delete restrict,
  quantity                 integer       not null default 1,
  status                   text          not null default 'in_use',
  responsible_person       text,
  serial_number            text,
  photo_url                text,
  notes                    text,
  created_by_user_id       uuid,
  created_at               timestamptz   not null default now(),
  updated_at               timestamptz   not null default now(),

  constraint items_kind_valid     check (kind in ('physical','virtual')),
  constraint items_status_valid   check (status in ('in_use','in_storage','under_repair','disposed')),
  constraint items_quantity_positive check (quantity >= 1),
  -- 核心业务规则：实物必须有成本+位置；虚拟不能有位置
  constraint items_kind_links_chk check (
    (kind = 'physical' and expense_id is not null and placement_venue_item_id is not null)
    or
    (kind = 'virtual'  and placement_venue_item_id is null)
  )
);

create index idx_items_kind        on items(kind);
create index idx_items_status      on items(status);
create index idx_items_expense     on items(expense_id);
create index idx_items_placement   on items(placement_venue_item_id);

create table item_status_logs (
  id                  uuid          primary key default uuid_generate_v4(),
  item_id             uuid          not null references items(id) on delete cascade,
  from_status         text,
  to_status           text          not null,
  note                text,
  changed_by_user_id  uuid,
  changed_at          timestamptz   not null default now()
);

create index idx_item_status_logs_item on item_status_logs(item_id, changed_at);

create trigger items_updated_at
  before update on items
  for each row execute function update_updated_at();

-- item_code 生成：WP-YYYY-NNNN，4 位零填充，每年重置。
-- on conflict 行级锁保证并发不重号。
create or replace function generate_item_code() returns trigger as $$
declare
  cur_year integer := extract(year from now())::int;
  next_seq integer;
begin
  if new.item_code is not null and new.item_code <> '' then
    return new;
  end if;
  insert into item_code_counters (year, last_seq)
    values (cur_year, 1)
    on conflict (year) do update set last_seq = item_code_counters.last_seq + 1
    returning last_seq into next_seq;
  new.item_code := 'WP-' || cur_year::text || '-' || lpad(next_seq::text, 4, '0');
  return new;
end;
$$ language plpgsql;

create trigger items_generate_code
  before insert on items
  for each row execute function generate_item_code();
