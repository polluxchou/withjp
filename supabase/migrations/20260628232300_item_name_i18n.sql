-- [2026-08-29 补录] 原 036_item_name_i18n.sql。2026-08-08 时间戳化(#150)时此文件从未入仓(一直
-- 在维护者工作区),被误判为「从未存在」;已按 information_schema 核对生产库,全部对象
-- 均已存在(即已手工执行过)。时间戳取文件 mtime 换算 Asia/Tokyo;内容未改,全程幂等。

-- Add i18n name columns to items table (mirrors venue_items pattern).
alter table items
  add column if not exists name_ja          text not null default '',
  add column if not exists name_en          text not null default '',
  add column if not exists name_i18n_source text not null default '';
