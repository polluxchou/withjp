# 官网内容管理与其他招募 · 设计规格

- 日期：2026-08-13
- 状态：**已确认方向，待写实施计划**
- 来源需求：《公会官网和公会后台的项目工程关系》附件 §能力完善（其他招募 / 新闻配置 / members）
- 相关：`docs/public-site.md`（本文推翻其 §2.4 与 §2.5 各一条）、`docs/2026-08-13-system-audit.md`、
  `tt-agent/docs/domain-b-applications-contract.md`（字段对齐目标）

---

## 0. 一句话

三件事一次交付：**其他招募**（摄影师 / 化妆师 / 团播运营表单 + 后台第二个 tab）、
**新闻后台化**、**成员后台化**。前者是纯增量；后两者是同一件事 ——
**把官网内容从 i18n 搬进数据库**，并为此显式推翻官网原有的「静态优先」承诺。

---

## 1. 本文推翻的既有约定

`docs/public-site.md` 里两条明写的东西，本设计要显式作废，落地时同步改那份文档：

| 位置 | 原文 | 变更 |
|---|---|---|
| §2.4 非功能需求 | "**静态优先**：除应募接口外全部预渲染（首屏不依赖数据库；数据库故障不影响官网可读）" | 改为 **ISR**：页面仍是预渲染的静态产物，但内容来源变为数据库，后台保存时 revalidate。数据库故障不影响**已生成**的页面，但影响新内容生效 |
| §2.5 本轮不做 | "NEWS / 成员 / 排班的**后台可编辑化**（现在改内容 = 改 i18n 文案 = 发一次版）" | NEWS 与成员**本轮做**；**排班（LIVE 页 ScheduleTable）仍不做**，继续留在 i18n |

排班留在 i18n 是刻意的：它是周期性固定编排，变更频率远低于新闻，没有理由跟着一起搬。

---

## 2. 范围

### 做

1. `site_applications` 扩展出「其他招募」三类，公开表单 + 后台第二个 tab
   （入口挂在 CONTACT 页 §02「制作与运营合作伙伴」，见 §5.5）
2. `site_news` 表 + 后台 CRUD + 置顶 + 单图上传；官网 NEWS 列表/详情改为读库
3. `site_members` 表 + 后台配置；官网 VISION 页成员网格改为读库
4. 现有 4 篇新闻、8 位成员从 i18n 搬进库（幂等脚本）
5. 上传 route 去重（新增第三个上传口之前先抽共享 helper）

### 不做

- 排班（ScheduleTable）后台化
- 双队长 captains 后台化 —— 附件说的是「Team 中的主播形象」，即 12 人卡片网格；队长是单独一块且几乎不变，留 i18n
- 富文本 / 复合编辑器 —— 附件明确排除
- 新闻多图 —— 附件明确「news 一张图」
- 应募的状态流转与导出 —— 后台仍只读，与现状一致
- 附件里的「公司邮箱」一行 —— 原文标注「无关联」

---

## 3. 数据层

### 3.1 迁移 047 · `site_applications` 扩展

```sql
-- ============================================================
-- Migration 047: 官网应募扩展出「其他招募」三类
--
-- 不新建第二张表：附件要的是「官网应募页增加一个 tab」，同一数据源两个视图。
-- 字段名逐字对齐 tt-agent/docs/domain-b-applications-contract.md，
-- 将来导入 core.applications 就是 1:1，不需要映射表。
-- ============================================================

alter table site_applications
  -- default 'creator' 用于回填历史行；回填完立刻 drop default，
  -- 否则表单少传 kind 会静默记成主播应募。
  add column if not exists kind text not null default 'creator'
    check (kind in ('creator', 'photographer', 'makeup', 'group_live_ops')),
  add column if not exists email text
    check (email is null or char_length(email) between 3 and 254),
  add column if not exists commute_mode text
    check (commute_mode is null or commute_mode in ('subway', 'bicycle', 'walk', 'car'));

alter table site_applications alter column kind drop default;

-- 员工类应募没有年龄；居住位置对员工类是选填（附件标注「选题」）
alter table site_applications alter column age       drop not null;
alter table site_applications alter column residence drop not null;

alter table site_applications
  add constraint site_applications_creator_fields check (
    kind <> 'creator' or (age is not null and residence is not null)
  ),
  add constraint site_applications_staff_fields check (
    kind = 'creator' or (email is not null and commute_mode is not null)
  );

create index if not exists idx_site_applications_kind_created
  on site_applications (kind, created_at desc);
```

