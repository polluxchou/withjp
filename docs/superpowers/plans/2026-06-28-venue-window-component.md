# 场地「窗户」组件(3D 挖墙)Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** 新增 `window` 组件:画布上可拖拽矩形,3D 视图在对应空间墙体上挖一个抬高的矩形洞(窗台+窗楣保留),洞里嵌半透明玻璃;支持配置离地高度(elevation)、高度(height3d)、厚度/进深(新字段 thickness)。

**Architecture:** `window` 归 `VenueShapeType`(宽度即 footprint,不计面积)。3D 复用门的「吸附最近空间墙体」匹配,但产出**带竖直 band 的 WallPort**;`AreaWalls` 在窗洞水平区间渲染窗台块+窗楣块+玻璃。复用现有 `elevation`/`height3d`,仅新增 `thickness`(cm)。

**Tech Stack:** Next.js + React Three Fiber(@react-three/drei)+ Supabase + `node --test --experimental-strip-types`。

**工作目录:** 全程在 worktree `/Users/fengzhou/Code/newWith-window`(分支 `feat/venue-window`)。所有命令/路径用此绝对路径。提交前 `git -C /Users/fengzhou/Code/newWith-window branch --show-current` 必须为 `feat/venue-window`。

**可测性说明:** Task 1/2 是纯数据逻辑,走 TDD(node --test)。Task 4/5/6 在 `Venue3DCanvas.client.tsx`/`VenueCanvas.tsx`(引入 three/react),不单测,靠 `npx tsc --noEmit` + `next build` + 人工 3D 验证。

---

### Task 1: layoutData — 类型 `window` + `thickness` 字段 + 默认

**Files:**
- Modify: `src/venue/layoutData.ts`
- Test: `src/venue/layoutData.test.ts`(已在 package.json test 脚本)

- [ ] **Step 1: 写失败测试**

在 `src/venue/layoutData.test.ts` 末尾追加(若 `addVenueItem` 未在导入块,加入现有 `from './layoutData.ts'` 导入):

```ts
test('addVenueItem(window): 带窗户默认 离地/高度/厚度', () => {
  const layout = addVenueItem(DEFAULT_VENUE_LAYOUT, DEFAULT_VENUE_LAYOUT.floors[0].id, 'window')
  const added = layout.floors[0].items[layout.floors[0].items.length - 1]
  assert.equal(added.type, 'window')
  assert.equal(added.placement, 'aerial')
  assert.equal(added.elevation, 90)
  assert.equal(added.height3d, 120)
  assert.equal(added.thickness, 8)
})

test('每个 item 都带 thickness(默认 0)', () => {
  const eq = addVenueItem(DEFAULT_VENUE_LAYOUT, DEFAULT_VENUE_LAYOUT.floors[0].id, 'equipment')
  const added = eq.floors[0].items[eq.floors[0].items.length - 1]
  assert.equal(added.thickness, 0)
})
```

(若 `DEFAULT_VENUE_LAYOUT` 未导入,加入导入。)

- [ ] **Step 2: 运行,确认失败**

Run: `cd /Users/fengzhou/Code/newWith-window && npm test`
Expected: FAIL(`thickness` 未定义 / window 不是合法类型 / 默认不匹配)。

- [ ] **Step 3: 实现**

在 `src/venue/layoutData.ts`:
1. `VenueShapeType` 增加 `'window'`:
   ```ts
   export type VenueShapeType = 'equipment' | 'renovation' | 'area' | 'corridor' | 'window'
   ```
2. `VenueItem` 增加字段(放在 `elevation` 之后):
   ```ts
   // 墙厚方向进深(cm),仅窗户用于 3D 玻璃构件厚度;其它类型为 0。
   thickness: number
   ```
3. 找到所有**构造 VenueItem 的地方**(种子数据 `DEFAULT_VENUE_LAYOUT` 里每个 item 字面量、`addVenueItem`、`applyVenueAction` 等)补 `thickness`。最稳妥:`grep -n "elevation:" src/venue/layoutData.ts`,每个写了 `elevation:` 的 item 字面量同步加 `thickness: 0`(种子数据全 0)。
4. `DEFAULT_PLACEMENT` 增加 `window: 'aerial'`。
5. `addVenueItem`:为 `window` 设默认尺寸与立体参数。先 `grep -n "function addVenueItem\|const DEFAULT_SIZE\|DEFAULT_" src/venue/layoutData.ts` 看它如何取默认尺寸;在新建 item 时,按 type 给默认:window ⇒ `width:120, height:24, elevation:90, height3d:120, thickness:8, placement:'aerial'`;其它类型 `thickness:0`、`elevation`/`height3d` 维持现状。确保返回的 item 一定带 `thickness`。

