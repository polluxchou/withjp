-- [2026-08-29 补录] 原 044_competitor_dossier.sql。2026-08-08 时间戳化(#150)时此文件从未入仓(一直
-- 在维护者工作区),被误判为「从未存在」;已按 information_schema 核对生产库,全部对象
-- 均已存在(即已手工执行过)。时间戳取文件 mtime 换算 Asia/Tokyo;内容未改,全程幂等。

-- 044_competitor_dossier.sql
-- 竞品团播档案：补全 competitors 表缺失的指标字段 + 建截图表 + RLS。
-- competitors 表已在生产库中存在（无迁移记录），此文件仅做 ALTER ADD COLUMN IF NOT EXISTS。

-- 1. 给 competitors 补字段
alter table competitors add column if not exists followers     bigint;
alter table competitors add column if not exists likes_count  bigint;   -- 累计获赞（videoCount 拿不到时的备用指标）
alter table competitors add column if not exists video_count  integer;
alter table competitors add column if not exists counts_as_of date;

-- 2. competitor_shots（截图记录）
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

-- 3. RLS：沿用 authenticated_only 约定
do $$
declare
  t text;
  tables text[] := array['competitor_shots'];
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