> 现有的 `age between 16 and 60`、`residence` 长度上限等 check 保持不变 —— 它们在
> 列为 NULL 时自动为真，不需要改。

### 3.2 迁移 048 · 内容表

两张专用表，不用通用表 + jsonb：字段少、形状差异大，而 check 约束、索引与
「哪些字段必填」这三件事在 jsonb 里全部失去表达能力。

**三语用三列，不用 jsonb** —— 只有列才能把「ja 必填」写成 `not null`。

```sql
-- ── 新闻 ──────────────────────────────────────────────────────
create table site_news (
  id           uuid primary key default gen_random_uuid(),
  -- slug 是稳定路由标识，发出去的链接不能因为改标题或插入新文章而失效
  -- （沿用 src/lib/site/news.ts 原有的理由）
  slug         text not null unique
                 check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 60),
  -- 与 site.news.filters 的词表一致（ALL 只是 UI 筛选项，不是 tag 取值）
  tag          text not null check (tag in ('RECRUIT', 'PROJECT', 'LIVE')),
  published_on date not null,
  is_pinned    boolean not null default false,
  -- 下架能力（2026-08-13 确认需要）：false = 内容还在库里，但官网不展示。
  -- 比软删便宜也比软删诚实——运营要的是「先撤下来再想怎么改」，不是删除。
  -- 默认 true：后台没有草稿态，新建即发布（§5.2）。
  is_published boolean not null default true,
  -- 两种形态并存：搬迁进来的 4 篇沿用仓库里的静态路径（/site/*.webp），
  -- 后台新上传的是 site-media 桶的公开 URL。渲染侧一视同仁地当 src 用，
  -- 不要为了「统一」去把老图搬进桶——它们已经在 CDN 上了，搬迁只有风险没有收益。
  image_url    text,

  -- 三语：ja 必填，zh/en 缺失时回退 ja
  title_ja text not null check (char_length(title_ja) between 1 and 120),
  title_zh text          check (char_length(title_zh) <= 120),
  title_en text          check (char_length(title_en) <= 120),
  lead_ja  text not null check (char_length(lead_ja) between 1 and 300),
  lead_zh  text          check (char_length(lead_zh) <= 300),
  lead_en  text          check (char_length(lead_en) <= 300),
  -- 正文纯文本，空行分段（附件明确不支持复合编辑器）
  body_ja  text not null check (char_length(body_ja) between 1 and 8000),
  body_zh  text          check (char_length(body_zh) <= 8000),
  body_en  text          check (char_length(body_en) <= 8000),

  created_by_user_id uuid references users(id) on delete set null,
  updated_by_user_id uuid references users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 列表排序：置顶优先，其次发布日倒序。官网只查已发布的，故 is_published 进索引首位
create index idx_site_news_order
  on site_news (is_published, is_pinned desc, published_on desc);

create trigger site_news_updated_at
  before update on site_news
  for each row execute function update_updated_at();

-- ── 成员 ──────────────────────────────────────────────────────
create table site_members (
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

  -- 已公开的卡位必须有名字和照片，否则官网会渲染出一张空卡
  constraint site_members_revealed_fields check (
    not is_revealed or (name is not null and photo_url is not null)
  )
);

create trigger site_members_updated_at
  before update on site_members
  for each row execute function update_updated_at();
```

### 3.3 RLS —— 按 046 的教训写