- [ ] **Step 4: 运行,确认通过**

Run: `npm test`
Expected: PASS(2 条新用例 + 既有 layoutData 用例全绿)。

- [ ] **Step 5: 提交**

```bash
git -C /Users/fengzhou/Code/newWith-window add src/venue/layoutData.ts src/venue/layoutData.test.ts
git -C /Users/fengzhou/Code/newWith-window commit -m "feat(venue): 新增 window 类型 + thickness 字段 + 默认"
```

---

### Task 2: layout-sync — `thickness` 往返

**Files:**
- Modify: `src/lib/venue/layout-sync.ts`
- Test: `src/lib/venue/layout-sync.test.ts`(已在 test 脚本)

- [ ] **Step 1: 写失败测试**

在 `src/lib/venue/layout-sync.test.ts` 末尾追加:

```ts
test('thickness 往返:layoutToRows 写出, rowsToLayout 读回', () => {
  const layout = structuredClone(SAMPLE)
  layout.floors[0].items[0].thickness = 8
  const { venue, floors, items } = layoutToRows(layout)
  assert.equal(items[0].thickness, 8)
  const back = rowsToLayout(venue, floors, items)
  assert.equal(back.floors[0].items[0].thickness, 8)
})

test('rowsToLayout:旧行缺 thickness 时补 0', () => {
  const { venue, floors, items } = layoutToRows(SAMPLE)
  const stripped = items.map(({ thickness: _t, ...rest }) => rest)
  // @ts-expect-error 模拟旧库行没有 thickness 列
  const back = rowsToLayout(venue, floors, stripped)
  assert.equal(back.floors[0].items[0].thickness, 0)
})
```

(`SAMPLE` 已在该测试文件顶部定义;其 item 字面量需补 `thickness`——见 Step 3。)

- [ ] **Step 2: 运行,确认失败**

Run: `npm test`
Expected: FAIL(`items[0].thickness` 为 undefined / 类型缺失)。

- [ ] **Step 3: 实现**

在 `src/lib/venue/layout-sync.ts`:
1. `VenueItemRow` 接口增加 `thickness: number`。
2. `layoutToRows` 的 item 映射增加 `thickness: item.thickness`。
3. `rowsToLayout` 的 item 映射增加 `thickness: item.thickness ?? 0`。

并在 `src/lib/venue/layout-sync.test.ts` 顶部的 `SAMPLE` 里给每个 item 字面量补 `thickness: 0`(满足 `VenueItem` 类型)。

- [ ] **Step 4: 运行,确认通过**

Run: `npm test`
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git -C /Users/fengzhou/Code/newWith-window add src/lib/venue/layout-sync.ts src/lib/venue/layout-sync.test.ts
git -C /Users/fengzhou/Code/newWith-window commit -m "feat(venue): layout-sync thickness 往返"
```

---

### Task 3: service select + 迁移 036

**Files:**
- Modify: `src/lib/venue/service.ts`
- Create: `supabase/migrations/036_venue_item_window.sql`

- [ ] **Step 1: getVenueLayout select 增加 thickness**

在 `src/lib/venue/service.ts` 的 `getVenueLayout` 里,venue_items 的 `.select('id, floor_id, type, name, x, y, width, height, rotation, status, note, z_index, height3d, elevation, ...')` 字符串追加 `, thickness`(注意:文件里可能已含 `placement` 等列,把 `thickness` 加进同一个 select 字符串)。`grep -n "from('venue_items')" src/lib/venue/service.ts` 定位。

- [ ] **Step 2: 写迁移**

`supabase/migrations/036_venue_item_window.sql`:

```sql
-- venue_items.type 允许 'window';新增 thickness(墙厚方向进深,cm)。
alter table venue_items drop constraint venue_items_type_valid;
alter table venue_items add constraint venue_items_type_valid check (type in
  ('equipment','renovation','area','corridor',
   'door_inward','door_outward','door_sliding','fire','power','network','window'));
