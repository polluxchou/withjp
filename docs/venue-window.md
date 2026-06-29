# 场地「窗户」组件 — 产品需求 & 技术实现

> 更新时间：2026-06-28 · 状态：✅ 已上线（[PR #97](https://github.com/polluxchou/withjp/pull/97)）
> 主入口：`/zh/guild-venue` · 代码：`src/venue/`、`src/lib/venue/`、`src/app/[locale]/(app)/guild-venue/`
> 相关文档：
> - [docs/venue.md](./venue.md) — 场地布置整体实现状态（对齐基准）
> - [docs/venue-3d-design.md](./venue-3d-design.md) — 3D 立体能力设计 RFC
> - [docs/superpowers/specs/2026-06-28-venue-window-component-design.md](./superpowers/specs/2026-06-28-venue-window-component-design.md) — 本功能设计稿
> - [docs/superpowers/plans/2026-06-28-venue-window-component.md](./superpowers/plans/2026-06-28-venue-window-component.md) — 本功能实现计划

---

## 1. 产品需求

### 1.1 背景
场地画布的 3D 视图会把「空间」(area) 渲染成四面墙围合的房间，并已支持门在墙上挖洞。但墙体此前都是封闭的，无法表达**窗户**——而窗户是直播间布置里常见的采光/通风要素，需要在平面规划和 3D 预览里都能体现。

### 1.2 目标用户故事
- 作为场地规划者，我想在平面图上**摆一个窗户并调整它的宽度**，让它贴在某面墙上。
- 切到 3D 视图时，我希望那面墙在窗户位置**挖出一个抬高的窗洞**（不是从地面通到顶），窗下保留窗台、窗上保留窗楣，洞里有玻璃，这样房间的采光关系一眼可读。
- 我想能配置窗户的**离地高度**（窗台多高）、**高度**（窗多高）、**厚度**（玻璃在墙厚方向的进深）。
- 两个相邻空间共享一面墙时，窗户应该**两侧都开**，而不是只开一侧、看起来像穿墙。

### 1.3 功能范围（已交付）
| 能力 | 说明 |
|---|---|
| 添加窗户 | 工具栏「+ 窗户」按钮，添加到当前楼层 |
| 2D 编辑 | 窗户是**可拖拽缩放的矩形**（青色），宽度即沿墙开口宽；可移动/旋转/选中/撤销，与其它形状一致 |
| 3D 挖墙 | 窗户自动吸附最近的空间墙体，在该墙挖出抬高的矩形洞，渲染**窗台块 + 窗楣块 + 半透明玻璃** |
| 共享墙 | 相邻空间共享的墙两侧都开窗 |
| 可配置 | Inspector「立体」区：离地高度（m）、高度（m）、**厚度（cm）** |
| 不占面积 | 窗户挂在墙上（placement=aerial），不计入「可用面积」统计 |
| 多语言 | 中/英/日：`+ 窗户` / `+ Window`、`窗户` / `Window`、`厚度` / `Thickness` / `厚さ` |

### 1.4 不在范围内（YAGNI / 后续可选）
- 窗户与墙面角度的精细对齐（当前按 footprint 沿墙投影取开口宽，未处理任意旋转下的斜窗）。
- 窗框样式 / 多扇窗 / 推拉窗动画（玻璃是单块半透明面，无窗框分格）。
- 窗洞被相邻非空间组件遮挡时的剔除。

---

## 2. 技术实现

### 2.1 类型与数据模型 — `src/venue/layoutData.ts`
- `window` 归入 **`VenueShapeType`**（`'equipment' | 'renovation' | 'area' | 'corridor' | 'window'`）——因此 2D 自动走「可缩放矩形」分支（非 marker 固定点）。
- `VenueItem` 新增字段 **`thickness: number`**（cm，墙厚方向进深；非窗户类型为 0）。
- 窗户默认值（按类型查表，见 `DEFAULT_SIZE` / `DEFAULT_3D` / `DEFAULT_THICKNESS` / `DEFAULT_PLACEMENT`）：

  | 维度 | 默认 | 字段 |
  |---|---|---|
  | 宽 × 高（footprint） | 120 × 24 | `width` / `height` |
  | 离地高度（窗台） | 90 cm | `elevation`（复用） |
  | 窗户竖直高度 | 120 cm | `height3d`（复用） |
  | 厚度（进深） | 8 cm | `thickness`（新增） |
  | 摆放 | aerial（挂墙、不占地） | `placement` |

- `window` 加入 `VENUE_ITEM_TYPE_OPTIONS`（驱动 Inspector 类型下拉、图层/筛选面板，以及 `isVenueItemType` 校验——**必须在此列表里，否则存储的窗户在解析时会被类型校验拒绝**）。

### 2.2 持久化链路
- DB：迁移 `036_venue_item_window.sql` —— `venue_items.type` 约束加入 `'window'`；新增列 `thickness integer not null default 0`。
- `src/lib/venue/layout-sync.ts`：`VenueItemRow` 增 `thickness`；`layoutToRows` 写出 `item.thickness`，`rowsToLayout` 读回 `item.thickness ?? 0`（兼容旧行）。
- `src/lib/venue/service.ts`：`getVenueLayout` 的 venue_items `select` 增加 `thickness` 列。
  - ⚠️ **部署顺序**：因为 `getVenueLayout` 会 select `thickness`，**迁移 036 必须先于代码部署**，否则场地页查询会因列不存在而报错。该迁移对旧代码向后兼容（加列 + 放宽约束）。

### 2.3 3D 挖墙渲染（核心）— `src/venue/Venue3DCanvas.client.tsx`
复用并扩展既有的「门 → 墙」机制：

**(a) 匹配（窗户 → 带 band 的 WallPort）**
- `WallPort` 类型扩展为 `{ offset, width, sourceId, band?: { bottom, top }, thickness? }`。
  - 门：无 `band` ⇒ 满高开口（0 → 墙顶），保持原行为。
  - 窗：带 `band = { bottom: elevation, top: elevation + height3d }` ⇒ 抬高的矩形开口。
- 匹配几何复用门的「area-local 坐标 + 最近墙 + offset clamp」；差异：
  - 开口宽 = footprint 沿墙投影（N/S 墙取 `win.width`，W/E 墙取 `win.height`）。
  - push 带 `band` + `thickness` 的 port；**不**写 `doorPlacements`（玻璃在墙体渲染里内联生成，无需独立构件 pose）。
  - 共享墙：对每个匹配到的空间都 push 一个 port ⇒ 两侧都开。
- 渲染循环里 `item.type === 'window'` **返回 null**（窗户不渲染默认实体盒，只参与挖墙 + 玻璃）。

**(b) 墙体渲染（窗台 / 窗楣 / 玻璃）— `AreaWalls`**
- `segmentWall(length, ports)` 不变：它按所有 port 的**水平**区间把墙切成实心段（窗户 port 的水平段同样被切掉 ⇒ 形成满高缺口）。
- 新增 `bandBlocks(side, port)`：仅对带 `band` 的 port，在其水平区间内补回：
  - **窗台块**：y ∈ [0, band.bottom]，满墙厚 `AREA_WALL_THICKNESS`(10cm)。
  - **窗楣块**：y ∈ [band.top, 墙高]，满墙厚。
  - **玻璃**：y ∈ [band.bottom, band.top]，进深 = `port.thickness`，半透明蓝（`#bae6fd`, opacity 0.45），居中嵌在墙厚里。
  - band 在此 clamp 到 `[0, height]`（墙高），避免窗高超过墙时溢出。
  - 坐标沿用既有 wall-box 写法：N/S 沿 X 轴、z 固定在 `±depth/2∓t/2`；W/E 沿 Z 轴、x 固定在 `±width/2∓t/2`。

### 2.4 2D / Inspector / 入口
- **2D**（`src/venue/VenueCanvas.tsx`）：窗户走 `<VenueShape>`（可缩放矩形），`TYPE_STYLE` 配青色（fill `#cffafe` / stroke `#0891b2`）。
- **Inspector**（`src/venue/VenueInspector.tsx`）：`type === 'window'` 时「立体」区显示 离地高度(m) + 高度(m) + **厚度(cm)**（厚度为 cm 原值输入，不做米换算）；窗户**不显示**地面/空中开关（placement 恒为 aerial）。
- **入口**（`src/app/[locale]/(app)/guild-venue/page.tsx`）：工具栏「+ 结构」之后新增「+ 窗户」`ToolbarButton`，图标 `TOOL_ICON.window = AppWindow`（lucide）。
- **文案**（`messages/{zh,en,ja}.json`）：`venue.addTypes.window`、`venue.types.window`、`venue.fieldThickness`。

---

## 3. 边界与已知限制
- **离玻璃需墙**：窗户必须吸附到某个空间(area)的墙才会挖洞/出玻璃；不靠墙的窗户在 3D 里不显示（2D 仍是个矩形）。吸附阈值复用门的 `DOOR_ATTACH_THRESHOLD`。
- **旋转**：开口宽按 footprint 的世界宽/高取，未严格处理任意角度斜窗；窗户建议与墙平行摆放。
- **窗高超墙**：band 顶被 clamp 到墙高，超出部分不渲染窗楣（窗楣高度为 0）。
- **3D 几何无自动测试**：R3F 渲染无法单测，靠 `tsc` + `next build` + 人工 3D 验证；几何坐标系沿用成熟的门/墙逻辑。

## 4. 测试与验证
- 单测（`node --test`）：`addVenueItem('window')` 默认值、每个 item 带 `thickness`、`layout-sync` 的 `thickness` 往返。`npm test` 全绿（170）。
- 人工：在场地页加窗户、贴墙、切 3D，调 离地/高度/厚度看实时变化、共享墙两侧开窗。

## 5. 涉及文件
| 文件 | 改动 |
|---|---|
| `supabase/migrations/036_venue_item_window.sql` | 新增：type 约束加 window + thickness 列 |
| `src/venue/layoutData.ts` | window 类型 + thickness + 各默认表 + 类型选项 |
| `src/lib/venue/layout-sync.ts` | thickness 往返 + `VenueItemRow` |
| `src/lib/venue/service.ts` | `getVenueLayout` select thickness |
| `src/venue/Venue3DCanvas.client.tsx` | 窗户匹配 + WallPort.band + `bandBlocks`（窗台/窗楣/玻璃）+ 跳过默认盒 |
| `src/venue/VenueCanvas.tsx` | 2D 窗户矩形配色 |
| `src/venue/VenueInspector.tsx` | 厚度输入 + 排除地面/空中开关 |
| `src/app/[locale]/(app)/guild-venue/page.tsx` | 「+ 窗户」按钮 + `TOOL_ICON.window` |
| `messages/{zh,en,ja}.json` | addTypes/types/fieldThickness 文案 |

## 6. 后续可选迭代
- 窗框分格 / 多扇窗 / 推拉窗。
- 任意旋转下的斜窗开口对齐。
- 窗户也能挂在「结构(corridor)」等非空间墙体上（当前仅吸附 area 墙）。
