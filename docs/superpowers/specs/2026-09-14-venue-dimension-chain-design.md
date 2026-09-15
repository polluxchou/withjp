# 场地布置 · 尺寸链标注 — 设计说明（spec）

## 目标

成本管理 → 场地布置（`/guild-venue`）的 2D 画布，支持两种互相独立的整体尺寸标注：

1. **外轮廓总尺寸**（已有，不改口径）：按画布内组件的整体外边缘给出总长、总宽。
2. **尺寸链**（新增）：沿外轮廓的一条边，把贴边那一排组件依次量出来，相邻组件即为分段点，每段直接标该段的尺寸数值。

两者可并存，也可单独只开其中一种，还可以都关。

用户当前是**手工摆一排「尺」代理组件**来凑出效果（截图里顶部那条 `0.48m | 2.55m | 3.95m …`），靠每个代理件自带的组件标尺拼成一条链。本次要做的就是把这件事自动化，并且新标注只画尺寸数值，不需要代理组件实体。

## 现状（investigation 摘要）

- 画布：`src/venue/VenueCanvas.tsx`（1276 行），SVG 直接画，`viewBox` 用楼层坐标，单位是 **厘米**（`formatVenueMeasurement()` → `centimetersToMeters()`）。
- `scale` = 屏幕 px / 楼层单位。任何要保持恒定屏幕尺寸的装饰都写成 `px / scale`。
- 现有三套标注，全部由**同一个** `showRulers` 布尔量控制：
  - `DimensionRulers`（`VenueCanvas.tsx:1139`）：每个组件自己的长宽标尺，偏移 `14/scale`。
  - `PairDistanceRulers`（`:1069`）：选中两个组件时的间距。
  - `TotalBoundsRulers`（`:1217`）：外轮廓总尺寸，偏移 `80/scale`，红色；**只统计 `area`（空间）类型**（`isVenueSpaceType`）。
- 开关在 `src/app/[locale]/(app)/guild-venue/page.tsx:969`，一个 `ToolbarButton`，`useState` 存在会话内、不持久化。
- 组件类型：`空间/区域/设备` 是矩形实体，`结构(corridor)/窗户/桁架/灯具` 也按矩形渲染，`门/消防/电源位/网络口` 是 `VENUE_MARKER_TYPE_OPTIONS` 里的**标识小图标**（`isVenueMarkerType`）。
- 旋转：`transform={rotate(${item.rotation} ${cx} ${cy})}`，角度制、绕中心。
- 样式门禁 `scripts/check-style-tokens.mjs` 的 WHITELIST 是**逐文件**列举的，`src/venue/VenueCanvas.tsx` 在内、新文件不在。

## 分段算法

放在新文件 `src/venue/dimensionChain.ts`，纯函数、不碰 React。

```ts
export type DimensionChainAxis = 'horizontal' | 'vertical'

export type DimensionChainSegment = {
  start: number          // 沿轴起点（cm）
  end: number            // 沿轴终点（cm）
  length: number         // end - start
  itemId: string | null  // null 表示空隙段
}

export function planDimensionChain(
  items: VenueItem[],
  axis: DimensionChainAxis,
): DimensionChainSegment[]
```

`horizontal` = 顶部那条横链，`vertical` = 左侧那条竖链。下面按 `horizontal` 描述，`vertical` 把 x/y、width/height 对调即可。

### 1. 候选组件

`items.filter(it => !isVenueMarkerType(it.type))`。标识类是小图标不是面积体，量它没有意义。

`rotation !== 0` 的组件取**外接正矩形**（绕中心旋转后的 AABB）：

```
θ = rotation * π / 180
w' = |w·cosθ| + |h·sinθ|
h' = |w·sinθ| + |h·cosθ|
```

中心不变，据此反推 AABB 的 x/y。候选为空则返回 `[]`。

### 2. 贴边带

```
nearEdge   = min(c.y)                     // 顶部链取最小 y
farEdge    = max(c.y + c.height)
bandDepth  = clamp(0.10 * (farEdge - nearEdge), 60, 200)   // cm
band       = candidates.filter(c => c.y <= nearEdge + bandDepth)
```

