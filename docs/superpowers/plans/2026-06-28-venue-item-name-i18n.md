# 场地画布组件名称自动翻译(日/英)Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 画布组件(`venue_items`)新建或改名时,用 Gemini 自动把中文名翻译成日文/英文并持久化;在 `ja`/`en` 语种下画布显示对应译名,译名全团队共享、随组件删除而删除。

**Architecture:** 在 `venue_items` 上加 `name_ja`/`name_en`/`name_i18n_source` 三列(服务端管理)。译名**不**进入可编辑的 `layout` 状态 —— 由幂等接口 `POST /api/venue/translate` 在「画布加载后」与「每次保存成功后」被非阻塞地触发,该接口翻译陈旧项(`name <> name_i18n_source`)、写回三列,并返回完整的 `{ itemId: { ja, en } }` 映射;页面单独持有该映射,画布按 `id + locale` 叠加显示。这样 PUT 保存不会覆盖译名列,刷新译名也不会回退用户正在进行的编辑。

**Tech Stack:** Next.js (App Router) + next-intl + Supabase(hosted)+ Gemini `gemini-2.5-flash` + `node --test`(`--experimental-strip-types`)。

**与设计文档的偏差:** 设计文档第 4 节原写「`rowsToLayout` 增加 name_ja/name_en」。实现改为「独立译名映射」方案(理由见 Architecture),`VenueItem` 类型与 layout 同步管线保持不变。其余与 spec 一致。

---

### Task 1: 数据库迁移 — venue_items 译名列

**Files:**
- Create: `supabase/migrations/033_venue_item_name_i18n.sql`

- [ ] **Step 1: 写迁移文件**

```sql
-- ============================================================
-- Migration 033: venue_items 名称的日/英译名(服务端管理)
-- name_ja / name_en：译名,随行删除;name_i18n_source：生成译名时
-- 依据的中文 name,作为陈旧标记(name <> name_i18n_source ⇒ 待翻译)。
-- ============================================================
alter table venue_items
  add column name_ja          text not null default '',
  add column name_en          text not null default '',
  add column name_i18n_source text not null default '';
```

- [ ] **Step 2: 提交**

```bash
git add supabase/migrations/033_venue_item_name_i18n.sql
git commit -m "feat(venue): 迁移 033 — venue_items 名称日/英译名列"
```

- [ ] **Step 3: 应用到托管库(人工)**

本项目无 Supabase CLI;迁移需由用户在 Supabase SQL Editor 执行 `033` 的内容。实现者请在任务结束时**提醒用户执行此迁移**,否则接口会因列不存在而 500。

---

### Task 2: 翻译纯函数 — 陈旧筛选 + 响应解析

**Files:**
- Create: `src/lib/venue/translate.ts`
- Test: `src/lib/venue/translate.test.ts`
- Modify: `package.json`(test 脚本追加该测试文件)

- [ ] **Step 1: 写失败测试**

`src/lib/venue/translate.test.ts`:

```ts
import assert from 'node:assert/strict'
import test from 'node:test'

import { pendingTranslations, parseTranslateResponse } from './translate.ts'

test('pendingTranslations: 命中空译名与改名,跳过已同步与空名', () => {
  const rows = [
    { id: 'a', name: '设备架', name_ja: '', name_en: '', name_i18n_source: '' },      // 新建,待翻译
    { id: 'b', name: '门口',   name_ja: '入口', name_en: 'Door', name_i18n_source: '门口' }, // 已同步,跳过
    { id: 'c', name: '会议室', name_ja: '会議室', name_en: 'Room', name_i18n_source: '办公室' }, // 改名,待翻译
    { id: 'd', name: '',       name_ja: '', name_en: '', name_i18n_source: '' },        // 空名,跳过
  ]
  const pending = pendingTranslations(rows)
  assert.deepEqual(pending.map((r) => r.id), ['a', 'c'])
})

test('parseTranslateResponse: 解析合法 JSON 数组', () => {
  const raw = '[{"ja":"設備ラック","en":"Equipment rack"},{"ja":"会議室","en":"Meeting room"}]'
  assert.deepEqual(parseTranslateResponse(raw, 2), [
    { ja: '設備ラック', en: 'Equipment rack' },
    { ja: '会議室', en: 'Meeting room' },
  ])
})

test('parseTranslateResponse: 数量不匹配返回 null', () => {
  assert.equal(parseTranslateResponse('[{"ja":"x","en":"y"}]', 2), null)
})

test('parseTranslateResponse: 非法 JSON 返回 null', () => {
  assert.equal(parseTranslateResponse('not json', 1), null)
})
```

