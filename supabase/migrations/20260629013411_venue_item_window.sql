-- venue_items.type 允许 'window';新增 thickness(墙厚方向进深,cm)。
alter table venue_items drop constraint venue_items_type_valid;
alter table venue_items add constraint venue_items_type_valid check (type in
  ('equipment','renovation','area','corridor',
   'door_inward','door_outward','door_sliding','fire','power','network','window'));
alter table venue_items add column thickness integer not null default 0;
