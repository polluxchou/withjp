# 招募表单新增舞蹈能力字段 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 官网 RECRUIT 页的主播（creator）应募表单新增两个选填字段——舞蹈能力类型（4 选 radio）与舞蹈年限（0–36 年 select，0 显示「无」）——并让这两项的值三语可见、在后台「官网应募」列表里可读。

**Architecture:** 沿用现有应募表单的分层：`application.ts`（纯函数校验，新增枚举常量与两个字段的解析分支）→ `ApplicationForm.tsx`（新增一个 radio group + 一个原生 select，位置在「经验」字段之后）→ `application-service.ts`（插入时多带两列）→ Supabase `site_applications` 表新增两个可空列（新迁移文件，check 约束限定枚举/范围）→ 后台 `/recruit-applications` 页面的 `RecordRow` 新增两个 meta 展示项。三语文案分别加进 `site.recruit.form.*`（前台）与 `recruitApplications.*`（后台）两个既有命名空间。

**Tech Stack:** Next.js 14 (App Router) + TypeScript + next-intl（三语 i18n）+ Supabase (Postgres) + `node --test`（内置测试跑道，非 Jest）

**Spec:** `docs/superpowers/specs/2026-09-01-recruit-dance-skill-fields-design.md`

---

## Task 1: 校验层——新增枚举常量与字段解析

**Files:**
- Modify: `src/lib/site/application.ts`
- Test: `src/lib/site/application.test.ts`

- [ ] **Step 1: 写失败的测试**

在 `src/lib/site/application.test.ts` 文件末尾（`test('不传 kind 时按主播类处理...` 之后）追加：

```ts
test('舞蹈字段选填：不传时落成 null', () => {
  const r = validateApplication(valid)
  assert.equal(r.ok, true)
  if (r.ok) {
    assert.equal(r.value.danceSkillLevel, null)
    assert.equal(r.value.danceYears, null)
  }
})

test('舞蹈能力类型：四个合法值都能通过', () => {
  for (const level of DANCE_SKILL_LEVELS) {
    const r = validateApplication({ ...valid, danceSkillLevel: level })
    assert.equal(r.ok, true, `expected ${level} to be accepted`)
    if (r.ok) assert.equal(r.value.danceSkillLevel, level)
  }
})

test('舞蹈能力类型：不在枚举里的值报 invalidChoice', () => {
  const r = validateApplication({ ...valid, danceSkillLevel: 'expert' })
  assert.equal(r.ok, false)
  if (!r.ok) assert.equal(r.fields.danceSkillLevel, 'invalidChoice')
})

test('舞蹈年限：0 是合法值且落成数字 0 而不是 null', () => {
  const r = validateApplication({ ...valid, danceYears: 0 })
  assert.equal(r.ok, true)
  if (r.ok) assert.equal(r.value.danceYears, 0)
})

test('舞蹈年限：边界值 0 与 36 都通过，字符串数字也接受', () => {
  assert.equal(validateApplication({ ...valid, danceYears: DANCE_YEARS_MIN }).ok, true)
  assert.equal(validateApplication({ ...valid, danceYears: DANCE_YEARS_MAX }).ok, true)
  const asString = validateApplication({ ...valid, danceYears: '20' })
  assert.equal(asString.ok, true)
  if (asString.ok) assert.equal(asString.value.danceYears, 20)
})

test('舞蹈年限：越界或非整数报 invalidChoice', () => {
  for (const bad of [DANCE_YEARS_MIN - 1, DANCE_YEARS_MAX + 1, 5.5, 'abc', '3.5']) {
    const r = validateApplication({ ...valid, danceYears: bad })
    assert.equal(r.ok, false, `expected ${JSON.stringify(bad)} to be rejected`)
    if (!r.ok) assert.equal(r.fields.danceYears, 'invalidChoice')
  }
})

test('员工类：即使传了舞蹈字段也静默丢弃，不落库不报错', () => {
  const r = validateApplication({
    kind: 'makeup', name: '花子', contact: '090', email: 'a@b.com',
    commuteMode: 'subway', consent: true, locale: 'ja',
    danceSkillLevel: 'teaching_level', danceYears: 10,
  })
  assert.equal(r.ok, true)
  if (r.ok) {
    assert.equal(r.value.danceSkillLevel, null)
    assert.equal(r.value.danceYears, null)
  }
})
```

文件顶部的 import 现状（`src/lib/site/application.test.ts:1-8`）：

```ts
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  validateApplication,
  isBotSubmission,
  LIMITS,
} from './application.ts'
import { hashIp } from './application-ip-hash.ts'
```

把其中的 `application.ts` 解构导入部分从：

```ts
import {
  validateApplication,
  isBotSubmission,
  LIMITS,
} from './application.ts'
```

改成：

```ts
import {
  validateApplication,
  isBotSubmission,
  LIMITS,
  DANCE_SKILL_LEVELS,
  DANCE_YEARS_MIN,
  DANCE_YEARS_MAX,
} from './application.ts'
```

- [ ] **Step 2: 跑测试确认失败**

