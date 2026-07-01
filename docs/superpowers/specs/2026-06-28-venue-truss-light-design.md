# 场地「桁架 + 吊灯」组件 — 设计文档

日期:2026-06-28
状态:已评审通过,待实现
实现隔离:独立 git worktree `/Users/fengzhou/Code/newWith-truss`(分支 `feat/venue-truss-light`),主仓被并行会话高频改动。

## 背景与目标

直播间常见吊顶布置:**灯光轨道/桁架**(黑色铝梁,贴天花)+ 从桁架**吊下来的柔光灯**(电动吊臂调高度)。当前场地 3D 没有对应组件(只能用「设备」空中盒近似)。

目标:新增两个组件 —— **桁架(truss)** 与 **吊灯(light)**。桁架是贴天花的横梁;吊灯自动吸附最近的桁架、从其下方吊下,渲染成球形/八角柔光箱,吊臂用一根竖直细杆表示。**不做布光(照度),只做物理组件几何。**

### 已确认决策

| 项 | 决策 |
|---|---|
| 桁架形状 | 单根直梁(可拖拽调长),要网格就拖多根拼 |
| 灯-桁架关系 | 灯**自动吸附**最近桁架、挂其下(复用门吸附墙的思路) |
| 灯 3D 形状 | 尽量还原球形/八角柔光箱(倒锥形,朝下开口) |
| 吊臂 | 一根**竖直细杆**连灯与桁架(不做剪刀伸缩结构) |
| 挂高 | 复用 `elevation`(离地高度);吊臂长 = 桁架高 − 灯高,渲染时算 |
| 新字段 | **无**(复用 elevation/height3d/footprint);仅扩展 DB type 约束 |

## 架构

### 1. 类型 — `src/venue/layoutData.ts`
- `VenueShapeType` 增加 `'truss'`、`'light'`(均为可缩放矩形,走 2D shape 分支)。
- 加入 `VENUE_ITEM_TYPE_OPTIONS`(下拉/筛选/`isVenueItemType` 校验必需)。
- 各默认表(`DEFAULT_SIZE`/`DEFAULT_3D`/`DEFAULT_THICKNESS`/`DEFAULT_PLACEMENT`/名称表)补两类:
  - **truss**:`DEFAULT_SIZE` 300×20(长梁);`DEFAULT_3D` `{ height3d: 15, elevation: 260 }`(梁粗 15cm、贴近层高);`placement: 'aerial'`;`thickness: 0`;名称如「桁架」。
  - **light**:`DEFAULT_SIZE` 70×70(灯罩直径);`DEFAULT_3D` `{ height3d: 40, elevation: 220 }`(灯罩高 40cm、挂在 220cm);`placement: 'aerial'`;`thickness: 0`;名称如「吊灯」。
- 无新字段;`thickness` 沿用现有(两类都 0)。

### 2. 数据库 — 迁移 `038_venue_item_truss_light.sql`
只扩展 type 约束(不加列):
```sql
alter table venue_items drop constraint venue_items_type_valid;
alter table venue_items add constraint venue_items_type_valid check (type in
  ('equipment','renovation','area','corridor','window',
   'door_inward','door_outward','door_sliding','fire','power','network',
   'truss','light'));
```
(本项目无 Supabase CLI,需用户在 SQL Editor 手动执行;因新代码不 select 新列,顺序不敏感,但插入 truss/light 前须先执行,否则违反 check。)

### 3. 3D 渲染 — `src/venue/Venue3DCanvas.client.tsx`

**(a) 桁架 beam**
- `truss` 渲染为一根细长 box(梁),尺寸 `[width, height3d, height]`(沿 footprint 宽为梁长,height3d 为梁粗),位置 y = `elevation + height3d/2`。深色材质(如 `#334155`),区别于普通设备盒。
- 与门/窗一样,`truss` 在渲染循环里**不走默认 `VenueItem3DMesh`**(单独渲染 beam mesh),或复用默认盒但套深色样式 —— 实现时二选一,优先单独 mesh 以便配深色。

**(b) 吊灯 softbox + 吊臂 + 吸附**
- **匹配(灯 → 最近桁架)**:新函数 `matchLightsToTrusses(items)`,对每个 light 求其中心到每根 truss「梁线段」的距离,取阈值内最近者,记录该 truss 的 `elevation`(作为吊臂顶端高度)。阈值用一个常量(如 `LIGHT_ATTACH_THRESHOLD = 120` cm)。无命中 → 不画吊臂。
- **softbox**:倒锥形 —— `coneGeometry(radius, coneH, 8)`(八角),底面(宽口)朝下、尖端朝上,radius = footprint 较小边/2,coneH = `height3d`。位置 y = `elevation + height3d/2`。材质深色外壳 `#1f2937`。
- **吊臂**:若匹配到桁架,从 softbox 顶部(y = `elevation + height3d`)竖直画一根细杆(细 box 或 cylinder,截面 ~4cm)上到 `truss.elevation`。杆位于灯的 (x,z)。深色 `#334155`。
- **不占面积**:aerial,不参与可用面积统计。
- 灯在渲染循环 `item.type === 'light'` 走独立渲染(softbox + 杆),不走默认盒。

