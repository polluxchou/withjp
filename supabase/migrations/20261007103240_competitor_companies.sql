-- competitor_companies：团播竞品背后的公司（公会 / ライバー事務所）。
-- competitor_company_accounts：公司 ↔ 团播账号的关联。
--
-- 关联单独成表、不在 competitors 上加 company_id：一家公司旗下的团不一定都在
-- 追踪清单里（比如只在招聘里出现过团名、还不知道 TikTok 账号），这些团同样要挂
-- 在公司名下。所以一行关联 = 一个团：group_name 必填，handle 知道就填，
-- competitor_id 只在该团已被追踪时指向 competitors。
-- 追踪账号没有任何关联行 = "未归属"，页面单列。
--
-- 第一期只读：数据由迁移 / 本地脚本写入，页面只展示。写权限沿用竞品表那套
-- authenticated_only，留给后续的编辑界面。

create table if not exists competitor_companies (
  id                 uuid        primary key default gen_random_uuid(),
  -- 对外称呼（品牌名优先），页面卡片标题。
  name               text        not null unique,
  -- 法人全称；没查到留 null，页面显示"未查到"。
  legal_name         text,
  website            text,
  -- 所在地自由文本（公司地址 + 演播室分布），城市粒度不统一，不拆字段。
  location           text        not null default '',
  group_format       text        not null default '',
  -- 规模几乎全是公司自报，原样记录并在文本里注明口径。
  scale              text        not null default '',
  -- 中资背景：confirmed 证据确凿 / suspected 有迹象 / none_seen 未见迹象 / unknown 无从判断
  capital_background text        not null default 'unknown'
                     check (capital_background in ('confirmed', 'suspected', 'none_seen', 'unknown')),
  capital_note       text        not null default '',
  recruit_note       text        not null default '',
  note               text        not null default '',
  -- [{ "label": "PR TIMES 2026-08-22", "url": "https://..." }]
  sources            jsonb       not null default '[]'::jsonb,
  -- 信息截至哪天：调研数据会过期，页面要让人看得出新鲜度。
  info_as_of         date,
  sort_order         integer     not null default 0,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create table if not exists competitor_company_accounts (
  id            uuid        primary key default gen_random_uuid(),
  company_id    uuid        not null references competitor_companies(id) on delete cascade,
  group_name    text        not null,
  -- TikTok handle（不带 @）；不知道账号时为 null。
  handle        text,
  -- 已追踪时指向 competitors；竞品被删时关联保留、退回"未追踪"。
  competitor_id uuid        references competitors(id) on delete set null,
  note          text        not null default '',
  sort_order    integer     not null default 0,
  created_at    timestamptz not null default now(),
  unique (company_id, group_name)
);

create index if not exists idx_competitor_company_accounts_company
  on competitor_company_accounts(company_id, sort_order);

-- 一个追踪账号最多归属一家公司，否则"未归属"和公司卡片会对不上。
create unique index if not exists uq_competitor_company_accounts_competitor
  on competitor_company_accounts(competitor_id)
  where competitor_id is not null;

do $$
declare t text;
begin
  foreach t in array array['competitor_companies', 'competitor_company_accounts'] loop
    execute format('alter table %I enable row level security', t);
    if not exists (
      select 1 from pg_policies
      where schemaname = 'public' and tablename = t and policyname = 'authenticated_only'
    ) then
      execute format(
        'create policy "authenticated_only" on %I for all to authenticated using (auth.uid() is not null)', t);
    end if;
  end loop;
end $$;
