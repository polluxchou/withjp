# 场地画布组件名称自动翻译(日/英)— 设计文档

日期:2026-06-28
状态:已评审通过,待实现

## 背景与目标

场地画布(`guild-venue`)上的每个组件(`venue_items`,如「直播设备架」「直播间 A 装修区」)只有中文 `name`。在 `ja` / `en` 语种下浏览画布时,这些标签仍是中文。

目标:当画布组件**被命名(新建)或改名**时,通过 **Gemini** 自动把中文名翻译成日文和英文并持久化;在 `ja` / `en` 语种下,画布显示对应译名。译名跟随组件存在 —— **只要组件不被删除,译名就一直保留**。

### 已确认的范围决策

| 项 | 决策 |
|---|---|
| 翻译对象 | 场地画布组件(`venue_items`),**不是**物品台账(`items`) |
| 触发时机 | 新建时 **和** 改名时都(重新)翻译 |
| 执行方式 | 后台异步,**不阻塞保存** |
| 翻译引擎 | Gemini(`gemini-2.5-flash`,复用现有客户端) |
| 旧组件(种子数据) | **也翻译**(画布加载时自愈式补全) |
| 译名可见性 | **全团队共享**(存于共享场地行,所有人看到同一份) |

## 架构

### 1. 数据模型 — 迁移 `033_venue_item_name_i18n.sql`

给 `venue_items` 增加三列(均由服务端管理):

```sql
alter table venue_items
  add column name_ja          text not null default '',
  add column name_en          text not null default '',
  add column name_i18n_source text not null default '';
```

- `name_ja` / `name_en` —— 日文 / 英文译名。随行存在,组件删除时一并删除(满足「不删就保留」)。
- `name_i18n_source` —— 生成当前译名时所依据的中文 `name`。这是**陈旧标记**:当 `name <> name_i18n_source` 时说明译名过期(新建或刚改名),需要(重新)翻译。

**关键正确性点:** `layoutToRows`(`src/lib/venue/layout-sync.ts`)写入的 upsert payload **不包含**这三列。Supabase upsert 在冲突更新时只 SET payload 里出现的列,因此这三列在每次「移动 / 改状态 / 改名」保存时都**原样保留**,只由翻译接口刷新。新行插入时取默认值 `''`。

### 2. 翻译服务 — `src/lib/venue/translate.ts`

复用现有 Gemini 调用方式(`gemini-2.5-flash`、`GEMINI_API_KEY`、可选 `GEMINI_BASE_URL` 代理,参照 `src/lib/venue/venue-intent.ts`)。

```ts
translateNames(names: string[]): Promise<{ ja: string; en: string }[]>
```

- 一次 Gemini 调用批量翻译所有待译名称,返回严格 JSON 数组(顺序对应输入)。
- Prompt:把这些简短的场地 / 设备标签从中文翻译为日文和英文,保持与输入一一对应的数组,只输出 JSON,不要多余文字。
- 任何失败(网络 / 解析 / 数量不匹配)→ 返回空,调用方保持现状不写库,**绝不向用户流程抛错**。

### 3. 触发与流程(后台、不阻塞)

新增幂等接口 **`POST /api/venue/translate`**(服务端,service role):

1. 查出 `name <> ''` 且 `name <> name_i18n_source` 的 venue_items(即新建或改名过的)。
2. 批量翻译,写回 `name_ja`、`name_en`,并把 `name_i18n_source = name`。

两处触发:

- **保存后:** `saveVenueLayout` 成功后,客户端**不 await** 地 fire 该接口 —— 画布即时更新,译名稍后补入。
- **画布加载时(自愈):** 页面加载也 ping 一次,使本功能上线前就存在的组件(含种子数据如「直播设备架」)被补译。

因为接口自行根据陈旧标记推导工作集,所以可随时调用、天然支持协作并发编辑、失败会在下次保存 / 加载时自动重试。

### 4. 画布显示

- `VenueItem` 类型与 `rowsToLayout` 增加只读字段 `name_ja` / `name_en`;`layoutToRows` 保持不变(维持服务端管理)。
- `getVenueLayout` 的 select 增加这两列。
- 画布按当前 locale 选择显示名:`zh → name`、`ja → name_ja || name`、`en → name_en || name`(译名缺失时回退中文)。应用于两处渲染(`VenueCanvas.tsx:597`、`:854`)与 3D 视图标签。
- **编辑始终编辑中文 `name`**(唯一真值);译名自动生成、不可直接编辑;改名后经陈旧标记触发重新翻译。

### 5. 边界情况

- 空名称(大量 marker:门 / 消防 / 电源 / 网络口)→ 跳过,不翻译。
- Gemini 不可用 → 画布静默显示中文,下次触发时修复。
- 纯数字 / 已是英文的名称 → 照常传入,无害。
- 协作并发:接口幂等,以 source 匹配实现最终一致。

## 测试

单元测试:

- 陈旧检测:给定一批行,正确筛出需要翻译的(空名跳过、source 匹配跳过、不匹配命中)。
- locale → 显示名选择器:三语种 + 缺译回退。
- Gemini 响应解析:mock 返回值,覆盖正常、数量不匹配、非法 JSON。

## 涉及文件

- 新增:`supabase/migrations/033_venue_item_name_i18n.sql`
- 新增:`src/lib/venue/translate.ts`(+ 测试)
- 新增:`src/app/api/venue/translate/route.ts`
- 改动:`src/venue/layoutData.ts`(VenueItem 加 name_ja/name_en)
- 改动:`src/lib/venue/layout-sync.ts`(rowsToLayout 映射译名)
- 改动:`src/lib/venue/service.ts`(getVenueLayout select 译名列)
- 改动:`src/venue/VenueCanvas.tsx`、`src/venue/Venue3DCanvas*.tsx`(按 locale 显示名)
- 改动:画布保存成功处 + 画布加载处(触发翻译接口)