- [ ] **Step 2: 运行,确认失败**

Run: `npm test`
Expected: FAIL — `Cannot find module './translate.ts'`。

- [ ] **Step 3: 实现纯函数(暂不含 Gemini 调用)**

`src/lib/venue/translate.ts`:

```ts
export interface NameTranslation { ja: string; en: string }
export type NameTranslations = Record<string, NameTranslation>

export interface TranslatableRow {
  id: string
  name: string
  name_ja: string
  name_en: string
  name_i18n_source: string
}

// 待翻译 = 名称非空且与上次翻译所依据的源名称不一致(新建或改名)。
export function pendingTranslations(rows: TranslatableRow[]): TranslatableRow[] {
  return rows.filter((r) => r.name !== '' && r.name !== r.name_i18n_source)
}

// 解析 Gemini 返回的 JSON 数组;数量须与请求一致,否则视为失败返回 null。
export function parseTranslateResponse(raw: string, expectedCount: number): NameTranslation[] | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return null
  }
  if (!Array.isArray(parsed) || parsed.length !== expectedCount) return null
  const out: NameTranslation[] = []
  for (const item of parsed) {
    if (!item || typeof item !== 'object') return null
    const ja = (item as Record<string, unknown>).ja
    const en = (item as Record<string, unknown>).en
    if (typeof ja !== 'string' || typeof en !== 'string') return null
    out.push({ ja, en })
  }
  return out
}
```

- [ ] **Step 4: 在 test 脚本中登记新测试文件**

`package.json` 的 `"test"` 脚本末尾(在 `src/lib/items/validation.test.ts` 之后)追加一个空格分隔项:`src/lib/venue/translate.test.ts`。

- [ ] **Step 5: 运行,确认通过**

Run: `npm test`
Expected: PASS(含 4 条新用例)。

- [ ] **Step 6: 提交**

```bash
git add src/lib/venue/translate.ts src/lib/venue/translate.test.ts package.json
git commit -m "feat(venue): 译名纯函数 — 陈旧筛选 + 响应解析"
```

---

### Task 3: Gemini 批量翻译调用

**Files:**
- Modify: `src/lib/venue/translate.ts`

- [ ] **Step 1: 追加 Gemini transport 与 translateNames**

在 `src/lib/venue/translate.ts` 末尾追加(transport 复刻 `src/lib/venue/venue-intent.ts`):

```ts
function geminiApiKey(): string {
  const key = process.env.GEMINI_API_KEY
  if (!key) throw new Error('GEMINI_API_KEY is not configured')
  return key
}

function geminiBaseUrl(): string {
  return (process.env.GEMINI_BASE_URL ?? 'https://generativelanguage.googleapis.com').replace(/\/$/, '')
}

// 批量把中文名翻译成日/英。失败(网络/解析/数量不符)返回 null,调用方保持现状。
export async function translateNames(names: string[]): Promise<NameTranslation[] | null> {
  if (names.length === 0) return []
  const prompt = [
    '你是场地平面图标签的翻译器。把下列中文标签翻译成日文和英文。',
    '这些是简短的场地/设备/区域名称(如「直播设备架」「会议室」)。',
    '只输出一个 JSON 数组,长度与输入完全一致、顺序一一对应,每项形如 {"ja":"...","en":"..."}。',
    '不要输出数组以外的任何文字。',
    '输入(JSON 数组):',
    JSON.stringify(names),
  ].join('\n')

  const url = `${geminiBaseUrl()}/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiApiKey()}`
  let raw: string
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: 'application/json', temperature: 0 },
      }),
    })
    if (!res.ok) return null
    const data = await res.json()
    raw = (data.candidates?.[0]?.content?.parts?.[0]?.text as string) ?? ''
  } catch {
    return null
  }
  return parseTranslateResponse(raw, names.length)
}
```

