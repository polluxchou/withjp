-- ============================================================
-- Migration 029: Venue persistence
-- 把公会场地布局从浏览器 localStorage 迁入数据库，使其可全团队
-- 共享，并可被物品台账（迁移 030）引用。
-- 主键使用 text，直接沿用画布现有的字符串 id。
-- ============================================================

create table venues (
  id          text         primary key,
  name        text         not null,
  width       integer      not null,
  height      integer      not null,
  created_at  timestamptz  not null default now(),
  updated_at  timestamptz  not null default now()
);

create table venue_floors (
  id               text         primary key,
  venue_id         text         not null references venues(id) on delete cascade,
  name             text         not null,
  width            integer      not null,
  height           integer      not null,
  background_image text,
  sort_order       integer      not null default 0,
  created_at       timestamptz  not null default now(),
  updated_at       timestamptz  not null default now()
);

create table venue_items (
  id          text         primary key,
  floor_id    text         not null references venue_floors(id) on delete cascade,
  type        text         not null,
  name        text         not null default '',
  x           integer      not null default 0,
  y           integer      not null default 0,
  width       integer      not null default 0,
  height      integer      not null default 0,
  rotation    numeric      not null default 0,
  status      text         not null default 'planned',
  note        text         not null default '',
  z_index     integer      not null default 0,
  created_at  timestamptz  not null default now(),
  updated_at  timestamptz  not null default now(),

  constraint venue_items_type_valid check (type in
    ('equipment','renovation','area','corridor',
     'door_inward','door_outward','door_sliding','fire','power','network')),
  constraint venue_items_status_valid check (status in
    ('planned','in_progress','completed','maintenance'))
);

create index idx_venue_floors_venue on venue_floors(venue_id, sort_order);
create index idx_venue_items_floor  on venue_items(floor_id, z_index);

create trigger venues_updated_at       before update on venues       for each row execute function update_updated_at();
create trigger venue_floors_updated_at before update on venue_floors for each row execute function update_updated_at();
create trigger venue_items_updated_at  before update on venue_items  for each row execute function update_updated_at();

-- 预置单一共享场地，镜像 DEFAULT_VENUE_LAYOUT。
insert into venues (id, name, width, height) values ('guild-main', '主场地', 1200, 800);

insert into venue_floors (id, venue_id, name, width, height, sort_order) values
  ('floor-1', 'guild-main', '1F', 1200, 800, 0),
  ('floor-2', 'guild-main', '2F', 1200, 800, 1);

insert into venue_items (id, floor_id, type, name, x, y, width, height, rotation, status, note, z_index) values
  ('eq-1',       'floor-1', 'equipment',   '直播设备架',     120,  80, 160,  80, 0, 'completed',   '靠墙放置，保留走线空间。',     0),
  ('area-1',     'floor-1', 'renovation',  '直播间 A 装修区', 360, 120, 260, 180, 3, 'in_progress', '吸音墙和灯光轨道施工中。',     1),
  ('corridor-1', 'floor-1', 'corridor',    '主通道',         120, 560, 620,  72, 0, 'planned',     '保持通道净宽，不堆放设备。',   2),
  ('door-1',     'floor-1', 'door_inward', '主入口',         640, 600,  32,  32, 0, 'completed',   '内开门，注意开门半径。',       3),
  ('fire-1',     'floor-1', 'fire',        '灭火器',         980, 280,  32,  32, 0, 'completed',   '消防点位需保持可见。',         4),
  ('power-1',    'floor-1', 'power',       '设备区电源',     200, 200,  32,  32, 0, 'planned',     '',                             5);
