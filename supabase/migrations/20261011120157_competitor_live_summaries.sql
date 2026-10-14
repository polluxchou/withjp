-- competitor_live_summaries：「开播时段」页「趋势总结」视图的数据——按日期留档的开播时段趋势总结。
-- 全局一份、不挂在某个竞品上：总结本来就是跨号比较（谁挤在同一个钟点、谁错峰、谁的作息在变）。
-- 由本地脚本（scripts/live-watch/record-live-summary.mjs）在有人让 Claude 生成时按需写入，
-- 不是定时任务；界面只读。
--
-- body 是 markdown，界面用 lib/markdown/miniMarkdown.ts 解析后渲染（不透传 HTML）。
-- 正文会点名道姓写竞品账号与数据，所以内容只存在库里：本仓库是公开的，
-- 迁移、种子、测试夹具里都不放真实总结。本迁移不插任何数据行。
-- 写权限沿用 competitor_descriptions 那套 authenticated_only。

create table if not exists competitor_live_summaries (
  id            uuid        primary key default gen_random_uuid(),
  -- 生成日期由写入方显式给出，不等于入库时间：补写某天的总结、重跑某一天时，
  -- 靠它落到正确的位置。页面 URL 的 day 参数按它选中。
  generated_on  date        not null,
  title         text        not null default '',
  -- 一行范围说明，列表里标题下面那行小字（几个号 · 起止日期 · 多少场）；可为空。
  subtitle      text        not null default '',
  body          text        not null,
  source        text        not null default 'auto' check (source in ('auto', 'manual')),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- 列表按 (生成日期 desc, 入库时间 desc) 取，索引照这个顺序建。
create index if not exists idx_competitor_live_summaries_day
  on competitor_live_summaries(generated_on desc, created_at desc);

-- 自动路径每天只留一份：同一天重新生成是覆盖，不是叠一份——否则多试几次列表里
-- 全是内容雷同的同日条目。手写那份不受这个约束。
create unique index if not exists uq_competitor_live_summaries_auto_day
  on competitor_live_summaries(generated_on)
  where source = 'auto';

-- 覆盖写入时由触发器刷新 updated_at（update_updated_at 定义在 initial_schema），
-- 脚本不用自己带时间戳。
drop trigger if exists competitor_live_summaries_updated_at on competitor_live_summaries;
create trigger competitor_live_summaries_updated_at
  before update on competitor_live_summaries
  for each row execute function update_updated_at();

do $$
begin
  execute 'alter table competitor_live_summaries enable row level security';
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'competitor_live_summaries' and policyname = 'authenticated_only'
  ) then
    execute 'create policy "authenticated_only" on competitor_live_summaries for all to authenticated using (auth.uid() is not null)';
  end if;
end $$;