Run: `node --test --experimental-strip-types src/lib/site/application.test.ts`
Expected: 编译报错（`DANCE_SKILL_LEVELS` 等未从 `application.ts` 导出）或断言失败——两者皆可，只要不是全绿。

- [ ] **Step 3: 实现校验逻辑**

在 `src/lib/site/application.ts` 里，`COMMUTE_MODES` 定义之后加入新枚举：

```ts
export const COMMUTE_MODES = ['subway', 'bicycle', 'walk', 'car'] as const
export type CommuteMode = (typeof COMMUTE_MODES)[number]

export const DANCE_SKILL_LEVELS = [
  'barely_touched',
  'long_term_hobby',
  'professional_training',
  'teaching_level',
] as const
export type DanceSkillLevel = (typeof DANCE_SKILL_LEVELS)[number]

export const DANCE_YEARS_MIN = 0
export const DANCE_YEARS_MAX = 36
```

`FieldError` 联合类型追加 `invalidChoice`：

```ts
export type FieldError = 'required' | 'tooLong' | 'outOfRange' | 'invalidAge' | 'consent' | 'invalidEmail' | 'invalidChoice'
```

`ApplicationInput` 接口追加两个可选字段：

```ts
export interface ApplicationInput {
  kind?: unknown
  name?: unknown
  age?: unknown
  residence?: unknown
  contact?: unknown
  experience?: unknown
  email?: unknown
  commuteMode?: unknown
  danceSkillLevel?: unknown
  danceYears?: unknown
  consent?: unknown
  locale?: unknown
}
```

`ApplicationValue` 接口追加两个字段：

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
  danceSkillLevel: DanceSkillLevel | null
  danceYears: number | null
}
```

`validateApplication()` 函数体里，声明局部变量的地方（`let age: number | null = null` 那一组）追加两行：

```ts
  let age: number | null = null
  let residence: string | null = null
  let email: string | null = null
  let commuteMode: CommuteMode | null = null
  let danceSkillLevel: DanceSkillLevel | null = null
  let danceYears: number | null = null
```

在 `if (kind === 'creator') { ... }` 分支内部、`age` 解析代码块之后（分支结束的 `}` 之前）追加：

```ts
    // 选填：不传/空字符串一律是「未选择」，落成 null；只有传了但不合法
    // （不在枚举里、不是 0–36 的整数）才报错——两个原因都不复用 outOfRange
    // /invalidAge，那两个错误码的文案是写死给「年龄」用的，套在这两个新
    // 字段上会显示错误的范围提示。
    const rawDanceSkillLevel = asTrimmed(input.danceSkillLevel)
    if (rawDanceSkillLevel && !DANCE_SKILL_LEVELS.includes(rawDanceSkillLevel as DanceSkillLevel)) {
      fields.danceSkillLevel = 'invalidChoice'
    } else if (rawDanceSkillLevel) {
      danceSkillLevel = rawDanceSkillLevel as DanceSkillLevel
    }

    const rawDanceYears = input.danceYears
    if (!(rawDanceYears === undefined || rawDanceYears === null || (typeof rawDanceYears === 'string' && rawDanceYears.trim() === ''))) {
      let danceYearsValue = Number.NaN
      if (typeof rawDanceYears === 'number') {
        danceYearsValue = rawDanceYears
      } else if (typeof rawDanceYears === 'string' && /^\d+$/.test(rawDanceYears.trim())) {
        danceYearsValue = Number(rawDanceYears.trim())
      }
      if (!Number.isInteger(danceYearsValue) || danceYearsValue < DANCE_YEARS_MIN || danceYearsValue > DANCE_YEARS_MAX) {
        fields.danceYears = 'invalidChoice'
      } else {
        danceYears = danceYearsValue
      }
    }
```

最后，函数末尾 `return { ok: true, value: {...} }` 里追加两个字段：

```ts
  return {
    ok: true,
    value: {
      kind,
      name,
      contact,
      locale: locale as Locale,
      age,
      residence,
      experience: experience || null,
      email,
      commuteMode,
      danceSkillLevel,
      danceYears,
    },
  }
```

- [ ] **Step 4: 跑测试确认通过**

Run: `node --test --experimental-strip-types src/lib/site/application.test.ts`
Expected: 全部 PASS（原有用例 + 本任务新增的 7 条）

- [ ] **Step 5: 提交**

```bash
git add src/lib/site/application.ts src/lib/site/application.test.ts
git commit -m "feat(site): 应募校验层支持舞蹈能力类型与舞蹈年限两个选填字段"
```

---

## Task 2: 落库层——insert 语句带上两个新列

**Files:**
- Modify: `src/lib/site/application-service.ts:60-73`

- [ ] **Step 1: 修改 insert 调用**

把 `submitApplication()` 里的 `.insert({...})` 从：

```ts
  const { data, error } = await db
    .from('site_applications')
    .insert({
      kind: value.kind,
      name: value.name,
      age: value.age,
      residence: value.residence,
      contact: value.contact,
      experience: value.experience,
      email: value.email,
      commute_mode: value.commuteMode,
      locale: value.locale,
      ip_hash,
      user_agent: meta.userAgent?.slice(0, 400) ?? null,
    })
    .select('id')
    .single()
