-- [2026-08-29 补录] 原 027_w1_followups.sql。2026-08-08 时间戳化(#150)时此文件从未入仓(一直
-- 在维护者工作区),被误判为「从未存在」;已按 information_schema 核对生产库,全部对象
-- 均已存在(即已手工执行过)。时间戳取文件 mtime 换算 Asia/Tokyo;内容未改,全程幂等。

-- ============================================================
-- Migration 027: W1 follow-ups
--
-- 1. conversations.user_id — 让 conversation 有真正的 owner，
--    让 agent-service 能做 ownership 校验（W1 验收 #4）。
--    legacy 行允许为 null，但 agent-service 会拒绝 user_id 为 null 的会话。
-- 2. agents.model_provider CHECK 扩展，允许 'deepseek'。
-- 3. agent_runs.idempotency_key 唯一约束改成复合
--    (user_id, idempotency_key)，防止跨用户串号。
-- ============================================================

-- ── 1. conversations.user_id ────────────────────────────────
alter table conversations
  add column if not exists user_id uuid references users(id) on delete cascade;

create index if not exists idx_conversations_user_id
  on conversations(user_id);

-- ── 2. agents.model_provider CHECK 扩展 ─────────────────────
do $$
declare
  c_name text;
begin
  select con.conname into c_name
  from pg_constraint con
  join pg_class      rel on rel.oid = con.conrelid
  where rel.relname = 'agents'
    and con.contype = 'c'
    and pg_get_constraintdef(con.oid) ilike '%model_provider%';

  if c_name is not null then
    execute format('alter table agents drop constraint %I', c_name);
  end if;
end $$;

alter table agents
  add constraint agents_model_provider_check
    check (model_provider is null or model_provider in (
      'anthropic', 'openai', 'gemini', 'deepseek'
    ));

-- ── 3. agent_runs.idempotency_key 改为 (user_id, key) 复合 unique ──
alter table agent_runs
  drop constraint if exists agent_runs_idempotency_key_key;

create unique index if not exists uniq_agent_runs_user_idempotency
  on agent_runs (user_id, idempotency_key)
  where idempotency_key is not null;
