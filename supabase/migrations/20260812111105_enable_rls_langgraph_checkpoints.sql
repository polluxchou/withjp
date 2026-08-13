-- 补开 LangGraph checkpointer 表的 RLS。
-- 背景：这 4 张表由 agent-service 启动时 AsyncPostgresSaver.setup() 自动创建于 public schema,
-- 因此被 PostgREST 暴露,触发 Supabase "rls_disabled_in_public" 告警。
--
-- 与业务表不同:agent-service 用 SUPABASE_DB_URL 直连 Postgres(postgres 角色,rolbypassrls=true,
-- 且这 4 张表 owner 就是 postgres、未开 FORCE RLS),从不经 anon/authenticated key 访问这些表。
-- 所以这里只开 RLS、**不加任何策略**(deny-all):公开 API 彻底封死,后端直连不受影响。
--
-- 注:本文件曾以 043 编号写好但从未在生产库执行,导致 2026-08-09 再次收到告警;
-- 043 编号已被竞品档案迁移占用,故重新编号为 047 入库。脚本幂等,重复执行无副作用。

do $$
declare
  t text;
  tables text[] := array[
    'checkpoints',
    'checkpoint_blobs',
    'checkpoint_writes',
    'checkpoint_migrations'
  ];
begin
  foreach t in array tables loop
    -- 表由 langgraph 运行时创建;某些环境可能尚不存在
    if exists (
      select 1 from pg_tables where schemaname = 'public' and tablename = t
    ) then
      execute format('alter table %I enable row level security', t);
    else
      raise notice 'skipping %, table does not exist', t;
    end if;
  end loop;
end $$;
