# 官网内容管理与其他招募 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 交付三件事——官网「其他招募」（摄影师/化妆师/团播运营）投递与后台查看、新闻的后台可编辑化（含置顶与上下架）、成员卡位的后台配置。

**Architecture:** `site_applications` 扩展 `kind` 判别列复用同一张表；新建 `site_news` / `site_members` 两张内容表，三语用三列（ja 必填、zh/en 回退）；官网页面由 i18n 静态改为读库 + ISR，后台保存时 `revalidatePath`。

**Tech Stack:** Next.js 14 App Router / TypeScript / Supabase(Postgres) / Tailwind + 仓库自有 token / `node --test --experimental-strip-types`

**上游规格：** `docs/superpowers/specs/2026-08-13-site-content-and-recruitment-design.md`（下称「规格」）。本计划每个任务都以它为准，冲突时先改规格再改计划。

---

## Global Constraints

以下约束对**每一个任务**都生效，任务里不再重复：

1. **新增测试文件必须加进 `package.json` 的 `test` 脚本**。该脚本是逐个文件枚举的（现有 45 个）；
   本轮新增的纯函数测试和 `site-content-api.integration.test.ts` 都要登记，不加进去测试永远不跑，CI 也不会发现。
2. **测试里用相对路径 + `.ts` 后缀导入**（如 `../../i18n/routing.ts`），不能用 `@/` 别名——`node --test` 直接跑 TS 时不认 tsconfig 的 paths。
3. **JSX 里禁止裸中文**（`scripts/check-no-bare-han.mjs`）。所有面向用户的文案走 `useTranslations()` / `getTranslations()`。
4. **样式 token 零容忍**（`scripts/check-style-tokens.mjs`）：禁 `slate/indigo/zinc/gray/stone/neutral` 数字阶灰、裸 hex、固定透明度 token 带 `/N`、`text-base`。正向校验对全库生效——用到的色阶必须真实登记在 `tailwind.config.ts`（`text-ink-600` 会失败，ink 只登记了 900/700/500/400）。
5. **两套设计面不串味**：后台页面用 `src/components/ui/` + `layout/Header` + mauve/violet token；官网页面用 `src/components/site/` + `site-*` token。见规格 §8.4。
6. **组件先查后建**：新 UI 需求先查 `docs/design-system.md` §6.1 决策表与 `src/components/ui/` 目录，没有才新建；新建必须登记进 `design-system.md` §6.2。
7. **i18n 三语同改**：`messages/{zh,en,ja}.json` 的 key 形状必须完全一致，改一个文件就要改三个。改完跑 `npm run test:copy`。
8. **迁移必须可重跑且用时间戳命名**：本仓迁移是人工按文件名字典序应用、无 `schema_migrations` 记录。创建时用 `TZ=Asia/Tokyo date +%Y%m%d%H%M%S` 生成 `<YYYYMMDDHHMMSS>_<snake_case>.sql` 的前缀，并通过 `scripts/check-migrations.mjs`；`create policy` 前先 `drop policy if exists`，`add constraint` 用 `DO` 块查 `pg_constraint` 后再加（Postgres 不支持 `add constraint if not exists`）。同批文件逐秒递增以保证唯一和依赖顺序；contract 文件的时间戳必须晚于 expand，即使已随代码提交也只能在 expand 的部署判据满足后单独应用。
9. **迁移验收方式**：在一次性 Docker Postgres 容器上实跑（含重跑一次验幂等）后才算完成。参照 `supabase/migrations/20260814074006_rls_users_broadcast_accounts_salary.sql` 的做法。
10. **每个任务结束跑一次** `npx tsc --noEmit && npm test && npm run test:copy`。`test:copy` 已包含零 warning 的 ESLint；CI 的 `copy.yml` 分别运行这一组检查，`check.yml` 只跑 tsc 和 test。

---

## File Structure

**新建**

| 文件 | 职责 |
|---|---|
| `supabase/migrations/20260814112722_site_applications_kinds.sql` | `site_applications` 加 `kind`/`email`/`commute_mode` + 按 kind 的 check（expand） |
| `supabase/migrations/20260814112723_site_content.sql` | `site_news` / `site_members` 两张表 + RLS |
| `supabase/migrations/20260814112724_site_media_bucket.sql` | `site-media` 公开桶 |
| `supabase/migrations/20260814112725_site_applications_kinds_contract.sql` | 新服务稳定后移除 `kind` 的兼容 default（contract，不与前三条同批应用） |
| `scripts/seed-site-content.mjs` | 把静态 fixture 中的 5 篇新闻、8 位成员搬进库（幂等） |
| `scripts/site-content-seed-data.mjs` | 与 UI i18n/展示常量解耦的新闻、成员静态 seed fixture |
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
| `src/lib/site/domain-routing.ts` | 导出 `PUBLIC_SITE_LOCALES` 给官网缓存失效复用，并让 `PUBLIC_PAGE_RE` 放行 `/recruit/staff` |
| `src/lib/site/contact.ts` | `SiteContactAction` 加 `'staff-recruit'` |
| `src/lib/site/nav.ts` | 导出 `STAFF_RECRUIT_HREF` |
| `src/lib/auth/actor.ts` | `getActorProfile` 补 select `role` |
| `src/lib/site/news.ts`、`content.ts` | 改为消费库数据 |
| `src/app/[locale]/site/{page,news/page,news/[slug]/page,vision/page}.tsx` | 读库 + ISR |
| `src/app/[locale]/(app)/recruit-applications/page.tsx` | 加 tab |
| `src/components/layout/Sidebar.tsx` | 加「官网内容」分组 |
| `src/app/api/items/photo/route.ts`、`competitors/upload/route.ts` | 改用共享 helper |
| `next.config.mjs` | 配置 `site-media` 的 Next Image 远程来源 |
| `messages/{zh,en,ja}.json`、`scripts/i18n-baseline.json` | 删内容 key、加 UI 文案 |
| `package.json` | 注册 6 个新测试文件 |
| `docs/public-site.md`、`docs/design-system.md` | 同步口径与组件登记 |

