-- ============================================================
-- 官网内容表：site_news / site_members
--
-- 背景：docs/superpowers/specs/2026-08-13-site-content-and-recruitment-design.md
-- §3.2（内容表 DDL）与 §3.3（RLS）。官网的新闻与成员内容从 i18n 文案搬进数据库，
-- 本迁移只建表 + RLS，不做数据搬迁（数据搬迁见 §3.4 的 scripts/seed-site-content.mjs）。
--
-- 两张专用表，不用通用表 + jsonb：字段少、形状差异大，而 check 约束、索引与
-- 「哪些字段必填」这三件事在 jsonb 里全部失去表达能力。
--
-- 三语用三列，不用 jsonb —— 只有列才能把「ja 必填」写成 not null。
--
-- 本文件幂等，重复执行无副作用。
-- ============================================================

-- ── 新闻 ──────────────────────────────────────────────────────
create table if not exists site_news (
  id           uuid primary key default gen_random_uuid(),
  -- slug 是稳定路由标识，发出去的链接不能因为改标题或插入新文章而失效
  -- （沿用 src/lib/site/news.ts 原有的理由）
  slug         text not null unique
                 check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 60),
  -- 与 site.news.filters 的词表一致（ALL 只是 UI 筛选项，不是 tag 取值）
  tag          text not null check (tag in ('RECRUIT', 'PROJECT', 'LIVE')),
  -- 不随语言变化的内容分类，控制页面**行为**而非展示：文末「去应募」CTA 只在
  -- recruit 类文章出现（上游 #197 的 shouldShowNewsApply，现由 src/lib/site/news.ts
  -- 的 NEWS_CATEGORIES 常量提供）。
  --
  -- **它和 tag 不是一回事，不要合并。** tag 是给访客看的筛选标签，category 是
  -- 行为开关。今天两者恰好高度相关（RECRUIT ↔ recruit），但把 CTA 挂在 tag 上
  -- 意味着以后想要「一条带 RECRUIT 标签、但不挂应募入口的资讯」就无法表达。
  -- 迁移时漏掉这一列，会直接丢失已上线的「只有招募类文章才显示应募按钮」。
  category     text not null default 'project' check (category in ('project', 'recruit')),
  published_on date not null,
  is_pinned    boolean not null default false,
  -- 下架能力（2026-08-13 确认需要）：false = 内容还在库里，但官网不展示。
  -- 比软删便宜也比软删诚实——运营要的是「先撤下来再想怎么改」，不是删除。
  -- 默认 true：后台没有草稿态，新建即发布（§5.2）。
  is_published boolean not null default true,
  -- 两种形态并存：搬迁进来的 5 篇沿用仓库里的静态路径（/site/*.webp），
  -- 后台新上传的是 site-media 桶的公开 URL。渲染侧一视同仁地当 src 用，
  -- 不要为了「统一」去把老图搬进桶——它们已经在 CDN 上了，搬迁只有风险没有收益。
  image_url    text,

  -- 三语：ja 必填，zh/en 缺失时回退 ja
  -- not null 不保证非空白；下游的 pickLocaleText 把 ja 当作永远可用的回退值，
  -- 所以需要显式检查 ja 列非纯空白。
  title_ja text not null check (btrim(title_ja) <> '' and char_length(title_ja) between 1 and 120),
  title_zh text          check (char_length(title_zh) <= 120),
  title_en text          check (char_length(title_en) <= 120),
  lead_ja  text not null check (btrim(lead_ja) <> '' and char_length(lead_ja) between 1 and 300),
  lead_zh  text          check (char_length(lead_zh) <= 300),
  lead_en  text          check (char_length(lead_en) <= 300),
  -- 正文纯文本，空行分段（附件明确不支持复合编辑器）
  body_ja  text not null check (btrim(body_ja) <> '' and char_length(body_ja) between 1 and 8000),
  body_zh  text          check (char_length(body_zh) <= 8000),
  body_en  text          check (char_length(body_en) <= 8000),

  created_by_user_id uuid references users(id) on delete set null,
  updated_by_user_id uuid references users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 列表排序：置顶优先，其次发布日倒序。官网只查已发布的，故 is_published 进索引首位
create index if not exists idx_site_news_order
  on site_news (is_published, is_pinned desc, published_on desc);

drop trigger if exists site_news_updated_at on site_news;
create trigger site_news_updated_at
  before update on site_news
  for each row execute function update_updated_at();

-- ── 成员 ──────────────────────────────────────────────────────
create table if not exists site_members (
  id  uuid primary key default gen_random_uuid(),
  -- MOONDOLLZ 共 12 卡位（原 MEMBER_SLOTS 常量），编号即卡位
  no  smallint not null unique check (no between 1 and 12),

  is_revealed boolean not null default false,
  photo_url   text,
  -- 罗马字名（KANO / MIKOTO…），不分语言，卡片主标题
  name        text check (char_length(name) <= 40),
  -- 附件：姓名（日文、英文、特长说明）
  name_ja     text check (char_length(name_ja) <= 40),
  name_en     text check (char_length(name_en) <= 40),
  specialty_ja text check (char_length(specialty_ja) <= 60),
  specialty_zh text check (char_length(specialty_zh) <= 60),
  specialty_en text check (char_length(specialty_en) <= 60),

  -- 附件：预计完成招募时间。替代 i18n 里写死的 unrevealedRole（"12月 公開"）
  -- 与全局 note（"※ メンバーは 10 月・12 月に順次公開"），未公开卡位各自显示
  expected_reveal_on date,

  created_by_user_id uuid references users(id) on delete set null,
  updated_by_user_id uuid references users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- 已公开的卡位必须有名字、照片和日文特长，否则官网会渲染出不完整卡片
  constraint site_members_revealed_fields check (
    not is_revealed or (
      nullif(btrim(name), '') is not null
      and nullif(btrim(photo_url), '') is not null
      and nullif(btrim(specialty_ja), '') is not null
    )
  ),
  -- 未公开卡位必须有预计日期；否则官网只能渲染出没有提示的空卡位。
  constraint site_members_unrevealed_schedule check (
    is_revealed or expected_reveal_on is not null
  )
);

drop trigger if exists site_members_updated_at on site_members;
create trigger site_members_updated_at
  before update on site_members
  for each row execute function update_updated_at();

-- ============================================================
-- RLS —— 按 046（20260814074006_rls_users_broadcast_accounts_salary.sql）的教训写
--
-- 046 在一次性容器上实跑时抓到：TRUNCATE 不受 RLS 约束，只 revoke CRUD 会留下
-- 「任何登录用户可清空整表」。两张新表一律 revoke all 再 grant 回最小集。
--
-- anon 不给任何权限：官网虽然公开展示这些内容，但渲染发生在服务端（service role），
-- 浏览器从不直连数据库。写侧不给 authenticated 任何策略 —— 增删改全部只经过后台 API
-- （service role）+ 应用层角色判定（canEditSiteContent，src/lib/auth/site-content.ts）。
-- ============================================================

alter table site_news    enable row level security;
alter table site_members enable row level security;

-- 每条 create 前先 drop 同名策略：本仓迁移人工按文件名顺序应用、无
-- schema_migrations 记录（审计 D-1），整个文件必须可重跑。
drop policy if exists "Authenticated can read site news" on site_news;
create policy "Authenticated can read site news"
  on site_news for select to authenticated using (true);

drop policy if exists "Authenticated can read site members" on site_members;
create policy "Authenticated can read site members"
  on site_members for select to authenticated using (true);

revoke all on public.site_news    from anon, authenticated;
revoke all on public.site_members from anon, authenticated;
grant select on public.site_news    to authenticated;
grant select on public.site_members to authenticated;