10% 自适应 + 夹在 0.6m–2.0m，是这套规则**唯一**的可调参数。用户那层楼纵向跨 15.7m → 带深 1.57m：贴着上墙的柱子、化妆间、后门都在带内，深处的楼梯落在带外。

### 3. 谁切谁：面积小的赢

被外层空间包住的组件**要**当分段点（用户明确确认）。所以主直播间会被柱、化妆间、后门切开，而不是反过来把它们盖掉。

实现不用「涂色覆盖」（浮点重叠难缠），改成**边界切片**：

1. 收集 band 内所有组件的 `x` 与 `x + width`，并入链的跨度端点 `spanStart = min(c.x)` / `spanEnd = max(c.x + c.width)`，去重排序 → 得到若干**切片**。
2. 每个切片取中点，找出所有覆盖该中点的 band 成员，选**面积最小**的那个当 owner；面积相同则按 `id` 字典序取小，保证确定性。
3. 没有成员覆盖 → `owner = null`（空隙段）。

### 4. 成段

相邻同 owner 的切片合并成一段，`length = end - start`。长度小于 0.5cm 的段丢弃（浮点噪声）。

一个被切开的组件会贡献**多段**，每段标注的是**这一段自身的长度**，不是组件全宽。这是刻意的：整条链首尾相加严格等于该方向的跨度，符合施工图尺寸链的规矩，也和用户手摆的那条链行为一致。

### 5. 标签分排（同文件，独立纯函数）

```ts
export function layoutChainLabels(
  segments: DimensionChainSegment[],
  options: { labelWidth: (segment: DimensionChainSegment) => number; minGap: number },
): { index: number; row: number }[]
```

贪心区间装箱：按顺序遍历，记录每一排已占用的最右端，把标签放进**能放下它的最小排号**。第 0 排就是链线正上方，往上逐排错开。窄段因此自动被推到第二、第三排并拉引线（示意图里那三个 `0.40m`）。

`labelWidth` 由调用方传入（渲染层用 `文本长度 × 0.62 × 字号` 估算），算法本身不依赖字体度量，方便测。

## 渲染

新文件 `src/venue/DimensionChain.tsx`，一个哑组件，只吃几何数字：

```tsx
<DimensionChain
  segments={...}
  axis="horizontal"
  baseline={number}   // 链线所在的 y（横链）或 x（竖链）
  anchor={number}     // 引线要拉到的那条近边
  scale={number}
/>
```

- **层位**：组件标尺 `14/scale` → **尺寸链 `50/scale`** → 外轮廓总尺寸 `80/scale`，由内到外互不打架。竖链走左侧（`minX - 50/scale`），而红色总尺寸的高度标尺在右侧，天然错开。
- **配色**：青绿 `#0d9488`（线）/ `#0f766e`（字），和组件标尺的灰 `#64748b`、总尺寸的红 `#ef4444` 三者区分开。
- **空隙段**：链线画虚线、标签降一档明度。
- 端点刻度 `6/scale`、线宽 `1.6/scale`、字号 `11/scale`，文字带白色 `paintOrder="stroke"` 描边（沿用现有标注的可读性做法）。
- 引线：从刻度拉到组件近边，`0.8/scale`、`opacity 0.3`。
- 竖链标签 `transform={rotate(-90 …)}`。

### 跨度口径

尺寸链统计所有非标识组件，红色总尺寸只统计空间类型，所以两条标注的端点可能对不齐（用户截图里本来就是这样，绿尺条比红框宽）。**各算各的，不强行对齐**。

## 开关与 i18n

`VenueCanvas` 的 `showRulers: boolean` 换成：

```ts
export type VenueRulerOptions = {
  items: boolean       // 组件标尺 + 双选间距
  totalBounds: boolean // 外轮廓总尺寸
  chain: boolean       // 尺寸链
}
```

页面 `useState<VenueRulerOptions>({ items: true, totalBounds: true, chain: false })`，与 `showGrid` 一样只活在会话内。

