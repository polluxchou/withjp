-- ============================================================
-- Migration 031: Venue view bookmarks
-- 把"快速视图"(缩放比例 + 滚动位置)持久化到数据库。挂在 venues 行上，
-- 与场地一样全团队共享。结构为 JSON 数组：[{ zoom, left, top }, ...]，
-- 客户端最多保留 3 个。
-- ============================================================

alter table venues
  add column view_bookmarks jsonb not null default '[]'::jsonb;