---

# Phase 1 · 其他招募

### Task 1: 迁移 `20260814112722_site_applications_kinds.sql` —— `site_applications` 扩展

**Files:**
- Create: `supabase/migrations/20260814112722_site_applications_kinds.sql`

**Interfaces:**
- Produces: `site_applications.kind`（`creator|photographer|makeup|group_live_ops`）、`.email`、`.commute_mode`；Task 3 落库时使用。

- [ ] **Step 1: 写迁移文件**

```sql
-- ============================================================
-- Migration 20260814112722_site_applications_kinds: 官网应募扩展出「其他招募」三类
--
-- 不新建第二张表：附件要的是「官网应募页增加一个 tab」，同一数据源两个视图。
-- 字段名逐字对齐 tt-agent/docs/domain-b-applications-contract.md，
-- 将来导入 core.applications 就是 1:1，不需要映射表。
-- ============================================================

alter table site_applications
  -- expand 阶段保留 default：旧版本服务仍在运行时，少传 kind 的请求
  -- 继续按主播应募落库；contract 阶段再由后续 contract 迁移删除这个 default。
  add column if not exists kind text not null default 'creator'
    check (kind in ('creator', 'photographer', 'makeup', 'group_live_ops')),
  add column if not exists email text
    check (email is null or char_length(email) between 3 and 254),
  add column if not exists commute_mode text
    check (commute_mode is null or commute_mode in ('subway', 'bicycle', 'walk', 'car'));

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
docker run -d --rm --name m-site-applications-kinds -e POSTGRES_PASSWORD=x postgres:16-alpine
sleep 5
docker exec -i m-site-applications-kinds psql -U postgres -v ON_ERROR_STOP=1 <<'SQL'
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

- [ ] **Step 3: 应用迁移，验证回填、约束与兼容 default**

```bash
docker exec -i m-site-applications-kinds psql -U postgres -v ON_ERROR_STOP=1 -q < supabase/migrations/20260814112722_site_applications_kinds.sql
docker exec -i m-site-applications-kinds psql -U postgres -qtA <<'SQL'
select '历史行 kind=' || kind from site_applications;
select 'kind default=' || coalesce(column_default, '<none>')
  from information_schema.columns
  where table_name = 'site_applications' and column_name = 'kind';
SQL
if docker exec -i m-site-applications-kinds psql -U postgres -v ON_ERROR_STOP=1 -q -c \
  "insert into site_applications (kind,name,contact,locale,commute_mode)
   values ('makeup','A','x','ja','subway');"; then
  echo 'ERROR: staff row without email was accepted' >&2; exit 1
else
  echo 'OK: staff row without email rejected'
fi
docker exec -i m-site-applications-kinds psql -U postgres -v ON_ERROR_STOP=1 -q -c \
  "insert into site_applications (kind,name,contact,locale,email,commute_mode)
   values ('makeup','B','x','ja','b@e.com','subway');"
if docker exec -i m-site-applications-kinds psql -U postgres -v ON_ERROR_STOP=1 -q -c \
  "insert into site_applications (kind,name,contact,locale,residence)
   values ('creator','C','x','ja','大阪');"; then
  echo 'ERROR: creator row without age was accepted' >&2; exit 1
else
  echo 'OK: creator row without age rejected'
fi
```

Expected：历史行 `kind=creator`；`kind` 的 default 仍为 `'creator'`；第一条与第三条被 check
拒绝；第二条 OK。

- [ ] **Step 4: 验 `site_applications_kinds` 幂等 + 销毁容器**

```bash
docker exec -i m-site-applications-kinds psql -U postgres -v ON_ERROR_STOP=1 -q < supabase/migrations/20260814112722_site_applications_kinds.sql && echo "重跑 OK"
docker rm -f m-site-applications-kinds
```

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260814112722_site_applications_kinds.sql
git commit -m "feat(db): site_applications 扩展出其他招募三类"
```

- [ ] **Step 5: 部署新服务并满足 contract 判据**

先部署 Task 3 的新 service 和公开表单，使所有新请求显式写入 `kind`。只有同时满足以下条件，
才能执行下一步；任一条件不满足都必须继续保留 default：

1. 生产环境所有仍可能写入 `site_applications` 的实例都已部署新 service，旧实例已排空并下线；
2. 历史行已确认全部为 `kind = 'creator'`，且 `kind` 没有 NULL 或约束外的值；
3. 通过访问日志/指标确认新旧 API 在观察窗口内都显式写入四种合法 kind，未出现依赖 default 的请求；
4. 已验证 creator 与三类 staff 的完整请求都能成功落库，缺少 `kind` 的请求在 contract 后应明确失败。

- [ ] **Step 6: 迁移 `20260814112725_site_applications_kinds_contract.sql` —— contract 阶段移除兼容 default**

**Files:** Create `supabase/migrations/20260814112725_site_applications_kinds_contract.sql`

```sql
-- Migration 20260814112725_site_applications_kinds_contract: site_applications kind contract
-- 仅在 Task 1 Step 5 的全部判据满足后执行。
alter table site_applications
  alter column kind drop default;
```

