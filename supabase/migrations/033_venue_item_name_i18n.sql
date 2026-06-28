-- ============================================================
-- Migration 033: venue_items 名称的日/英译名(服务端管理)
-- name_ja / name_en：译名,随行删除;name_i18n_source：生成译名时
-- 依据的中文 name,作为陈旧标记(name <> name_i18n_source ⇒ 待翻译)。
-- ============================================================
alter table venue_items
  add column name_ja          text not null default '',
  add column name_en          text not null default '',
  add column name_i18n_source text not null default '';