```

改成：

```ts
  const { data, error } = await db
    .from('site_applications')
    .insert({
      kind: value.kind,
      name: value.name,
      age: value.age,
      residence: value.residence,
      contact: value.contact,
      experience: value.experience,
      email: value.email,
      commute_mode: value.commuteMode,
      dance_skill_level: value.danceSkillLevel,
      dance_years: value.danceYears,
      locale: value.locale,
      ip_hash,
      user_agent: meta.userAgent?.slice(0, 400) ?? null,
    })
    .select('id')
    .single()
```

这个文件没有独立单测（IO 层，靠 Task 1 的纯函数测试 + 最终的 E2E 验证兜底），只需要确认改完之后 `tsc` 不报错——`ApplicationValue` 上的 `danceSkillLevel`/`danceYears` 字段要在 Task 1 落地之后这里才能编译通过。

- [ ] **Step 2: 类型检查**

Run: `npx --no-install tsc --noEmit`
Expected: 无新增错误——`src/lib/supabase/server.ts` 的 `createServerClient()` 用的是不带 `Database` 泛型的 `createClient()`（已确认，见该文件），`.insert()` 的字段没有跟真实表结构做类型绑定，多传 `dance_skill_level`/`dance_years` 两个字段不会被 tsc 拦下，纯粹是运行时数据库层面的事——Task 3 的迁移在这之前必须已经写完（列名要对得上）。

- [ ] **Step 3: 提交**

```bash
git add src/lib/site/application-service.ts
git commit -m "feat(site): 应募落库带上舞蹈能力类型与舞蹈年限"
```

---

## Task 3: Supabase 迁移文件

**Files:**
- Create: `supabase/migrations/20260901222510_site_applications_dance_fields.sql`

- [ ] **Step 1: 写迁移文件**

```sql
-- ============================================================
-- Migration 20260901222510_site_applications_dance_fields:
-- 官网 RECRUIT 表单（主播类）新增两个选填字段——舞蹈能力类型、舞蹈年限
--
-- 两列只对 kind='creator' 的投递有意义，员工类（photographer/makeup/
-- group_live_ops）恒为 null，用条件约束挡住误填。
-- ============================================================

alter table site_applications
  add column if not exists dance_skill_level text
    check (dance_skill_level is null or dance_skill_level in
      ('barely_touched', 'long_term_hobby', 'professional_training', 'teaching_level')),
  add column if not exists dance_years smallint
    check (dance_years is null or dance_years between 0 and 36);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'site_applications_dance_fields_creator_only') then
    alter table site_applications add constraint site_applications_dance_fields_creator_only check (
      kind = 'creator' or (dance_skill_level is null and dance_years is null)
    );
  end if;
end $$;
```

- [ ] **Step 2: 跑迁移格式校验**

Run: `npm run test:migrations`
Expected: PASS（文件名时间戳格式正确、没有重复前缀）

- [ ] **Step 3: 提交**

```bash
git add supabase/migrations/20260901222510_site_applications_dance_fields.sql
git commit -m "feat(db): site_applications 新增 dance_skill_level／dance_years 列"
```

**注意（不在这个任务里做，留到 Task 10 之后）：** 这个仓库没有自动迁移工具，这个 `.sql` 文件本身不会自动生效——按 `supabase/migrations/README.md` 的约定，要在 PR 合并后手动贴到 Supabase Dashboard 的 SQL Editor 执行。在那之前，`dance_skill_level`/`dance_years` 这两列在真实数据库里还不存在，Task 2 改的 insert 语句如果真的打到线上会报 `db_error`（列不存在）——这是预期状态，不是 bug，Task 10 的验证范围因此排除「真实提交一条带舞蹈字段的表单」。

---

## Task 4: 前台三语文案——`site.recruit.form.*`

**Files:**
- Modify: `messages/zh.json`
- Modify: `messages/en.json`
- Modify: `messages/ja.json`

三个文件的编辑动作完全一致，只是文本不同。都在 `site.recruit.form` 这个对象里，紧跟在 `"experience"` 那一行之后插入四个新 key，并在 `form.errors` 对象的 `"invalidAge"` 那一行之后插入 `invalidChoice`。

- [ ] **Step 1: 编辑 `messages/zh.json`**

把：

```json
        "experience": "经验・社交账号",
        "consent": "我同意公司为招募选拔目的使用以上信息。",
```

改成：

```json
        "experience": "经验・社交账号",
        "danceSkillLevel": "舞蹈能力类型",
        "danceSkillLevelOptions": {
          "barely_touched": "接触较少",
          "long_term_hobby": "长期爱好",
          "professional_training": "专业培训",
          "teaching_level": "教学级别"
        },
        "danceYears": "舞蹈年限",
        "danceYearsOptions": {
          "none": "无"
        },
        "consent": "我同意公司为招募选拔目的使用以上信息。",
```

把：

```json
          "invalidAge": "请填写半角数字",
          "consent": "需要你的同意",
