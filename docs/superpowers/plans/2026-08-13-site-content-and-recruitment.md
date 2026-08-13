# 官网内容管理与其他招募 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 交付三件事——官网「其他招募」（摄影师/化妆师/团播运营）投递与后台查看、新闻的后台可编辑化（含置顶与上下架）、成员卡位的后台配置。

**Architecture:** `site_applications` 扩展 `kind` 判别列复用同一张表；新建 `site_news` / `site_members` 两张内容表，三语用三列（ja 必填、zh/en 回退）；官网页面由 i18n 静态改为读库 + ISR，后台保存时 `revalidatePath`。

**Tech Stack:** Next.js 14 App Router / TypeScript / Supabase(Postgres) / Tailwind + 仓库自有 token / `node --test --experimental-strip-types`

**上游规格：** `docs/superpowers/specs/2026-08-13-site-content-and-recruitment-design.md`（下称「规格」）。本计划每个任务都以它为准，冲突时先改规格再改计划。

---

## Global Constraints

以下约束对**每一个任务**都生效，任务里不再重复：

1. **新增测试文件必须加进 `package.json` 的 `test` 脚本**。该脚本是逐个文件枚举的（现有 45 个），不加进去测试永远不跑，CI 也不会发现。
2. **测试里用相对路径 + `.ts` 后缀导入**（如 `../../i18n/routing.ts`），不能用 `@/` 别名——`node --test` 直接跑 TS 时不认 tsconfig 的 paths。
3. **JSX 里禁止裸中文**（`scripts/check-no-bare-han.mjs`）。所有面向用户的文案走 `useTranslations()` / `getTranslations()`。
4. **样式 token 零容忍**（`scripts/check-style-tokens.mjs`）：禁 `slate/indigo/zinc/gray/stone/neutral` 数字阶灰、裸 hex、固定透明度 token 带 `/N`、`text-base`。正向校验对全库生效——用到的色阶必须真实登记在 `tailwind.config.ts`（`text-ink-600` 会失败，ink 只登记了 900/700/500/400）。
5. **两套设计面不串味**：后台页面用 `src/components/ui/` + `layout/Header` + mauve/violet token；官网页面用 `src/components/site/` + `site-*` token。见规格 §8.4。
6. **组件先查后建**：新 UI 需求先查 `docs/design-system.md` §6.1 决策表与 `src/components/ui/` 目录，没有才新建；新建必须登记进 `design-system.md` §6.2。
7. **i18n 三语同改**：`messages/{zh,en,ja}.json` 的 key 形状必须完全一致，改一个文件就要改三个。改完跑 `npm run test:copy`。
8. **迁移必须可重跑**：本仓迁移是人工按文件名顺序应用、无 `schema_migrations` 记录。`create policy` 前先 `drop policy if exists`；`add constraint` 用 `DO` 块查 `pg_constraint` 后再加（Postgres 不支持 `add constraint if not exists`）。
9. **迁移验收方式**：在一次性 Docker Postgres 容器上实跑（含重跑一次验幂等）后才算完成。参照 `supabase/migrations/046_rls_hardening.sql` 的做法。
10. **每个任务结束跑一次** `npx tsc --noEmit && npm test && npm run test:copy`。

---

## File Structure

**新建**

| 文件 | 职责 |
|---|---|
| `supabase/migrations/047_site_applications_kinds.sql` | `site_applications` 加 `kind`/`email`/`commute_mode` + 按 kind 的 check |
| `supabase/migrations/048_site_content.sql` | `site_news` / `site_members` 两张表 + RLS |
| `supabase/migrations/049_site_media_bucket.sql` | `site-media` 公开桶 |
| `scripts/seed-site-content.mjs` | 把现有 4 篇新闻、8 位成员从 i18n 搬进库（幂等） |
| `src/lib/site/i18n-content.ts` (+`.test.ts`) | `pickLocaleText` 三语回退纯函数 |
| `src/lib/storage/upload-image.ts` (+`.test.ts`) | 图片上传共享 helper（三个 route 复用） |
| `src/lib/auth/site-content.ts` (+`.test.ts`) | `canEditSiteContent` 权限纯函数 |
| `src/lib/site/news-sort.ts` (+`.test.ts`) | 新闻排序与已发布过滤纯函数 |
| `src/app/[locale]/site/recruit/staff/page.tsx` | 官网员工招募表单页 |
| `src/components/site/StaffApplicationForm.tsx` | 官网员工招募表单组件 |
| `src/app/api/site/news/route.ts`、`[id]/route.ts` | 新闻 CRUD |
| `src/app/api/site/members/route.ts`、`[no]/route.ts` | 成员配置 |
| `src/app/api/site/upload/route.ts` | 图片上传 |
| `src/app/[locale]/(app)/site-content/news/page.tsx` | 后台新闻列表 |
| `src/app/[locale]/(app)/site-content/members/page.tsx` | 后台成员配置 |
| `src/components/ui/ImageUploadField.tsx` | 新 UI 原语，须登记 design-system §6.2 |

**修改**

| 文件 | 改什么 |
|---|---|
| `src/lib/site/application.ts` | 加 `kind` 分支与 email/commuteMode 校验 |
| `src/lib/site/application-service.ts` | 落库带上新字段 |
| `src/lib/site/domain-routing.ts` | `PUBLIC_PAGE_RE` 放行 `/recruit/staff` |
| `src/lib/site/contact.ts` | `SiteContactAction` 加 `'staff-recruit'` |
| `src/lib/site/nav.ts` | 导出 `STAFF_RECRUIT_HREF` |
| `src/lib/auth/actor.ts` | `getActorProfile` 补 select `role` |
| `src/lib/site/news.ts`、`content.ts` | 改为消费库数据 |
| `src/app/[locale]/site/{page,news/page,news/[slug]/page,vision/page}.tsx` | 读库 + ISR |
| `src/app/[locale]/(app)/recruit-applications/page.tsx` | 加 tab |
| `src/components/layout/Sidebar.tsx` | 加「官网内容」分组 |
| `src/app/api/items/photo/route.ts`、`competitors/upload/route.ts` | 改用共享 helper |
| `messages/{zh,en,ja}.json`、`scripts/i18n-baseline.json` | 删内容 key、加 UI 文案 |
| `package.json` | 注册 6 个新测试文件 |
| `docs/public-site.md`、`docs/design-system.md` | 同步口径与组件登记 |