- [ ] **Step 2: 运行测试确认无回归**

Run: `npm test`
Expected: PASS(纯函数测试不受影响;`translateNames` 走网络,不在单测覆盖内)。

- [ ] **Step 3: 提交**

```bash
git add src/lib/venue/translate.ts
git commit -m "feat(venue): translateNames — Gemini 批量中译日/英"
```

---

### Task 4: 服务层编排 — translateVenueItemNames

**Files:**
- Modify: `src/lib/venue/service.ts`

- [ ] **Step 1: 在 service.ts 顶部补充导入**

确认/追加导入(`SHARED_VENUE_ID` 已在文件内使用,无需重复):

```ts
import { pendingTranslations, translateNames, type NameTranslations, type TranslatableRow } from '@/lib/venue/translate'
```

- [ ] **Step 2: 追加编排函数**

在 `src/lib/venue/service.ts` 末尾追加:

```ts
// 翻译某场地下所有陈旧的组件名称,写回译名列,并返回该场地的完整译名映射。
// 幂等:可在加载后与每次保存后重复调用。Gemini 失败时跳过写库,返回已有译名。
export async function translateVenueItemNames(
  venueId: string = SHARED_VENUE_ID,
): Promise<ServiceResult<NameTranslations>> {
  const db = createServerClient()

  const { data: floors, error: floorErr } = await db
    .from('venue_floors').select('id').eq('venue_id', venueId)
  if (floorErr) return err('db_error', floorErr.message)
  const floorIds = (floors ?? []).map((f) => f.id)
  if (floorIds.length === 0) return ok({})

  const { data: rows, error: rowErr } = await db
    .from('venue_items')
    .select('id, name, name_ja, name_en, name_i18n_source')
    .in('floor_id', floorIds)
  if (rowErr) return err('db_error', rowErr.message)
  const allRows = (rows ?? []) as TranslatableRow[]

  const pending = pendingTranslations(allRows)
  if (pending.length > 0) {
    const results = await translateNames(pending.map((r) => r.name))
    if (results) {
      await Promise.all(
        pending.map((row, i) =>
          db.from('venue_items')
            .update({ name_ja: results[i].ja, name_en: results[i].en, name_i18n_source: row.name })
            .eq('id', row.id),
        ),
      )
      // 把刚写入的译名并回内存行,使返回映射立即包含最新结果。
      pending.forEach((row, i) => {
        row.name_ja = results[i].ja
        row.name_en = results[i].en
      })
    }
  }

  const map: NameTranslations = {}
  for (const r of allRows) {
    if (r.name_ja || r.name_en) map[r.id] = { ja: r.name_ja, en: r.name_en }
  }
  return ok(map)
}
```

- [ ] **Step 3: 类型检查**

Run: `npx tsc --noEmit`
Expected: 无新增错误(若 `SHARED_VENUE_ID`/`createServerClient`/`err`/`ok`/`ServiceResult` 未在作用域,按文件现有定义补全导入)。

- [ ] **Step 4: 提交**

```bash
git add src/lib/venue/service.ts
git commit -m "feat(venue): translateVenueItemNames 服务编排"
```

---

### Task 5: API 路由 — POST /api/venue/translate

**Files:**
- Create: `src/app/api/venue/translate/route.ts`

- [ ] **Step 1: 写路由**

