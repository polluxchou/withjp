# 场地平面尺寸/标尺 精度到毫米 (0.001m) — 设计文档

日期:2026-07-01
状态:已评审通过,待实现
实现隔离:worktree `/Users/fengzhou/Code/newWith-mm`(分支 `feat/venue-mm-precision`)。

## 背景与目标
当前场地组件的位置/尺寸以**整数厘米**存储,`centimetersToMeters` 只保留 2 位小数,`metersToCentimeters` 取整到 cm —— 所以距离/长度最细只能到 0.01m(1cm)。目标:**平面尺寸(X/Y/宽/高)与标尺测量距离做到毫米精度(0.001m = 0.1cm)**。

### 已确认决策
- **真实毫米精度**(可输入/保存 0.001m),非仅显示。
- 范围:**venue_items 的 x/y/width/height + 标尺距离**。立体的 height3d/elevation/thickness、楼层/场地尺寸**保持现状**。
- 拖拽/网格吸附取整**不变**;毫米精度主要通过 **Inspector 输入**获得。

## 架构

### 1. 存储 — 迁移 `040_venue_item_mm_precision.sql`
把 `venue_items` 的 4 列由 `integer` 改为 `numeric`(允许小数 cm):
```sql
alter table venue_items
  alter column x      type numeric using x::numeric,
  alter column y      type numeric using y::numeric,
  alter column width  type numeric using width::numeric,
  alter column height type numeric using height::numeric;
```
现有整数值自动转 numeric,无损。其余列不动。(无 CLI,用户在 SQL Editor 执行。)

### 2. 精度转换 — `src/venue/layoutData.ts`
- `centimetersToMeters(value)`:2 位 → **3 位**
  ```ts
  export function centimetersToMeters(value: number): number {
    return Math.round((value / 100) * 1000) / 1000
  }
  ```
- `metersToCentimeters(value)`:整数 cm → **0.1cm(毫米)**
  ```ts
  export function metersToCentimeters(value: number): number {
    return Math.round(value * 1000) / 10   // 5.905m → 590.5cm
  }
  ```

### 3. 读回兼容(重要)— `src/lib/venue/layout-sync.ts`
Supabase/PostgREST 对 `numeric` 列可能以**字符串**返回。`rowsToLayout` 里 x/y/width/height 用 `Number(...)` 兜底:
```ts
x: Number(item.x),
y: Number(item.y),
width: Number(item.width),
height: Number(item.height),
```
`VenueItemRow` 的 x/y/width/height 类型仍标为 `number`(值来自 DB;运行时用 Number 兜底,避免字符串混入)。`layoutToRows` 不变(写出仍是数字)。

### 4. Inspector — `src/venue/VenueInspector.tsx`
X/Y/W/H 的 `NumberField` 加 `step={0.001}`(可精确输入到毫米);W/H 的 `min={0.08}` 保留。`metricChange` 沿用(现在经新版 `metersToCentimeters` 保留到 0.1cm)。

### 5. 标尺 / 面积
- `formatVenueMeasurement` 已 `maximumFractionDigits: 3`,喂入 3 位精度值后**自动显示到毫米**,无需改。
- `venueAreaSquareMeters`/`usableVenueAreaSquareMeters` 用更精的宽高自动更准,无需改。

## 测试
单测(`node --test`,`src/venue/layoutData.test.ts`):
- `centimetersToMeters(590.5) === 5.905`;`centimetersToMeters(590) === 5.9`。
- `metersToCentimeters(5.905) === 590.5`;`metersToCentimeters(5.9) === 590`。
- `formatVenueMeasurement(590.5)` 含 `5.905`。
- 既有用例(整数场景)不回归。

其余(渲染、Inspector step、DB numeric)靠 tsc + build + 人工。

## 涉及文件
- 新增:`supabase/migrations/040_venue_item_mm_precision.sql`
- 改:`src/venue/layoutData.ts`(两个精度函数)+ 测试
- 改:`src/lib/venue/layout-sync.ts`(rowsToLayout 的 x/y/width/height Number 兜底)
- 改:`src/venue/VenueInspector.tsx`(X/Y/W/H step=0.001)

## 边界与风险
- 拖拽/吸附仍按现粒度(不改);毫米靠 Inspector 输入。
- numeric 列 + 字符串返回:靠 rowsToLayout 的 Number 兜底,务必覆盖。
- venue_items 是并行会话高频改动的表 → 全程 worktree,迁移是安全的 alter 类型(向后兼容:旧代码把 numeric 当数字读也没问题,只是精度更细)。
- 部署顺序:代码不 select 新列、列类型 alter 向后兼容,顺序不敏感;但建议迁移 040 与部署一起做,确保输入的毫米值能存进去(整数列会把 590.5 拒绝/取整)。
