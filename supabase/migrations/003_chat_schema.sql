-- ============================================================
-- Migration 003: 6-department agent roles + chat persistence
-- ============================================================

-- ── Extend agent_role enum ───────────────────────────────────
-- PostgreSQL requires a commit boundary before ALTER TYPE can be used;
-- in Supabase migrations each file runs as a single transaction,
-- so we use DO blocks to avoid errors on re-run.
do $$ begin
  alter type agent_role add value if not exists 'content';
exception when duplicate_object then null; end $$;

do $$ begin
  alter type agent_role add value if not exists 'growth';
exception when duplicate_object then null; end $$;

do $$ begin
  alter type agent_role add value if not exists 'legal';
exception when duplicate_object then null; end $$;

-- ── chat_enabled flag on agents ──────────────────────────────
alter table agents
  add column if not exists chat_enabled boolean not null default true;

-- ── Conversations ────────────────────────────────────────────
create table if not exists conversations (
  id         uuid primary key default uuid_generate_v4(),
  agent_id   uuid not null references agents(id) on delete cascade,
  title      text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_conversations_agent_id on conversations(agent_id);

drop trigger if exists conversations_updated_at on conversations;

create trigger conversations_updated_at
  before update on conversations
  for each row execute function update_updated_at();

-- ── Conversation Messages ─────────────────────────────────────
create table if not exists conversation_messages (
  id              uuid primary key default uuid_generate_v4(),
  conversation_id uuid not null references conversations(id) on delete cascade,
  sender_type     text not null check (sender_type in ('user', 'agent')),
  agent_id        uuid references agents(id),
  content         text not null,
  created_at      timestamptz not null default now()
);

create index if not exists idx_conv_messages_conv_id
  on conversation_messages(conversation_id);

create index if not exists idx_conv_messages_created_at
  on conversation_messages(conversation_id, created_at);
