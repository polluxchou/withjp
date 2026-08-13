-- venue_items.type 允许 'truss'、'light'(桁架/吊灯)。不加新列。
alter table venue_items drop constraint venue_items_type_valid;
alter table venue_items add constraint venue_items_type_valid check (type in
  ('equipment','renovation','area','corridor','window',
   'door_inward','door_outward','door_sliding','fire','power','network',
   'truss','light'));
