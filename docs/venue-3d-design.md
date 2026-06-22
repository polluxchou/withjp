# Venue 2D → 3D 可视化与编辑 技术设计

> 状态：Draft v0.1 · 2026-06-22
> 目标读者：WithJP 工程团队 / PMO
> 关联模块：`src/venue/`（VenueCanvas、VenueInspector、layoutData）
> 关联页面：`/guild-venue`

---

## 1. 需求摘要

在现有 2D 场地布置（俯视、可拖动、Inspector 编辑）基础上，新增 3D 可视化与编辑能力：**每个 item 增加"高度"维度后，可在 3D 视图里直接拖动并调高度**。

### 1.1 MVP 范围（已对齐）

| 维度 | MVP 选择 | 后续可扩展 |
|------|----------|-----------|
| 3D 能力 | **可编辑**（拖动 + 调高度 + 调 elevation + **绕 Y 旋转**） | 捕捉对齐线、3D 注释 |
| 视觉质感 | **色块 + 线框**，沿用 2D 的 `TYPE_STYLE` 色板 | PBR 材质、贴图、阴影 |
| Marker 表现 | **按类型默认高度 + 可调 elevation** | 自定义模型库（如真实灭火器） |
| 多楼层 | **一次只看一层**，与 2D 视图一致 | 全楼透明视图、楼层透视切换 |
| 视图切换 | 同一画布的 `2D / 3D` 模式 toggle | 并排联动、画中画 |

### 1.2 非目标

- 不做物理引擎 / 碰撞检测（拖动允许穿模，与 2D 一致）
- 不做光源调节（固定 ambient + directional）
- 不做 VR / AR / 第一人称视角
- 不做导入外部 3D 模型（.glb / .fbx）
- 不做 3D 视图独有的 item 类型（所有类型由 2D 模型驱动）

---

## 2. 技术选型

### 2.1 3D 库

| 候选 | 评估 | 结论 |
|------|------|------|
| **three.js + @react-three/fiber + @react-three/drei** | React 生态成熟；drei 提供 `OrbitControls` / `TransformControls` / `Edges` 等开箱组件；声明式 JSX 与现有代码一致 | ✅ **采用** |
| Babylon.js | 性能更强，但 React 集成偏弱，团队学习成本高 | 拒绝 |
| 纯 three.js（命令式） | 灵活，但要自己管理生命周期，与 React 18 / Next 14 抽象层不匹配 | 拒绝 |

### 2.2 加载方式

- **SSR 关闭**：Three 用到 `window`、`WebGL`，必须 `dynamic import` + `ssr: false`
- **按需加载**：3D 视图只在用户切到 3D 模式时才下载 chunk，避免污染 2D-only 用户的初始包

```tsx
// src/venue/Venue3DCanvas.client.tsx — 'use client'
// src/venue/index.ts
export const Venue3DCanvas = dynamic(
  () => import('./Venue3DCanvas.client'),
  { ssr: false, loading: () => <Venue3DLoading /> }
)
```

### 2.3 依赖增量

| 包 | 版本 | gzip 估算 |
|------|------|-----------|
| `three` | ^0.169 | ~170 KB |
| `@react-three/fiber` | ^8.17 | ~30 KB |
| `@react-three/drei` | ^9.114 | ~50 KB（tree-shake 后实际更小） |

> 总增量约 **250 KB gzip**，但全部在 3D chunk 内，不进主包。

---

## 3. 数据模型扩展

### 3.1 `VenueItem` 增加 2 个字段

```ts
export type VenueItem = {
  id: string
  type: VenueItemType
  name: string
  x: number
  y: number
  width: number
  height: number       // 已有：2D 平面 Y 方向（屏幕 cm）
  rotation: number
  status: VenueItemStatus
  note: string
  // —— 新增 ——
  height3d: number     // 沿 Z 轴拉伸高度（cm），从 elevation 起向上
  elevation: number    // 离地起始高度（cm），默认 0
}
```

> **命名说明**：避免和已有 `height`（2D 平面纵深）混淆 → 新字段叫 `height3d`。在 3D 渲染中：
> - `width`  → 3D X 长度
> - `height` → 3D Z 长度（地面方向）
> - `height3d` → 3D Y 拉伸高度（朝上）
> - `elevation` → 3D Y 起始位置

