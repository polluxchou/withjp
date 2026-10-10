-- competitor_live_sessions：竞品的开播记录，一场一行。
-- 来源是 TikTok 主页 LIVE History 列表的原文，管理员在竞品卡片里粘贴导入
-- （解析见 src/lib/competitors/liveHistory.ts）。截图只能截到寥寥几场，这份清单
-- 才是开播规律、频率时长、每场热度的完整证据。
--
-- 只建表，不带任何竞品数据：仓库是 public。
-- 上线顺序：先在库里执行本文件，再合 PR —— 看板加载是并发整表拉取，
-- 任何一张表不存在都会让整个看板报错。

create table if not exists competitor_live_sessions (
  id            uuid        primary key default gen_random_uuid(),
  competitor_id uuid        not null references competitors(id) on delete cascade,
  -- 原文只有「几点几分」，开播时刻按解析时区还原成 UTC，分钟精度。
  started_at    timestamptz not null,
  -- 下播时刻早于开播时刻的（跨午夜）在解析时已算到次日。
  ended_at      timestamptz not null,
  title         text        not null default '',
  -- 原文是 106.7K / 1.6M 这样的缩写，换算成整数后是近似值。缺失为 null。
  likes         bigint,
  -- 目前只有 TikTok History 一个来源；留着这一列，以后接别的来源不必改表。
  source        text        not null default 'tiktok_history',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  -- 去重键：同一场重复粘贴是覆盖（更新标题、下播时刻、点赞），不是叠一行。
  -- 唯一约束顺带给 (competitor_id, started_at) 建了索引，按竞品取场次不必另建。
  constraint competitor_live_sessions_uk unique (competitor_id, started_at),
  constraint competitor_live_sessions_range_ck check (ended_at >= started_at),
  constraint competitor_live_sessions_source_ck check (source in ('tiktok_history'))
);

-- RLS 沿用竞品表那套 authenticated_only。
do $$
begin
  execute 'alter table competitor_live_sessions enable row level security';
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'competitor_live_sessions' and policyname = 'authenticated_only'
  ) then
    execute 'create policy "authenticated_only" on competitor_live_sessions for all to authenticated using (auth.uid() is not null)';
  end if;
end $$;
