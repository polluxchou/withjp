-- ============================================================
-- Migration 002: Agent-level model provider configuration
-- ============================================================

alter table agents
  add column if not exists model_provider text
    check (model_provider in ('anthropic', 'openai', 'gemini')),
  add column if not exists model_name text;

-- Set defaults for any existing agents that don't have a provider configured
update agents
  set model_provider = 'anthropic',
      model_name     = 'claude-sonnet-4-6'
where model_provider is null;