### 3.2 `VenueFloor` 增加 1 个字段

```ts
export type VenueFloor = {
  id: string
  name: string
  width: number
  height: number
  backgroundImage?: string
  items: VenueItem[]
  // —— 新增 ——
  floorHeight: number  // 楼层净高（cm），默认 280，决定 3D 视图天花板高度上限提示
}
```

> 不强制约束 `item.elevation + item.height3d <= floor.floorHeight`，仅在 Inspector 给出警示，与 2D 允许越界保持一致。

### 3.3 各类型的默认 `height3d` / `elevation`

```ts
const DEFAULT_3D: Record<VenueItemType, { height3d: number; elevation: number }> = {
  equipment:    { height3d: 100, elevation: 0   },  // 设备架，约 1m
  renovation:   { height3d: 280, elevation: 0   },  // 装修区域 = 墙，到顶
  area:         { height3d: 0,   elevation: 0   },  // 虚拟空间，只显示地面色块
  corridor:     { height3d: 0,   elevation: 0   },  // 通道，平面虚线带
  door_inward:  { height3d: 200, elevation: 0   },  // 门高 2m
  door_outward: { height3d: 200, elevation: 0   },
  door_sliding: { height3d: 200, elevation: 0   },
  fire:         { height3d: 60,  elevation: 0   },  // 灭火器立柱
  power:        { height3d: 15,  elevation: 30  },  // 插座，离地 30cm
  network:      { height3d: 10,  elevation: 30  },  // 网口，离地 30cm
}
```

### 3.4 兼容性 / 迁移

- `parseStoredVenueLayout` + `sanitizeVenueLayout` 在 sanitize 阶段对**老数据**：
  - 缺 `height3d` / `elevation`：按 `DEFAULT_3D[type]` 补
  - 缺 `floor.floorHeight`：补 280
- `addVenueItem` 创建时直接带上 `DEFAULT_3D[type]` 的值
- `normalizeVenueItem` 增加：`height3d >= 0`、`elevation >= 0`

### 3.5 测试增量

- `layoutData.test.ts` 增加 4 组用例：
  1. 老布局（无 height3d）→ sanitize 后补全字段
  2. `addVenueItem('equipment')` → height3d=100, elevation=0
  3. `normalizeVenueItem` 把负 height3d 截到 0
  4. `updateVenueItem` patch height3d → 写入成功且其他字段不变

---

## 4. 坐标系映射

### 4.1 2D ↔ 3D 坐标

```
2D 坐标系（SVG，原点左上，Y 向下）
    +X →
  +Y ↓

3D 坐标系（three.js，右手系，Y 向上）
        +Y ↑
     ←──┼──→ +X
        ↓
       +Z（朝屏幕外，即 2D 中的"Y 向下"方向）
```

**映射**：
| 2D | 3D |
|----|----|
| `x` | `x` |
| `y` | `z`（2D 越往下，3D 越往外） |
| `width` | X 长度 |
| `height` | Z 长度 |
| `rotation`（度，顺时针） | `-rotation` 弧度（绕 Y 轴） |
| —— | `height3d` Y 拉伸，`elevation` Y 偏移 |

> 这样视角默认从 +Y 向下看时，看到的就是 2D 视图的镜像（左右对、上下对），用户切换无方向迷失。

### 4.2 物体中心点

three.js 的 BoxGeometry 是中心在原点。Floor 平面以 `(0, 0, 0)` 为左前角放置。每个 item 的 mesh 位置：

```ts
position = [
  item.x + item.width  / 2,
  item.elevation + item.height3d / 2,
  item.y + item.height / 2,
]
rotation = [0, -degToRad(item.rotation), 0]
scale    = [item.width, item.height3d, item.height]   // 配 unit cube
```

> 用 `unit cube + scale` 而不是每次 new BoxGeometry，便于 instancing 优化（虽然 MVP 不一定上）。

---

## 5. 渲染策略

### 5.1 场景构成

