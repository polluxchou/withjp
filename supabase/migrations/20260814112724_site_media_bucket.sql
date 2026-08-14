-- Migration 20260814112724_site_media_bucket: 官网内容图片桶(新闻主图 / 成员照片)
-- 公开读:这些图本来就在官网上对外展示,与 item-photos 同理。
insert into storage.buckets (id, name, public)
values ('site-media', 'site-media', true)
on conflict (id) do nothing;