046 在一次性容器上实跑时抓到：**`TRUNCATE` 不受 RLS 约束**，只 revoke CRUD 会留下
「任何登录用户可清空整表」。两张新表一律 `revoke all` 再 grant 回最小集。

```sql
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
```

**anon 不给任何权限**：官网虽然公开展示这些内容，但渲染发生在服务端（service role），
浏览器从不直连数据库。写侧不给 `authenticated` 任何策略 —— 增删改全部只经过后台 API
（service role）+ 应用层角色判定（§5.3）。

### 3.4 数据搬迁脚本

`scripts/seed-site-content.mjs` —— 一次性、幂等，读 `messages/{ja,zh,en}.json` 写库。
**不放进迁移**：迁移不该依赖前端文案文件。

- 新闻：按 `NEWS_SLUGS` 的四个 slug upsert；`date`（`2026.10.01`）→ `published_on`
  （ISO `YYYY-MM-DD`）；`body: string[]` → 用 `\n\n` 连接成 `body_*`；图片沿用
  `news.ts` 里 `NEWS_IMAGES` 的现有 `/site/*.webp` 路径，先不搬进存储桶（已经是仓库里
  的静态资源，能用）。
- 成员：`site.members.list` 的 8 条按下标 → `no = i + 1`，`is_revealed = true`；
  现有 `role` 字段形如 `花乃／儚い微笑みの罠`，按**全角 `／`** 拆成
  `name_ja` 与 `specialty_*`；`name` 取原 `name`（`KANO`）；照片沿用 `MEMBER_IMAGES` 的路径。
  9–12 号卡位建成 `is_revealed = false` 的空行，`expected_reveal_on` 由运营在后台补
  （现在 i18n 写死的 `"12月 公開"` 即其初值）。

**顺序是硬的**：先跑脚本搬迁 → 验证官网读库正常 → 再从 `messages/*.json` 删 key。
反过来就是上线即丢内容。

---

## 4. 三语与回退

```ts
// src/lib/site/i18n-content.ts
export function pickLocale<T>(
  locale: 'zh' | 'en' | 'ja',
  values: { ja: T; zh?: T | null; en?: T | null },
): T
```

规则：请求语言有值就用它，否则回退 `ja`。`ja` 由数据库 `not null` 保证一定有值，
因此这个函数**永不返回空**。纯函数，配单元测试（三语 × 有值/空串/null 的组合）。

空字符串与 `null` 同等对待 —— 后台表单清空一个选填字段会提交空串，不该导致官网显示空白。

> 与 CI 门禁的关系：`scripts/check-i18n.mjs` 管的是 `messages/*.json` 的 key 形状一致性，
> 管不到数据库内容。本设计不改门禁规则，只改 messages 里的 key 集合（§7）。

---

## 5. 应用层

### 5.1 公开投递接口（扩展）

`POST /api/site/applications` 增加 `kind` 分支。校验仍走 `src/lib/site/application.ts`
的纯函数模式（现有三层防护 —— honeypot + 最短填写时长 + 每 IP 每小时上限 —— 全部保留，
按 kind 分支的只是字段校验）。

| kind | 必填 | 选填 |
|---|---|---|
| `creator` | name, contact, age, residence, locale | experience |
| 其余三类 | name, contact, email, commute_mode, locale | residence |

未知 kind → 400。机器人提交仍返回与成功一致的 201 但不落库。

### 5.2 后台 API（新增）

```
GET    /api/site/news              列表
POST   /api/site/news              新建
PATCH  /api/site/news/[id]         编辑 / 置顶 / 上下架
DELETE /api/site/news/[id]         删除

GET    /api/site/members           12 个卡位
PATCH  /api/site/members/[no]      配置某个卡位

POST   /api/site/upload            图片上传（news 主图 / 成员照片）
```

