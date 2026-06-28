# 场地「窗户」组件(3D 挖墙渲染)— 设计文档

日期:2026-06-28
状态:已评审通过,待实现
实现隔离:独立 git worktree `/Users/fengzhou/Code/newWith-window`(分支 `feat/venue-window`),因主仓被并行「地面/空中」会话高频改动。

## 背景与目标

场地画布支持把组件摆到平面图上,3D 视图会把空间(area)渲染成四面墙围合的房间,并已实现**门在墙上挖洞**(吸附最近墙体、共享墙两侧都挖、按真实开门姿态渲染)。

目标:新增**窗户**组件。3D 渲染时在对应墙体上挖一个**抬高的矩形洞**(窗下留窗台、窗上留窗楣),并在洞里嵌一块玻璃构件。支持配置**离地高度**(窗台距地)与**厚度**(墙厚方向的进深);窗户宽度沿用组件在画布上的宽度。

### 已确认决策

| 项 | 决策 |
|---|---|
| 类型归属 | 新增 `window`,归 `VenueShapeType`(可拖拽矩形,宽度即开口宽) |
| 面积计入 | 不计入可用面积(面积只算 `area`/空间) |
| 离地高度 | 复用现有 `elevation`(默认 90cm) |
| 窗户竖直高度 | 复用现有 `height3d`(默认 120cm) |
| 厚度(进深) | **新增字段 `thickness`**(cm,墙厚方向,默认 8cm) |
| 宽度 | 沿用 footprint(组件在画布上的宽) |
| 吸附+挖洞 | 复用门的「吸附最近墙体 + 共享墙两侧都挖」逻辑 |
| 3D 实体盒 | 窗户**不**渲染默认 box,改走挖墙+贴构件 |

## 架构

### 1. 类型与数据模型 — `src/venue/layoutData.ts`

- `VenueShapeType` 增加 `'window'`:`'equipment' | 'renovation' | 'area' | 'corridor' | 'window'`。
- `VenueItem` 增加可选字段 `thickness: number`(cm,墙厚方向进深;非窗户类型可为 0/忽略)。为保持与现有 `elevation`/`height3d` 一致,设为**必填 + 默认**(读取旧数据时缺省补 0,见迁移与 `rowsToLayout`)。
- `DEFAULT_PLACEMENT['window'] = 'aerial'`(挂在墙上,不占地面)。
- 新建窗户的默认尺寸:footprint 宽 120cm × 进深薄(2D 矩形短边),`elevation=90`、`height3d=120`、`thickness=8`(在 `addVenueItem` 或其默认表里给 window 专属默认)。

### 2. 数据库 — 新迁移 `0XX_venue_item_window.sql`

```sql
-- venue_items.type 允许 'window';新增 thickness(墙厚方向进深,cm)。
alter table venue_items drop constraint venue_items_type_valid;
alter table venue_items add constraint venue_items_type_valid check (type in
  ('equipment','renovation','area','corridor',
   'door_inward','door_outward','door_sliding','fire','power','network','window'));
alter table venue_items add column thickness integer not null default 0;
```

(迁移号取当时最大 +1;本项目无 Supabase CLI,需用户在 SQL Editor 手动执行。)

### 3. 行<->布局同步 — `src/lib/venue/layout-sync.ts`

- `layoutToRows`:item 行增加 `thickness: item.thickness`。
- `rowsToLayout`:`thickness: item.thickness ?? 0`(兼容旧行)。
- `VenueItemRow` 接口增加 `thickness: number`。
- `service.ts` 的 `getVenueLayout` select 增加 `thickness` 列。

### 4. 3D 挖墙(扩展门机制)— `src/venue/Venue3DCanvas.client.tsx`

复用并泛化现有门-墙匹配与墙体分段渲染:

- **匹配**:把现处理门的 `matchDoorsToWalls`(useMemo)泛化为同时处理窗户。窗户用 footprint 中心找最近空间墙体,在该墙 `side` 上 push 一个 port,`width = 窗沿墙方向投影宽度`(取与墙平行的那条 footprint 边长)。共享墙两侧都 push。
- **WallPort 扩展**:`WallPort = { offset; width; sourceId; band?: { bottom: number; top: number } }`。
  - 门:`band` 省略 ⇒ 视为 full-height(0→墙顶),保持现有行为不变。
  - 窗:`band = { bottom: elevation, top: elevation + height3d }`(并 clamp 到 [0, 墙高])。
