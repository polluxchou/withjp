-- ============================================================
-- Migration 016: Add 'terminated' to creator_status enum
--
-- Captures creators whose contract / engagement has ended. Reachable
-- from any active state (contacted onward); reversible back to
-- contacted if the relationship is reopened.
--
-- Postgres requires ALTER TYPE ... ADD VALUE to run outside a
-- transaction. If your migration runner wraps statements in a tx,
-- run this file directly.
-- ============================================================

alter type creator_status add value if not exists 'terminated';