### 4. 2D — `src/venue/VenueCanvas.tsx`
- `truss`:细长深灰矩形(`TYPE_STYLE` 加项,fill `#e2e8f0`/stroke `#334155`),沿长边可拖拽。
- `light`:小矩形(暖色,fill `#fef9c3`/stroke `#ca8a04`),中间画一个简单灯罩符号(圆或多边形)区分。
- 都走 `<VenueShape>`(非 marker)。

### 5. Inspector — `src/venue/VenueInspector.tsx`
- 复用现有「立体」区:truss 显示 离地(挂高)+ 高度(梁粗);light 显示 离地(挂高)+ 高度(灯罩高)。
- **不加新输入**;不显示地面/空中开关(truss/light 恒 aerial —— 把现有排除条件再加 `&& item.type !== 'truss' && item.type !== 'light'`,或复用已有对 window 的排除模式扩展)。

### 6. 入口 + 文案
- 工具栏新增顶层 **「+ 桁架」「+ 灯」** `ToolbarButton`(接在窗户/结构后面),`addItem('truss')`/`addItem('light')`。
- `TOOL_ICON.truss`(如 lucide `Minus`/`GitCommitHorizontal` 之类横梁感图标)、`TOOL_ICON.light`(`Lightbulb`)。
- `messages/{zh,en,ja}.json`:`addTypes.truss/light`、`types.truss/light`。

### 7. 天花板视角(3D 仰视预设)— `src/venue/Venue3DCanvas.client.tsx`

俯瞰(默认斜俯视)不方便看吊顶。新增一个 **「看天花板」预设**:一键把镜头切到**从室内往上看**(即照片那种仰视角度),直接看清桁架 + 吊灯布局。

- **交互**:3D 视图容器上叠一个小按钮「看天花板 / 俯瞰」(HTML overlay,绝对定位,或接入现有 3D 工具栏)。点击在「仰视天花板」与「默认俯视」之间切换/复位。
- **实现**:复用现有 `OrbitControls`(已 `makeDefault`)。用一个 `ceilingNonce` state,按钮点击 `+1`;`<Canvas>` 内一个小组件(`useThree` 拿到 `camera` 与 controls)监听 nonce 变化,把镜头设为仰视位姿:
  - 相机位置 ≈ 地面中心略高处 `[floor.width/2, 40, floor.height/2 + ε]`;
  - `controls.target` ≈ 天花板中心 `[floor.width/2, ceilingHeight, floor.height/2]`(ceilingHeight 取 `floor.floorHeight` 或场内最高 truss elevation);
  - 设置后 `controls.update()`;之后用户仍可自由 orbit。
- **不改**默认初始视角与其它 3D 行为;只是多一个预设入口。放到本 spec 里因为它正是为看桁架/吊灯而加。

## 测试

单测(`node --test`,纯函数):
- `addVenueItem('truss')` / `addVenueItem('light')` 默认值正确(尺寸/挂高/placement=aerial)。
- `matchLightsToTrusses`:若可提取为纯函数(输入 items → 每盏灯匹配到的 truss id/elevation)则单测(阈值内取最近、超阈值不匹配、无 truss 返回空)。若逻辑必须内嵌 client 组件,则靠 tsc+build+人工。

3D 几何(beam/softbox/杆)不单测,靠 `npx tsc --noEmit` + `next build` + 人工 3D 验证。

## 涉及文件
- 新增:`supabase/migrations/038_venue_item_truss_light.sql`
- 改:`src/venue/layoutData.ts`(两类型 + 各默认表 + 类型选项)
- 改:`src/venue/Venue3DCanvas.client.tsx`(truss beam + light softbox/杆 + 灯→桁架匹配 + 渲染循环跳过默认盒 + 「看天花板」仰视预设)
- 改:`src/venue/VenueCanvas.tsx`(2D truss/light 配色 + 符号)
- 改:`src/venue/VenueInspector.tsx`(排除 truss/light 的地面/空中开关)
- 改:`src/app/[locale]/(app)/guild-venue/page.tsx`(+桁架/+灯 按钮 + 图标)
- 改:`messages/{zh,en,ja}.json`(文案)

## 边界与已知限制
- 灯必须在阈值内靠近某根桁架才画吊臂;否则灯罩悬在自身 elevation、无杆。
- 吊臂是竖直细杆(灯在自己 x/z 竖直上引到桁架高度),不投影到梁线;灯明显偏离梁时杆不一定正好触梁 —— 建议把灯放在梁正下方附近。
- 桁架是单根直梁;网格靠拼多根。
- 不做布光/照度;柔光箱是纯几何外观。
- 3D 几何无自动断言,靠构建 + 人工。

## 风险与隔离
- 主仓被并行会话高频改动 → 全程在 worktree 实现,完成后走 PR。
- 复杂点在 3D:beam/softbox/杆的坐标与 elevation 对齐,以及灯→桁架匹配;门/窗已铺好 area-local + 高度坐标范式,按既有模式扩展。