alter table venue_items add column thickness integer not null default 0;
```

- [ ] **Step 3: 类型检查**

Run: `cd /Users/fengzhou/Code/newWith-window && npx tsc --noEmit`
Expected: 无新增错误。

- [ ] **Step 4: 提交 + 提醒**

```bash
git -C /Users/fengzhou/Code/newWith-window add src/lib/venue/service.ts supabase/migrations/036_venue_item_window.sql
git -C /Users/fengzhou/Code/newWith-window commit -m "feat(venue): getVenueLayout 读取 thickness + 迁移 036"
```
实现者在任务末尾**提醒用户在 Supabase SQL Editor 执行迁移 036**(本项目无 CLI)。

---

### Task 4: 3D 匹配 — 窗户产出带 band 的 WallPort

**Files:**
- Modify: `src/venue/Venue3DCanvas.client.tsx`

**说明:** 不单测(client 组件)。靠 tsc + build。

- [ ] **Step 1: 扩展 WallPort 类型**

把 `type WallPort = { offset: number; width: number; doorId: string }` 改为:

```ts
// band 省略 ⇒ 满高开口(门);带 band ⇒ 抬高的矩形开口(窗,墙厚方向通厚挖空),
// band 用 area-local 墙高坐标 [bottom, top](cm,自地面起算)。
type WallPort = { offset: number; width: number; sourceId: string; band?: { bottom: number; top: number } }
```

把所有用到 `doorId` 的地方改成 `sourceId`(`grep -n "doorId" src/venue/Venue3DCanvas.client.tsx`,逐处替换;门那处 push `sourceId: door.id`)。

- [ ] **Step 2: 在匹配函数里追加窗户匹配**

在 `matchDoorsToWalls`(返回 `{ areaPorts, doorPlacements }` 的函数)内,门循环之后、`return` 之前,追加窗户循环。窗户复用与门相同的「local 坐标 + 最近墙 + clamp」几何,但:开口宽用 footprint 沿墙投影,且 push 带 band 的 port、不写 doorPlacements:

```ts
const windows = items.filter((it) => it.type === 'window')
for (const win of windows) {
  const wx = win.x + win.width / 2
  const wy = win.y + win.height / 2
  for (const area of areas) {
    const cx = area.x + area.width / 2
    const cy = area.y + area.height / 2
    const aw = area.width / 2
    const ad = area.height / 2
    const theta = (area.rotation * Math.PI) / 180
    const rx = wx - cx
    const ry = wy - cy
    const cos = Math.cos(theta)
    const sin = Math.sin(theta)
    const lx = rx * cos + ry * sin
    const lz = -rx * sin + ry * cos
    // 沿墙开口宽:N/S 墙用窗的世界宽,W/E 墙用窗的世界高
    const candidates: { side: WallSide; distance: number; offset: number; openW: number }[] = []
    if (Math.abs(lx) <= aw + win.width / 2) {
      candidates.push({ side: 'N', distance: Math.abs(lz + ad), offset: lx, openW: win.width })
      candidates.push({ side: 'S', distance: Math.abs(lz - ad), offset: lx, openW: win.width })
    }
    if (Math.abs(lz) <= ad + win.height / 2) {
      candidates.push({ side: 'W', distance: Math.abs(lx + aw), offset: lz, openW: win.height })
      candidates.push({ side: 'E', distance: Math.abs(lx - aw), offset: lz, openW: win.height })
    }
    let areaBest: { side: WallSide; distance: number; offset: number; openW: number } | null = null
    for (const c of candidates) {
      if (c.distance > DOOR_ATTACH_THRESHOLD) continue
      if (areaBest === null || c.distance < areaBest.distance) areaBest = c
    }
    if (areaBest === null) continue
    const wallLen = areaBest.side === 'N' || areaBest.side === 'S' ? area.width : area.height
    const half = wallLen / 2
    const margin = areaBest.openW / 2 + AREA_WALL_THICKNESS
    const clamped = Math.max(-half + margin, Math.min(half - margin, areaBest.offset))
    const ports = areaPorts.get(area.id)
    if (ports) ports[areaBest.side].push({
      offset: clamped,
      width: areaBest.openW,
      sourceId: win.id,
      band: { bottom: win.elevation, top: win.elevation + Math.max(win.height3d, 1) },
    })
  }
}
```

- [ ] **Step 3: 渲染循环跳过窗户默认盒**

在 `floor.items.map(...)`(约 `:193`)里,`isDoorType` 分支之后增加:`if (item.type === 'window') return null`(窗户只参与挖墙+玻璃,不渲染默认 mesh;但仍需把 ports 传给 area —— area 已通过 `areaPorts.get(item.id)` 拿到所有 ports,含窗户)。

- [ ] **Step 4: 类型检查 + 构建**

Run: `npx tsc --noEmit && npm run build`
Expected: 通过(此时窗户已在墙上挖出满墙厚的洞,但还没渲染窗台/窗楣/玻璃 —— 下个任务补)。

- [ ] **Step 5: 提交**

```bash
git -C /Users/fengzhou/Code/newWith-window add src/venue/Venue3DCanvas.client.tsx
git -C /Users/fengzhou/Code/newWith-window commit -m "feat(venue): 窗户匹配最近墙体,产出带 band 的 WallPort"
```

---

### Task 5: AreaWalls — 窗台块 + 窗楣块 + 玻璃

**Files:**
- Modify: `src/venue/Venue3DCanvas.client.tsx`(`AreaWalls`)

**背景:** `segmentWall` 已按所有 port 的水平区间把墙切成实心段(窗户的 band port 也会在此被切掉水平段 → 形成满高缺口)。本任务在每个**带 band 的 port** 的水平区间内补回:窗台块(0→band.bottom)、窗楣块(band.top→height),并在中间放玻璃。坐标完全沿用现有 wall-box 的写法(N/S 沿 X 轴、深度方向 z=-depth/2+t/2 等)。

- [ ] **Step 1: 在 AreaWalls 内增加渲染带 band port 的辅助**

在 `AreaWalls` 组件里(`wallMaterial` 之后、`return` 之前)定义一个渲染函数,按 side 输出窗台/窗楣/玻璃 mesh。`t = AREA_WALL_THICKNESS`,`height` 为墙高:

```tsx
const GLASS_COLOR = '#bae6fd'
function bandBlocks(side: WallSide, port: WallPort) {
  if (!port.band) return null
  const b = Math.max(0, Math.min(port.band.bottom, height))
  const tp = Math.max(b, Math.min(port.band.top, height))
  const w = port.width
  const off = port.offset
  const sillH = b              // 窗台高度
  const lintelH = height - tp  // 窗楣高度
  const glassH = tp - b
  const glassDepth = Math.max(1, port.thickness ?? 0) // 见 Step 2:port 需带 thickness
  // 位置工具:N/S 沿 X 轴(z 固定),W/E 沿 Z 轴(x 固定)
  const isNS = side === 'N' || side === 'S'
  const zN = -depth / 2 + t / 2
  const zS = depth / 2 - t / 2
  const xW = -width / 2 + t / 2
  const xE = width / 2 - t / 2
  const blocks: JSX.Element[] = []
  const pushBlock = (key: string, cy: number, h: number, isGlass: boolean) => {
    if (h <= 0) return
    const args: [number, number, number] = isNS
      ? [w, h, isGlass ? glassDepth : t]
      : [isGlass ? glassDepth : t, h, w]
    const pos: [number, number, number] = isNS
      ? [off, cy, side === 'N' ? zN : zS]
      : [side === 'W' ? xW : xE, cy, off]
    blocks.push(
      <mesh key={key} position={pos}>
        <boxGeometry args={args} />
        {isGlass ? (
          <meshStandardMaterial color={GLASS_COLOR} transparent opacity={0.45} />
        ) : (
          wallMaterial(key)
        )}
      </mesh>,
    )
  }
  pushBlock(`${side}-sill-${port.sourceId}`, sillH / 2, sillH, false)
  pushBlock(`${side}-lintel-${port.sourceId}`, tp + lintelH / 2, lintelH, false)
  pushBlock(`${side}-glass-${port.sourceId}`, b + glassH / 2, glassH, true)
  return blocks
}
```

并在 `return (<> ... </>)` 里,在四面墙 segment map 之后追加:

```tsx
{(['N','S','W','E'] as WallSide[]).flatMap((side) =>
  (ports?.[side] ?? []).filter((p) => p.band).flatMap((p) => bandBlocks(side, p) ?? []),
)}
```

- [ ] **Step 2: WallPort 携带 thickness(玻璃进深)**

`bandBlocks` 用到 `port.thickness`。在 Task 4 的 WallPort 类型加上 `thickness?: number`,并在窗户 push port 时带 `thickness: win.thickness`(玻璃进深;门不带,默认走满墙厚 `t`,但门没有 band 不会进 bandBlocks,无影响)。更新 Task 4 的 WallPort 类型定义为:
```ts
type WallPort = { offset: number; width: number; sourceId: string; band?: { bottom: number; top: number }; thickness?: number }
```

- [ ] **Step 3: 类型检查 + 构建**

Run: `npx tsc --noEmit && npm run build`
Expected: 通过。(若 `JSX.Element` 类型不被识别,用 `React.ReactElement` 或直接 `const blocks = []` 不标注。)

- [ ] **Step 4: 提交**

```bash
git -C /Users/fengzhou/Code/newWith-window add src/venue/Venue3DCanvas.client.tsx
git -C /Users/fengzhou/Code/newWith-window commit -m "feat(venue): 3D 窗洞渲染窗台+窗楣+玻璃构件"
```

---

### Task 6: 2D 画布渲染窗户

**Files:**
- Modify: `src/venue/VenueCanvas.tsx`

- [ ] **Step 1: 窗户作为 shape 矩形 + 配色 + 符号**

`grep -n "equipment\|renovation\|fill\|stroke\|TYPE\|color" src/venue/VenueCanvas.tsx` 找到 shape 类型的配色映射(类似 `Venue3DCanvas` 顶部的 `TYPE_STYLE` 对象,或 VenueCanvas 内的颜色表)。给 `window` 加一项配色(浅蓝:fill `#e0f2fe`,stroke `#0284c7`)。确认 `window` 走可缩放矩形分支(非 marker 固定点)——即只要它在 `VenueShapeType` 里且渲染逻辑按"非 marker 即矩形",应自动生效。若有显式的 shape 类型列表/`switch`,把 `window` 纳入。