**不做草稿态**：附件没提，YAGNI。写进库即上线（配合 §6 的 revalidate）。
成员只有 PATCH，没有增删 —— 12 个卡位由 seed 建好，是固定的。

### 5.3 权限（新约定）

这三块内容一改就对公网可见，误操作代价高于内部数据。因此**所有写操作要求
`is_admin` 或 `role = 'ops'`**，读列表沿用现状（登录即可）。

```ts
// src/lib/auth/site-content.ts
export function canEditSiteContent(actor: ActorProfile | null): boolean
```

这与仓库现状（后台绝大多数 route 只判登录）不一致，是**刻意引入的新约定** ——
审计 P0-4 指出的方向就是这个，这三个新 route 不该再往旧坑里加一层。
复用现有 `getActorProfile()`（`src/lib/auth/actor.ts`）。

> 已知缺口：`/api/profile` 目前允许任何人把自己的 `role` 改成 `ops`，所以
> `role = 'ops'` 这一支现在可以被自助绕过。这条已登记在审计行动项 2，
> 与本设计并行修；在它修好之前，实际有效的门是 `is_admin`。

### 5.4 图片上传

新建公开桶 `site-media`（对外展示图，公开读是正确的，与 `item-photos` 同理）。

**先去重再加第三个**：`src/app/api/items/photo/route.ts` 与
`src/app/api/competitors/upload/route.ts` 目前逐字重复（仅 BUCKET 常量不同）。
抽出 `src/lib/storage/upload-image.ts`（校验类型/大小、生成路径、落桶、返回公开 URL），
三个 route 各自只保留鉴权 + 调用。顺带修掉两个已知小问题：扩展名取自用户文件名未净化、
错误直接回传 `error.message`。

限制沿用现有：≤5MB，PNG / JPEG / WebP / GIF。

### 5.5 其他招募的入口：CONTACT §02

入口不新开导航项，挂在 CONTACT 页第二段「**FOR COMPANION / 制作与运营合作伙伴**」
（合作伙伴 = 吉光片羽株式会社，负责领域「ヘアメイク／ロケ撮影／運営研修／AIGC 制作」
—— 与摄影师 / 化妆师 / 团播运营三类招募一一对应，这个位置有语义依据，不是随手安放）。

**替换掉那句占位文案**：`site.contact.sections[1].note`
（zh「咨询窗口正在准备中」／ ja「お問い合わせ窓口は準備中」）删除，改为 `cta` + `action`。

现有机制直接可用，只需扩一个取值：

```ts
// src/lib/site/contact.ts
export type SiteContactAction = 'recruit' | 'email' | 'staff-recruit'
//                                                     ^^^^^^^^^^^^^^ 新增

// buildContactSections() 里加一条映射
section.action === 'staff-recruit' ? STAFF_RECRUIT_HREF : ...
```

`ContactSection.tsx` 的按钮 variant 现在是
`section.action === 'recruit' ? 'hot' : 'ghost'` —— 新入口走 `ghost`，与主招募入口
（`hot`）拉开主次，符合它是次要通道的定位。

**表单页**：`/site/recruit/staff`，复用 RECRUIT 页的版式与 `ApplicationForm` 的三层防护，
字段按 §5.1 的员工类分支。

> ⚠️ **必须同步改 `src/lib/site/domain-routing.ts`。** 现有
> `PUBLIC_PAGE_RE = /^\/(?:news(?:\/[^/]+)?|vision|live|services|recruit|contact)?\/?$/`
> —— 只有 `news` 放行了子路径，`recruit` 没有。不改这条正则，新页面在内部域名能打开，
> 在 `eacn.agenova.chat` 上直接 404。**这个 bug 只会在生产域名上出现**，本地和预览都发现不了。
> 改法：把 `recruit` 也写成 `recruit(?:\/staff)?`，并给 `domain-routing.test.ts` 补一条用例。

---

## 6. 官网渲染与 ISR

