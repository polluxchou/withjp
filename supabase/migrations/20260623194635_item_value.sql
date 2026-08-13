-- Migration 034: custom item_value for asset accounting
-- Allows an item to carry a value lower than its linked expense's total_price
-- (e.g. one expense covers multiple items).
-- NULL means "use the linked expense's total_price as the asset value".
alter table items
  add column item_value numeric(15,2) check (item_value is null or item_value > 0);