---

# Phase 1 · 其他招募

### Task 1: 迁移 047 —— `site_applications` 扩展

**Files:**
- Create: `supabase/migrations/047_site_applications_kinds.sql`

**Interfaces:**
- Produces: `site_applications.kind`（`creator|photographer|makeup|group_live_ops`）、`.email`、`.commute_mode`；Task 3 落库时使用。

- [ ] **Step 1: 写迁移文件**

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

-- 员工类应募没有年龄；居住位置对员工类是选填
alter table site_applications alter column age       drop not null;
alter table site_applications alter column residence drop not null;

-- Postgres 没有 `add constraint if not exists`，用 DO 块保证可重跑
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'site_applications_creator_fields') then
    alter table site_applications add constraint site_applications_creator_fields check (
      kind <> 'creator' or (age is not null and residence is not null)
    );
  end if;
  if not exists (select 1 from pg_constraint where conname = 'site_applications_staff_fields') then
    alter table site_applications add constraint site_applications_staff_fields check (
      kind = 'creator' or (email is not null and commute_mode is not null)
    );
  end if;
end $$;

create index if not exists idx_site_applications_kind_created
  on site_applications (kind, created_at desc);
```

- [ ] **Step 2: 起一次性容器并铺现有表结构**

```bash
docker run -d --rm --name m047 -e POSTGRES_PASSWORD=x postgres:16-alpine
sleep 5
docker exec -i m047 psql -U postgres -v ON_ERROR_STOP=1 <<'SQL'
create table site_applications (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 30),
  age smallint not null check (age between 16 and 60),
  residence text not null check (char_length(residence) between 1 and 60),
  contact text not null check (char_length(contact) between 1 and 120),
  experience text check (char_length(experience) <= 1000),
  locale text not null check (locale in ('zh','en','ja')),
  status text not null default 'new' check (status in ('new','reviewing','accepted','rejected')),
  ip_hash text, user_agent text,
  created_at timestamptz not null default now()
);
insert into site_applications (name, age, residence, contact, locale)
  values ('历史行', 22, '大阪', 'x', 'ja');
SQL
```

- [ ] **Step 3: 应用迁移，验证回填与约束**

```bash
docker exec -i m047 psql -U postgres -v ON_ERROR_STOP=1 -q < supabase/migrations/047_site_applications_kinds.sql
docker exec -i m047 psql -U postgres -qtA <<'SQL'
\set ON_ERROR_STOP off
select '历史行 kind=' || kind from site_applications;
\echo '--- 员工类缺 email：期望被拒 ---'
insert into site_applications (kind,name,contact,locale,commute_mode) values ('makeup','A','x','ja','subway');
\echo '--- 员工类完整：期望成功 ---'
insert into site_applications (kind,name,contact,locale,email,commute_mode) values ('makeup','B','x','ja','b@e.com','subway') returning 'OK';
\echo '--- 主播类缺 age：期望被拒 ---'
insert into site_applications (kind,name,contact,locale,residence) values ('creator','C','x','ja','大阪');
SQL
```

Expected：历史行 `kind=creator`；第一条与第三条被 check 拒绝；第二条 OK。

- [ ] **Step 4: 验幂等 + 销毁容器**

```bash
docker exec -i m047 psql -U postgres -v ON_ERROR_STOP=1 -q < supabase/migrations/047_site_applications_kinds.sql && echo "重跑 OK"
docker rm -f m047
```

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/047_site_applications_kinds.sql
git commit -m "feat(db): site_applications 扩展出其他招募三类"
```

---

### Task 2: `application.ts` 的 kind 分支

**Files:**
- Modify: `src/lib/site/application.ts`
- Modify: `src/lib/site/application.test.ts`

**Interfaces:**
- Produces: `APPLICATION_KINDS`、`ApplicationKind`、`COMMUTE_MODES`、`CommuteMode`，以及改形后的 `ApplicationValue`（`age`/`residence` 变为 `number|null`/`string|null`，新增 `kind`/`email`/`commuteMode`）。Task 3 的 service 与 route 消费它。

- [ ] **Step 1: 写失败的测试**（追加到 `src/lib/site/application.test.ts`）

```ts
test('员工类：邮箱与通勤方式必填，不需要年龄', () => {
  const r = validateApplication({
    kind: 'makeup', name: '花子', contact: '090', email: 'a@b.com',
    commuteMode: 'subway', consent: true, locale: 'ja',
  })
  assert.equal(r.ok, true)
  if (r.ok) {
    assert.equal(r.value.kind, 'makeup')
    assert.equal(r.value.age, null)
    assert.equal(r.value.email, 'a@b.com')
  }
})

test('员工类：缺邮箱与通勤方式各报一个字段错', () => {
  const r = validateApplication({
    kind: 'photographer', name: '太郎', contact: '090', consent: true, locale: 'ja',
  })
  assert.equal(r.ok, false)
  if (!r.ok) {
    assert.equal(r.fields.email, 'required')
    assert.equal(r.fields.commuteMode, 'required')
  }
})

test('员工类：邮箱格式非法', () => {
  const r = validateApplication({
    kind: 'makeup', name: '花子', contact: '090', email: 'not-an-email',
    commuteMode: 'walk', consent: true, locale: 'ja',
  })
  assert.equal(r.ok, false)
  if (!r.ok) assert.equal(r.fields.email, 'invalidEmail')
})

test('未知 kind 被拒', () => {
  const r = validateApplication({
    kind: 'ceo', name: '花子', contact: '090', consent: true, locale: 'ja',
  })
  assert.equal(r.ok, false)
  if (!r.ok) assert.equal(r.fields.kind, 'required')
})

test('不传 kind 时按主播类处理（向后兼容在飞的旧表单）', () => {
  const r = validateApplication({
    name: '花子', age: '22', residence: '大阪', contact: '090', consent: true, locale: 'ja',
  })
  assert.equal(r.ok, true)
  if (r.ok) assert.equal(r.value.kind, 'creator')
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `node --test --experimental-strip-types src/lib/site/application.test.ts`
Expected: FAIL（`r.value.kind` 不存在 / 未知 kind 未被拒）

- [ ] **Step 3: 实现**

在 `src/lib/site/application.ts` 顶部加：

```ts
export const APPLICATION_KINDS = ['creator', 'photographer', 'makeup', 'group_live_ops'] as const
export type ApplicationKind = (typeof APPLICATION_KINDS)[number]

