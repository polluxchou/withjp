# 场地「灯」拆成 4 种独立 3D 形态 — 设计文档

日期:2026-07-01
状态:已评审通过,待实现
实现隔离:worktree `/Users/fengzhou/Code/newWith-lightforms`(分支 `feat/venue-light-forms`)。

## 背景与目标

当前只有一个 `light` 类型(八角柔光箱、吸附桁架、aerial)。要拆成 4 种实物形态,覆盖落地灯与吊顶灯:

| # | 类型 id | 说明 | 落位 | 吸附桁架 |
|---|---|---|---|---|
| 1 | `light_grille4` | 四角格栅灯,直接落地、无支架 | ground(贴地) | 否 |
| 2 | `light_grille8_stand` | 八角格栅灯 + 支架 | ground(支架抬高) | 否 |
| 3 | `light_spot` | 射灯,吸附桁架接天花 | aerial | **是** |
| 4 | `light_grille4_stand` | 四角格栅灯 + 支架 | ground(支架抬高) | 否 |

现有 `light` 类型**移除**;现有 `type='light'` 数据在迁移里**删除**(用户已同意丢弃)。

### 已确认决策
- **4 个独立类型**(不用单类型 + 形态字段)。
- 现有 light 数据可丢弃,4 种全新做。
- 格栅灯面用**扁平板 + 深色边框(Edges)表意**,不画满网格线(YAGNI,后续可加)。
- 默认高度:支架灯 elevation=150,射灯 elevation=240。
- `elevation` 统一含义 = 灯面离地高度(#1=0 贴地;#2/#4=支架高;#3=吊挂高)。

## 架构

### 1. 类型与默认 — `src/venue/layoutData.ts`
- `VenueShapeType`:移除 `'light'`,加入 `'light_grille4' | 'light_grille8_stand' | 'light_spot' | 'light_grille4_stand'`。
- 各 `Record<VenueItemType, …>` 表(`DEFAULT_SIZE`/`DEFAULT_3D`/`DEFAULT_THICKNESS`/`DEFAULT_PLACEMENT`/名称表)用这 4 行替换原 `light` 行:

  | 类型 | DEFAULT_SIZE | DEFAULT_3D {height3d, elevation} | placement | thickness | 名称 |
  |---|---|---|---|---|---|
  | `light_grille4` | 60×60 | {8, 0} | ground | 0 | 格栅灯 |
  | `light_grille8_stand` | 70×70 | {10, 150} | ground | 0 | 八角格栅灯 |
  | `light_spot` | 30×30 | {25, 240} | aerial | 0 | 射灯 |
  | `light_grille4_stand` | 60×60 | {8, 150} | ground | 0 | 格栅灯(支架) |

- `VENUE_ITEM_TYPE_OPTIONS`:把原 `{ value: 'light', label: '吊灯' }` 换成 4 项(label:格栅灯 / 八角格栅灯 / 射灯 / 格栅灯·支架)。
- 新增 helper `isLightType(type): boolean`(判断是否属这 4 种),3D 渲染与吸附会用到。
- `lightTrussAttachments`:筛选条件由 `type === 'light'` 改为 **`type === 'light_spot'`**(只有射灯吸附桁架)。

### 2. 数据库 — 迁移 `039_venue_item_light_forms.sql`
```sql
delete from venue_items where type = 'light';       -- 丢弃旧灯数据
alter table venue_items drop constraint venue_items_type_valid;
alter table venue_items add constraint venue_items_type_valid check (type in
  ('equipment','renovation','area','corridor','window',
   'door_inward','door_outward','door_sliding','fire','power','network',
   'truss','light_grille4','light_grille8_stand','light_spot','light_grille4_stand'));
-- 注意:'light' 与 'truss' 保留 truss;移除 'light'
```
(保留 `truss`;移除 `light`,加 4 个新灯。本项目无 CLI,用户在 SQL Editor 执行;删除语句是丢弃旧灯,已授权。)

### 3. 3D 渲染 — `src/venue/Venue3DCanvas.client.tsx`
把现有单一 `Light3D` 改为按类型分形态渲染(一个 `Light3D` 内部 switch,或每形态一个子渲染函数)。`cx=item.x+w/2`,`cz=item.y+h/2`,`r=min(w,h)/2`。

- **`light_grille4`(四角落地)**:扁平方板 `box [w, height3d, h]`,y=height3d/2(贴地);深色材质 `#1f2937` + `Edges`(格栅感)。
- **`light_grille4_stand`(四角+支架)**:方板同上但 y=elevation(灯面在支架顶);外加**支架**:细杆 `box [6, elevation, 6]` 从 0→elevation + 小底座 `box [24,4,24]` 贴地。
- **`light_grille8_stand`(八角+支架)**:灯面 = 八边扁棱柱 `cylinderGeometry(r, r, height3d, 8)`,y=elevation;支架同上。
- **`light_spot`(射灯)**:小筒身 `cylinderGeometry(6,6,height3d,16)` + 朝下短锥 `coneGeometry(8, 10, 16)`,y≈elevation;**吸附最近桁架** → 从筒顶竖直细杆 `box[4, rodH, 4]` 上到 `trussElevation`(复用 `lightTrussAttachments`,只对 `light_spot`;无命中则无杆)。
- 渲染循环:`if (isLightType(item.type)) return <Light3D item trussElevation={lightAttach.get(item.id)} ... />`(替换原 `item.type === 'light'` 分支)。4 种灯都**不**走默认盒。

### 4. 2D / Inspector / 入口 / i18n
- **2D**(`VenueCanvas.tsx` `TYPE_STYLE`)+ **3D**(`Venue3DCanvas` `TYPE_STYLE_3D`):4 种都加配色(暖色系:格栅偏黄 `#fef9c3/#ca8a04`,八角偏琥珀 `#fde68a/#d97706`,射灯偏橙 `#ffedd5/#ea580c`,支架格栅偏黄绿 `#ecfccb/#65a30d`)。都是非 marker → 2D 自动可缩放矩形。
- **Inspector**(`VenueInspector.tsx`):地面/空中开关排除条件再加这 4 种(`&& !isLightType(item.type)` 或逐个排除);复用「立体」区显示离地/高度。
- **入口**(`page.tsx`):`FACILITY_MENU_TYPES` 由 `['window','truss','light']` 改为 `['window','truss','light_grille4','light_grille4_stand','light_grille8_stand','light_spot']`;`TOOL_ICON` 4 行(lucide:`Grid2x2`/`LampFloor`/`LampCeiling`/`Lightbulb` 之类,实现时按已安装版本可用图标选)。
- **i18n**(`messages/{zh,en,ja}.json`):4 个 `types.*` + 4 个 `addTypes.*`。

### 5. 面积 & 隔离
- 4 种灯均**不计入 / 不扣减可用面积**(面积只认 `type==='area'` 与 `type==='corridor'&&ground`,灯类型天然排除)——满足既有要求,无需改面积逻辑。
- 全程 worktree 实现,完成走 PR。

## 测试
单测(`node --test`):
- `addVenueItem` 对 4 种类型的默认值(尺寸/elevation/placement)。
- `isLightType`:4 种为 true,其它(area/truss/window/…)为 false。
- `lightTrussAttachments`:只对 `light_spot` 产出吸附(`light_grille4` 等落地灯不吸附)。

3D 几何(灯面/支架/射灯/吊臂)非单测,靠 tsc + build + 人工 3D 验证。

## 涉及文件
- 新增:`supabase/migrations/039_venue_item_light_forms.sql`
- 改:`src/venue/layoutData.ts`(类型/默认/选项/isLightType/lightTrussAttachments)
- 改:`src/venue/Venue3DCanvas.client.tsx`(Light3D 分形态 + TYPE_STYLE_3D + 渲染循环 + 吸附筛选)
- 改:`src/venue/VenueCanvas.tsx`(TYPE_STYLE 4 色)
- 改:`src/venue/VenueInspector.tsx`(排除 4 种的地面/空中开关)
- 改:`src/app/[locale]/(app)/guild-venue/page.tsx`(FACILITY_MENU_TYPES + TOOL_ICON)
- 改:`messages/{zh,en,ja}.json`(types/addTypes)

## 边界与已知限制
- 只有 `light_spot` 吸附桁架;落地灯不吸附。
- 支架是竖直细杆 + 小底座,不做可调倾角/云台。
- 格栅是扁平板 + 边框表意,无逐格网线。
- 现有 `type='light'` 数据被迁移删除(不可恢复,已授权)。
- 3D 几何无自动断言,靠构建 + 人工。
