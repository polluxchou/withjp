# 招募表单新增舞蹈能力字段 — 设计说明（spec）

## 目标

官网 RECRUIT 页的主播应募表单（`ApplicationForm.tsx`，`kind: 'creator'`）新增两个选填字段：

1. **舞蹈能力类型**：四选一，`接触较少 / 长期爱好 / 专业培训 / 教学级别`
2. **舞蹈年限**：0–36 的整年份，必须是「选择器」交互（原生 `<select>`），不接受手工输入；0 显示成「无」而不是数字 0

覆盖范围三项（用户原话）：三语文案、后台投递记录展示、前台表单本身。三者都在本 spec 内，不额外做聚合统计视图（已跟用户确认）。

## 现状（investigation 摘要）

- 表单组件：`src/components/site/ApplicationForm.tsx`（creator 专用）与 `StaffApplicationForm.tsx`（photographer/makeup/group_live_ops 专用），共用同一个 `/api/site/applications` POST 接口
- 校验：`src/lib/site/application.ts` 的 `validateApplication()`，纯函数，`kind === 'creator'` 分支处理 age/residence，`COMMUTE_MODES`/`APPLICATION_KINDS` 是现成的「固定枚举 + check 约束」范例
- 落库：`src/lib/site/application-service.ts` 的 `submitApplication()`，手写字段映射（无 ORM）
- 表：Supabase `site_applications`，两版迁移在 `supabase/migrations/{20260811183310,20260814112722}_site_applications*.sql`，本仓库**没有自动迁移工具**，迁移文件合并后需要手动贴到 Supabase Dashboard SQL Editor 执行（`supabase/migrations/README.md`）
- 后台展示：`src/app/[locale]/(app)/recruit-applications/page.tsx`，`RecordRow` 按 `kind === 'creator'` 分支渲染 meta 数组，无聚合统计、无导出
- i18n：`site.recruit.form.*`（表单本身）与 `recruitApplications.*`（后台页面）是两个独立命名空间，各自三语同步

## 数据模型

`site_applications` 表新增两个可空列，走 check 约束枚举（不用自由文本），风格对齐 `commute_mode`：

```sql
alter table site_applications
  add column if not exists dance_skill_level text
    check (dance_skill_level is null or dance_skill_level in
      ('barely_touched', 'long_term_hobby', 'professional_training', 'teaching_level')),
  add column if not exists dance_years smallint
    check (dance_years is null or dance_years between 0 and 36);
```

非 creator 类型（photographer/makeup/group_live_ops）这两列必须为 null，新开一条独立约束 `site_applications_dance_fields_creator_only`（不并进已有的 `site_applications_creator_fields`——那条约束的语义是「creator 必须有 age/residence」，是「必须存在」；这条新约束的语义是「非 creator 必须没有」，是「必须不存在」，两条方向相反的断言放一起会互相绕晕读代码的人），用现有 `do $$ if not exists (select 1 from pg_constraint ...) $$` 幂等写法追加：

```sql
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'site_applications_dance_fields_creator_only') then
    alter table site_applications add constraint site_applications_dance_fields_creator_only check (
      kind = 'creator' or (dance_skill_level is null and dance_years is null)
    );
  end if;
end $$;
```

迁移文件命名：`TZ=Asia/Tokyo date +%Y%m%d%H%M%S` 生成时间戳前缀，格式对齐现有两个文件。

## 校验（`src/lib/site/application.ts`）