工具栏那个 `Ruler` 按钮改成弹层：复刻 `page.tsx:1700` 的 `AddMenu` 写法（`useRef` + `mousedown` 关闭 + `position: fixed` 定位），面板里三个 checkbox。按钮的 `active` 取三者任一为真。

i18n 在 `messages/{zh,en,ja}.json` 的 `venue` 命名空间下新增：

| key | zh | en | ja |
| --- | --- | --- | --- |
| `rulerMenu.items` | 组件标尺 | Item rulers | 部材寸法 |
| `rulerMenu.totalBounds` | 外轮廓总尺寸 | Overall size | 全体寸法 |
| `rulerMenu.chain` | 尺寸链 | Dimension chain | 寸法チェーン |

现有 `venue.dimensionRulers`（尺寸标尺）留作按钮的 `aria-label` / `title`。

## 代码落点

`VenueCanvas.tsx` 已经 1276 行，新逻辑一律不往里塞：

| 文件 | 动作 |
| --- | --- |
| `src/venue/dimensionChain.ts` | 新增。`planDimensionChain` + `layoutChainLabels`，纯函数。 |
| `src/venue/dimensionChain.test.ts` | 新增。见下。 |
| `src/venue/DimensionChain.tsx` | 新增。SVG 渲染件。 |
| `src/venue/VenueCanvas.tsx` | 改 props（`showRulers` → `rulerOptions`）、挂载尺寸链、`useMemo` 缓存两条链。 |
| `src/app/[locale]/(app)/guild-venue/page.tsx` | 状态改成 `VenueRulerOptions`，新增 `RulerMenu` 弹层组件。 |
| `messages/{zh,en,ja}.json` | 三语同步加 key。 |
| `package.json` | `test` 脚本尾部登记新测试文件（否则永远不跑）。 |
| `scripts/check-style-tokens.mjs` | WHITELIST 加 `src/venue/DimensionChain.tsx` 并写明理由。 |
| `docs/design-system.md` §7 | 同步登记上面这条豁免（门禁脚本注释里的硬要求）。 |

## 测试

`src/venue/dimensionChain.test.ts`（`node --test --experimental-strip-types`，纯类型 import 要写内联 `type`）：

1. 单个组件 → 一段，长度等于组件宽。
2. 两个相邻组件 → 两段，无空隙段。
3. 两个组件之间留空 → 中间出现 `itemId === null` 的空隙段。
4. 嵌套：大空间 + 带内小柱 → 三段，柱在中间；**三段之和 === 跨度**。
5. 带外的深处组件（如楼梯）不参与分段。
6. 标识类组件（门/消防/电源位）被排除。
7. 旋转 45° 的组件按外接矩形参与。
8. `vertical` 轴上同样成立（第 4 条的转置用例）。
9. 面积相同的两个组件重叠时，owner 取 `id` 小的那个（确定性）。
10. `layoutChainLabels`：宽段留在第 0 排；连着两个窄段被推到不同排；标签不重叠。

渲染层不写单测（SVG 结构断言性价比低），靠实机验证。

## 实机验证

worktree 里主仓的 `preview_start` 会跑到主仓去，必须手动 `npx next dev --port <其它端口>`（见记忆「worktree 实机预览配方」）。要看的：

- 三个勾选项的 8 种组合都正确生效，互不牵连。
- 用户那层楼的顶部链是否接近他手摆的那 7 段；带深 1.57m 是否把柱子都收进来、把楼梯排除。
- 缩放到 50% 和 300%，标签分排是否仍然不重叠、链线是否仍贴在总尺寸内侧。
- 拖动组件时链实时重算，不卡顿。

## 不做（YAGNI）

- 不动 3D 视图（`Venue3DCanvas`）。
- 不做下边 / 右边的链——只做顶部 + 左侧。
- 不给贴边带深度开 UI 调节入口，先用自适应公式，实机不满意再谈。
- 开关不持久化（与现有 `showGrid` / `showRulers` 一致）。
- 不改外轮廓总尺寸「只算空间类型」的既有口径。
