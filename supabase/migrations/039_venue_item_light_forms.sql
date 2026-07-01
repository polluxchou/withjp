-- 丢弃旧 light 数据;venue_items.type 用 4 种新灯替换 'light'(保留 truss)。
delete from venue_items where type = 'light';
alter table venue_items drop constraint venue_items_type_valid;
alter table venue_items add constraint venue_items_type_valid check (type in
  ('equipment','renovation','area','corridor','window',
   'door_inward','door_outward','door_sliding','fire','power','network',
   'truss','light_grille4','light_grille8_stand','light_spot','light_grille4_stand'));