```ts
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

- `ApplicationInput` 新增 `danceSkillLevel?: unknown`、`danceYears?: unknown`
- `ApplicationValue` 新增 `danceSkillLevel: DanceSkillLevel | null`、`danceYears: number | null`
- 两个字段只在 `kind === 'creator'` 分支解析，员工类分支不读取（即使传了也丢弃，保持 `null`）
- **选填语义**：空值/未传 → `null`，合法；两个字段都不参与 `Object.keys(fields).length > 0` 的必填判定
- **非法值语义**（正常 UI 走不到，只有直连 API 才可能触发）：
  - `danceSkillLevel` 传了但不在 `DANCE_SKILL_LEVELS` 里 → 新错误码 `invalidChoice`
  - `danceYears` 传了但不是 0–36 的整数 → 同样用 `invalidChoice`
  - 不复用现有的 `outOfRange`（文案写死「16–60 之间的数字」，对这两个字段的错误提示是错的）或 `invalidAge`（名字语义绑死年龄），新增一个通用的 `invalidChoice` 错误码，文案是「请从列表中选择」这类中性表达
- `FieldError` 联合类型追加 `'invalidChoice'`

对应的 Postgres check 约束上限（0–36）与这里的 `DANCE_YEARS_MIN/MAX` 必须一起改——沿用文件头部注释里「两边改必须一起改」的既有约定。

## 表单 UI（`ApplicationForm.tsx`）

字段位置：紧跟在「经验・社交账号」（`experience`）之后、honeypot 之前（在同意勾选框之前）。

- **舞蹈能力类型**：4 选项 radio group，完全复用 `StaffApplicationForm.tsx` 里 `kind`/`commuteMode` 的既有模式（`role="radiogroup"` + `aria-labelledby` + `Field` 组件的 `labelId` 分支）。不预选默认值，未选=不提交=`null`。
- **舞蹈年限**：原生 `<select name="danceYears">`，37 个 `<option>`（0–36），用 `FIELD_CLS` 同款样式包一层（公开站首次出现 `<select>`，参考后台 `ExpenseForm.tsx` 的「空值渲染成 common.none」写法，但公开站没有 `common.none` 这个 key，用 `site.recruit.form.danceYearsOptions.none` 单独定义）：
  - 第一个 `<option value="" disabled hidden>` 是「未选择」占位项（不是 0），复用字段本身的标签文案 `t('danceYears')`，不新开一个 placeholder key；`disabled hidden` 让它只在未选择时短暂可见、不能被重新选回去，避免用户把「空白」当成一个有效选项提交
  - 之后 0–36 共 37 个 `<option value={n}>`：`n === 0` 渲染 `t('danceYearsOptions.none')`（"无"），其余渲染纯数字 `n`（不加「年」后缀，字段标签已说明单位）
- 两个字段都不加 `required`，`Field` 的 `error` prop 接住新的 `invalidChoice` 错误（正常路径基本不会触发，但组件要能画）

payload 新增 `danceSkillLevel: data.get('danceSkillLevel')`、`danceYears: data.get('danceYears')`。

## 三语文案

`site.recruit.form` 新增（三语同步，zh 示例）：

```json
"danceSkillLevel": "舞蹈能力类型",
"danceSkillLevelOptions": {
  "barely_touched": "接触较少",
  "long_term_hobby": "长期爱好",
  "professional_training": "专业培训",
  "teaching_level": "教学级别"
},
"danceYears": "舞蹈年限",
"danceYearsOptions": { "none": "无" }
```

`errors` 追加：

```json
"invalidChoice": "请从列表中选择"
```

英文/日文按同样 key 结构翻译：

| key | en | ja |
|---|---|---|
| danceSkillLevel | Dance skill level | ダンス経験レベル |
| barely_touched | Rarely practiced | ほとんど経験なし |
| long_term_hobby | Long-term hobby | 長く続けている趣味 |
| professional_training | Professional training | 専門トレーニング経験あり |
| teaching_level | Instructor level | 指導できるレベル |
| danceYears | Years of dance experience | ダンス経験年数 |
| danceYearsOptions.none | None | なし |
| errors.invalidChoice | Please choose from the list | リストから選択してください |

`recruitApplications`（后台命名空间）新增：

```json
"columns": {
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
```
（复用同一份四选项翻译文本，后台和前台各自独立的 key——两个命名空间历来不互相引用，`commuteModes` 在后台和 `commuteModeOptions` 在前台就是各存一份的先例。`danceYearsNone` 同理独立存一份，不跨命名空间调用 `getTranslations('site.recruit.form')` 去取前台的 key。）

## 后台展示（`/recruit-applications`）

`ApplicationRow` 类型新增 `dance_skill_level: DanceSkillLevel | null`、`dance_years: number | null`；`getApplications()` 的 `select()` 字符串追加这两列（不加会拿不到数据，即使表里有）。

`RecordRow` 的 creator 分支 `meta` 数组追加两项，紧跟在 `experience` 后面：

```tsx
{
  icon: metaIconWithLabel(<Music />, t('columns.danceSkillLevel')),
  text: application.dance_skill_level ? t(`danceSkillLevels.${application.dance_skill_level}`) : notProvided,
},
{
  icon: metaIconWithLabel(<Timer />, t('columns.danceYears')),
  mono: true,
  text: application.dance_years !== null
    ? (application.dance_years === 0 ? t('danceYearsNone') : String(application.dance_years))
    : notProvided,
},
```

图标用 `Music`/`Timer`（`lucide-react` 现有导出，跟 `Calendar`/`Cake`/`MapPin` 一样是纯装饰＋`sr-only` 文字）。0 年在后台也显示成「无」而不是字面 0，和前台一致，直接读同一份 `recruitApplications.danceYearsNone`（上面 i18n 一节已定义），不跨命名空间取值。

无聚合统计视图、无 CSV 导出——维持现状。

## 测试

- `src/lib/site/application.test.ts`：
  - creator 提交不带 `danceSkillLevel`/`danceYears` → 通过，两个值是 `null`
  - creator 提交合法的 `danceSkillLevel`（四个值各测一次）与 `danceYears`（边界值 0、36，以及中间值）→ 通过，值原样落到 `ApplicationValue`
  - `danceYears: 0` → `result.value.danceYears === 0`（不是 `null`——0 是一个合法选择，不是「未填」）
  - 非法值（不在枚举里的字符串、37、-1、非整数、`'abc'`）→ `ok: false`，`fields.danceSkillLevel`/`fields.danceYears === 'invalidChoice'`
  - staff 类（`kind: 'photographer'` 等）即使传了这两个字段也不落到 `ApplicationValue`（保持 `null`，不报错——静默丢弃，因为字段在 UI 上对 staff 表单本来就不存在）
- 不需要类似 `staff-application-form.ts`/`checkStaffRequiredChoices()` 的客户端前置校验：那个模块存在是因为 `StaffApplicationForm` 的 `kind`/`commuteMode` 是必填单选，不选就提交会被服务端误判成别的字段缺失；本次两个新字段是选填，未选=`null`=合法，不需要提交前拦截
- 迁移 SQL 手工验证：本地或 staging 数据库跑一遍两条新 check 约束（非法值插入应该被拒绝）

## 验收标准

1. 主播应募表单新增「舞蹈能力类型」（4 选 radio）与「舞蹈年限」（0–36 select，0 显示「无」，不可手输）两个选填字段，位置在「经验・社交账号」之后
2. 表单不选这两项也能正常提交成功
3. 提交后台 `/recruit-applications` 的主播投递记录卡片能看到这两个字段的值，未填显示「—」，0 年显示「无」
4. 三语（zh/en/ja）文案对称，`test:i18n` 通过
5. Supabase `site_applications` 表新增的两列有 check 约束挡住枚举外的值与超范围年份，非 creator 类型的投递这两列恒为 null
6. `npm run test:copy`、`tsc --noEmit`、`node --test` 全绿
