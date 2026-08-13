-- 042_competitor_monitoring.sql
-- 竞品监测：竞品清单 + 每日打点快照。App 级全局参考数据（非空间隔离）。
-- 所有登录用户可读；清单写入在 service 层按 is_admin 收紧；快照写入只走 service-role 脚本。

create table if not exists competitors (
  id           uuid        primary key default gen_random_uuid(),
  platform     text        not null default 'tiktok'
               constraint competitors_platform_ck check (platform in ('tiktok')),
  handle       text        not null,
  profile_url  text        not null,
  display_name text,
  note         text        not null default '',
  created_at   timestamptz not null default now(),
  constraint competitors_platform_handle_uk unique (platform, handle)
);

create table if not exists competitor_snapshots (
  id            uuid        primary key default gen_random_uuid(),
  competitor_id uuid        not null references competitors(id) on delete cascade,
  captured_on   date        not null,
  followers     bigint,
  likes         bigint,
  videos        integer,
  following     bigint,
  display_name  text,
  bio           text,
  region        text,
  verified      boolean,
  raw           jsonb,
  captured_at   timestamptz not null default now(),
  constraint competitor_snapshots_daily_uk unique (competitor_id, captured_on)
);
-- 无需额外索引：competitor_snapshots_daily_uk 唯一约束已为 (competitor_id, captured_on) 建索引。

-- RLS：登录用户可读写（写权限在 service 层按 is_admin 再收紧），沿用 authenticated_only 约定。
do $$
declare
  t text;
  tables text[] := array['competitors', 'competitor_snapshots'];
begin
  foreach t in array tables loop
    execute format('alter table %I enable row level security', t);
    if not exists (
      select 1 from pg_policies
      where schemaname = 'public' and tablename = t and policyname = 'authenticated_only'
    ) then
      execute format(
        'create policy "authenticated_only" on %I for all to authenticated using (auth.uid() is not null)', t
      );
    end if;
  end loop;
end $$;