- [ ] **Step 2: (可选)窗洞符号**

在窗户矩形中间画一条与长边平行的中线(`<line>`),让它一眼区别于普通区域。若实现成本高可省略——至少配色要区分。

- [ ] **Step 3: 类型检查 + 构建**

Run: `npx tsc --noEmit && npm run build`
Expected: 通过。

- [ ] **Step 4: 提交**

```bash
git -C /Users/fengzhou/Code/newWith-window add src/venue/VenueCanvas.tsx
git -C /Users/fengzhou/Code/newWith-window commit -m "feat(venue): 2D 画布渲染窗户矩形"
```

---

### Task 7: Inspector — 厚度输入 + 排除地面/空中

**Files:**
- Modify: `src/venue/VenueInspector.tsx`

- [ ] **Step 1: 厚度输入(cm)**

`grep -n "elevation\|height3d\|立体\|Field\|fieldElevation\|fieldHeight" src/venue/VenueInspector.tsx` 找到「立体」区里 elevation/height3d 的数字输入。仿照它,在 `item.type === 'window'` 时新增一个「厚度」输入,绑定 `item.thickness`,`onChange({ thickness: <number> })`。**单位 cm**:直接显示/写入 cm 整数(不像 elevation/height3d 做米换算——它们若做了 ÷100/×100,thickness 不要做,标签写"厚度 (cm)")。用 `t('fieldThickness')` 作标签(Task 8 加文案)。