export const COMMUTE_MODES = ['subway', 'bicycle', 'walk', 'car'] as const
export type CommuteMode = (typeof COMMUTE_MODES)[number]
```

`LIMITS` 加一项 `email: 254`。`FieldError` 加 `'invalidEmail'`。
`ApplicationInput` 加 `kind?: unknown`、`email?: unknown`、`commuteMode?: unknown`。
`ApplicationValue` 改为：

```ts
export interface ApplicationValue {
  kind: ApplicationKind
  name: string
  contact: string
  locale: Locale
  age: number | null
  residence: string | null
  experience: string | null
  email: string | null
  commuteMode: CommuteMode | null
}
```

`validateApplication` 的结构改成：先定 kind，再按 kind 走两条分支。共同字段（name/contact/consent/locale）不变；主播分支**把现有的 age/residence 校验整段搬进 `if (kind === 'creator')`，不要重写**；员工分支新写：

```ts
// 不传 kind = 在飞的旧主播表单，按 creator 处理；传了但不认识则明确报错，
// 不静默落成 creator —— 静默会让一条本该是摄影师的线索永远进错下游。
const rawKind = input.kind === undefined || input.kind === null || input.kind === ''
  ? 'creator'
  : input.kind
if (!APPLICATION_KINDS.includes(rawKind as ApplicationKind)) {
  return { ok: false, fields: { kind: 'required' } }
}
const kind = rawKind as ApplicationKind

// …共同字段校验（name / contact / consent / locale）保持原样…

let age: number | null = null
let residence: string | null = null
let email: string | null = null
let commuteMode: CommuteMode | null = null

if (kind === 'creator') {
  // 现有的 age / residence 校验逻辑原样搬到这里，赋值给上面的 age / residence
} else {
  const rawEmail = asTrimmed(input.email)
  if (!rawEmail) fields.email = 'required'
  else if (rawEmail.length > LIMITS.email) fields.email = 'tooLong'
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(rawEmail)) fields.email = 'invalidEmail'
  else email = rawEmail

  const rawMode = asTrimmed(input.commuteMode)
  if (!rawMode) fields.commuteMode = 'required'
  else if (!COMMUTE_MODES.includes(rawMode as CommuteMode)) fields.commuteMode = 'required'
  else commuteMode = rawMode as CommuteMode

  // 员工类的居住位置是选填
  const rawResidence = asTrimmed(input.residence)
  if (rawResidence.length > LIMITS.residence) fields.residence = 'tooLong'
  else residence = rawResidence || null
}

// 末尾 return 的 value 换成新形状：{ kind, name, contact, locale, age, residence,
// experience: experience || null, email, commuteMode }
```

- [ ] **Step 4: 跑测试确认通过**

Run: `node --test --experimental-strip-types src/lib/site/application.test.ts`
Expected: PASS（含原有全部用例；原用例里断言 `value.age === 22` 的仍应通过）

- [ ] **Step 5: Commit**

```bash
git add src/lib/site/application.ts src/lib/site/application.test.ts
git commit -m "feat(site): 应募校验支持四类 kind"
```

---

### Task 3: 落库、公开接口、官网表单页、域名放行

**Files:**
- Modify: `src/lib/site/application-service.ts`
- Modify: `src/lib/site/domain-routing.ts`、`src/lib/site/domain-routing.test.ts`
- Modify: `src/lib/site/contact.ts`、`src/lib/site/contact.test.ts`、`src/lib/site/nav.ts`
- Create: `src/components/site/StaffApplicationForm.tsx`、`src/app/[locale]/site/recruit/staff/page.tsx`
- Modify: `messages/{zh,en,ja}.json`

**Interfaces:**
- Consumes: Task 2 的 `ApplicationValue`、`APPLICATION_KINDS`、`COMMUTE_MODES`
- Produces: `STAFF_RECRUIT_HREF`（`src/lib/site/nav.ts` 导出，值 `/site/recruit/staff`）

- [ ] **Step 1: 写 domain-routing 的失败测试**（追加到 `domain-routing.test.ts`）

```ts
test('官网域名放行员工招募子路径', () => {
  const r = resolvePublicSiteRoute('eacn.agenova.chat', '/recruit/staff')
  assert.equal(r?.kind, 'rewrite')
  if (r?.kind === 'rewrite') assert.equal(r.pathname, '/ja/site/recruit/staff')
})