```

改成：

```json
          "invalidAge": "请填写半角数字",
          "invalidChoice": "请从列表中选择",
          "consent": "需要你的同意",
```

- [ ] **Step 2: 编辑 `messages/en.json`**

把：

```json
        "experience": "Experience / socials",
        "consent": "I agree that the information above may be used for recruitment screening.",
```

改成：

```json
        "experience": "Experience / socials",
        "danceSkillLevel": "Dance skill level",
        "danceSkillLevelOptions": {
          "barely_touched": "Rarely practiced",
          "long_term_hobby": "Long-term hobby",
          "professional_training": "Professional training",
          "teaching_level": "Instructor level"
        },
        "danceYears": "Years of dance experience",
        "danceYearsOptions": {
          "none": "None"
        },
        "consent": "I agree that the information above may be used for recruitment screening.",
```

把：

```json
          "invalidAge": "Digits only",
          "consent": "Your consent is required",
```

改成：

```json
          "invalidAge": "Digits only",
          "invalidChoice": "Please choose from the list",
          "consent": "Your consent is required",
```

- [ ] **Step 3: 编辑 `messages/ja.json`**

把：

```json
        "experience": "経験・SNS",
        "consent": "応募選考の目的で、入力内容を利用することに同意します。",
```

改成：

```json
        "experience": "経験・SNS",
        "danceSkillLevel": "ダンス経験レベル",
        "danceSkillLevelOptions": {
          "barely_touched": "ほとんど経験なし",
          "long_term_hobby": "長く続けている趣味",
          "professional_training": "専門トレーニング経験あり",
          "teaching_level": "指導できるレベル"
        },
        "danceYears": "ダンス経験年数",
        "danceYearsOptions": {
          "none": "なし"
        },
        "consent": "応募選考の目的で、入力内容を利用することに同意します。",
```

把：

```json
          "invalidAge": "半角数字で入力してください",
          "consent": "同意が必要です",
```

改成：

```json
          "invalidAge": "半角数字で入力してください",
          "invalidChoice": "リストから選択してください",
          "consent": "同意が必要です",
```

- [ ] **Step 4: 跑 i18n 门禁**

Run: `npm run test:i18n`
Expected: `i18n key parity OK for zh, en, ja`（三语 key 形状必须完全一致，这一步会拦住任何一语漏改）

- [ ] **Step 5: 提交**

```bash
git add messages/zh.json messages/en.json messages/ja.json
git commit -m "copy(site): 招募表单新增舞蹈能力类型／舞蹈年限三语文案"
```

---

## Task 5: 前台表单 UI

**Files:**
- Modify: `src/components/site/ApplicationForm.tsx`

- [ ] **Step 1: 引入 `DANCE_SKILL_LEVELS` 常量**

把顶部的 import：

```tsx
import type { ApplicationFields, FieldError } from '@/lib/site/application'
```

改成：

```tsx
import { DANCE_SKILL_LEVELS, type ApplicationFields, type FieldError } from '@/lib/site/application'
```

- [ ] **Step 2: payload 里带上两个新字段**

把 `onSubmit` 里构造 `payload` 的这段：

```tsx
    const data = new FormData(event.currentTarget)
    const payload = {
      name: data.get('name'),
      age: data.get('age'),
      residence: data.get('residence'),
      contact: data.get('contact'),
      experience: data.get('experience'),
      consent: data.get('consent') === 'on',
      locale,
      hp: data.get('hp'),
      elapsedMs: Date.now() - mountedAt.current,
    }
```

改成：

```tsx
    const data = new FormData(event.currentTarget)
    const payload = {
      name: data.get('name'),
      age: data.get('age'),
      residence: data.get('residence'),
      contact: data.get('contact'),
      experience: data.get('experience'),
      danceSkillLevel: data.get('danceSkillLevel'),
      danceYears: data.get('danceYears'),
      consent: data.get('consent') === 'on',
      locale,
      hp: data.get('hp'),
      elapsedMs: Date.now() - mountedAt.current,
    }
```

- [ ] **Step 3: 加两个表单控件**

把 `experience` 字段和 honeypot 输入框之间的这段：

```tsx
        <Field label={t('experience')} error={fields.experience} htmlFor={`${uid}-experience`} t={t}>
          <textarea
            id={`${uid}-experience`}
            name="experience"
            rows={4}
            className={`${FIELD_CLS} resize-none text-[14px]`}
          />
        </Field>

        {/* honeypot：真人看不见所以永远是空的。用 absolute 移出视口而不是
            display:none —— 后者会被一些爬虫识别并跳过。 */}
