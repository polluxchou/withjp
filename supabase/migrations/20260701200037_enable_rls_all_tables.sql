-- Enable RLS on all public tables that were missing it.
-- Policy: authenticated users only (internal system).

do $$
declare
  t text;
  tables text[] := array[
    'config',
    'agents',
    'conversations',
    'conversation_messages',
    'query_log',
    'milestones',
    'creator_activity_logs',
    'devices',
    'creators',
    'lifecycle_transitions',
    'user_salary',
    'expenses',
    'expense_saved_views',
    'work_tasks',
    'pending_actions',
    'intent_violations',
    'service_agents',
    'finance',
    'finance_forecast_views',
    'finance_forecast_accounts',
    'finance_forecast_months',
    'finance_forecast_lifecycle_templates',
    'knowledge',
    'discussion_topic_sequences',
    'discussion_threads',
    'discussion_messages',
    'agent_runs',
    'agent_run_steps',
    'notifications',
    'venues',
    'venue_floors',
    'venue_editors',
    'items',
    'item_code_counters',
    'item_status_logs',
    'tasks'
  ];
begin
  foreach t in array tables loop
    -- skip tables that don't exist in this environment
    if not exists (
      select 1 from pg_tables where schemaname = 'public' and tablename = t
    ) then
      raise notice 'skipping %, table does not exist', t;
      continue;
    end if;

    execute format('alter table %I enable row level security', t);

    -- skip if policy already exists
    if not exists (
      select 1 from pg_policies where schemaname = 'public' and tablename = t and policyname = 'authenticated_only'
    ) then
      execute format(
        'create policy "authenticated_only" on %I for all to authenticated using (auth.uid() is not null)',
        t
      );
    end if;
  end loop;
end $$;
