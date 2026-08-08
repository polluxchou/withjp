-- ============================================================
-- Migration 032: item photos storage bucket
-- 公开读取的物品照片桶；上传通过 service-role 后端路由完成。
-- ============================================================
insert into storage.buckets (id, name, public)
values ('item-photos', 'item-photos', true)
on conflict (id) do nothing;