- [ ] **Step 2: 排除窗户的地面/空中开关**

把 placement 开关的显示条件 `!isVenueMarkerType(item.type) && item.type !== 'area'` 改为再排除 window:`!isVenueMarkerType(item.type) && item.type !== 'area' && item.type !== 'window'`。

- [ ] **Step 3: 类型检查 + 构建**

Run: `npx tsc --noEmit && npm run build`
Expected: 通过(此时 `fieldThickness` 文案可能缺失,会回退显示 key 名——Task 8 补;不阻塞构建)。

- [ ] **Step 4: 提交**

```bash
git -C /Users/fengzhou/Code/newWith-window add src/venue/VenueInspector.tsx
git -C /Users/fengzhou/Code/newWith-window commit -m "feat(venue): Inspector 窗户厚度输入 + 排除地面/空中开关"
```

---

### Task 8: 入口按钮 + 图标 + 三语文案

**Files:**
- Modify: `src/app/[locale]/(app)/guild-venue/page.tsx`
- Modify: `messages/zh.json`, `messages/en.json`, `messages/ja.json`

- [ ] **Step 1: 文案**

三个 `messages/*.json` 的 `venue` 节点下增加(键名一致,值按语言):
- `addTypes.window`:zh `+ 窗户`,en `+ Window`,ja `+ Window`
- `types.window`:zh `窗户`,en `Window`,ja `Window`
- `fieldThickness`:zh `厚度 (cm)`,en `Thickness (cm)`,ja `厚さ (cm)`