```

改成：

```tsx
        <Field label={t('experience')} error={fields.experience} htmlFor={`${uid}-experience`} t={t}>
          <textarea
            id={`${uid}-experience`}
            name="experience"
            rows={4}
            className={`${FIELD_CLS} resize-none text-[14px]`}
          />
        </Field>

        <Field
          label={t('danceSkillLevel')}
          error={fields.danceSkillLevel}
          labelId={`${uid}-dance-skill-label`}
          t={t}
        >
          <div
            role="radiogroup"
            aria-labelledby={`${uid}-dance-skill-label`}
            className="flex flex-wrap gap-x-6 gap-y-2"
          >
            {DANCE_SKILL_LEVELS.map((level) => (
              <label
                key={level}
                className="flex cursor-pointer items-center gap-2 text-[14px] text-site-fg/86"
              >
                <input type="radio" name="danceSkillLevel" value={level} className="accent-site-accent" />
                {t(`danceSkillLevelOptions.${level}`)}
              </label>
            ))}
          </div>
        </Field>

        <Field label={t('danceYears')} error={fields.danceYears} htmlFor={`${uid}-dance-years`} t={t}>
          <select id={`${uid}-dance-years`} name="danceYears" defaultValue="" className={FIELD_CLS}>
            <option value="" disabled hidden>{t('danceYears')}</option>
            {Array.from({ length: 37 }, (_, n) => n).map((n) => (
              <option key={n} value={n}>{n === 0 ? t('danceYearsOptions.none') : n}</option>
            ))}
          </select>
        </Field>

        {/* honeypot：真人看不见所以永远是空的。用 absolute 移出视口而不是
            display:none —— 后者会被一些爬虫识别并跳过。 */}
```

`Field` 组件本身已经在这个文件里支持 `labelId` prop 了吗——检查一下：本文件当前的 `Field` 定义只有 `htmlFor`，没有 `labelId`（那是 `StaffApplicationForm.tsx` 里的版本）。所以还要把本文件末尾的 `Field` 函数从：

```tsx
function Field({
  label,
  hint,
  error,
  htmlFor,
  t,
  children,
}: {
  label: string
  hint?: string
  error?: FieldError
  htmlFor: string
  t: (key: string) => string
  children: React.ReactNode
}) {
  return (
    <div>
      <div className="mb-1.5 flex flex-wrap items-baseline gap-2">
        <label htmlFor={htmlFor} className="text-[13px] tracking-[0.06em] text-site-fg/60">
          {label}
        </label>
        {hint && <span className="text-[12px] text-site-fg/40">{hint}</span>}
        {error && <span className="text-[12px] text-site-hot">{t(`errors.${error}`)}</span>}
      </div>
      {children}
    </div>
  )
}
```

改成（对齐 `StaffApplicationForm.tsx` 里 `htmlFor`/`labelId` 二选一的写法，理由同那边的注释——radio group 没有单个 `<input>` 可以让 `label htmlFor` 指过去）：

```tsx
/**
 * 视觉标签必须是真 <label htmlFor>，不能用 span：span 关联不到输入框
 * （input.labels 为空），屏幕阅读器读不出字段名、点标签也不会聚焦。
 * radio group 例外——它没有单个控件可以让 htmlFor 指过去，改用 labelId
 * 由外层 role="radiogroup" + aria-labelledby 指回来。
 */
