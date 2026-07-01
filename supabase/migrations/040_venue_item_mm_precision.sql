-- 平面尺寸支持毫米精度:x/y/width/height 由 integer 改为 numeric(允许 0.1cm 小数)。
-- 现有整数值自动转 numeric,无损;其余列不变。
alter table venue_items
  alter column x      type numeric using x::numeric,
  alter column y      type numeric using y::numeric,
  alter column width  type numeric using width::numeric,
  alter column height type numeric using height::numeric;
