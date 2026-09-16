-- competitor_descriptions：直播间历史图片的风格总结。
-- 本地任务（scripts/live-watch/record-style-description.mjs）按需生成写入，
-- 管理员也可在竞品卡昵称旁的浮层里手写补充。一个竞品多条，界面按生成日期倒序。
-- 写权限沿用 competitor_shots 那套 authenticated_only。

create table if not exists competitor_descriptions (
  id            uuid        primary key default gen_random_uuid(),
  competitor_id uuid        not null references competitors(id) on delete cascade,
  body          text        not null,
  -- 生成日期由写入方显式给出，不等于入库时间：补跑历史/重跑某个时间段的总结时，
  -- 靠它落到正确的位置，而不是全堆到执行那天。
  generated_on  date        not null,
  source        text        not null default 'manual' check (source in ('auto', 'manual')),
  created_at    timestamptz not null default now()
);

-- 列表按 (生成日期 desc, 入库时间 desc) 取，索引照这个顺序建。
create index if not exists idx_competitor_descriptions_competitor
  on competitor_descriptions(competitor_id, generated_on desc, created_at desc);

-- 自动路径每个竞品每天只留一条：脚本重跑同一天是覆盖（upsert），不是叠一条，
-- 否则多试几次浮层里就全是内容雷同的重复项。手写那条不受这个约束 ——
-- 人在同一天补两条不同的观察是合理的。
create unique index if not exists uq_competitor_descriptions_auto_day
  on competitor_descriptions(competitor_id, generated_on)
  where source = 'auto';

do $$
begin
  execute 'alter table competitor_descriptions enable row level security';
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'competitor_descriptions' and policyname = 'authenticated_only'
  ) then
    execute 'create policy "authenticated_only" on competitor_descriptions for all to authenticated using (auth.uid() is not null)';
  end if;
end $$;
