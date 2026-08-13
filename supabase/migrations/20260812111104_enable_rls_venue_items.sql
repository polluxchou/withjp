-- 补开 venue_items 的 RLS。
-- 背景：038 批量开 RLS 时表清单误写为 items(030 建),漏了 venue_items(029 建),
-- 触发 Supabase "rls_disabled_in_public / Table publicly accessible" 告警。
-- 沿用全库 authenticated_only 约定(登录用户可读写,写权限在 service 层再收紧)。
--
-- 注:本文件曾以 042 编号在本地手工执行过(生产库已生效),但一直没进 git,
-- 而 042/043 编号已被竞品监测那条线占用,故重新编号为 046 入库。
-- 脚本幂等,重复执行无副作用。

do $$
begin
  -- 表可能在某些环境不存在,存在才处理
  if exists (
    select 1 from pg_tables where schemaname = 'public' and tablename = 'venue_items'
  ) then
    alter table venue_items enable row level security;

    if not exists (
      select 1 from pg_policies
      where schemaname = 'public' and tablename = 'venue_items' and policyname = 'authenticated_only'
    ) then
      create policy "authenticated_only" on venue_items
        for all to authenticated using (auth.uid() is not null);
    end if;
  else
    raise notice 'skipping venue_items, table does not exist';
  end if;
end $$;