| 页面 | 现状 | 变更 |
|---|---|---|
| `/site/news` | i18n 静态 | 读库 + ISR |
| `/site/news/[slug]` | `generateStaticParams` 读硬编码 slug 数组 | `generateStaticParams` 读库 |
| `/site/vision`（成员网格） | i18n 静态 | 读库 + ISR |
| `/site`（首页最新三条动态） | i18n 静态 | 读库 + ISR |

官网侧的查询一律带 `where is_published`。`generateStaticParams` 同样只返回已发布的
slug —— 已下架文章的详情页应当 404，而不是仍能被旧链接直接打开。

后台保存成功后调用 `revalidatePath()`，覆盖上面四类路径 × 三个 locale。
**下架也要 revalidate** —— 忘了这一步，下架的文章会在静态页上继续挂着，
这正是「下架」最不能出错的地方。

**ISR 失败可见性**（选 ISR 时接受的代价，必须配兜底）：
`revalidatePath` 静默失败会表现为「后台改了、线上没变」，很难查。因此：

1. 后台列表显示每行的 `updated_at`（「最后保存于」）。
2. 保存成功后的反馈里给出官网对应页面的直达链接，让编辑者一键自查。
3. revalidate 抛错时**不吞异常** —— 保存成功但 revalidate 失败要在 UI 上明确提示
   「已保存，但线上刷新失败，请重试或联系技术」，而不是一个绿色的「保存成功」。

`src/lib/site/news.ts` 现有的 `NEWS_SLUGS` / `NEWS_IMAGES` / `buildArticles` 与
`src/lib/site/content.ts` 的 `buildMembers` / `MEMBER_IMAGES` 相应删除或改为从库数据构造；
`MEMBER_SLOTS = 12` 保留（它现在是 `site_members.no` 的 check 上界，两处要一致）。

---

## 7. i18n 门禁的连带改动

内容进库后，这些 key 必须从 `messages/{zh,en,ja}.json` **删除**，否则
`scripts/check-i18n.mjs` 会判定「定义了但没被引用」：

- `site.news.articles[]`（4 篇）
- `site.members.list`（8 位）
- `site.members.note`、`site.members.unrevealedRole` —— 被 per-member 的
  `expected_reveal_on` 取代
- `site.contact.sections[1].note`（「咨询窗口正在准备中」）—— 被 §5.5 的 CTA 取代。
  注意这是数组里某一项的键：三语文件都要删同一位置，且 `check-i18n` 校验的是数组
  长度与形状，删一个可选键不影响长度，但**三语必须一起删**

**保留**：`site.news.{eyebrow,title,filters,empty,read,back,backCta,applyCta,imagePlaceholder}`、
`site.members.{eyebrow,title,sub,placeholder,unrevealedName,captains}` —— 这些是 UI 标签
与队长块，不是内容。

**新增**：
- 后台三个页面的界面文案（三语），含「置顶」「下架 / 上架」「最后保存于」
- 官网员工招募表单的字段标签：邮箱 / 希望参与职能（三选一）/ 通勤方式（地铁·自行车·步行·开车）
- CONTACT §02 的 CTA 文案（替换掉被删的 `note`）

`scripts/i18n-baseline.json` 需同步更新。

---

## 8. 后台

### 8.1 官网应募页加 tab

`/recruit-applications?tab=creator|staff` —— 两个 tab 共用一张表。

> **`staff` 是 UI 分组，不是 `kind` 的取值。** 数据库里只有四个 kind
> （`creator` / `photographer` / `makeup` / `group_live_ops`）；`tab=staff` 查询的是
> 后三个的合集。查询参数刻意叫 `tab` 而不是 `kind`，就是为了不让人误以为存在一个
> 叫 `staff` 的 kind 而去数据库里加它。列表里用一列显示具体职能。
主播 tab 的列不变；员工 tab 的列：姓名 / 职能 / 联系方式 / 邮箱 / 居住位置 / 通勤方式 / 时间。
统计条（总数 / 新增 / 今日）按当前 tab 统计。