```
<Canvas camera={{ position: [..., ..., ...], fov: 35 }}>
  <ambientLight intensity={0.6} />
  <directionalLight position={[1, 2, 1]} intensity={0.5} />

  <FloorGrid width={floor.width} depth={floor.height} />

  {floor.items.map(item => (
    <VenueItem3D
      key={item.id}
      item={item}
      selected={selectedItemIds.includes(item.id)}
      onSelect={...}
      onChange={...}
    />
  ))}

  <OrbitControls
    enableRotate
    enablePan
    enableZoom
    minPolarAngle={0}
    maxPolarAngle={Math.PI / 2 - 0.05}  // 不允许从地面下方看
  />

  {selectedItem && (
    <TransformControls
      object={selectedMeshRef}
      mode={transformMode}     // 'translate' | 'scale'
      showY={transformMode === 'scale'}     // 仅 Y 方向（拉高度）
      showX={transformMode === 'translate'}
      showZ={transformMode === 'translate'}
    />
  )}
</Canvas>
```

### 5.2 每个 item 的 3D 表达

- **占面积类**（equipment / renovation / area / corridor）：BoxGeometry + `meshStandardMaterial` 用 `TYPE_STYLE[type].fill`；用 `<Edges>` 加 `TYPE_STYLE[type].stroke` 描边
- **`height3d=0` 时**：所有类型一律退化为 1cm 薄面板（地面色块），只显示俯视轮廓，不挡视线
- **corridor 虚线**：2D 中是虚线边框，3D 中改为实线（虚线 box edge 在 three.js 里实现成本高），用色板自带的 `#fef3c7 / #d97706` 已足够辨识
- **marker 类**（门 / 灭火器 / 电源 / 网口）：BoxGeometry（按 item.width × height3d × item.height），同样色块 + 线框；不再像 2D 那样固定 32px 屏幕尺寸（3D 视图按实际尺寸）
- **状态指示**：`status='maintenance'` 时材质叠加 0.5 alpha 的红色 emissive（与 2D 状态徽章同色）
- **选中态**：`<Edges>` 颜色切到 `SELECTION_ACCENT = #f4511e`（沿用 2D 选中色）

### 5.3 楼层地面

```tsx
<mesh rotation={[-Math.PI/2, 0, 0]} position={[w/2, 0, d/2]}>
  <planeGeometry args={[w, d]} />
  <meshStandardMaterial color="#f8fafc" />
</mesh>
<gridHelper args={[Math.max(w, d), 20]} position={[w/2, 0.01, d/2]} />
```

如果 floor 有 `backgroundImage`：用 `useTexture(backgroundImage)` 当地面贴图（这是设计稿允许的少数贴图例外，因为它已经在 2D 用了）。

### 5.4 相机初值

- 视角：等距俯视，方位角 45°，仰角 50°
- 距离：`max(floor.width, floor.height) * 1.4`
- 视点：地面中心

```ts
const max = Math.max(floor.width, floor.height)
camera.position.set(floor.width/2 + max*0.8, max*0.9, floor.height/2 + max*0.8)
camera.lookAt(floor.width/2, 0, floor.height/2)
```

---

## 6. 编辑交互（关键复杂点）

### 6.1 选中 / 框选

| 操作 | 行为 |
|------|------|
| 单击 mesh | 选中该 item，OrbitControls 不响应 |
| 单击空地 | 清空选中 |
| Shift + 单击 | 切换该 item 在 selectedItemIds 中的存在 |
| 拖动空地 | OrbitControls 旋转（不做 3D 框选，复杂度太高） |

`raycaster` 用 R3F 的内置 `onClick(e)`，事件冒泡 `e.stopPropagation()`。

### 6.2 拖动平移

- 选中后显示 drei `<TransformControls mode="translate" showY={false} />`
- 监听 `objectChange`，把 mesh.position 映射回 `{ x, y }`（注意减回中心点偏移 + 反向映射 Z→Y）
- 拖动结束（`mouseUp`）发 `onItemChange({ x, y })`，进 history
- 拖动中实时更新本地 mesh 位置，**不每帧 push history**（与 2D 行为一致）

### 6.3 调高度

两个高度字段两种交互：

