-- 受限帐号（只开竞品监测）：见 src/lib/auth/access-scope.ts。
-- 全部幂等，可重复执行核对。须先于对应代码上线执行：新代码在建帐号、描述、开播记录时写 created_by。

-- 1. 竞品三张表补上传人（截图表 competitor_shots.created_by 早已存在）。
--    受限帐号只能改 created_by 是自己的行；历史行为空，受限帐号一律不能改。
alter table competitors
  add column if not exists created_by uuid references users(id) on delete set null;
alter table competitor_descriptions
  add column if not exists created_by uuid references users(id) on delete set null;
alter table competitor_live_sessions
  add column if not exists created_by uuid references users(id) on delete set null;

comment on column competitors.created_by is '建档人（界面新增时写入；历史行与脚本建档为 null）';
comment on column competitor_descriptions.created_by is '撰写人（界面手写时写入；自动生成与历史行为 null）';
comment on column competitor_live_sessions.created_by is '首次导入人（覆盖已有场次时不改；历史行为 null）';

-- 2. 数据库这一层也把受限帐号挡在外面。
--    anon key 本就在浏览器里，受限帐号拿自己的会话可以绕过网站直接打 PostgREST。
--    现有策略大多是「登录即全权」(auth.uid() is not null)，所以给 public 下每张开了
--    RLS 的表加一条 restrictive 策略：受限帐号一律无权。restrictive 与原有的
--    permissive 策略取交集，不用逐张改旧策略；网站后端走 service role，不受影响。
--    access_scope 在 app_metadata 里（只有 service role 能写），随 JWT 签发。
create or replace function public.is_scoped_account()
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce(auth.jwt() -> 'app_metadata' ->> 'access_scope', '') <> ''
$$;

do $$
declare
  t record;
begin
  for t in
    select c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p') and c.relrowsecurity
  loop
    if not exists (
      select 1 from pg_policies
      where schemaname = 'public' and tablename = t.relname and policyname = 'deny_scoped_accounts'
    ) then
      execute format(
        'create policy "deny_scoped_accounts" on public.%I as restrictive for all to authenticated '
        'using (not public.is_scoped_account()) with check (not public.is_scoped_account())',
        t.relname
      );
    end if;
  end loop;
end $$;

-- 之后新建的表要自己补这条策略（重跑本文件第 2 段即可，已加过的会跳过）。