function Field({
  label,
  hint,
  error,
  htmlFor,
  labelId,
  t,
  children,
}: {
  label: string
  hint?: string
  error?: FieldError
  htmlFor?: string
  labelId?: string
  t: (key: string) => string
  children: React.ReactNode
}) {
  return (
    <div>
      <div className="mb-1.5 flex flex-wrap items-baseline gap-2">
        {htmlFor ? (
          <label htmlFor={htmlFor} className="text-[13px] tracking-[0.06em] text-site-fg/60">
            {label}
          </label>
        ) : (
          <span id={labelId} className="text-[13px] tracking-[0.06em] text-site-fg/60">
            {label}
          </span>
        )}
        {hint && <span className="text-[12px] text-site-fg/40">{hint}</span>}
        {error && <span className="text-[12px] text-site-hot">{t(`errors.${error}`)}</span>}
      </div>
      {children}
    </div>
  )
}
```

- [ ] **Step 4: 类型检查**

Run: `npx --no-install tsc --noEmit`
Expected: 无新增错误

- [ ] **Step 5: 门禁**

Run: `npm run test:copy`
Expected: 全绿（`test:i18n` 在 Task 4 已经过；这里额外跑 `test:no-bare-han`——JSX 里全是变量插值和拉丁字符，不会命中裸汉字；`test:style` 这个文件没有新增颜色值，不会命中裸 hex；`test:lint` 检查 ESLint）

- [ ] **Step 6: 提交**

```bash
git add src/components/site/ApplicationForm.tsx
git commit -m "feat(site): RECRUIT 表单新增舞蹈能力类型与舞蹈年限两个字段"
```

---

## Task 6: 后台三语文案——`recruitApplications.*`

**Files:**
- Modify: `messages/zh.json`
- Modify: `messages/en.json`
- Modify: `messages/ja.json`

- [ ] **Step 1: 编辑 `messages/zh.json`**

把：

```json
    "columns": {
      "age": "年龄",
      "email": "邮箱",
      "commuteMode": "通勤方式"
    }
  },
  "siteNews": {
```

改成（这是 `recruitApplications` 对象结尾那一段，注意别改错到 `site.recruit.form` 或其它文件里同名的 `columns` 块——`recruitApplications` 这个对象整体在文件里只出现一次，`grep -n '"recruitApplications"'` 定位到的那一处才是目标）：

```json
    "columns": {
      "age": "年龄",
      "email": "邮箱",
      "commuteMode": "通勤方式",
      "danceSkillLevel": "舞蹈能力",
      "danceYears": "舞蹈年限"
    },
    "danceSkillLevels": {
      "barely_touched": "接触较少",
      "long_term_hobby": "长期爱好",
      "professional_training": "专业培训",
      "teaching_level": "教学级别"
    },
    "danceYearsNone": "无"
  },
  "siteNews": {
```

- [ ] **Step 2: 编辑 `messages/en.json`**

把：

```json
    "columns": {
      "age": "Age",
      "email": "Email",
      "commuteMode": "Commute"
    }
  },
  "siteNews": {
```

改成：

```json
    "columns": {
      "age": "Age",
      "email": "Email",
      "commuteMode": "Commute",
      "danceSkillLevel": "Dance skill",
      "danceYears": "Dance experience"
    },
    "danceSkillLevels": {
      "barely_touched": "Rarely practiced",
      "long_term_hobby": "Long-term hobby",
      "professional_training": "Professional training",
      "teaching_level": "Instructor level"
    },
    "danceYearsNone": "None"
  },
  "siteNews": {
```

- [ ] **Step 3: 编辑 `messages/ja.json`**

把：

```json
    "columns": {
      "age": "年齢",
      "email": "メール",
      "commuteMode": "通勤手段"
    }
  },
  "siteNews": {
```

改成：

```json
    "columns": {
      "age": "年齢",
      "email": "メール",
      "commuteMode": "通勤手段",
      "danceSkillLevel": "ダンス経験",
      "danceYears": "ダンス経験年数"
    },
    "danceSkillLevels": {
      "barely_touched": "ほとんど経験なし",
      "long_term_hobby": "長く続けている趣味",
      "professional_training": "専門トレーニング経験あり",
      "teaching_level": "指導できるレベル"
    },
    "danceYearsNone": "なし"
  },
  "siteNews": {
```

- [ ] **Step 4: 跑 i18n 门禁**

Run: `npm run test:i18n`
Expected: `i18n key parity OK for zh, en, ja`

- [ ] **Step 5: 提交**

```bash
git add messages/zh.json messages/en.json messages/ja.json
git commit -m "copy(site): 官网应募后台列表新增舞蹈能力字段三语文案"
```

---

## Task 7: 后台展示——`/recruit-applications` 页面

**Files:**
- Modify: `src/app/[locale]/(app)/recruit-applications/page.tsx`

- [ ] **Step 1: 引入类型与图标**

把：

```tsx
import type { ApplicationKind, CommuteMode } from '@/lib/site/application'
import { Calendar, Cake, MapPin, Mail, Navigation, FileText } from 'lucide-react'
```

改成：

```tsx
import type { ApplicationKind, CommuteMode, DanceSkillLevel } from '@/lib/site/application'
import { Calendar, Cake, MapPin, Mail, Navigation, FileText, Music, Timer } from 'lucide-react'
```

- [ ] **Step 2: `ApplicationRow` 类型追加字段**

把：

```tsx
type ApplicationRow = {
  id: string
  kind: ApplicationKind
  name: string
  age: number | null
  residence: string | null
  contact: string
  email: string | null
  commute_mode: CommuteMode | null
  experience: string | null
  locale: string
  status: string
  created_at: string
}
```

改成：

```tsx
type ApplicationRow = {
  id: string
  kind: ApplicationKind
  name: string
  age: number | null
  residence: string | null
  contact: string
  email: string | null
  commute_mode: CommuteMode | null
  dance_skill_level: DanceSkillLevel | null
  dance_years: number | null
  experience: string | null
  locale: string
  status: string
  created_at: string
}
```

- [ ] **Step 3: 查询语句加列**

把：

```tsx
    .select('id, kind, name, age, residence, contact, email, commute_mode, experience, locale, status, created_at')
```

改成：

```tsx
    .select('id, kind, name, age, residence, contact, email, commute_mode, dance_skill_level, dance_years, experience, locale, status, created_at')
```

- [ ] **Step 4: `RecordRow` 的 creator 分支加两个 meta 项**

把 creator 分支的 meta 数组（`src/app/[locale]/(app)/recruit-applications/page.tsx:133-143`）：

```tsx
                  application.kind === 'creator'
                    ? [
                        { icon: <Calendar />, text: formatDate(application.created_at) },
                        {
                          icon: metaIconWithLabel(<Cake />, t('columns.age')),
                          mono: true,
                          text: application.age !== null ? String(application.age) : notProvided,
                        },
                        { icon: <MapPin />, text: application.residence || notProvided },
                        { icon: <FileText />, text: application.experience || notProvided },
                      ]
```

改成：

```tsx
                  application.kind === 'creator'
                    ? [
                        { icon: <Calendar />, text: formatDate(application.created_at) },
                        {
                          icon: metaIconWithLabel(<Cake />, t('columns.age')),
                          mono: true,
                          text: application.age !== null ? String(application.age) : notProvided,
                        },
                        { icon: <MapPin />, text: application.residence || notProvided },
                        {
                          icon: metaIconWithLabel(<Music />, t('columns.danceSkillLevel')),
                          text: application.dance_skill_level
                            ? t(`danceSkillLevels.${application.dance_skill_level}`)
                            : notProvided,
                        },
                        {
                          icon: metaIconWithLabel(<Timer />, t('columns.danceYears')),
                          mono: true,
                          text:
                            application.dance_years !== null
                              ? application.dance_years === 0
                                ? t('danceYearsNone')
                                : String(application.dance_years)
                              : notProvided,
                        },
                        { icon: <FileText />, text: application.experience || notProvided },
                      ]
```

（把两个新字段放在 `residence` 之后、`experience` 之前——跟 spec 里「紧跟在 experience 后面」的意图一致，这里因为 `experience` 本身要保持在数组最后一项没有变化，实际插入点在 `residence` 与 `experience` 之间；两种顺序都符合验收标准第 3 条,选这个顺序是因为 meta 数组的阅读顺序目前是「时间→年龄→居住地→经验」，新字段插在「居住地」之后仍然保持「越基础的信息越靠前」的既有顺序逻辑）

- [ ] **Step 5: 类型检查**

Run: `npx --no-install tsc --noEmit`
Expected: 无新增错误

- [ ] **Step 6: 提交**

```bash
git add "src/app/[locale]/(app)/recruit-applications/page.tsx"
git commit -m "feat(admin): 官网应募后台列表展示舞蹈能力类型与舞蹈年限"
```

---

## Task 8: 更新日志

**Files:**
- Modify: `src/lib/changelog/entries.ts`

- [ ] **Step 1: 在最新一天的 block 里插入一条**

写这份计划时（2026-09-01）,文件顶部现状是：

```ts
export const CHANGELOG: DailyChangelog[] = [
  {
    date: '2026-08-31',
    items: [
```

**执行这一步之前先跑一次 `git diff origin/main -- src/lib/changelog/entries.ts` 或直接打开文件确认顶部现状**——这个文件被多个并行会话频繁改动，真正执行时顶部可能已经不是上面这段。按下面两种情况二选一处理：

- **情况 A：顶部第一个 block 的 `date` 已经是执行当天的日期**——在那个 block 的 `items: [` 之后插入本条（作为该天的第一条）：

```ts
      {
        kind: 'feat',
        scope: '对外官网',
        title: '招募表单新增「舞蹈能力类型」与「舞蹈年限」两项选填信息',
        details:
          '主播应募表单在「经验・社交账号」之后新增两个选填字段：舞蹈能力类型（接触较少／长期爱好／专业培训／教学级别四选一）与舞蹈年限（0–36 年的选择器，不支持手工输入，0 显示为「无」）。后台「官网应募」列表的主播投递记录同步展示这两项。',
      },
```

- **情况 B：顶部第一个 block 的 `date` 不是执行当天**（比如仍是上面看到的 `2026-08-31`，或已经变成别的日期）——在数组最前面新插一整个当天的 block，把：

```ts
export const CHANGELOG: DailyChangelog[] = [
  {
    date: '2026-08-31',
    items: [
```

改成（把 `2026-09-01` 换成实际执行当天的日期）：

```ts
export const CHANGELOG: DailyChangelog[] = [
  {
    date: '2026-09-01',
    items: [
      {
        kind: 'feat',
        scope: '对外官网',
        title: '招募表单新增「舞蹈能力类型」与「舞蹈年限」两项选填信息',
        details:
          '主播应募表单在「经验・社交账号」之后新增两个选填字段：舞蹈能力类型（接触较少／长期爱好／专业培训／教学级别四选一）与舞蹈年限（0–36 年的选择器，不支持手工输入，0 显示为「无」）。后台「官网应募」列表的主播投递记录同步展示这两项。',
      },
    ],
  },
  {
    date: '2026-08-31',
    items: [
```

- [ ] **Step 2: 提交**

```bash
git add src/lib/changelog/entries.ts
git commit -m "docs: 更新日志记录招募表单舞蹈能力字段"
```

---

## Task 9: 文档同步——`docs/public-site.md`

**Files:**
- Modify: `docs/public-site.md:222`

- [ ] **Step 1: 更新字段清单**

把：

```
**字段**（比设计稿多两项，都是必要补充）：姓名、年龄、居住地、**联系方式**（设计稿收了信息却没有任何联系方式，收了也联系不上人）、经验/SNS（选填）、**同意勾选**（收集个人信息的前提）、语言（自动）。
```

改成：

```
**字段**（比设计稿多两项，都是必要补充）：姓名、年龄、居住地、**联系方式**（设计稿收了信息却没有任何联系方式，收了也联系不上人）、经验/SNS（选填）、**舞蹈能力类型**（选填，四选一）、**舞蹈年限**（选填，0–36 年 select）、**同意勾选**（收集个人信息的前提）、语言（自动）。
```

- [ ] **Step 2: 提交**

```bash
git add docs/public-site.md
git commit -m "docs: public-site.md 补充舞蹈能力字段"
```

---

## Task 10: 全量验证 + 表单 UI 可视化核对

**Files:** 无新文件——这个任务只跑命令和浏览器核对，不改代码。

- [ ] **Step 1: 完整测试套件**

Run: `npm run test:copy && npx --no-install tsc --noEmit && npm test`

Expected: 三段全部 PASS。第三段 `npm test` 跑 `package.json` 里 `"test"` 脚本列出的全部测试文件（含 `src/lib/site/application.test.ts`），输出的 `tests`/`pass` 计数应该比 Task 1 之前多 7（本任务新增的 7 条用例）。

- [ ] **Step 2: 起本地 dev server（worktree 专用端口）**

```bash
npx next dev -p 3010
```

（等 `Ready` 输出后再进行下一步；这个 worktree 需要先把仓库根目录的 `.env.local` 拷贝进来才能连上 Supabase 渲染真实页面——如果还没拷贝，先 `cp /Users/fengzhou/Code/newWith/.env.local .env.local`。）

- [ ] **Step 3: 浏览器核对三语表单 UI（不提交表单）**

依次打开 `http://localhost:3010/zh/site/recruit`、`/en/site/recruit`、`/ja/site/recruit`，确认：
- 「经验・社交账号」字段下方出现「舞蹈能力类型」四个 radio 选项，文案对应语言正确
- 再往下出现「舞蹈年限」下拉框，点开后能看到 0–36，其中 0 显示为对应语言的「无」，其余是纯数字，没有手工输入框
- 用 `resize_window` 分别在 375px、768px、1280px 宽度下截图，确认新增的两个字段没有把版式撑坏（radio group 换行是否自然、select 宽度是否跟其它输入框一致）

**明确不做的事**：不点击「提交」——这个 worktree 的 `.env.local` 连的是仓库唯一的 Supabase 项目（生产库），Task 3 的迁移文件此时还没有手动应用到那个项目，`dance_skill_level`/`dance_years` 这两列在真实表里还不存在，真的提交会因为 `db_error` 失败；就算迁移已经应用，一次真实提交也会触发 `notifyOps()` 给真实的 ops 用户发一条通知——不应该为了测试制造一条假的应募记录和一条假通知。真正的端到端验证（提交 → 落库 → 后台列表可见）放在 Task 11，PR 合并、迁移手动应用之后。

- [ ] **Step 4: 关闭 dev server**

```bash
pkill -f "next dev -p 3010"
```

---

## Task 11: 开 PR，合并后手动应用迁移并做真实端到端验证

**Files:** 无——这是收尾任务，不改代码。

- [ ] **Step 1: 确认所有 commit 已经在 `feat/recruit-dance-skill` 分支上**

```bash
git log --oneline origin/main..HEAD
```

Expected: 看到 Task 1–9 的全部 commit（Task 10 不产生 commit）。

- [ ] **Step 2: 开 PR**

标题用 `feat(site):` 前缀，body 里明确写「迁移文件合并后需要手动到 Supabase Dashboard SQL Editor 执行，之后再做真实的端到端验证」，参考仓库其它 PR 的格式（`gh pr create`）。**推送前先跟当前的 origin/main 对比是否落后，落后则先 rebase**——这个仓库有并行会话同时改动的先例。

- [ ] **Step 3: 等待用户明确同意后合并**

不自动合并——遵循这个仓库「改动走 PR，等用户同意再合」的既有约定。

- [ ] **Step 4（合并后）：手动应用迁移**

登录 Supabase Dashboard 的 SQL Editor，贴入 `supabase/migrations/20260901222510_site_applications_dance_fields.sql` 的内容并执行。执行后用以下方式之一确认两列已经存在：

```bash
curl -s "$NEXT_PUBLIC_SUPABASE_URL/rest/v1/" -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" | \
  python3 -c "import json,sys; d=json.load(sys.stdin); print(list(d['definitions']['site_applications']['properties'].keys()))"
```

Expected: 输出的列名列表里包含 `dance_skill_level` 和 `dance_years`。

- [ ] **Step 5（合并后）：真实端到端验证**

在生产站点 `https://eacn.agenova.chat/zh/site/recruit` 上填写一条**明确可辨认为测试数据**的应募（比如姓名填「TEST-舞蹈字段验证-可删除」），选一个舞蹈能力类型和一个非零的舞蹈年限，提交。确认：
- 提交成功（跳到感谢页）
- 登录后台 `/recruit-applications`，能在主播投递列表里看到这条记录，舞蹈能力类型与舞蹈年限的值跟填写的一致
- 找到这条记录后，请用户确认是否需要手动从 `site_applications` 表删除这条测试数据（会触发过一次真实的 ops 通知，属于本次验证的必要代价，需要跟用户说明）

Expected: 全部符合预期。这一步如果发现不一致，回到对应 Task 修代码，不在这个任务里改数据模型。
