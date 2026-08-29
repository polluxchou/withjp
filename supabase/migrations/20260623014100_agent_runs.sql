-- [2026-08-29 补录] 原 026_agent_runs.sql。2026-08-08 时间戳化(#150)时此文件从未入仓(一直
-- 在维护者工作区),被误判为「从未存在」;已按 information_schema 核对生产库,全部对象
-- 均已存在(即已手工执行过)。时间戳取文件 mtime 换算 Asia/Tokyo;内容未改,全程幂等。

-- ============================================================
-- Migration 026: Agent runs persistence (W1 — agent-service skeleton)
--
-- agent_runs:       一次 Agent 执行的主记录
-- agent_run_steps:  每个节点 / tool call 的步骤记录
-- ============================================================

-- ── agent_runs ──────────────────────────────────────────────
create table if not exists agent_runs (
  id               uuid primary key default uuid_generate_v4(),
  conversation_id  uuid references conversations(id) on delete set null,
  agent_role       text not null,
  user_id          uuid not null references users(id),
  status           text not null default 'running',
    -- running | completed | failed | awaiting_approval | cancelled
  parent_run_id    uuid references agent_runs(id) on delete set null,
  dispatch_depth   int not null default 0,
  idempotency_key  text unique,
  input_message    text not null,
  output_message   text,
  error            text,
  token_usage      jsonb,
  tool_call_count  int not null default 0,
  started_at       timestamptz not null default now(),
  completed_at     timestamptz
);

create index if not exists idx_agent_runs_conversation_id
  on agent_runs(conversation_id);

create index if not exists idx_agent_runs_user_status
  on agent_runs(user_id, status);

-- ── agent_run_steps ─────────────────────────────────────────
create table if not exists agent_run_steps (
  id          uuid primary key default uuid_generate_v4(),
  run_id      uuid not null references agent_runs(id) on delete cascade,
  step_index  int not null,
  step_type   text not null,
    -- llm_call | tool_call | dispatch | approval_gate | checkpoint
  tool_name   text,
  input       jsonb,
  output      jsonb,
  status      text not null,
    -- ok | error | skipped | pending_approval
  duration_ms int,
  created_at  timestamptz not null default now()
);

create index if not exists idx_agent_run_steps_run_idx
  on agent_run_steps(run_id, step_index);