| 字段 | 3D 交互 | Inspector 交互 |
|------|---------|----------------|
| `height3d` | 切换到"高度"模式，TransformControls scale Y，拖动顶面句柄 | 数字输入（米） |
| `elevation` | 暂不开放 3D Gizmo（避免和 height3d 冲突） | 数字输入（米） |

> 决策：MVP 阶段只把 `height3d` 暴露给 3D Gizmo，`elevation` 必须从 Inspector 输入。避免在一根 Y 轴上塞两个独立 Gizmo 引发误操作。

### 6.4 模式切换栏

3D 画布顶部加一个浮层 toolbar：

```
[ 选择 ] [ 平移 ] [ 旋转 ] [ 高度 ]   ｜   [ 重置视角 ] [ 退出 3D ]
```

- 默认"选择"，单击只选中
- "平移" → TransformControls mode=translate（仅 X / Z，禁用 Y）
- "旋转" → TransformControls mode=rotate，**仅显示 Y 轴环**（`showX=false, showZ=false`），等价于 2D 平面内旋转
  - 拖动结束把弧度反向换算回 `rotation`（度），写回 layoutData，与 2D 互通
  - 角度做 0.5° 量化，避免出现 27.318° 这种脏数
  - `Shift` 拖动时切到 15° 整数对齐
- "高度" → TransformControls mode=scale + 仅 Y

### 6.5 OrbitControls 与 TransformControls 冲突

drei 的两者天然兼容：`<TransformControls>` 拖动时自动 disable 父级 OrbitControls。但要给 OrbitControls 加 `makeDefault` 让 drei 找到它。

---

## 7. Inspector 改造

`VenueInspector.tsx` 在尺寸（width / height）字段下方追加一个"立体"分区：

```
立体
┌──────────────────────────┐
│ 高度  [_____] m   ⓘ      │
│ 离地  [_____] m   ⓘ      │
│ ─────────────             │
│ 楼层净高（信息）：2.80 m  │
└──────────────────────────┘
```

- 单位 m（与 2D 字段一致），存的是 cm（用现有 `centimetersToMeters` / `metersToCentimeters`）
- area / corridor 类型：默认 `height3d=0`（保持现有视觉），但**允许用户输入 > 0** 把它"立起来"，常见用法是 area 作为矮挡板分区、corridor 作为地面凹槽/凸起标识
- `height3d=0` 时 3D 中退化为 1cm 薄面板（地面色块）；`>0` 时正常拉伸
- 楼层净高显示在底部，纯信息性，不联动校验

### 7.1 楼层 Inspector

floor 级别的 settings 浮层（VenueCanvas 现有的"设置"面板）追加：
- 楼层净高（m），默认 2.80

---

## 8. 视图切换 UI

VenueCanvas 现在有 zoom + grid 等工具栏，再加一个**模式切换段**：

```
[ 2D ] [ 3D ]
```

- 切到 3D 时：
  - 卸载 VenueCanvas SVG，挂载 Venue3DCanvas（dynamic 加载，loading 转圈）
  - 选中状态、当前楼层、selectedItemIds 跨模式保留（页面级状态）
  - undo/redo / 复制粘贴 / 删除等键盘快捷键继续工作
- 切到 2D 时：
  - 3D 中的相机视角丢弃（再切回 3D 时重置）
  - 楼层切换、Inspector 不动

> 决策：**不做并排联动**。性能、移动端、复杂度三个都不划算。

---

## 9. 性能与可达性

| 维度 | 策略 |
|------|------|
| FPS | 50 个 item 以下 60fps 无忧；100 个时考虑 `<Instances>` 把同类合批（MVP 不做） |
| 内存 | 切换楼层时 dispose 上一楼层的 geometries / materials（R3F 自动） |
| 移动端 | 3D 模式默认不在 mobile 显示，工具栏的"3D"按钮在 `md` 断点以下隐藏；显式提示"3D 模式建议在桌面端使用" |
| 键盘 | TransformControls 支持 `Esc` 取消选择；自定义 `Q/W/E` 切换 select/translate/scale 模式（与 Blender 风格一致） |
| 无 GPU 兜底 | R3F 在 WebGL 不可用时抛错，包一层 ErrorBoundary，fallback 到 2D 视图 + toast 提示 |

