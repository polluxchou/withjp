-- [2026-08-29 补录] 原 028_deprecate_orphan_conversations.sql。2026-08-08 时间戳化(#150)时此文件从未入仓(一直
-- 在维护者工作区),被误判为「从未存在」;已按 information_schema 核对生产库,全部对象
-- 均已存在(即已手工执行过)。时间戳取文件 mtime 换算 Asia/Tokyo;内容未改,全程幂等。

-- ============================================================
-- Migration 028: 标记 user_id 为 null 的历史 conversation 为弃用
--
-- migration 027 给 conversations 加了 user_id 列，但既有数据无法
-- 安全归属（agents 表也没有 created_by_user_id）。本 migration：
--   1. 加 deprecated_at 列
--   2. backfill：所有 user_id IS NULL 的行打上 deprecated_at = now()
--   3. GET /api/conversations 已改为同时过滤 user_id 和 deprecated_at
-- 这些行不被 list、不能被 agent-service 校验通过；保留是为了
--   - conversation_messages 外键不被破坏
--   - 后续如果发现归属线索，可以人工 backfill user_id 并清 deprecated_at
-- ============================================================

alter table conversations
  add column if not exists deprecated_at timestamptz;

update conversations
  set deprecated_at = now()
  where user_id is null
    and deprecated_at is null;

create index if not exists idx_conversations_active
  on conversations(user_id)
  where deprecated_at is null;