### 8.2 新增侧边栏分组「官网内容」

`src/components/layout/Sidebar.tsx` 的 `NAV` 数组新增一组（沿用现有
`{ href, key, icon }` 结构）：

```
官网内容
  ├─ 新闻   /site-content/news
  └─ 成员   /site-content/members
```

放在「创作者」组之后 —— 与同为官网来源的「官网应募」相邻。

### 8.3 页面

- **新闻列表**：表格 + 新建按钮；行内可切换**置顶**与**上架/下架**；已下架的行整行降调
  （灰显 + 状态标签），一眼能看出它不在官网上。
- **新闻编辑**：slug（新建后不可改）、tag、发布日、主图上传、三语三段（ja 必填，zh/en 折叠默认收起）。
- **成员配置**：12 个卡位的网格，点开编辑单个卡位；未公开卡位只需填 `expected_reveal_on`。

### 8.4 界面设计约束（硬性，覆盖后台与官网两侧）

本设计横跨仓库里**两套刻意分开的设计面**，两边都不能自由发挥：

| | 后台新页面（新闻 / 成员 / 应募 tab） | 官网新页面（`/site/recruit/staff`、CONTACT CTA） |
|---|---|---|
| 规范 | `docs/design-system.md` §1–§7 **全部** | §8 例外面：不受 §1 色彩 / §2 字体 / §3 圆角约束 |
| token | mauve 灰阶 + violet 品牌色 | `site-*` 命名空间 |
| 组件 | `src/components/ui/` + `layout/Header` | `src/components/site/` |
| 门禁 | §7 全部 | **§7 全部（例外面也不豁免）** |

**组件准入流程（§6 开头）**：新 UI 需求**先查 §6.1 决策表与 `src/components/ui/` 目录，
没有才新建；新建必须登记进 `design-system.md` §6.2**。同一文件内禁止混用共享组件与手写同类元素。

按 §6.1 决策表，本设计的选型是确定的，**不要另起炉灶**：

| 场景 | 用 |
|---|---|
| 应募页两个 tab | `Header` 的 `tabs` prop（§6.3 列表页模式），不是自造按钮组 |
| 应募列表、新闻列表 | `RecordRow`（记录浏览、每行有身份），**不是** `Table` |
| 已发布 / 已下架 / 置顶 状态 | `Tag`，tone 必须走 §1.3 状态映射表 |
| 列表页顶部统计 | `Stat` / `StatBand` |
| 新闻编辑、成员卡位编辑 | §6.3 表单模式：页内 `SectionCard` 或 `Modal` + `Field` 单列 |
| 删除新闻 | §6.3 危险操作：`Modal` 确认 + `danger` Button + 一句话说明不可逆后果 |
| 三态 | `LoadingState`（骨架）/ `EmptyState`（带首条引导 action）/ `ErrorState`（带重试）**必须都处理**，禁止裸 HTTP 状态码文案 |

**需要新建、因而必须登记进 design-system.md §6.2 的组件**（目前 `ui/` 里没有对应物）：

1. **图片上传控件** —— 三处要用（新闻主图、成员照片，以及将来的复用）。props 契约随 PR 登记。
2. **成员卡位网格** —— 12 格布局若无法用现有 `SectionCard` + 既有原语拼出，才新建；
   能拼出就不要新建。**先拼，拼不动再建**。

**两条门禁细节，写代码前必须知道**（`scripts/check-style-tokens.mjs` 零容忍）：

- 禁 `slate/indigo/zinc/gray/stone/neutral` 数字阶灰、裸 hex、固定透明度 token 带 `/N`、`text-base`。
- **正向校验对全库生效**：用到的色阶必须真实登记在 `tailwind.config.ts`，未登记即失败 ——
  写 `text-ink-600` 会挂，因为 ink 只登记了 900/700/500/400。不存在的类名 Tailwind 不生成，
  样式会静默失效，门禁存在就是为了让它别静默。