```ts
import { NextRequest, NextResponse } from 'next/server'
import { authGuard } from '@/lib/auth/guard'
import { translateVenueItemNames, httpStatusForError } from '@/lib/venue/service'

// POST /api/venue/translate  body: { venueId?: string }
// 翻译该场地下陈旧的组件名称,返回 { [itemId]: { ja, en } } 映射。
export async function POST(req: NextRequest) {
  const user = await authGuard()
  if (user instanceof NextResponse) return user

  let body: { venueId?: string }
  try {
    body = (await req.json()) as { venueId?: string }
  } catch {
    return NextResponse.json({ data: null, error: 'Invalid JSON body' }, { status: 400 })
  }

  const result = await translateVenueItemNames(body.venueId)
  if (result.error) {
    return NextResponse.json(
      { data: null, error: result.error.message },
      { status: httpStatusForError(result.error.code) },
    )
  }
  return NextResponse.json({ data: result.data, error: null })
}
```

- [ ] **Step 2: 类型检查**

Run: `npx tsc --noEmit`
Expected: 无新增错误。

- [ ] **Step 3: 提交**

```bash
git add src/app/api/venue/translate/route.ts
git commit -m "feat(venue): POST /api/venue/translate 接口"
```

---

### Task 6: 画布显示选择器(纯函数 + 测试)

**Files:**
- Modify: `src/venue/layoutData.ts`
- Test: `src/venue/layoutData.test.ts`(已在 test 脚本中)

- [ ] **Step 1: 写失败测试**

在 `src/venue/layoutData.test.ts` 末尾追加(若文件已有 import 块,把 `resolveVenueItemName` 加入现有 `from './layoutData.ts'` 导入):

```ts
import { resolveVenueItemName } from './layoutData.ts'

test('resolveVenueItemName: zh 用原名', () => {
  assert.equal(resolveVenueItemName('设备架', 'a', 'zh', { a: { ja: '設備', en: 'Rack' } }), '设备架')
})
test('resolveVenueItemName: ja 用译名,缺失回退原名', () => {
  assert.equal(resolveVenueItemName('设备架', 'a', 'ja', { a: { ja: '設備', en: 'Rack' } }), '設備')
  assert.equal(resolveVenueItemName('设备架', 'b', 'ja', {}), '设备架')
})
test('resolveVenueItemName: en 译名为空时回退原名', () => {
  assert.equal(resolveVenueItemName('设备架', 'a', 'en', { a: { ja: '設備', en: '' } }), '设备架')
})
```

(若 `assert`/`test` 尚未在该文件导入,补 `import assert from 'node:assert/strict'` 与 `import test from 'node:test'`。)

- [ ] **Step 2: 运行,确认失败**

Run: `npm test`
Expected: FAIL — `resolveVenueItemName is not a function` / 未导出。

- [ ] **Step 3: 实现选择器**

在 `src/venue/layoutData.ts` 顶部 type 定义之后追加:

```ts
export type VenueNameTranslations = Record<string, { ja: string; en: string }>

// 按当前语种选择组件显示名:ja/en 用译名,缺失或 zh 回退中文原名。
export function resolveVenueItemName(
  name: string,
  id: string,
  locale: string,
  translations: VenueNameTranslations,
): string {
  if (locale === 'ja') return translations[id]?.ja || name
  if (locale === 'en') return translations[id]?.en || name
  return name
}
```

- [ ] **Step 4: 运行,确认通过**