---

## 10. 文件改动清单

| 文件 | 变更 |
|------|------|
| `src/venue/layoutData.ts` | 新增 `height3d` / `elevation` / `floorHeight` 字段；DEFAULT_3D 表；sanitize / normalize / addVenueItem 适配 |
| `src/venue/layoutData.test.ts` | 增加迁移、默认值、归一化测试 |
| `src/venue/VenueInspector.tsx` | 立体分区（高度 / 离地）+ 楼层净高显示 |
| `src/venue/VenueCanvas.tsx` | 工具栏加 2D/3D 切换按钮；externalize 当前模式 state |
| `src/venue/Venue3DCanvas.client.tsx` | **新增** — R3F 场景、TransformControls、模式切换栏 |
| `src/venue/VenueItem3D.tsx` | **新增** — 单个 item 的 mesh + edges + 选中态 |
| `src/venue/Venue3DLoading.tsx` | **新增** — dynamic loading fallback |
| `src/app/[locale]/(app)/guild-venue/page.tsx` | 透传 mode state 到 VenueCanvas / Venue3DCanvas |
| `messages/zh.json` / `messages/en.json` | 新增文案：高度、离地、楼层净高、3D 提示、移动端不支持等 |
| `package.json` | 加 `three` / `@react-three/fiber` / `@react-three/drei` |

---

## 11. 落地路径

| 阶段 | 内容 | 完成标志 | 估算 |
|------|------|----------|------|
| **S1 数据模型** | layoutData 字段扩展 + sanitize + 测试 | 老布局打开后字段自动补全；新增 item 带默认 3D 字段；测试全过 | 0.5d |
| **S2 Inspector** | 立体分区 + 楼层净高 | 在 2D 模式下用 Inspector 改 height3d，数据写入正确 | 0.5d |
| **S3 3D 只读视图** | Venue3DCanvas、VenueItem3D、相机、地面、OrbitControls | 切到 3D 能看到正确的色块 + 线框；楼层切换正常；选中态正确 | 1.5d |
| **S4 3D 编辑** | TransformControls 平移 + Scale Y + **Rotate Y**；模式切换栏；与 history 联动；角度量化与 Shift 对齐 | 在 3D 中拖动 / 旋转 / 拉高 item 后 2D 同步；undo/redo 工作 | 2.0d |
| **S5 打磨** | 移动端兜底、加载态、键盘快捷键、文案、E2E 验证 | 桌面端流畅、移动端优雅降级；i18n 完整 | 0.5d |

**总计：约 5 个工作日**

---

## 12. 待确认项

### 已决策（2026-06-22）

| # | 决策 | 影响 |
|---|------|------|
| 1 | **3D 支持旋转编辑** — TransformControls 仅显示 Y 轴环，0.5° 量化，Shift 切 15° 对齐 | 进 S4，工作量 +0.5d |
| 4 | **floor.backgroundImage 在 3D 当地面贴图** — 复用 `useTexture`，地面 mesh 替换为带贴图的 standardMaterial；无 backgroundImage 时退回纯色 + gridHelper | 零额外字段；S3 内消化 |
| 5 | **toolbar 加"截图为 PNG"** — Canvas 内调 `gl.domElement.toDataURL('image/png')`，触发下载；文件名 `venue-3d-{floorName}-{yyyymmddhhmm}.png` | 进 S5，约 1h |
| 6 | **area / corridor 允许 height3d > 0** — 默认仍是 0（兼容现状），用户可在 Inspector 自由输入 | Inspector 不再做"禁用 / 启用"二段交互，统一是数字输入 |

### 仍待确认

| # | 问题 | 默认建议 | 需要决策 |
|---|------|----------|----------|
| 2 | 是否允许在 3D 中**新建** item | 不允许，必须先在 2D 新建 | 是否进 MVP（建议不进） |
| 3 | 3D 视图是否需要**测距工具** | 不需要 | 业务是否真用到 |
| 7 | 3D 模式下是否支持多选拖动 | 仅支持单选编辑，多选只能高亮 | 多选拖动会让 TransformControls 复杂度上升一档 |