- **墙体渲染** `AreaWalls` / `segmentWall`:
  - 现 `segmentWall` 把墙按 port 的水平 `[offset±width/2]` 切成实心段。保持不变 —— 它负责**水平**切分。
  - 对每个 port:
    - `band` 省略(门)⇒ 该水平区间整段镂空(现行为)。
    - 有 `band`(窗)⇒ 该水平区间内渲染:**窗台块**(y: 0→band.bottom)+ **窗楣块**(y: band.top→墙高),均为满墙厚实体;两块之间是窗洞。
  - 在窗洞中央嵌一块**玻璃构件**:宽=port.width、高=band.top-band.bottom、进深=`thickness`,半透明蓝(如 `#bae6fd`,opacity ~0.45),居中于墙厚。
- **跳过默认盒**:渲染 `floor.items` 时,`window` 类型与门一样 **不**渲染默认 extruded box(只参与挖墙+玻璃构件)。
- 名称标签:窗户沿用现有标签逻辑(标签锚到组件包围盒);不特殊处理。

### 5. 2D 渲染 — `src/venue/VenueCanvas.tsx`

- `window` 作为可缩放矩形渲染(走 shape 分支,非 marker 固定点)。
- 视觉区分:窗户矩形用浅蓝描边 + 内部画窗户符号(矩形内一条中线/双线),与「空间/设备/区域」区分。沿用现有 shape 颜色映射,新增 window 配色项。

### 6. Inspector — `src/venue/VenueInspector.tsx`

- 「立体」区在 `type === 'window'` 时显示三项:**离地高度**(`elevation`)、**高度**(`height3d`)——沿用现有两项(单位米,与现有 elevation/height3d 输入一致);**厚度**(`thickness`)——新增输入,**单位 cm**(进深值较小,如 8cm,用米显示成 0.08 太别扭),标签明示 cm,存储也是 cm 整数。
- 非窗户类型不显示 `thickness` 输入。
- 窗户**不显示「地面/空中」开关**:把现有显示条件 `!isVenueMarkerType(item.type) && item.type !== 'area'` 收紧为再排除 `window`(窗户固定挂墙,placement 恒为 aerial,切换无意义)。

### 7. 入口与文案 — `src/app/[locale]/(app)/guild-venue/page.tsx` + `messages/*`

- 工具栏新增顶层 **「+ 窗户」** `ToolbarButton`(与设备/区域/空间/结构并列),`onClick={() => addItem('window')}`。
- `TOOL_ICON.window` 配图标(如 lucide `Square`/`PanelTop` 之类的窗形图标)。
- `messages/{zh,en,ja}.json` 增加 `venue.addTypes.window`(`+ 窗户` / `+ Window`)、`venue.types.window`(`窗户` / `Window`),以及 Inspector 的 `venue.fieldThickness`(`厚度` / `Thickness`)。
- 面积统计/筛选:`window` 作为 shape 出现在类型筛选里;不计入可用面积(沿用"仅 area 计面积"逻辑,无需额外改)。

## 测试

纯函数 / 可单测部分(`node --test`):
- `layout-sync`:`thickness` 往返(layoutToRows/rowsToLayout)正确,旧行缺省补 0。
- 窗户-墙匹配:给定一个窗户 footprint 贴某墙,产出带 `band={bottom:elevation, top:elevation+height3d}` 的 port;band 被 clamp 到 [0, 墙高]。
- `segmentWall` band 行为:有 band 的 port 产出窗台+窗楣两段(而非整段镂空);无 band 维持整段镂空(门回归不破)。

3D 几何渲染本身不单测(无渲染断言能力),靠类型检查 + 构建 + 人工 3D 验证。

## 涉及文件

- 新增:`supabase/migrations/0XX_venue_item_window.sql`
- 改:`src/venue/layoutData.ts`(类型 + thickness + 默认)
- 改:`src/lib/venue/layout-sync.ts`(thickness 往返 + VenueItemRow)
- 改:`src/lib/venue/service.ts`(getVenueLayout select thickness)
- 改:`src/venue/Venue3DCanvas.client.tsx`(窗户匹配 + WallPort band + AreaWalls/segmentWall 窗台窗楣 + 玻璃构件 + 跳过默认盒)
- 改:`src/venue/VenueCanvas.tsx`(2D 窗户矩形 + 符号 + 配色)
- 改:`src/venue/VenueInspector.tsx`(thickness 输入 + window 立体区)
- 改:`src/app/[locale]/(app)/guild-venue/page.tsx`(+窗户按钮 + TOOL_ICON.window)
- 改:`messages/{zh,en,ja}.json`(addTypes/types/fieldThickness)

## 风险与隔离

- 主仓被并行会话高频改动 → 全程在 worktree `/Users/fengzhou/Code/newWith-window` 实现,完成后走 PR;合并若冲突再处理。
- 3D 墙体分段是本功能最复杂处:窗台/窗楣/玻璃三块的坐标与墙厚对齐要仔细,但门已铺好坐标系(area-local + side),按既有 `doorPose`/`segmentWall` 模式扩展即可。
