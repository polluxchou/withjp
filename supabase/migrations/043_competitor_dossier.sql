-- 043_competitor_dossier.sql
-- 团播档案扩展：给 competitors 补团级字段；新建 competitor_shots（手动上传截图）。
-- 写权限在 service 层放开为所有登录用户；沿用 authenticated_only RLS。

-- A. competitors 团级稳定属性（均可空，不破坏现有行）
alter table competitors add column if not exists avatar_url    text;
alter table competitors add column if not exists region        text not null default 'JP';
alter table competitors add column if not exists member_count  integer;
alter table competitors add column if not exists composition   text;
alter table competitors add column if not exists launch_city   text;
alter table competitors add column if not exists launched_on   date;
alter table competitors add column if not exists mc_note       text;
alter table competitors add column if not exists online_note   text;
alter table competitors add column if not exists latest_videos jsonb;

-- B. 截图表
create table if not exists competitor_shots (
  id            uuid        primary key default gen_random_uuid(),
  competitor_id uuid        not null references competitors(id) on delete cascade,
  image_url     text        not null,
  shot_on       date,
  tag           text,
  caption       text        not null default '',
  sort_order    integer     not null default 0,
  created_at    timestamptz not null default now()
);
create index if not exists idx_competitor_shots_competitor
  on competitor_shots(competitor_id, shot_on);

-- C. RLS：登录用户可读写（沿用 authenticated_only）
do $$
begin
  execute 'alter table competitor_shots enable row level security';
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'competitor_shots' and policyname = 'authenticated_only'
  ) then
    execute 'create policy "authenticated_only" on competitor_shots for all to authenticated using (auth.uid() is not null)';
  end if;
end $$;