- 另有 `check-no-bare-han.mjs`：**JSX 里禁止裸中文**，新页面所有文案一律走 `useTranslations()`。

---

## 9. 测试

沿用仓库现状（`node --test` + 纯函数单测，344 项全在 `src/lib`）：

| 单元 | 测什么 |
|---|---|
| `pickLocale` | 三语 × 有值/空串/null；ja 永不为空 |
| `application.ts` 的 kind 分支 | 四类 kind 各自的必填/选填；未知 kind 被拒 |
| 新闻排序与过滤 | 置顶优先 + 发布日倒序；同置顶按日期；**已下架的不出现在官网列表** |
| slug 校验 | 合法/非法 slug 形状 |
| `resolvePublicSiteRoute` | `/recruit/staff` 在官网域名下被放行（现有 `domain-routing.test.ts` 补一条）|
| `buildContactSections` | `action: 'staff-recruit'` 映射出正确的 `ctaHref` |
| 成员卡位构造 | 12 个卡位补齐；未公开卡位回退占位文案 |
| `upload-image` | 类型/大小校验；扩展名净化 |
| `canEditSiteContent` | admin / ops / 其他角色 / 未登录 |

**API route 与权限判定目前全仓 0 测试**（审计发现）。本设计**不承诺**补齐这一层，
但 `canEditSiteContent` 是纯函数，必须有测试 —— 新引入的权限约定不能没有测试守着。

迁移 047/048 按 046 的做法，在一次性 Postgres 容器上实跑验证（含幂等重跑）后才算完成。

---

## 10. 已接受的风险

1. **官网可用性从此依赖数据库** —— ISR 保住了已生成页面，但数据库长时间不可用期间
   新内容无法发布，且冷启动/首次构建会失败。这是选择后台可编辑化的必然代价。
2. **中英内容大概率长期缺失** —— 回退到日语是可接受的降级，但官网原本承诺的
   「三语等价完整版本」在数据库内容这部分事实上不再成立。`docs/public-site.md` §2.2
   要同步改口径。
3. **无草稿态、无发布审核** —— 保存即上线。误发只能靠再改一次修正。
4. **`role = 'ops'` 可被自助绕过**（见 §5.3），在 `/api/profile` 修好前实际只有
   `is_admin` 有效。
5. **本设计让 withjp 离「冻结待退役」更远** —— 这是已知的、被业务方接受的取舍
   （审计 §6-1、§6-2）。

---

## 11. 边界：这两张表将来不迁进 `core.*`

`site_news` / `site_members` 是**官网展示内容**，不是经营数据。迁移时它们跟官网走，
不跟后台走。这与 `site_applications` 相反 —— 后者是 A 域主播档案与 B 域员工账号的
上游线索，已定融进 `core.applications`（见 `tt-agent/docs/domain-b-applications-contract.md`）。

因此 §3.1 的字段名必须与那份契约逐字对齐，而 §3.2 的两张表不需要遵守 `core` 的六条
横切契约。

---

## 12. 原未决事项 —— 已定（2026-08-13）

1. **应募数据保留期限** → **不设期限**，应募数据长期保留。
   两点连带结论：① 不需要清理任务，`site_applications` 也不需要软删列；
   ② 但**手工删除单条的能力仍需保留** —— 应募者若来函要求删除自己的数据，
   需要有人能删掉那一行。本轮后台是只读的，所以这件事目前靠直连数据库处理；
   等应募后台做写操作时再补一个删除入口。
2. **新闻「下架」** → **需要**。已落为 `site_news.is_published`（§3.2），
   默认 `true`，官网只展示 `is_published = true` 的条目，后台列表可切换。
   下架不等于删除：内容留在库里，随时可以重新上架。
3. **9–12 号成员的照片来源** → **先不管**。seed 建成未公开的空卡位，
   官网按占位渲染；等有素材了再在后台补。

## 13. 未决（不阻塞实施）

暂无。