Run: `npm test`
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add src/venue/layoutData.ts src/venue/layoutData.test.ts
git commit -m "feat(venue): resolveVenueItemName 显示选择器"
```

---

### Task 7: 画布组件接入显示选择器

**Files:**
- Modify: `src/venue/VenueCanvas.tsx`
- Modify: `src/venue/Venue3DCanvas.client.tsx`

**背景:** 标签文本在子组件里渲染 —— `VenueShape`(`src/venue/VenueCanvas.tsx:541`,在 `:597` 渲染 `{item.name}`,并在 `:527` 用 `estTextUnits(item.name)` 估算字宽)与 `VenueCallout`(`:807`,在 `:854` 渲染 `{item.name}`)。顶层 `VenueCanvas`(`:76`)在渲染循环里以 `item={item}` 调用这些子组件。因此解析器需要**透传到子组件**,不能只在顶层定义。约定:用可选 prop `itemName?: (item: VenueItem) => string`,缺省时回退 `item.name`,顶层不传也能照常工作。

- [ ] **Step 1: 顶层 VenueCanvas 增加并转发 itemName**

在 `VenueCanvas`(`:76`)的 props 类型中增加 `itemName?: (item: VenueItem) => string` 并解构。在渲染处把它转发给会显示名称的子组件:给每个 `<VenueShape ... />` 与 `<VenueCallout ... />` 调用点(在 `item={item}` 附近,约 `:378–:443` 的循环及 callout 渲染处)增加 `itemName={itemName}`。
(若 `VenueItem` 类型未导入,从 `@/venue/layoutData` 以 type 引入。)

- [ ] **Step 2: VenueShape 接入**

在 `VenueShape` 的 props 类型加 `itemName?: (item: VenueItem) => string` 并解构,函数体顶部定义 `const displayName = itemName ? itemName(item) : item.name`。把:
- `:527` 的 `estTextUnits(item.name)` → `estTextUnits(displayName)`
- `:597` 的 `{item.name}` → `{displayName}`

- [ ] **Step 3: VenueCallout 接入**

在 `VenueCallout` 的 props 类型加 `itemName?: (item: VenueItem) => string` 并解构,函数体顶部定义 `const displayName = itemName ? itemName(item) : item.name`。把 `:854` 的 `{item.name}` → `{displayName}`。

- [ ] **Step 4: 兜底检查其它显示用 .name**

Run: `grep -n "item\.name" src/venue/VenueCanvas.tsx`
对每个**用于显示**的 `item.name`(文本节点 / 字宽估算)都应已改为 `displayName`;`floor.name`、写库、aria-label 等**不改**。逐条确认。

- [ ] **Step 5: Venue3DCanvas 同样接入**

`Venue3DCanvas.tsx` 是 `dynamic()` 包装层(`:9`),需在其 props 透传 `itemName` 给 `.client`。在 `Venue3DCanvas.client.tsx` 的 props 增加 `itemName?: (item: VenueItem) => string`,渲染 3D 文字标签处把显示用的 `item.name` 改为 `itemName ? itemName(item) : item.name`(先 `grep -n "item\.name" src/venue/Venue3DCanvas.client.tsx` 定位标签文本;仅改显示用途,不动 `floor.name` 等)。

- [ ] **Step 6: 类型检查**

Run: `npx tsc --noEmit`
Expected: 无新增错误。

- [ ] **Step 7: 提交**

```bash
git add src/venue/VenueCanvas.tsx src/venue/Venue3DCanvas.client.tsx src/venue/Venue3DCanvas.tsx
git commit -m "feat(venue): 画布按语种显示组件译名"
```

---

### Task 8: 页面接线 — 加载后 + 保存后触发翻译

**Files:**
- Modify: `src/app/[locale]/(app)/guild-venue/page.tsx`

- [ ] **Step 1: 导入 useLocale、resolver、类型**

在顶部导入区:
- `import { useTranslations, useLocale } from 'next-intl'`(把 `useLocale` 加入现有 next-intl 导入)
- 从 `@/venue/layoutData` 的现有导入中追加 `resolveVenueItemName`、`type VenueNameTranslations`

- [ ] **Step 2: 增加译名状态与 locale**

在组件其它 `useState` 附近:

```ts
  const locale = useLocale()
  const [nameTranslations, setNameTranslations] = useState<VenueNameTranslations>({})