应用并检查：

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/migrations/20260814112725_site_applications_kinds_contract.sql
psql "$DATABASE_URL" -Atc "select column_default from information_schema.columns where table_name='site_applications' and column_name='kind'"
```

Expected：查询返回空行；`kind` 的 `NOT NULL`、允许值 check 和按 kind 的字段 check 保持不变。
contract 文件的时间戳晚于 expand，文件名字典序会先应用 expand；它不得与 expand 同批执行，也不得在旧 service 仍可能接收流量时执行。

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

同时修改现有 `contact.test.ts` 的 locale-safe action 测试：把
`assert.equal(sections[1].ctaHref, undefined)` 改为
`assert.equal(sections[1].ctaHref, '/site/recruit/staff')`。这不是新增断言，而是更新
staff CTA 后必然改变的既有行为；必须与 contact 实现同一提交完成。

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
同步修改现有 `ApplicationRow`：`age: number | null`、`residence: string | null`，加入
`kind`、`email: string | null`、`commute_mode: string | null`。creator 行显示年龄与居住地；staff
行不显示年龄，年龄/居住地/邮箱/通勤方式的 NULL 或空串统一用三语 i18n 的
`recruitApplications.notProvided`（值为 `—`）显示，禁止直接渲染 `null`。查询结果和统计必须
使用这个新类型，避免把数据库 NULL 强制 cast 成旧的非空类型。
`StatBand` 的三个统计按当前 tab 统计。
三态齐全：`LoadingState` / `EmptyState`（带引导）/ `ErrorState`（带重试）。

查询按 tab 分支：

```ts
const tab = searchParams.tab === 'staff' ? 'staff' : 'creator'
let q = db.from('site_applications')
  .select('id, kind, name, age, residence, contact, email, commute_mode, experience, locale, status, created_at')
  .order('created_at', { ascending: false })
  .limit(200)
q = tab === 'creator' ? q.eq('kind', 'creator') : q.neq('kind', 'creator')
```

- [ ] **Step 2: 补 i18n**

`recruitApplications.*` 加两个 tab 标签、员工列的表头、三个职能与四种通勤方式的显示名，
以及 `notProvided`（三语显示 `—` 或等价本地化文案）。三语同改。

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
- Create: `supabase/migrations/20260814112724_site_media_bucket.sql`
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
-- Migration 20260814112724_site_media_bucket: 官网内容图片桶（新闻主图 / 成员照片）
-- 公开读：这些图本来就在官网上对外展示，与 item-photos 同理。
insert into storage.buckets (id, name, public)
values ('site-media', 'site-media', true)
on conflict (id) do nothing;
```

- [ ] **Step 6: 配置 Next Image 的远程来源**

修改 `next.config.mjs`：在现有 `nextConfig` 对象中加入 `images.remotePatterns`。host 必须从部署环境
的 `NEXT_PUBLIC_SUPABASE_URL` 推导，不能用 `*.supabase.co` 放开所有项目；路径必须限制到本次新桶：

```js
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
if (!supabaseUrl) throw new Error('NEXT_PUBLIC_SUPABASE_URL is required')
const supabaseHost = new URL(supabaseUrl).hostname
```

将下面这个属性加入现有 `nextConfig` 对象；不要再声明第二个 `nextConfig`：

```js
images: {
  remotePatterns: [
    {
      protocol: 'https',
      hostname: supabaseHost,
      port: '',
      pathname: '/storage/v1/object/public/site-media/**',
    },
  },
},
```

提交前用真实 Supabase 项目的 `getPublicUrl()` 结果检查 hostname 和 pathname；在 production build/start
环境写入一条新闻图片和一张成员图片，访问官网页面确认两者都由 `next/image` 成功渲染。只验证 CSP 或
使用仓库内 `/site/*.webp` 不算通过。

- [ ] **Step 7: Commit**

```bash
git add src/lib/storage/upload-image.ts src/lib/storage/upload-image.test.ts \
  src/app/api/items/photo/route.ts src/app/api/competitors/upload/route.ts \
  src/app/api/site/upload/route.ts supabase/migrations/20260814112724_site_media_bucket.sql next.config.mjs
git commit -m "refactor(storage): 抽出图片上传 helper 并新增 site-media 桶"
```

---

# Phase 3 · 新闻

### Task 7: 迁移 `20260814112723_site_content.sql` + 权限纯函数

