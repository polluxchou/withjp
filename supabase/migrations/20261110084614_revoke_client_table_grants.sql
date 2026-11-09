-- ============================================================
-- 收回浏览器端两个角色（anon / authenticated）对业务表的表级权限，
-- 并删掉「登录即全权」的宽松策略
--
-- 背景：`20260701200037_enable_rls_all_tables.sql` 给每张表挂的策略是
--
--   create policy "authenticated_only" on <表>
--     for all to authenticated using (auth.uid() is not null);
--
-- 等价于「只要登录就能读写整张表」。`20260814074006_…` 只收紧了 users /
-- broadcast_accounts / user_salary，`20260814112723_site_content.sql` 收紧了
-- site_news / site_members，其余表一直维持原状。anon key 打包在登录页的 JS 里，
-- 任何成员拿自己的会话直连 PostgREST，就能绕过 API 层的全部判定（管理员专属
-- 接口、只能改自己的行、支出管理的可见范围）直接读写这些表。
--
-- 另外两个角色还握着 Supabase 默认授予的全部表级权限，其中 TRUNCATE 不受
-- RLS 约束——所以只删策略不够，必须连表级权限一起收。
--
-- 【不改变任何应用行为】所有服务端读写走 service_role
-- （src/lib/supabase/server.ts），service_role 绕过 RLS 且有独立授权，本文件
-- 不碰它。anon / authenticated 在本仓只用于登录、登出、换取会话
-- （`supabase.from(` 在浏览器端与用户会话客户端零命中），浏览器插件同样只调
-- 认证接口。Realtime 发布里没有任何表。
--
-- 【做法】对下面名单里的每张表：
--   1. 删掉名单内列出的宽松策略。不留「收紧版」：没有策略 = 拒绝，将来万一
--      有人恢复了表级 grant，也不会有一条现成的策略把权限还回去。
--      `deny_scoped_accounts`（restrictive）保留，不受影响。
--   2. revoke all … from anon, authenticated。
-- 已经收紧过的五张表（users / broadcast_accounts / user_salary / site_news /
-- site_members）不在名单里，维持各自迁移定下的「authenticated 只读」。
--
-- 名单是显式写死的，不是「public 下所有表」：这样重复执行时不会误伤将来
-- 有意开放给浏览器的新表。名单包含后端服务自行创建的表（checkpoint_* 等），
-- 表不存在的环境会跳过。
--
-- 【新表的默认权限】由 postgres 角色新建的表，默认仍会自动授予 anon /
-- authenticated 全部权限（pg_default_acl）。第 3 段把这个默认值也收掉，之后
-- 新表只有 service_role 自动获得权限；需要浏览器直连的表按 README 的约定在
-- 建表迁移里显式 grant 最小集并配策略。
--
-- 本文件幂等，重复执行无副作用。
-- ============================================================

do $$
declare
  t text;
  p text;
  tables text[] := array[
    'activity_events',
    'activity_summaries',
    'agent_run_steps',
    'agent_runs',
    'agents',
    'business_task_positions',
    'business_tasks',
    'businesses',
    'checkpoint_blobs',
    'checkpoint_migrations',
    'checkpoint_writes',
    'checkpoints',
    'competitor_companies',
    'competitor_company_accounts',
    'competitor_descriptions',
    'competitor_live_sessions',
    'competitor_live_summaries',
    'competitor_shots',
    'competitor_snapshots',
    'competitor_viewer_readings',
    'competitors',
    'config',
    'conversation_messages',
    'conversations',
    'creator_activity_logs',
    'creators',
    'devices',
    'discussion_messages',
    'discussion_threads',
    'discussion_topic_sequences',
    'expense_saved_views',
    'expenses',
    'finance',
    'finance_forecast_accounts',
    'finance_forecast_lifecycle_templates',
    'finance_forecast_months',
    'finance_forecast_views',
    'intent_violations',
    'item_code_counters',
    'item_status_logs',
    'items',
    'knowledge',
    'lifecycle_transitions',
    'milestones',
    'notifications',
    'pending_actions',
    'pmo_instances',
    'position_members',
    'positions',
    'query_log',
    'service_agents',
    'site_applications',
    'task_items',
    'tasks',
    'venue_editors',
    'venue_floors',
    'venue_items',
    'venues',
    'view_sessions',
    'work_tasks'
  ];
  -- 历史上挂在这些表上的全部宽松策略名。
  loose_policies text[] := array[
    'authenticated_only',
    'authenticated read activity_events',
    'authenticated read activity_summaries',
    'authenticated read pmo_instances',
    'Authenticated can read site applications',
    'users insert own view_sessions',
    'users read own view_sessions',
    'users update own view_sessions'
  ];
begin
  foreach t in array tables loop
    if not exists (
      select 1 from pg_tables where schemaname = 'public' and tablename = t
    ) then
      raise notice 'skipping %, table does not exist', t;
      continue;
    end if;

    -- 1. 宽松策略
    for p in
      select policyname from pg_policies
      where schemaname = 'public' and tablename = t and policyname = any (loose_policies)
    loop
      execute format('drop policy %I on public.%I', p, t);
    end loop;

    -- 没开 RLS 的表顺手开上（正常情况下早已开启，这里只是兜底）。
    execute format('alter table public.%I enable row level security', t);

    -- 2. 表级权限
    execute format('revoke all on table public.%I from anon, authenticated', t);
  end loop;
end $$;

-- 3. 之后由 postgres 新建的表 / 序列，不再自动授权给浏览器端角色。
--    service_role 的默认授权不动。函数的默认 EXECUTE 不动：策略里用到的
--    public.is_scoped_account() 需要调用方角色可执行。
alter default privileges for role postgres in schema public
  revoke all on tables from anon, authenticated;
alter default privileges for role postgres in schema public
  revoke all on sequences from anon, authenticated;

-- ============================================================
-- 应用后自检（SQL Editor 里跑，或 `npm run audit:rls`）：
--
-- 1) anon 不应再有任何表级权限；authenticated 只应在五张表上剩 SELECT：
--    select grantee, table_name,
--           string_agg(privilege_type, ',' order by privilege_type) as privs
--    from information_schema.role_table_grants
--    where table_schema = 'public' and grantee in ('anon', 'authenticated')
--    group by grantee, table_name order by grantee, table_name;
--    → 期望：anon 0 行；authenticated 只有 broadcast_accounts / site_members /
--      site_news / user_salary / users，各自只有 SELECT
--
-- 2) 不应再有「登录即全权」的策略：
--    select tablename, policyname from pg_policies
--    where schemaname = 'public' and policyname = 'authenticated_only';
--    → 期望 0 行
--
-- 3) 服务端仍能读写（任取一张表）：
--    select has_table_privilege('service_role', 'public.expenses',
--                               'select,insert,update,delete');
--    → 期望 t
-- ============================================================