```

- [ ] **Step 3: 增加非阻塞刷新函数**

在组件内(其它 useCallback/函数附近)定义:

```ts
  const refreshTranslations = useCallback(async (venueId: string) => {
    try {
      const res = await fetch('/api/venue/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ venueId }),
      })
      if (!res.ok) return
      const body = (await res.json()) as { data: VenueNameTranslations | null }
      if (body.data) setNameTranslations(body.data)
    } catch {
      // 翻译是增强项,失败时画布静默显示中文。
    }
  }, [])
```

(若 `useCallback` 未导入,加入 `react` 的 import。)

- [ ] **Step 4: 加载完成后触发**

在加载 effect 中 `applyLayout(cloud)` 之后(约 `src/app/[locale]/(app)/guild-venue/page.tsx:182`)追加:

```ts
        void refreshTranslations(activeId)
```

- [ ] **Step 5: 保存成功后触发**

在保存 effect 中(约 `:364`),把:

```ts
          setSaveState(res.ok ? 'saved' : 'error')
```

改为:

```ts
          setSaveState(res.ok ? 'saved' : 'error')
          if (res.ok) void refreshTranslations(layout.venueId)
```

- [ ] **Step 6: 把解析器传给画布**

找到渲染 `<VenueCanvas ... />` 与 `<Venue3DCanvas ... />` 的位置,各增加 prop:

```tsx
          itemName={(item) => resolveVenueItemName(item.name, item.id, locale, nameTranslations)}
```

- [ ] **Step 7: 类型检查 + 构建**

Run: `npx tsc --noEmit`
Expected: 无新增错误。

- [ ] **Step 8: 提交**

```bash
git add "src/app/[locale]/(app)/guild-venue/page.tsx"
git commit -m "feat(venue): 画布加载/保存后非阻塞触发译名刷新"
```

---

### Task 9: 端到端验证

**前置:** 确认 Task 1 的迁移 `033` 已在 Supabase SQL Editor 执行(否则接口 500)。

- [ ] **Step 1: 启动并打开画布**

用 preview 工具启动 dev server,打开 `/zh/guild-venue`。

- [ ] **Step 2: 验证自愈翻译(旧组件)**

切到 `/ja/guild-venue` 与 `/en/guild-venue`,刷新后种子组件(如「直播设备架」)应显示为日文/英文。用 `preview_network` 确认 `POST /api/venue/translate` 返回 200 且 `data` 含映射。

- [ ] **Step 3: 验证新建翻译**

在 `/zh/guild-venue` 新建一个组件并命名(如「测试灯架」),等待保存(saveState=saved),切到 `/ja` 与 `/en` 应看到对应译名。

- [ ] **Step 4: 验证改名重译**

把该组件改名(如「测试灯架」→「主摄像机」),保存后切语种,译名应随之更新(陈旧标记触发重译)。

- [ ] **Step 5: 验证删除即清除**

删除该组件并保存;其译名随行删除(库中无残留;再次切语种不再出现)。用 `preview_screenshot` 留存日/英画布证据。

- [ ] **Step 6: 全量测试**

Run: `npm test`
Expected: PASS(全绿,含新增用例)。

---

## Self-Review notes

- **Spec 覆盖:** 数据列(T1)、Gemini 翻译(T2/T3)、触发接口与幂等/自愈(T4/T5/T8)、按语种显示与中文为编辑真值(T6/T7)、边界与测试(T2/T6/T9)均有对应任务。
- **类型一致:** `NameTranslations`/`NameTranslation`/`TranslatableRow` 定义于 `translate.ts` 并被 service 复用;前端 `VenueNameTranslations` 定义于 `layoutData.ts`,结构 `{ id: { ja, en } }` 与后端返回一致。`resolveVenueItemName(name, id, locale, translations)` 签名在 T6 定义、T7/T8 调用一致。
- **偏差已记录:** 译名走独立映射而非 layout(见顶部「与设计文档的偏差」)。