**Files:**
- Create: `supabase/migrations/20260814112723_site_content.sql`
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
// 下面这条是本函数存在的全部意义，不要因为「看起来 ops 该能管内容」就改掉它：
// /api/profile 的 GET 会给没有 profile 行的用户自动建档并写死 role: 'ops'
// （src/app/api/profile/route.ts:29）。ops 是默认角色，不是被授予的权限。
test('ops 不可编辑 —— 它是每个新用户的默认角色', () => {
  assert.equal(canEditSiteContent({ id: 'b', is_admin: false, role: 'ops' }), false)
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
 * 官网内容一改就对公网可见，误操作代价高于内部数据，因此写操作只认 is_admin。
 *
 * 为什么不认 role === 'ops'：/api/profile 的 GET 在用户没有 profile 行时会自动
 * 建档并写死 role: 'ops'（src/app/api/profile/route.ts:29）——ops 是每个新用户的
 * 默认角色，不是被授予的权限。把它写进判定等于对所有登录用户开放。PATCH 允许
 * 用户自选 role 只是第二条绕过路径，堵上它也不改变默认建档这条。
 *
 * 放开 ops 的前提有两条，缺一不可：① 建档默认角色改成最小权限；② role 改为
 * 仅管理员可分配。参数里保留 role 字段是为那一天留位，现在不参与判定。
 */
export function canEditSiteContent(actor: SiteContentActor | null): boolean {
  if (!actor) return false
  return actor.is_admin
}
```

`src/lib/auth/actor.ts`：`getActorProfile` 的 select 从 `'id, is_admin'` 改为 `'id, is_admin, role'`，`ActorProfile` 接口加 `role: string | null`，return 加 `role: data.role ?? null`。

- [ ] **Step 4: 写迁移 `20260814112723_site_content.sql`（所有 DDL 可重跑）**

按规格 §3.2 与 §3.3 全文照抄：`site_news`（含 `category text not null default 'project' check (category in ('project', 'recruit'))`、
`is_published boolean not null default true`、索引
`(is_published, is_pinned desc, published_on desc)`、`updated_at` 触发器）、`site_members`
（12 卡位 check、`site_members_revealed_fields` 约束）；两表 RLS 按 `drop policy if exists` →
`create policy ... for select to authenticated using (true)` → `revoke all ... from anon, authenticated`
→ `grant select ... to authenticated` 的顺序。

DDL 必须使用以下幂等形式，不能恢复成裸语句：把两张完整表定义的开头分别写成
`create table if not exists site_news (` 和 `create table if not exists site_members (`；新闻索引使用
`create index if not exists idx_site_news_order on site_news (is_published, is_pinned desc, published_on desc)`；
两个 trigger 都先执行 `drop trigger if exists site_news_updated_at on site_news`、
`drop trigger if exists site_members_updated_at on site_members`，再执行现有的 `create trigger`。
提交的迁移文件必须保留规格 §3.2 的全部列、check 和外键。
其中 `site_members` 的两个业务约束必须原样落地：已公开行要求
`nullif(btrim(name), '')`、`nullif(btrim(photo_url), '')`、`nullif(btrim(specialty_ja), '')`
全部非空；未公开行要求 `expected_reveal_on is not null`。API 也要在 trim 后执行同样校验，
因为数据库 check 是最后防线，不应让空白文本绕过它。

- [ ] **Step 5: 容器验证（含幂等）**

```bash
docker run -d --rm --name m-site-content -e POSTGRES_PASSWORD=x postgres:16-alpine && sleep 5
docker exec -i m-site-content psql -U postgres -v ON_ERROR_STOP=1 -q <<'SQL'
create role anon; create role authenticated;
create table users (id uuid primary key);
create function update_updated_at() returns trigger language plpgsql as $$
  begin new.updated_at = now(); return new; end $$;
grant usage on schema public to anon, authenticated;
grant all on all tables in schema public to anon, authenticated;
SQL
docker exec -i m-site-content psql -U postgres -v ON_ERROR_STOP=1 -q < supabase/migrations/20260814112723_site_content.sql && echo "应用 OK"
docker exec -i m-site-content psql -U postgres -v ON_ERROR_STOP=1 -q < supabase/migrations/20260814112723_site_content.sql && echo "重跑 OK"
docker exec -i m-site-content psql -U postgres -qtA -c "
  select grantee||': '||table_name||' = '||string_agg(privilege_type,',' order by privilege_type)
  from information_schema.role_table_grants
  where grantee in ('anon','authenticated') and table_name in ('site_news','site_members')
  group by grantee, table_name;"
if docker exec -i m-site-content psql -U postgres -v ON_ERROR_STOP=1 -q -c \
  "insert into site_members (no, is_revealed, name, photo_url, specialty_ja, expected_reveal_on)
   values (12, true, ' ', '/p.webp', 'ok', '2026-12-01');"; then
  echo 'ERROR: revealed blank name was accepted' >&2; exit 1
else
  echo 'OK: revealed blank name rejected'
fi
if docker exec -i m-site-content psql -U postgres -v ON_ERROR_STOP=1 -q -c \
  "insert into site_members (no, is_revealed, name, photo_url, specialty_ja)
   values (11, false, null, null, null);"; then
  echo 'ERROR: unrevealed null schedule was accepted' >&2; exit 1
else
  echo 'OK: unrevealed null schedule rejected'
fi
docker rm -f m-site-content
```

Expected：第二次应用输出 `重跑 OK`；anon 零行；authenticated 两张表各只有 `SELECT`
（**特别确认没有 TRUNCATE** —— 它不受 RLS 约束，是既有 RLS 实跑曾抓到的坑）。

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
- Create: `scripts/site-content-seed-data.mjs`

**Interfaces:**
- Consumes: `site_news` / `site_members`（Task 7）

- [ ] **Step 1: 建立与 UI 解耦的 fixture 和按 locale 的拆分规则**

```bash
node --input-type=module -e "
import { MEMBER_SEED } from './scripts/site-content-seed-data.mjs'
const splitters = {
  ja: value => value.split('／'),
  zh: value => value.split('／'),
  en: value => value.split(/\s+\/\s+/),
}
for (const [locale, split] of Object.entries(splitters)) {
  for (const row of MEMBER_SEED) {
    const parts = split(row.role[locale])
    if (parts.length !== 2 || parts.some(part => !part.trim())) process.exit(1)
    console.log(locale, row.no, JSON.stringify(parts))
  }
}
"
```

`site-content-seed-data.mjs` 必须自包含地导出规格 §3.4 的完整 `NEWS_SEED` 与 `MEMBER_SEED`：
`NEWS_SEED` 每项包含 slug、可空图片路径、published_on、tag、category，以及五篇文章的完整 ja/zh/en
`title`、`lead`、`body`；`MEMBER_SEED` 包含 8 个成员的 `no`、罗马字 `name`、图片路径和 ja/zh/en
原始 role。不得从 `messages/*.json`、`src/lib/site/news.ts` 或 `content.ts` 导入；后续删除 UI key
或私有常量不会影响 seed。ja/zh 的 role 用全角 `／`，en 用 ASCII `/`，三种解析规则必须分别
写在脚本中。任何一条不能恰好拆成两段都要以非零码停止，不能猜测或继续写库。

新闻 metadata 必须与当前代码逐项对应，不能再按数组下标把旧内容错配给新 slug：

| slug | published_on | tag | category | image_url |
|---|---|---|---|---|
| `mc-character-tech-partnership` | `2026-08-12` | `PROJECT` | `project` | `/site/mc-character-expressions.webp` |
| `operations-partner-announced` | `2026-08-10` | `PROJECT` | `project` | `/site/operations-partner-lockup.webp` |
| `first-recruitment-round` | `2026-08-01` | `RECRUIT` | `recruit` | `/site/shin-osaka-station.webp` |
| `echoamp-launch` | `2026-07-21` | `PROJECT` | `project` | `/site/moondollz-silhouettes.webp` |
| `moondollz-launch` | `2026-05-01` | `PROJECT` | `project` | `/site/moondollz-key.webp` |

- [ ] **Step 2: 写脚本**

读 `site-content-seed-data.mjs` 的 fixture，用 `SUPABASE_SERVICE_ROLE_KEY` 写库，幂等（新闻按
`slug` upsert、成员按 `no` upsert）。脚本只从 fixture 读取图片和原始内容，不依赖任何私有展示常量。

- 新闻：fixture 的 slug 集合必须与当前 `NEWS_SLUGS` 完全一致：`mc-character-tech-partnership`、
  `operations-partner-announced`、`first-recruitment-round`、`echoamp-launch`、`moondollz-launch`；日期
  `"2026.08.12"` → `published_on` `"2026-08-12"`（`.replaceAll('.', '-')`）；`body: string[]` → `body_*`
  用 `\n\n` 连接；tag 必须是 `RECRUIT|PROJECT|LIVE`，category 必须是 `project|recruit`，`is_published = true`。
  当前五项的 category 依次为 `project`、`project`、`recruit`、`project`、`project`。`image_url` 可为
  `null`；当前 fixture 的五项均使用现有 `/site/*.webp`，以后缺图时保持 `null`，由官网占位框渲染。
- 成员：fixture 的 8 条写入 `is_revealed = true`；分别用 ja/zh/en splitter 生成
  `name_ja`、`name_en`、`specialty_ja`、`specialty_zh`、`specialty_en`；9–12 号写入
  `is_revealed = false`、`expected_reveal_on = '2026-12-01'`，不能写 NULL。

写入前用 fixture 生成完整的 12 行 expected rows，写入后立即 select 回读并做深比较：8 个已公开行
的 `name_ja`、`name_en` 和三种 `specialty_*` 必须逐字段相等，9–12 行必须是未公开且日期正确；
任意差异、空字符串、错误分隔或图片路径不在 fixture 中都以非零码退出。这样断言验证的是解析结果，
不是简单复述 seed 数组本身。

- [ ] **Step 3: 对本地/测试库跑两次，确认幂等**

Expected：第二次跑完 `select count(*) from site_news` = 5、`site_members` = 12，与第一次相同；
并再次通过上述 12 行逐字段断言，以及新闻 slug 集合、category 和可空图片字段的回读断言。

- [ ] **Step 4: Commit**

```bash
git add scripts/seed-site-content.mjs scripts/site-content-seed-data.mjs
git commit -m "chore(site): 现有新闻与成员的一次性搬迁脚本"
```

---

### Task 9: 新闻 API + 后台页

**Files:**
- Create: `src/app/api/site/news/route.ts`、`src/app/api/site/news/[id]/route.ts`
- Create: `src/lib/site/news-sort.ts`、`src/lib/site/news-sort.test.ts`
- Create: `src/app/api/site/site-content-api.integration.test.ts`
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
 * 与 `20260814112723_site_content.sql` 里 site_news.slug 的 check 约束**同一条规则**，两边改必须一起改。
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

**读写分开**（规格 §5.3）：
- `GET` 只需 `authGuard()` —— 登录即可读列表，与侧边栏入口对所有登录用户可见保持一致。
- `POST` / `PATCH` / `DELETE` 走 `authGuard()` → `getActorProfile()` → `canEditSiteContent()`，
  不通过返回 403。

`PATCH` 支持部分字段（含 `is_pinned` / `is_published`）。
**每个写方法成功后遍历 `PUBLIC_SITE_LOCALES` 逐一失效官网语言的内部源路径**，不要使用动态路由模式，也不要依赖官网域名
rewrite：

```ts
import { revalidatePath } from 'next/cache'
import { PUBLIC_SITE_LOCALES } from '@/lib/site/domain-routing'

function revalidateNewsPages(slug: string): void {
  for (const locale of PUBLIC_SITE_LOCALES) {
    revalidatePath(`/${locale}/site`)
    revalidatePath(`/${locale}/site/news`)
    revalidatePath(`/${locale}/site/news/${slug}`)
  }
}
```

新建、编辑、置顶、上下架和删除都调用该函数；删除前先读取 slug，避免删除后无法构造详情路径。
`revalidatePath` 只是把已有产物标记为 stale，重建发生在下一次访问，写接口不能同步捕获后续重建
是否成功。接口响应只表示“保存成功、失效标记已提交”，同时记录 actor、slug、locale 和路径；
后台提供官网直达链接，生产日志/监控负责发现下一次访问时的重建错误。
错误一律返回稳定错误码，不回传 `error.message`。

**Step 6: 先定义 API schema 和字段白名单**

仓库已有 `zod`，用它解析 JSON；禁止把 `body` 直接 spread 到 Supabase。所有文本字段先
`trim()`，必填字段 trim 后为空则返回字段错误；选填文本 trim 后为空统一转为 `null`；日期、URL、
slug、tag、category、布尔值和枚举分别校验，校验规则与 `20260814112723_site_content.sql` 的 check 一致。

- news create 只允许 `slug`、`tag`、`category`、`published_on`、`is_pinned`、`is_published`、`image_url`、
  `title_ja/zh/en`、`lead_ja/zh/en`、`body_ja/zh/en`；ja 的 title/lead/body 与 category 必填，category
  只能是 `project|recruit`，slug 新建后不可修改；`is_pinned` 缺省为 `false`、`is_published` 缺省为 `true`；
- `image_url` 的空白统一写为 `null`，表示缺图并由官网占位框显示；不得从其他新闻复制图片来规避空值。
- news patch 只允许上述字段中的可编辑字段，客户端传入的 `created_by_user_id`、
  `updated_by_user_id`、`id`、`created_at`、`updated_at` 一律拒绝或忽略；`is_published` 只有
  通过 `is_admin` 写权限检查的 PATCH 才能改变，非管理员不能靠请求体伪造发布状态；
- members patch 只允许 `is_revealed`、`photo_url`、`name`、`name_ja`、`name_en`、
  `specialty_ja/zh/en`、`expected_reveal_on`；`no` 只取路由参数，不从 body 接受；
- create 时 `created_by_user_id` 与 `updated_by_user_id` 都由服务端写 `actor.id`；patch 保留
  原 `created_by_user_id`，只把 `updated_by_user_id` 写成当前 `actor.id`。客户端传入伪造 UUID
  必须被拒绝或丢弃，并由测试证明数据库中没有该 UUID。

这里的“拒绝或忽略”必须在实现中选一种并固定；推荐对未知字段返回 400，便于发现客户端误传，
对审计字段也返回稳定的 `forbidden_field`，不要静默接受后再写入。

- [ ] **Step 7: API 集成测试**

测试文件使用 `node:test`，通过真实 `Request` 调用 route handler；实现时把 route 的业务处理抽成
接收 `{ authGuard, getActorProfile, db, revalidatePath }` 的 handler factory，再由 production route
绑定真实依赖、测试用例绑定 fake context。这样测试的是 HTTP 状态、解析、
数据库写入和失效调用的组合，不是单独测试 `canEditSiteContent`。固定以下用例：

1. 未登录 `GET` 返回 401；未登录 `POST/PATCH/DELETE` 也分别返回 401；
2. 已登录但 `is_admin=false` 的用户：GET 返回 200；任何写请求返回 403，尝试提交
   `is_published: true` 后数据库原值不变；
3. `is_admin=true` 的用户可创建 `category: 'recruit'` 的新闻，返回 201，写入的两个审计字段均为该 actor.id，
   category 原样入库；`category: 'other'` 返回 400，数据库不产生部分记录；`image_url` 为空白时写入 `null`，
   不自动复制任何已有图片；
4. 管理员 PATCH 下架新闻成功；请求同时携带攻击者的 `created_by_user_id` /
   `updated_by_user_id`，返回 400（或稳定忽略结果），数据库不出现攻击者 UUID；
5. PATCH 传入未知字段、slug 修改、必填字段全空白分别返回 400，数据库没有部分更新；
6. 管理员 PATCH 已公开成员时，空白 `name`、`photo_url` 或 `specialty_ja` 返回 400；未公开成员
   缺少 `expected_reveal_on` 也返回 400；数据库中不出现不完整卡位；
7. 下架后调用官网详情 loader/production 页面请求，详情返回 404；同时断言 `PUBLIC_SITE_LOCALES` 的每个
   列表、首页、详情内部源路径都被记录为 stale。

若采用黑盒验证，使用 `next build && next start` 启动临时端口，向测试数据库写入 fixture，
通过测试用户 cookie 执行上述请求，再 fetch `/${locale}/site/news/${slug}` 验证 404；不能只断言
helper 返回值。

- [ ] **Step 8: `ImageUploadField` 组件 + 登记**

`src/components/ui/ImageUploadField.tsx`，props：`value: string | null` `onChange(url: string): void` `label: string` `hint?: string` `error?: string`。用后台 token（violet/mauve），内部用 `Field` 包裹，上传打 `/api/site/upload`。
**同 PR 在 `docs/design-system.md` §6.2 登记它的 props 契约**（§6 准入流程要求）。

- [ ] **Step 9: 后台列表页 + 侧边栏**

`site-content/news/page.tsx`：`Header`(title+sub+actions) → `StatBand` → `SectionCard` + `RecordRow × n`；行内切置顶与上下架；已下架整行降调 + `Tag`；删除走 `Modal` + `danger` Button + 一句话说明不可逆；编辑用页内 `SectionCard` + `Field` 单列，包含 `project|recruit` 的 category 选择、可清空主图和 zh/en 默认折叠的三语段。category 是详情 CTA 的行为字段，不能从 tag 自动推导。三态齐全。
`Sidebar.tsx` 的 `NAV` 加「官网内容」分组，放在「创作者」组之后：引入实际存在的新闻和成员
图标（例如 `Newspaper`、`UsersRound`），加入 `siteContent` 一级 key 及两个 child key。
因为 `NAV_ACCENT` 的类型是 `Record<TopNavKey, Accent>`，必须同时补
`siteContent: 'violet'`（以及需要的 `siteNews`/`siteMembers` 子项色板）；否则 TypeScript 会因
缺少一级 key 编译失败。三语 `messages/{zh,en,ja}.json` 的 `nav` namespace 同步加入
`siteContent`、`siteNews`、`siteMembers`，不能只添加 NAV 结构。

**非管理员视角**：入口对所有登录用户可见、列表可读，但**写操作控件必须隐藏或禁用**
（新建按钮、置顶/上下架开关、删除、编辑表单）—— 不要让人点了才拿到 403。
页面从 `getActorProfile()` 拿 `is_admin` 决定渲染，与 API 侧的 `canEditSiteContent`
用同一个判据，避免两处规则漂移。

- [ ] **Step 10: 全量校验 + Commit**

```bash
# 将 site-content-api.integration.test.ts 注册进 package.json 的 test 清单。
npx tsc --noEmit && npm test && node --test --experimental-strip-types src/app/api/site/site-content-api.integration.test.ts && npm run test:copy
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

删 `NEWS_SLUGS` / `NEWS_IMAGES` / `NEWS_CATEGORIES` / `buildArticles` / `findArticle` 的 i18n 版本，改为从库行构造 `SiteArticle`（三语字段走 `pickLocaleText`，`body` 按 `\n\n` 切回段落数组，`image_url = null` 保持为缺图）。`news.test.ts` 改写为「库行 → SiteArticle」的测试，覆盖 `category: 'recruit'` 仍会交给 CTA 判定，以及 `image_url: null` 不被改写为其他文章的图片。

- [ ] **Step 2: 三个页面改读库**

列表 / 详情 / 首页最新三条都查 `is_published = true`；`generateStaticParams` 只返回已发布 slug（**下架文章的详情页应 404，而不是旧链接还能打开**）。详情页把库行的 `category` 传给 `shouldShowNewsApply()`，只有 `category === 'recruit'` 才显示文末「去应募」CTA；不能再从已删除的 `NEWS_CATEGORIES` 或展示 tag 推断。加 ISR 配置。

- [ ] **Step 3: 先验证读库正常，再删 key**

**顺序是硬的**：确认官网三个页面在三语下都渲染正确之后，才从 `messages/{zh,en,ja}.json`
删 `site.news.articles[]`。先把 seed 所需的新闻内容放入 `site-content-seed-data.mjs`，再删 UI key；
反过来就是上线即丢内容。`check-i18n` 对“定义但未引用”的 key 只打印 `console.warn`，不会因此 exit(1)。
真正会失败的是源码引用不存在的 key（`overBaseline`）或 baseline 记录了不存在的文件（zombie）；
删除后运行 `npm run test:copy`，必要时执行
`node scripts/check-i18n.mjs --update-baseline`，不要把 warning 当作删除前置条件。

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

`GET` 返回 12 个卡位（按 `no` 升序），登录即可；`PATCH /[no]` 改单个卡位，仅 `is_admin`。
读写分开的判定与 Task 9 一致。写成功后
遍历 `PUBLIC_SITE_LOCALES` 逐一失效官网语言的内部源路径：

```ts
import { revalidatePath } from 'next/cache'
import { PUBLIC_SITE_LOCALES } from '@/lib/site/domain-routing'

for (const locale of PUBLIC_SITE_LOCALES) {
  revalidatePath(`/${locale}/site`)
  revalidatePath(`/${locale}/site/vision`)
}
```

不要使用动态路由模式，也不要把官网域名的 rewrite 路径当成失效路径。`revalidatePath` 只提交 stale
标记，重建发生在下一次访问；接口响应只表示标记已提交，
并记录 actor、卡位编号、locale 和路径。重建错误由生产日志/监控发现，后台提供官网直达链接供自查。
PATCH 先 trim 并把现有行与部分请求合并，再执行 schema：已公开时 `name`、`photo_url`、
`specialty_ja` 三者不得为空白；未公开时合并后的有效行必须有 `expected_reveal_on`。空白选填的
中英文 specialty 统一写 NULL，不能把空白当作有效翻译；不能因为请求只改照片就误报已有日期缺失。
后台表单也要在客户端提前提示，但服务端 400 与数据库 check 必须同时保留。

- [ ] **Step 2: 后台页**

12 卡位网格。**先用 `SectionCard` + 现有原语拼**；拼不出来才新建组件，新建就要登记 design-system §6.2。点开单卡编辑用 `Modal` + `Field`（design-system §6.3 表单模式）；未公开卡位只需填 `expected_reveal_on`。三态齐全。

- [ ] **Step 3: 侧边栏加「成员」入口 + i18n 三语**

这里是在 Task 9 已建立的「官网内容」一级分组下补 `siteMembers` child，不再新建一级 NAV；
确认 `NAV_ACCENT` 的 `siteContent` 已登记，三语 `nav.siteMembers` 已登记，避免重复分组或再次
触发 `Record<TopNavKey, Accent>` 缺键。

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
  type MemberRow = {
    no: number; is_revealed: boolean; name: string | null; name_ja: string | null; name_en: string | null
    specialty_ja: string | null; specialty_zh: string | null; specialty_en: string | null
    photo_url: string | null; expected_reveal_on: string | null
  }
  const emptyRow = (no: number): MemberRow => ({
    no, is_revealed: false, name: null, name_ja: null, name_en: null,
    specialty_ja: null, specialty_zh: null, specialty_en: null,
    photo_url: null, expected_reveal_on: '2026-12-01',
  })
  const rows: MemberRow[] = Array.from({ length: 12 }, (_, i) => emptyRow(i + 1))
  rows[0] = { ...rows[0], is_revealed: true, name: 'KANO', name_ja: '花乃',
    specialty_ja: '罠', photo_url: '/p.webp' }
  const members = buildMembers(rows, 'ja', '— 公開前 —', '— 公开时间未定 —')
  assert.equal(members.length, 12)
  assert.equal(members[0].name, 'KANO')
  assert.equal(members[0].image, '/p.webp')
  assert.equal(members[11].name, '— 公開前 —')
})

test('未公开卡位用该行的预计公开时间，而不是全局写死的文案', () => {
  const rows = [{ no: 9, is_revealed: false, name: null, name_ja: null, name_en: null,
                  specialty_ja: null, specialty_zh: null, specialty_en: null,
                  photo_url: null, expected_reveal_on: '2026-12-01' }]
  const members = buildMembers(rows, 'ja', '— 公開前 —', '— 公开时间未定 —')
  assert.equal(members[8].role, '2026-12')
})

test('未公开卡位日期为空时显示明确 fallback，而不是空字符串', () => {
  const rows = [{ no: 9, is_revealed: false, name: null, name_ja: null, name_en: null,
                  specialty_ja: null, specialty_zh: null, specialty_en: null,
                  photo_url: null, expected_reveal_on: null }]
  const members = buildMembers(rows, 'ja', '— 公開前 —', '— 公开时间未定 —')
  assert.equal(members[8].role, '— 公开时间未定 —')
})
```

- [ ] **Step 2: 跑测试确认失败** → **Step 3: 改 `content.ts`**

`buildMembers` 改签名为 `(rows, locale, unrevealedName, unrevealedScheduleUnknown)`，消费库行；
`MEMBER_SLOTS = 12` 保留（它是 `site_members.no` check 的上界，两处必须一致）；删 `MEMBER_IMAGES`；
已公开卡位的 `role` 由 `pickLocaleText` 取 specialty，未公开卡位的 `role` 由
`expected_reveal_on` 格式化为 `YYYY-MM`（替代写死的 `unrevealedRole`）。如果读到 NULL，role 必须
使用 `unrevealedScheduleUnknown`，例如三语对应「公开时间未定」，不能返回空字符串。正常 seed 的
9–12 行都带 `2026-12-01`，fallback 只处理异常历史数据。

- [ ] **Step 4: 跑测试确认通过 + vision 页改读库 + ISR**

- [ ] **Step 5: 验证渲染正确后再删 key**

三语下确认成员网格渲染正确，并确认 seed 已不再依赖 UI messages 后，再删
`site.members.list`、`site.members.note`、`site.members.unrevealedRole`；新增并保留
`site.members.unrevealedScheduleUnknown`、`unrevealedName`、`captains` 与其余 UI 标签。
未使用 key 只会让 `check-i18n` 输出 warning；删除后运行 `npm run test:copy`，真正需要修复的是
源码引用不存在 key 的 `overBaseline` 或 baseline zombie，必要时执行
`node scripts/check-i18n.mjs --update-baseline`。更新 baseline 后再进行全量校验。

- [ ] **Step 6: 全量校验 + Commit**

```bash
npx tsc --noEmit && npm test && npm run test:copy
git add -A && git commit -m "feat(site): 成员网格改为读库 + ISR"
```

---

## 交付前检查清单

- [ ] `npx tsc --noEmit` / `npm test` / `npm run test:copy` 全绿
- [ ] `20260814112722_site_applications_kinds.sql`、`20260814112723_site_content.sql`、
      `20260814112724_site_media_bucket.sql` 都在一次性容器上跑过，且**重跑一次不报错**；
      `20260814112725_site_applications_kinds_contract.sql` 只在 Task 1 Step 5 的 contract 判据满足后
      单独执行，并验证 default 已移除
- [ ] `site_news` / `site_members` 上 anon 零权限、authenticated 只有 SELECT（**确认没有 TRUNCATE**）
- [ ] 搬迁脚本跑过两次，行数不变（news=5、members=12），五个 slug、category 和可空图片字段回读无误
- [ ] 搬迁脚本回读断言通过：8 个已公开行的 `name_ja`、`name_en`、三种 `specialty_*` 精确匹配，
      9–12 行均为未公开且 `expected_reveal_on = '2026-12-01'`
- [ ] `20260814112723_site_content.sql` 的已公开空白字段、未公开 NULL 日期负例均由“命令意外成功即失败”的脚本拦截
- [ ] 内容 API 集成测试覆盖 401/403/管理员成功、白名单与审计字段、下架详情 404；普通登录用户
      的后台写控件隐藏或禁用
- [ ] 官网三语切换下 news 列表/详情、vision 成员网格渲染正确
- [ ] **`https://eacn.agenova.chat/recruit/staff` 能打开** —— 这是 `PUBLIC_PAGE_RE` 那条改动的唯一真实验证点，内部域名与本地都测不出来
- [ ] 后台改一条新闻 → 官网对应页面在 ISR 后可见；下架 → 官网列表消失、详情 404
- [ ] `docs/public-site.md` 的 §2.2 / §2.4 / §2.5 已同步
- [ ] `docs/design-system.md` §6.2 已登记 `ImageUploadField`（以及成员网格若新建了组件）
