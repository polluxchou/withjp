-- 浏览器扩展一键截图上传（extensions/live-shot）：
--   A. competitor_shots 记录上传人，供「今日上传」按人统计；同一上传人同一读数时刻只留一张（重试/双击去重的数据库兜底）
--   B. 新表 competitor_viewer_readings：每次点击记下当前房间人数 + Following 侧栏同期竞品人数
-- 设计：docs/superpowers/specs/2026-10-09-live-shot-extension-design.md
-- 全部幂等，可重复执行核对。须先于 /api/competitors/quick-shot 上线执行：路由写 created_by、upsert 读数表。

-- A. 上传人
alter table competitor_shots
  add column if not exists created_by uuid references auth.users(id) on delete set null;
create index if not exists idx_competitor_shots_created_by_day
  on competitor_shots(created_by, shot_on);
-- 重试幂等的兜底：服务先按这三列查重，并发双击时后到的一方撞这条索引（23505）后认领先到的那一行。
-- 部分索引：历史行与自动巡检的 created_by 为 null，不受约束。
create unique index if not exists uq_competitor_shots_uploader_capture
  on competitor_shots(created_by, competitor_id, captured_at)
  where created_by is not null;
comment on column competitor_shots.created_by is '上传人（扩展一键上传写入；历史行与自动巡检为 null）';

-- B. 人数读数
create table if not exists competitor_viewer_readings (
  id            uuid        primary key default gen_random_uuid(),
  competitor_id uuid        not null references competitors(id) on delete cascade,
  captured_at   timestamptz not null,
  viewer_count  integer,
  viewer_text   text,
  source        text        not null check (source in ('current', 'sidebar')),
  viewer_source text        check (viewer_source in ('room', 'anchored', 'sole')),
  shot_id       uuid        references competitor_shots(id) on delete set null,
  created_by    uuid        references auth.users(id) on delete set null,
  created_at    timestamptz not null default now(),
  constraint competitor_viewer_readings_uk unique (competitor_id, captured_at, source)
);
create index if not exists idx_competitor_viewer_readings_competitor
  on competitor_viewer_readings(competitor_id, captured_at);
comment on column competitor_viewer_readings.source is 'current=当前房间（截图口径）；sidebar=Following 侧栏同期横截面';
comment on column competitor_viewer_readings.viewer_text is '页面原文，如 1.3K；viewer_count 是解析并钳位到 int4 的值，解析不出为 null';

-- C. RLS：登录用户可读写（沿用 authenticated_only）
do $$
begin
  execute 'alter table competitor_viewer_readings enable row level security';
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'competitor_viewer_readings' and policyname = 'authenticated_only'
  ) then
    execute 'create policy "authenticated_only" on competitor_viewer_readings for all to authenticated using (auth.uid() is not null)';
  end if;
end $$;