(用 `python3 -c` 读改写 JSON,或手动编辑;改完确认三个文件仍是合法 JSON。)

- [ ] **Step 2: TOOL_ICON.window + 顶层「+ 窗户」按钮**

在 `src/app/[locale]/(app)/guild-venue/page.tsx`:
- `const TOOL_ICON: Record<VenueItemType, ...>` 增加 `window: PanelTop`(从 `lucide-react` 引入 `PanelTop`;若已引入别的窗形图标可复用)。
- 在「+ 结构」按钮(`addItem('corridor')`)之后,仿照它加一个:
  ```tsx
  <ToolbarButton
    icon={TOOL_ICON.window}
    label={t('addTypes.window')}
    onClick={() => addItem('window')}
  />
  ```

- [ ] **Step 3: 类型检查 + 构建**

Run: `npx tsc --noEmit && npm run build`
Expected: 通过。

- [ ] **Step 4: 提交**

```bash
git -C /Users/fengzhou/Code/newWith-window add "src/app/[locale]/(app)/guild-venue/page.tsx" messages/zh.json messages/en.json messages/ja.json
git -C /Users/fengzhou/Code/newWith-window commit -m "feat(venue): + 窗户 按钮 + 图标 + 三语文案"
```

---

### Task 9: 全量校验 + 人工 3D 验证

- [ ] **Step 1: 全量测试 + 构建**

Run: `cd /Users/fengzhou/Code/newWith-window && npm test && npx tsc --noEmit && npm run build`
Expected: 测试全绿、tsc 干净、build 通过。

- [ ] **Step 2: 人工 3D 验证(前置:迁移 036 已执行)**

启动 dev(在 worktree:`cd /Users/fengzhou/Code/newWith-window && npm run dev`,注意端口与主仓冲突——用 `PORT=3010 npm run dev` 或停掉主仓 dev)。在场地页:
- 点「+ 窗户」添加窗户,拖到某空间墙边。
- 切 3D:确认该墙在窗户位置挖出**抬高的洞**,洞下有窗台、洞上有窗楣,中间有半透明玻璃。
- 调 Inspector 的离地高度/高度/厚度,确认 3D 实时变化(离地抬高窗台、高度改变洞高、厚度改变玻璃进深)。
- 共享墙两侧空间都应挖洞。
- `preview_screenshot` 留证。

- [ ] **Step 3: changelog(用户可感知功能)**

在 `src/lib/changelog/entries.ts` 的 `2026-06-28` 块 `items` 顶部追加一条 `feat`:
```ts
{
  kind: 'feat',
  scope: '场地布置',
  title: '新增窗户组件,3D 视图会在墙上挖出窗洞',
  details: '工具栏新增「+ 窗户」。把窗户拖到空间墙边,3D 视图会在对应墙体上挖出一个抬高的窗洞(下留窗台、上留窗楣),中间嵌半透明玻璃。可在 Inspector 配置离地高度、窗户高度与厚度(进深);共享墙两侧空间都会开窗。',
},
```
提交:`git -C /Users/fengzhou/Code/newWith-window add src/lib/changelog/entries.ts && git -C /Users/fengzhou/Code/newWith-window commit -m "docs(changelog): 窗户组件"`

---

## Self-Review notes

- **Spec 覆盖:** 类型/字段(T1)、迁移+sync+service(T2/T3)、3D 匹配带 band(T4)、窗台/窗楣/玻璃(T5)、2D(T6)、Inspector 厚度+排除开关(T7)、入口+文案(T8)、验证+changelog(T9)。全覆盖。
- **类型一致:** `WallPort` 增加 `sourceId`/`band`/`thickness?`(T4 定义,T5 使用);`VenueItem.thickness`(T1)→ row(T2)→ service select(T3)→ 匹配 band(T4)→ 玻璃进深(T5)→ inspector(T7)一致。`window` 在 `VenueShapeType`(T1)、TOOL_ICON/按钮(T8)、inspector 排除(T7)、3D 跳过默认盒(T4 Step3)一致。
- **可测边界已说明:** 仅 T1/T2 单测;3D/2D 靠 tsc+build+人工。
- **占位说明:** 迁移号 036 已确定(最新 035)。无 TBD。