test('recruit 下的未知子路径仍然 404', () => {
  assert.equal(resolvePublicSiteRoute('eacn.agenova.chat', '/recruit/nope')?.kind, 'not_found')
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `node --test --experimental-strip-types src/lib/site/domain-routing.test.ts`
Expected: FAIL —— 现有 `PUBLIC_PAGE_RE` 只给 `news` 放行子路径，`/recruit/staff` 落到 `not_found`

- [ ] **Step 3: 改正则**

`src/lib/site/domain-routing.ts`：

```ts
// recruit 允许唯一一个子路径 /recruit/staff（其他招募表单）。
// 这条正则是官网域名下的白名单，漏改会让新页面只在内部域名可用、
// 在 eacn.agenova.chat 上 404 —— 而本地与 preview 都发现不了。
const PUBLIC_PAGE_RE = /^\/(?:news(?:\/[^/]+)?|recruit(?:\/staff)?|vision|live|services|contact)?\/?$/
```

- [ ] **Step 4: 跑测试确认通过**

Run: `node --test --experimental-strip-types src/lib/site/domain-routing.test.ts`
Expected: PASS

- [ ] **Step 5: contact 的 staff-recruit action**

`src/lib/site/nav.ts` 加 `export const STAFF_RECRUIT_HREF = '/site/recruit/staff'`。
`src/lib/site/contact.ts`：`SiteContactAction` 加 `'staff-recruit'`，`buildContactSections` 的 `ctaHref` 三元加一支：

```ts
ctaHref:
  section.action === 'recruit'
    ? RECRUIT_HREF
    : section.action === 'staff-recruit'
      ? STAFF_RECRUIT_HREF
      : section.action === 'email' && section.cta
        ? `mailto:${section.cta}`
        : undefined,
```

`contact.test.ts` 追加：

```ts
test('staff-recruit 映射到员工招募页', () => {
  const [s] = buildContactSections([
    { no: '02', eyebrow: 'FOR COMPANION', title: 't', body: 'b',
      cta: 'c', action: 'staff-recruit', rows: [] },
  ])
  assert.equal(s.ctaHref, '/site/recruit/staff')
})
```

- [ ] **Step 6: 改 i18n —— 删占位、加 CTA 与表单文案**

三语文件同改：`site.contact.sections[1]` 删掉 `note`（zh「咨询窗口正在准备中」／ja「お問い合わせ窓口は準備中」），加 `cta` 与 `"action": "staff-recruit"`。
另加 `site.recruitStaff.*`：页面标题、导语、字段标签（姓名/联系方式/邮箱/希望参与职能/居住位置/通勤方式/同意）、三个职能选项、四个通勤选项、提交按钮、成功与各 `FieldError` 码的提示文案。

- [ ] **Step 7: 官网表单页**

`src/components/site/StaffApplicationForm.tsx` —— 照抄 `ApplicationForm.tsx` 的结构（honeypot 隐藏字段、`elapsedMs` 计时、`fetch('/api/site/applications')`、按 `FieldError` 码映射文案），字段换成：姓名 / 联系方式 / 邮箱 / 希望参与职能（三选一，映射到 `kind`）/ 居住位置（选填）/ 通勤方式（四选一）/ 同意条款。提交体带 `kind`。
`src/app/[locale]/site/recruit/staff/page.tsx` —— 用 `SiteSection` + `SectionHead` + 该表单，版式与 `/site/recruit` 一致，**只用 `site-*` token**。

Run: `npm run test:copy`
Expected: PASS（Step 6 加的 key 到这一步才被引用，两步必须一起完成）

- [ ] **Step 8: service 落库带上新字段**

`application-service.ts` 的 `insert({...})` 加 `kind: value.kind`、`email: value.email`、`commute_mode: value.commuteMode`，`age`/`residence` 直接传 `value.age`/`value.residence`（现在可能是 null）。
`notifyOps` 的通知正文要分支——`${value.age} ／ ${value.residence}` 在员工类下会渲染成 `null ／ null`：

```ts
const detail = value.kind === 'creator'
  ? `${value.age} ／ ${value.residence}`
  : `${value.kind} ／ ${value.residence ?? '-'}`
```

- [ ] **Step 9: 全量校验 + Commit**

```bash
npx tsc --noEmit && npm test && npm run test:copy
git add -A && git commit -m "feat(site): 其他招募表单与投递链路"
```

---

### Task 4: 后台应募页加 tab

**Files:**
- Modify: `src/app/[locale]/(app)/recruit-applications/page.tsx`
- Modify: `messages/{zh,en,ja}.json`

**Interfaces:**
- Consumes: `site_applications.kind`（Task 1）

- [ ] **Step 1: 改页面**

`?tab=creator|staff`（**`staff` 是 UI 分组，不是 kind 取值**——它查的是后三个 kind 的合集）。
用 `Header` 的 `tabs` prop 渲染切换，**不要自造按钮组**（design-system §6.3 列表页模式）。
列表从现有表格改为 `RecordRow`（§6.1：记录浏览为主、每行有身份）；职能用 `Tag`，tone 走 §1.3 状态映射表。
`StatBand` 的三个统计按当前 tab 统计。
三态齐全：`LoadingState` / `EmptyState`（带引导）/ `ErrorState`（带重试）。

查询按 tab 分支：

```ts
const tab = searchParams.tab === 'staff' ? 'staff' : 'creator'
let q = db.from('site_applications')
  .select('id, kind, name, age, residence, contact, email, commute_mode, locale, status, created_at')
  .order('created_at', { ascending: false })
  .limit(200)
q = tab === 'creator' ? q.eq('kind', 'creator') : q.neq('kind', 'creator')
```

- [ ] **Step 2: 补 i18n**

`recruitApplications.*` 加两个 tab 标签、员工列的表头、三个职能与四种通勤方式的显示名。三语同改。

- [ ] **Step 3: 校验 + Commit**

```bash
npx tsc --noEmit && npm run test:copy
git add -A && git commit -m "feat(admin): 官网应募页按类别分 tab"
```

---

# Phase 2 · 共享基建

### Task 5: `pickLocaleText` 三语回退

**Files:**
- Create: `src/lib/site/i18n-content.ts`、`src/lib/site/i18n-content.test.ts`
- Modify: `package.json`

**Interfaces:**
- Produces: `pickLocaleText(locale: Locale, values: { ja: string; zh?: string | null; en?: string | null }): string`

> 与规格 §4 的小偏差：规格写的是泛型 `pickLocale<T>`，这里收窄为 `pickLocaleText`。
> 空串回退只对字符串有意义，泛型化会让「空值」的判定无法定义。

- [ ] **Step 1: 写失败的测试**

```ts
import assert from 'node:assert/strict'
import test from 'node:test'
import { pickLocaleText } from './i18n-content.ts'

test('有对应语言就用它', () => {
  assert.equal(pickLocaleText('zh', { ja: 'JA', zh: 'ZH', en: 'EN' }), 'ZH')
  assert.equal(pickLocaleText('en', { ja: 'JA', zh: 'ZH', en: 'EN' }), 'EN')
  assert.equal(pickLocaleText('ja', { ja: 'JA', zh: 'ZH', en: 'EN' }), 'JA')
})

test('缺失回退日语', () => {
  assert.equal(pickLocaleText('zh', { ja: 'JA' }), 'JA')
  assert.equal(pickLocaleText('en', { ja: 'JA', en: null }), 'JA')
})

test('空串与 null 同等对待', () => {
  assert.equal(pickLocaleText('zh', { ja: 'JA', zh: '' }), 'JA')
  assert.equal(pickLocaleText('zh', { ja: 'JA', zh: '   ' }), 'JA')
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `node --test --experimental-strip-types src/lib/site/i18n-content.test.ts`
Expected: FAIL "Cannot find module './i18n-content.ts'"

- [ ] **Step 3: 实现**

```ts
import type { Locale } from '../../i18n/routing.ts'

export interface LocalizedText {
  ja: string
  zh?: string | null
  en?: string | null
}

/**
 * 数据库内容的三语取值。ja 由 DB 的 not null 保证一定有值，所以本函数永不返回空。
 * 空串与 null 同等对待：后台表单清空一个选填字段会提交空串，不该让官网显示空白。
 */
export function pickLocaleText(locale: Locale, values: LocalizedText): string {
  const candidate = locale === 'ja' ? values.ja : locale === 'zh' ? values.zh : values.en
  const trimmed = typeof candidate === 'string' ? candidate.trim() : ''
  return trimmed || values.ja
}
```

- [ ] **Step 4: 跑测试 + 注册进 package.json**

把 `src/lib/site/i18n-content.test.ts` 加进 `package.json` 的 `test` 脚本文件清单。
Run: `npm test`
Expected: PASS，总数从 344 增加

- [ ] **Step 5: Commit**

```bash
git add src/lib/site/i18n-content.ts src/lib/site/i18n-content.test.ts package.json
git commit -m "feat(site): 数据库内容的三语回退"
```

---

### Task 6: 上传 helper 去重 + `site-media` 桶

**Files:**
- Create: `src/lib/storage/upload-image.ts`、`src/lib/storage/upload-image.test.ts`
- Modify: `src/app/api/items/photo/route.ts`、`src/app/api/competitors/upload/route.ts`
- Create: `src/app/api/site/upload/route.ts`
- Create: `supabase/migrations/049_site_media_bucket.sql`
- Modify: `package.json`

**Interfaces:**
- Produces: `validateImage(file: { type: string; size: number }): { ok: true } | { ok: false; error: 'type' | 'size' }`、`safeExtension(filename: string): string`、`uploadImage(bucket: string, file: File): Promise<{ url: string; error: null } | { url: null; error: 'upload_failed' }>`

- [ ] **Step 1: 写失败的测试**

```ts
import assert from 'node:assert/strict'
import test from 'node:test'
import { validateImage, safeExtension } from './upload-image.ts'

test('只放行四种图片类型', () => {
  assert.deepEqual(validateImage({ type: 'image/png', size: 100 }), { ok: true })
  assert.deepEqual(validateImage({ type: 'image/svg+xml', size: 100 }), { ok: false, error: 'type' })
})

test('超过 5MB 被拒', () => {
  assert.deepEqual(validateImage({ type: 'image/png', size: 5 * 1024 * 1024 + 1 }), { ok: false, error: 'size' })
})

test('扩展名净化：剥掉路径分隔与奇怪字符', () => {
  assert.equal(safeExtension('a.png'), 'png')
  assert.equal(safeExtension('a.PNG'), 'png')
  assert.equal(safeExtension('evil.pn/g'), 'png')          // 斜杠会在桶里造出子目录
  assert.equal(safeExtension('noext'), 'png')              // 无扩展名回退
  assert.equal(safeExtension('a.' + 'x'.repeat(20)), 'png') // 异常长度回退
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `node --test --experimental-strip-types src/lib/storage/upload-image.test.ts`
Expected: FAIL "Cannot find module"

- [ ] **Step 3: 实现 helper**

```ts
export const MAX_BYTES = 5 * 1024 * 1024
export const ALLOWED_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif'])
const ALLOWED_EXT = new Set(['png', 'jpg', 'jpeg', 'webp', 'gif'])

export function validateImage(file: { type: string; size: number }) {
  if (!ALLOWED_TYPES.has(file.type)) return { ok: false as const, error: 'type' as const }
  if (file.size > MAX_BYTES) return { ok: false as const, error: 'size' as const }
  return { ok: true as const }
}

/**
 * 扩展名只从白名单里取。原实现是 `file.name.split('.').pop()` —— 用户可以塞进
 * 斜杠，在桶里造出子目录结构。白名单之外一律回退 png。
 */
export function safeExtension(filename: string): string {
  const raw = filename.includes('.') ? filename.split('.').pop()!.toLowerCase() : ''
  return ALLOWED_EXT.has(raw) ? raw : 'png'
}
```

`uploadImage(bucket, file)` 另写：`createServerClient()` 落桶、路径用 `randomUUID() + '.' + safeExtension(file.name)`、返回 `getPublicUrl`；**失败只返回稳定错误码 `'upload_failed'`，不回传 `error.message`**。

- [ ] **Step 4: 跑测试 + 三个 route 改用 helper**

`items/photo`、`competitors/upload` 删掉各自重复的实现，改为鉴权 + `uploadImage('item-photos' | 'competitor-shots', file)`。
新建 `src/app/api/site/upload/route.ts`；本任务先用 `authGuard()` + `getActorProfile()` 的 `is_admin` 判定，Task 7 完成后换成 `canEditSiteContent`。

Run: `npm test && npx tsc --noEmit`
Expected: PASS

- [ ] **Step 5: 建桶迁移**

```sql
-- Migration 049: 官网内容图片桶（新闻主图 / 成员照片）
-- 公开读：这些图本来就在官网上对外展示，与 item-photos 同理。
insert into storage.buckets (id, name, public)
values ('site-media', 'site-media', true)
on conflict (id) do nothing;
```

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "refactor(storage): 抽出图片上传 helper 并新增 site-media 桶"
```

---

# Phase 3 · 新闻

### Task 7: 迁移 048 + 权限纯函数

**Files:**
- Create: `supabase/migrations/048_site_content.sql`
- Create: `src/lib/auth/site-content.ts`、`src/lib/auth/site-content.test.ts`
- Modify: `src/lib/auth/actor.ts`、`package.json`

**Interfaces:**
- Produces: `site_news` / `site_members` 两张表；`canEditSiteContent(actor: SiteContentActor | null): boolean`

- [ ] **Step 1: 写权限的失败测试**

```ts
import assert from 'node:assert/strict'
import test from 'node:test'
import { canEditSiteContent } from './site-content.ts'

test('admin 可编辑', () => {
  assert.equal(canEditSiteContent({ id: 'a', is_admin: true, role: 'bd' }), true)
})
test('ops 可编辑', () => {
  assert.equal(canEditSiteContent({ id: 'b', is_admin: false, role: 'ops' }), true)
})
test('其他角色不可编辑', () => {
  assert.equal(canEditSiteContent({ id: 'c', is_admin: false, role: 'bd' }), false)
})
test('未登录不可编辑', () => {
  assert.equal(canEditSiteContent(null), false)
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `node --test --experimental-strip-types src/lib/auth/site-content.test.ts`
Expected: FAIL "Cannot find module"

- [ ] **Step 3: 实现**

```ts
export interface SiteContentActor {
  id: string
  is_admin: boolean
  role: string | null
}

/**
 * 官网内容一改就对公网可见，误操作代价高于内部数据，因此收到 admin/ops。
 *
 * 已知缺口：/api/profile 目前允许任何人把自己的 role 改成 ops，所以 ops 这一支
 * 现在可被自助绕过（审计行动项 2 在修）。在那之前实际有效的门是 is_admin。
 */
export function canEditSiteContent(actor: SiteContentActor | null): boolean {
  if (!actor) return false
  return actor.is_admin || actor.role === 'ops'
}
```

`src/lib/auth/actor.ts`：`getActorProfile` 的 select 从 `'id, is_admin'` 改为 `'id, is_admin, role'`，`ActorProfile` 接口加 `role: string | null`，return 加 `role: data.role ?? null`。

- [ ] **Step 4: 写迁移 048**

按规格 §3.2 与 §3.3 全文照抄：`site_news`（含 `is_published boolean not null default true`、索引 `(is_published, is_pinned desc, published_on desc)`、`updated_at` 触发器）、`site_members`（12 卡位 check、`site_members_revealed_fields` 约束）；两表 RLS 按 `drop policy if exists` → `create policy ... for select to authenticated using (true)` → `revoke all ... from anon, authenticated` → `grant select ... to authenticated` 的顺序。

- [ ] **Step 5: 容器验证（含幂等）**

```bash
docker run -d --rm --name m048 -e POSTGRES_PASSWORD=x postgres:16-alpine && sleep 5
docker exec -i m048 psql -U postgres -v ON_ERROR_STOP=1 -q <<'SQL'
create role anon; create role authenticated;
create table users (id uuid primary key);
create function update_updated_at() returns trigger language plpgsql as $$
  begin new.updated_at = now(); return new; end $$;
grant usage on schema public to anon, authenticated;
grant all on all tables in schema public to anon, authenticated;
SQL
docker exec -i m048 psql -U postgres -v ON_ERROR_STOP=1 -q < supabase/migrations/048_site_content.sql && echo "应用 OK"
docker exec -i m048 psql -U postgres -v ON_ERROR_STOP=1 -q < supabase/migrations/048_site_content.sql && echo "重跑 OK"
docker exec -i m048 psql -U postgres -qtA -c "
  select grantee||': '||table_name||' = '||string_agg(privilege_type,',' order by privilege_type)
  from information_schema.role_table_grants
  where grantee in ('anon','authenticated') and table_name in ('site_news','site_members')
  group by grantee, table_name;"
docker rm -f m048
```

Expected：anon 零行；authenticated 两张表各只有 `SELECT`（**特别确认没有 TRUNCATE** —— 它不受 RLS 约束，是 046 实跑时抓到的坑）

- [ ] **Step 6: 注册测试 + Commit**

```bash
# 把 src/lib/auth/site-content.test.ts 加进 package.json 的 test 清单
npm test && npx tsc --noEmit
git add -A && git commit -m "feat(db): 官网内容表与编辑权限"
```

---

### Task 8: 内容搬迁脚本

**Files:**
- Create: `scripts/seed-site-content.mjs`

**Interfaces:**
- Consumes: `site_news` / `site_members`（Task 7）

- [ ] **Step 1: 干跑验证拆分规则（先于写脚本）**

```bash
node -e "
const l = require('./messages/ja.json').site.members.list;
console.log(l.map(e => JSON.stringify({ name: e.name, ja: e.role.split('／')[0], sp: e.role.split('／')[1] })).join('\n'));
"
```

Expected：8 条全部拆出两段，形如 `{"name":"KANO","ja":"花乃","sp":"儚い微笑みの罠"}`。
**若有任何一条拆不出两段，停下来问，不要猜。**

- [ ] **Step 2: 写脚本**

读 `messages/{ja,zh,en}.json`，用 `SUPABASE_SERVICE_ROLE_KEY` 写库，幂等（新闻按 `slug` upsert、成员按 `no` upsert）。

- 新闻：`NEWS_SLUGS` 四个 slug；`date` `"2026.10.01"` → `published_on` `"2026-10-01"`（`.replaceAll('.', '-')`）；`body: string[]` → `body_ja` 用 `\n\n` 连接；`image_url` 取 `news.ts` 里 `NEWS_IMAGES` 的现有路径；`tag` 直接取 i18n 的 `tag`（已是 `RECRUIT|PROJECT|LIVE`）；`is_published = true`。
- 成员：`site.members.list` 8 条按下标 → `no = i + 1`、`is_revealed = true`；`role` 按全角 `／` 拆成 `name_ja` 与 `specialty_*`；`name` 取 `entry.name`；`photo_url` 取 `MEMBER_IMAGES[i]`；9–12 号建 `is_revealed = false` 的空行。

- [ ] **Step 3: 对本地/测试库跑两次，确认幂等**

Expected：第二次跑完 `select count(*) from site_news` = 4、`site_members` = 12，与第一次相同。

- [ ] **Step 4: Commit**

```bash
git add scripts/seed-site-content.mjs
git commit -m "chore(site): 现有新闻与成员的一次性搬迁脚本"
```

---

### Task 9: 新闻 API + 后台页

**Files:**
- Create: `src/app/api/site/news/route.ts`、`src/app/api/site/news/[id]/route.ts`
- Create: `src/lib/site/news-sort.ts`、`src/lib/site/news-sort.test.ts`
- Create: `src/components/ui/ImageUploadField.tsx`
- Create: `src/app/[locale]/(app)/site-content/news/page.tsx`
- Modify: `src/components/layout/Sidebar.tsx`、`messages/{zh,en,ja}.json`、`package.json`、`docs/design-system.md`

**Interfaces:**
- Consumes: `canEditSiteContent`（T7）、`uploadImage`（T6）
- Produces: `sortNews(rows)`、`publishedOnly(rows)`、`isValidNewsSlug(slug)`（POST/PATCH 前置校验用）

- [ ] **Step 1: 写排序的失败测试**

```ts
import assert from 'node:assert/strict'
import test from 'node:test'
import { sortNews, publishedOnly } from './news-sort.ts'

test('置顶优先，其次发布日倒序', () => {
  const rows = [
    { slug: 'a', is_pinned: false, published_on: '2026-10-01', is_published: true },
    { slug: 'b', is_pinned: true,  published_on: '2026-08-01', is_published: true },
    { slug: 'c', is_pinned: false, published_on: '2026-12-01', is_published: true },
  ]
  assert.deepEqual(sortNews(rows).map(r => r.slug), ['b', 'c', 'a'])
})

test('已下架的不出现在官网列表', () => {
  const rows = [
    { slug: 'a', is_pinned: false, published_on: '2026-10-01', is_published: true },
    { slug: 'b', is_pinned: true,  published_on: '2026-11-01', is_published: false },
  ]
  assert.deepEqual(publishedOnly(rows).map(r => r.slug), ['a'])
})

test('slug 形状校验与数据库 check 一致', () => {
  assert.equal(isValidNewsSlug('moondollz-launch'), true)
  assert.equal(isValidNewsSlug('a1-b2'), true)
  assert.equal(isValidNewsSlug('Moondollz'), false)   // 大写
  assert.equal(isValidNewsSlug('a--b'), false)        // 连续连字符
  assert.equal(isValidNewsSlug('-a'), false)          // 首尾连字符
  assert.equal(isValidNewsSlug('a_b'), false)         // 下划线
  assert.equal(isValidNewsSlug(''), false)
  assert.equal(isValidNewsSlug('x'.repeat(61)), false) // 超过 60
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `node --test --experimental-strip-types src/lib/site/news-sort.test.ts`
Expected: FAIL "Cannot find module"

- [ ] **Step 3: 实现**

```ts
export interface NewsOrderable {
  is_pinned: boolean
  published_on: string
  is_published: boolean
}

export function publishedOnly<T extends NewsOrderable>(rows: T[]): T[] {
  return rows.filter((r) => r.is_published)
}

/** 置顶优先；同组内按发布日倒序。日期是 ISO 串，字典序即时间序。 */
export function sortNews<T extends NewsOrderable>(rows: T[]): T[] {
  return [...rows].sort((a, b) => {
    if (a.is_pinned !== b.is_pinned) return a.is_pinned ? -1 : 1
    return b.published_on.localeCompare(a.published_on)
  })
}

/**
 * 与迁移 048 里 site_news.slug 的 check 约束**同一条规则**，两边改必须一起改。
 * 前置校验存在的意义是给出字段级错误，而不是让用户撞一个数据库约束错误。
 */
const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/

export function isValidNewsSlug(slug: string): boolean {
  return slug.length > 0 && slug.length <= 60 && SLUG_RE.test(slug)
}
```

- [ ] **Step 4: 跑测试确认通过 + 注册进 package.json**

Run: `npm test`
Expected: PASS

- [ ] **Step 5: API route**

四个方法都先 `authGuard()` → `getActorProfile()` → `canEditSiteContent()`，不通过返回 403。
`PATCH` 支持部分字段（含 `is_pinned` / `is_published`）。
**每个写方法成功后调 `revalidatePath`**，覆盖 `/[locale]`、`/[locale]/site/news`、`/[locale]/site/news/[slug]` × 三个 locale；revalidate 抛错**不吞**，作为响应里的 `warning` 字段回传（规格 §6 的失败可见性要求）。
错误一律返回稳定错误码，不回传 `error.message`。

- [ ] **Step 6: `ImageUploadField` 组件 + 登记**

`src/components/ui/ImageUploadField.tsx`，props：`value: string | null` `onChange(url: string): void` `label: string` `hint?: string` `error?: string`。用后台 token（violet/mauve），内部用 `Field` 包裹，上传打 `/api/site/upload`。
**同 PR 在 `docs/design-system.md` §6.2 登记它的 props 契约**（§6 准入流程要求）。

- [ ] **Step 7: 后台列表页 + 侧边栏**

`site-content/news/page.tsx`：`Header`(title+sub+actions) → `StatBand` → `SectionCard` + `RecordRow × n`；行内切置顶与上下架；已下架整行降调 + `Tag`；删除走 `Modal` + `danger` Button + 一句话说明不可逆；编辑用页内 `SectionCard` + `Field` 单列，zh/en 段默认折叠。三态齐全。
`Sidebar.tsx` 的 `NAV` 加「官网内容」分组（`{ href: '/site-content/news', key: 'siteNews', icon: Newspaper }`），放在「创作者」组之后。

- [ ] **Step 8: 全量校验 + Commit**

```bash
npx tsc --noEmit && npm test && npm run test:copy
git add -A && git commit -m "feat(admin): 新闻后台管理"
```

---

### Task 10: 官网新闻改读库 + 删 i18n key

**Files:**
- Modify: `src/lib/site/news.ts`、`src/lib/site/news.test.ts`
- Modify: `src/app/[locale]/site/news/page.tsx`、`src/app/[locale]/site/news/[slug]/page.tsx`、`src/app/[locale]/site/page.tsx`
- Modify: `messages/{zh,en,ja}.json`、`scripts/i18n-baseline.json`
- Modify: `docs/public-site.md`

**Interfaces:**
- Consumes: `pickLocaleText`（T5）、`sortNews`/`publishedOnly`（T9）、`site_news`（T7）

- [ ] **Step 1: 改 `news.ts`**

删 `NEWS_SLUGS` / `NEWS_IMAGES` / `buildArticles` / `findArticle` 的 i18n 版本，改为从库行构造 `SiteArticle`（三语字段走 `pickLocaleText`，`body` 按 `\n\n` 切回段落数组）。`news.test.ts` 改写为「库行 → SiteArticle」的测试。

- [ ] **Step 2: 三个页面改读库**

列表 / 详情 / 首页最新三条都查 `is_published = true`；`generateStaticParams` 只返回已发布 slug（**下架文章的详情页应 404，而不是旧链接还能打开**）。加 ISR 配置。

- [ ] **Step 3: 先验证读库正常，再删 key**

**顺序是硬的**：确认官网三个页面在三语下都渲染正确之后，才从 `messages/{zh,en,ja}.json` 删 `site.news.articles[]`。反过来就是上线即丢内容。

- [ ] **Step 4: 更新 baseline + 文档**

`scripts/i18n-baseline.json` 同步；`docs/public-site.md` 改 §2.4（静态优先 → ISR）、§2.5（NEWS/成员本轮做、排班仍不做）、§2.2（三语等价的口径改为「日语必填、中英回退」）。

- [ ] **Step 5: 全量校验 + Commit**

```bash
npx tsc --noEmit && npm test && npm run test:copy
git add -A && git commit -m "feat(site): 新闻改为读库 + ISR"
```

---

# Phase 4 · 成员

### Task 11: 成员 API + 后台配置页

**Files:**
- Create: `src/app/api/site/members/route.ts`、`src/app/api/site/members/[no]/route.ts`
- Create: `src/app/[locale]/(app)/site-content/members/page.tsx`
- Modify: `src/components/layout/Sidebar.tsx`、`messages/{zh,en,ja}.json`

**Interfaces:**
- Consumes: `canEditSiteContent`（T7）、`ImageUploadField`（T9）、`site_members`（T7）

- [ ] **Step 1: API**

`GET` 返回 12 个卡位（按 `no` 升序）；`PATCH /[no]` 改单个卡位。权限判定同 Task 9。写成功后 `revalidatePath('/[locale]/site/vision')` × 三个 locale，revalidate 错误不吞、作为 `warning` 回传。

- [ ] **Step 2: 后台页**

12 卡位网格。**先用 `SectionCard` + 现有原语拼**；拼不出来才新建组件，新建就要登记 design-system §6.2。点开单卡编辑用 `Modal` + `Field`（design-system §6.3 表单模式）；未公开卡位只需填 `expected_reveal_on`。三态齐全。

- [ ] **Step 3: 侧边栏加「成员」入口 + i18n 三语**

- [ ] **Step 4: 校验 + Commit**

```bash
npx tsc --noEmit && npm run test:copy
git add -A && git commit -m "feat(admin): 成员卡位后台配置"
```

---

### Task 12: 官网成员改读库 + 删 i18n key

**Files:**
- Modify: `src/lib/site/content.ts`、`src/lib/site/content.test.ts`（不存在则新建并注册进 package.json）
- Modify: `src/app/[locale]/site/vision/page.tsx`
- Modify: `messages/{zh,en,ja}.json`、`scripts/i18n-baseline.json`

**Interfaces:**
- Consumes: `pickLocaleText`（T5）、`site_members`（T7）

- [ ] **Step 1: 写失败的测试**

```ts
test('12 个卡位补齐，未公开卡位显示占位', () => {
  const rows = [{ no: 1, is_revealed: true, name: 'KANO', name_ja: '花乃', name_en: null,
                  specialty_ja: '罠', specialty_zh: null, specialty_en: null,
                  photo_url: '/p.webp', expected_reveal_on: null }]
  const members = buildMembers(rows, 'ja', '— 公開前 —')
  assert.equal(members.length, 12)
  assert.equal(members[0].name, 'KANO')
  assert.equal(members[0].image, '/p.webp')
  assert.equal(members[11].name, '— 公開前 —')
})

test('未公开卡位用该行的预计公开时间，而不是全局写死的文案', () => {
  const rows = [{ no: 9, is_revealed: false, name: null, name_ja: null, name_en: null,
                  specialty_ja: null, specialty_zh: null, specialty_en: null,
                  photo_url: null, expected_reveal_on: '2026-12-01' }]
  const members = buildMembers(rows, 'ja', '— 公開前 —')
  assert.equal(members[8].role, '2026-12')
})
```

- [ ] **Step 2: 跑测试确认失败** → **Step 3: 改 `content.ts`**

`buildMembers` 改签名为 `(rows, locale, unrevealedName)`，消费库行；`MEMBER_SLOTS = 12` 保留（它是 `site_members.no` check 的上界，两处必须一致）；删 `MEMBER_IMAGES`；已公开卡位的 `role` 由 `pickLocaleText` 取 specialty，未公开卡位的 `role` 由 `expected_reveal_on` 格式化为 `YYYY-MM`（替代写死的 `unrevealedRole`）。

- [ ] **Step 4: 跑测试确认通过 + vision 页改读库 + ISR**

- [ ] **Step 5: 验证渲染正确后再删 key**

三语下确认成员网格渲染正确，然后删 `site.members.list`、`site.members.note`、`site.members.unrevealedRole`；**保留** `unrevealedName`、`captains` 与其余 UI 标签。更新 baseline。

- [ ] **Step 6: 全量校验 + Commit**

```bash
npx tsc --noEmit && npm test && npm run test:copy
git add -A && git commit -m "feat(site): 成员网格改为读库 + ISR"
```

---

## 交付前检查清单

- [ ] `npx tsc --noEmit` / `npm test` / `npm run test:copy` 全绿
- [ ] 三个迁移（047/048/049）都在一次性容器上跑过，且**重跑一次不报错**
- [ ] `site_news` / `site_members` 上 anon 零权限、authenticated 只有 SELECT（**确认没有 TRUNCATE**）
- [ ] 搬迁脚本跑过两次，行数不变（news=4、members=12）
- [ ] 官网三语切换下 news 列表/详情、vision 成员网格渲染正确
- [ ] **`https://eacn.agenova.chat/recruit/staff` 能打开** —— 这是 `PUBLIC_PAGE_RE` 那条改动的唯一真实验证点，内部域名与本地都测不出来
- [ ] 后台改一条新闻 → 官网对应页面在 ISR 后可见；下架 → 官网列表消失、详情 404
- [ ] `docs/public-site.md` 的 §2.2 / §2.4 / §2.5 已同步
- [ ] `docs/design-system.md` §6.2 已登记 `ImageUploadField`（以及成员网格若新建了组件）
