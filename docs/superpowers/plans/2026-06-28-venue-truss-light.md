# 场地「桁架 + 吊灯」组件 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use checkbox (`- [ ]`).

**Goal:** 新增 `truss`(桁架:贴天花横梁)与 `light`(吊灯:八角柔光箱,自动吸附最近桁架、竖直细杆吊臂)两个组件,并加一个 3D「看天花板」仰视预设。

**Architecture:** 两类型都归 `VenueShapeType`(可拖拽、aerial、不占面积)。桁架直接复用默认 `VenueItem3DMesh` 盒(细长 + 高 elevation = 梁);吊灯用专属 `Light3D`(coneGeometry 八角柔光箱 + 细杆),吊臂顶端高度由**纯函数** `lightTrussAttachments`(在 `layoutData.ts`,可单测)算出的最近桁架 elevation 决定。无新字段,仅迁移扩展 type 约束。看天花板 = OrbitControls 相机预设。

**Tech Stack:** Next.js + React Three Fiber/@react-three/drei + Supabase + `node --test --experimental-strip-types`。

**工作目录:** worktree `/Users/fengzhou/Code/newWith-truss`(分支 `feat/venue-truss-light`)。命令用 `cd /Users/fengzhou/Code/newWith-truss`;提交前 `git -C /Users/fengzhou/Code/newWith-truss branch --show-current` 须为 `feat/venue-truss-light`;只 `git add` 指名文件。

**可测性:** Task 1 纯数据/几何,走 TDD。Task 3/4 在 `Venue3DCanvas.client.tsx`(R3F),tsc + build + 人工。

---

### Task 1: layoutData — truss/light 类型 + 默认 + 颜色 + 灯桁架匹配纯函数

**Files:** Modify `src/venue/layoutData.ts`; Test `src/venue/layoutData.test.ts`

- [ ] **Step 1: 写失败测试**（追加到 `src/venue/layoutData.test.ts`;`addVenueItem`/`DEFAULT_VENUE_LAYOUT`/`lightTrussAttachments` 加入 `from './layoutData.ts'` 导入）

```ts
test('addVenueItem(truss): 贴天花横梁默认', () => {
  const l = addVenueItem(DEFAULT_VENUE_LAYOUT, DEFAULT_VENUE_LAYOUT.floors[0].id, 'truss')
  const it = l.floors[0].items.at(-1)!
  assert.equal(it.type, 'truss'); assert.equal(it.placement, 'aerial')
  assert.equal(it.elevation, 260); assert.equal(it.height3d, 15)
})
test('addVenueItem(light): 吊灯默认', () => {
  const l = addVenueItem(DEFAULT_VENUE_LAYOUT, DEFAULT_VENUE_LAYOUT.floors[0].id, 'light')
  const it = l.floors[0].items.at(-1)!
  assert.equal(it.type, 'light'); assert.equal(it.placement, 'aerial')
  assert.equal(it.elevation, 220); assert.equal(it.height3d, 40)
})
test('lightTrussAttachments: 灯吸附阈值内最近桁架的 elevation', () => {
  const mk = (o: Partial<VenueItem> & { id: string; type: VenueItemType }): VenueItem => ({
    x: 0, y: 0, width: 40, height: 40, rotation: 0, status: 'planned', note: '',
    name: '', height3d: 0, elevation: 0, thickness: 0, placement: 'aerial', ...o,
  })
  const items = [
    mk({ id: 't1', type: 'truss', x: 0, y: 0, width: 300, height: 20, elevation: 260 }),
    mk({ id: 'L1', type: 'light', x: 100, y: 5, width: 40, height: 40, elevation: 220 }), // 正下方,命中
    mk({ id: 'L2', type: 'light', x: 100, y: 400, width: 40, height: 40, elevation: 220 }), // 远,不命中
  ]
  const m = lightTrussAttachments(items)
  assert.equal(m.get('L1'), 260)
  assert.equal(m.get('L2'), undefined)
})
```

(`VenueItem`/`VenueItemType` 若未导入则以 type 形式加入导入。)

- [ ] **Step 2: 运行确认失败** — `cd /Users/fengzhou/Code/newWith-truss && npm test`（FAIL:类型/函数未定义）。

- [ ] **Step 3: 实现** 在 `src/venue/layoutData.ts`:
1. `VenueShapeType` 增加 `'truss' | 'light'`:`export type VenueShapeType = 'equipment' | 'renovation' | 'area' | 'corridor' | 'window' | 'truss' | 'light'`。
2. 以下**每个** `Record<VenueItemType, …>` 表补 truss/light 行（TS 会强制;`grep -n "window:" src/venue/layoutData.ts` 找到每个表逐一补）:
   - `DEFAULT_SIZE`:`truss: { width: 300, height: 20 }`,`light: { width: 70, height: 70 }`
   - `DEFAULT_3D`:`truss: { height3d: 15, elevation: 260 }`,`light: { height3d: 40, elevation: 220 }`
   - `DEFAULT_THICKNESS`:`truss: 0`,`light: 0`
   - `DEFAULT_PLACEMENT`:`truss: 'aerial'`,`light: 'aerial'`
   - 名称表:`truss: '新增桁架'`,`light: '新增吊灯'`
3. `VENUE_ITEM_TYPE_OPTIONS`:在 window 项后加 `{ value: 'truss', label: '桁架' }, { value: 'light', label: '吊灯' }`。
4. 文件末尾加纯函数(点到桁架 footprint 矩形的最近点距离,阈值内取最近):
```ts
export const LIGHT_ATTACH_THRESHOLD = 120 // cm

// 每盏灯 → 阈值内最近桁架的 elevation(吊臂顶端高度)。无命中的灯不在 Map 里。
export function lightTrussAttachments(items: VenueItem[]): Map<string, number> {
  const trusses = items.filter((it) => it.type === 'truss')
  const out = new Map<string, number>()
  for (const light of items) {
    if (light.type !== 'light') continue
    const lx = light.x + light.width / 2
    const ly = light.y + light.height / 2
    let best: { dist: number; elevation: number } | null = null
    for (const tr of trusses) {
      const cx = Math.max(tr.x, Math.min(lx, tr.x + tr.width))
      const cy = Math.max(tr.y, Math.min(ly, tr.y + tr.height))
      const dist = Math.hypot(lx - cx, ly - cy)
      if (dist > LIGHT_ATTACH_THRESHOLD) continue
      if (best === null || dist < best.dist) best = { dist, elevation: tr.elevation }
    }
    if (best) out.set(light.id, best.elevation)
  }
  return out
}
```

- [ ] **Step 4: 运行确认通过 + tsc** — `npm test`(新用例 + 既有全绿);`npx tsc --noEmit`(若别处 `Record<VenueItemType>` 表/构造 item 缺 truss/light,补齐:`TYPE_STYLE_3D`(Venue3DCanvas)、`TYPE_STYLE`(VenueCanvas)、`TOOL_ICON`(page.tsx)——这些留到各自 Task,但若 tsc 在本任务报它们,可在此顺带补最小占位颜色/图标以过编译,后续 Task 覆盖细节)。**优先**只让 layoutData 自身编译通过;跨文件的 exhaustive 报错记录下来交给对应 Task。

- [ ] **Step 5: 提交**
```bash
git -C /Users/fengzhou/Code/newWith-truss add src/venue/layoutData.ts src/venue/layoutData.test.ts
git -C /Users/fengzhou/Code/newWith-truss commit -m "feat(venue): truss/light 类型 + 默认 + 灯桁架匹配纯函数"
```

---

### Task 2: 迁移 038(扩展 type 约束)

**Files:** Create `supabase/migrations/038_venue_item_truss_light.sql`

- [ ] **Step 1: 写迁移**
```sql
-- venue_items.type 允许 'truss'、'light'(桁架/吊灯)。不加新列。
alter table venue_items drop constraint venue_items_type_valid;
alter table venue_items add constraint venue_items_type_valid check (type in
  ('equipment','renovation','area','corridor','window',
   'door_inward','door_outward','door_sliding','fire','power','network',
   'truss','light'));
```

- [ ] **Step 2: 提交 + 提醒**
```bash
git -C /Users/fengzhou/Code/newWith-truss add supabase/migrations/038_venue_item_truss_light.sql
git -C /Users/fengzhou/Code/newWith-truss commit -m "feat(venue): 迁移 038 — type 约束加 truss/light"
```
实现末尾**提醒用户执行迁移 038**(插入 truss/light 前必须,否则违反 check)。

---

### Task 3: 3D — 吊灯 Light3D + 桁架配色 + 渲染循环

**Files:** Modify `src/venue/Venue3DCanvas.client.tsx`

- [ ] **Step 1: TYPE_STYLE_3D 补 truss/light**

`TYPE_STYLE_3D`(约 `:14`)增加:`truss: { fill: '#334155', stroke: '#1e293b' }`,`light: { fill: '#1f2937', stroke: '#eab308' }`。（truss 复用默认盒渲染 → 深色即是横梁外观。）

- [ ] **Step 2: 导入匹配函数**

从 `@/venue/layoutData` 导入 `lightTrussAttachments`(value import;该文件不引 three,可在 client 组件里安全 import)。在渲染主体(door/window 匹配的 useMemo 附近)算:
```ts
const lightAttach = useMemo(() => lightTrussAttachments(floor.items), [floor.items])
```

- [ ] **Step 3: Light3D 组件**

在文件内(靠近 `Door3D`)新增:
```tsx
function Light3D({ item, trussElevation, selected, onSelect }: {
  item: VenueItem
  trussElevation: number | undefined
  selected: boolean
  onSelect: (ids: string[]) => void
}) {
  const style = TYPE_STYLE_3D.light
  const r = Math.max(1, Math.min(item.width, item.height) / 2)
  const coneH = Math.max(1, item.height3d)
  const cx = item.x + item.width / 2
  const cz = item.y + item.height / 2
  const softboxCenterY = item.elevation + coneH / 2
  const softboxTopY = item.elevation + coneH
  const rodTopY = trussElevation ?? null
  const rodH = rodTopY !== null ? rodTopY - softboxTopY : 0
  function handleClick(event: ThreeEvent<MouseEvent>) {
    event.stopPropagation()
    onSelect(event.nativeEvent.shiftKey && selected ? [] : [item.id])
  }
  return (
    <group position={[cx, 0, cz]} onClick={handleClick}>
      {/* 柔光箱:八角倒锥,宽口朝下 */}
      <mesh position={[0, softboxCenterY, 0]}>
        <coneGeometry args={[r, coneH, 8]} />
        <meshStandardMaterial
          color={style.fill}
          emissive={selected ? SELECTION_ACCENT : '#000000'}
          emissiveIntensity={selected ? 0.25 : 0}
        />
        <Edges threshold={15} color={selected ? SELECTION_ACCENT : style.stroke} scale={1.001} />
      </mesh>
      {/* 吊臂:竖直细杆,连到最近桁架 */}
      {rodH > 0 && (
        <mesh position={[0, softboxTopY + rodH / 2, 0]}>
          <boxGeometry args={[4, rodH, 4]} />
          <meshStandardMaterial color="#334155" />
        </mesh>
      )}
    </group>
  )
}
```
(若 `ThreeEvent`/`Edges`/`SELECTION_ACCENT` 已在文件顶部导入/定义——沿用;`ThreeEvent` 来自 `@react-three/fiber`,`Edges` 来自 drei,均已被 Door3D 使用。)

- [ ] **Step 4: 渲染循环分支**

在 `floor.items.map(...)` 里,`if (item.type === 'window') return null` 之后加:
```tsx
if (item.type === 'light') {
  return (
    <Light3D
      key={item.id}
      item={item}
      trussElevation={lightAttach.get(item.id)}
      selected={selectedSet.has(item.id)}
      onSelect={onSelectItems}
    />
  )
}
```
（`truss` 不加分支 → 落到默认 `VenueItem3DMesh`,渲染为深色细长盒 = 横梁。）

- [ ] **Step 5: tsc + build** — `cd /Users/fengzhou/Code/newWith-truss && npx tsc --noEmit && npm run build`（通过）。

- [ ] **Step 6: 提交**
```bash
git -C /Users/fengzhou/Code/newWith-truss add src/venue/Venue3DCanvas.client.tsx
git -C /Users/fengzhou/Code/newWith-truss commit -m "feat(venue): 3D 桁架横梁 + 吊灯柔光箱/吊臂"
```

---

### Task 4: 3D「看天花板」仰视预设

**Files:** Modify `src/venue/Venue3DCanvas.client.tsx`

READ 组件结构,确认包裹 `<Canvas>` 的外层容器(用于叠放 HTML 按钮)以及 `floor.width/height/floorHeight`、`OrbitControls`(已 `makeDefault`)。

- [ ] **Step 1: Canvas 内相机控制组件**

新增(用 `useThree` 拿 camera + controls;controls 由 OrbitControls makeDefault 提供):
```tsx
function CeilingView({ nonce, floor }: { nonce: number; floor: VenueFloor }) {
  const camera = useThree((s) => s.camera)
  const controls = useThree((s) => s.controls) as { target: Vector3; update: () => void } | null
  useEffect(() => {
    if (nonce === 0 || !controls) return
    const cx = floor.width / 2
    const cz = floor.height / 2
    const ceil = Math.max(floor.floorHeight, 200)
    camera.position.set(cx, 40, cz + 1)   // 室内近地面
    controls.target.set(cx, ceil, cz)      // 看向天花中心
    camera.lookAt(cx, ceil, cz)
    controls.update()
  }, [nonce, controls, camera, floor.width, floor.height, floor.floorHeight])
  return null
}
```
(`useThree` 来自 `@react-three/fiber`,`useEffect` 来自 react,`Vector3` 已从 three 导入。)

- [ ] **Step 2: nonce state + 按钮 + 挂载组件**

在 Venue3DCanvas 主组件里加 `const [ceilingNonce, setCeilingNonce] = useState(0)`。在 `<Canvas>…</Canvas>` 内(与其它场景组件并列)加 `<CeilingView nonce={ceilingNonce} floor={floor} />`。在包裹 Canvas 的外层容器里叠一个按钮:
```tsx
<button
  type="button"
  onClick={() => setCeilingNonce((n) => n + 1)}
  className="absolute top-3 right-3 z-10 rounded-lg border border-slate-200 bg-white/90 px-3 py-1.5 text-sm text-slate-600 shadow hover:text-indigo-700"
>
  {t3d('ceilingView')}
</button>
```
若组件内已有 `useTranslations('venue')`(记作 `t` 或类似)则用它:`t('ceilingView')`;若无,加 `const t = useTranslations('venue')`。外层容器需 `relative` 定位(若还不是,给它加 `relative`)。

- [ ] **Step 3: i18n key** — 在 `messages/{zh,en,ja}.json` 的 `venue` 下加 `ceilingView`:zh `看天花板`,en `Ceiling view`,ja `天井ビュー`。

- [ ] **Step 4: tsc + build** — `npx tsc --noEmit && npm run build`（通过）。

- [ ] **Step 5: 提交**
```bash
git -C /Users/fengzhou/Code/newWith-truss add src/venue/Venue3DCanvas.client.tsx messages/zh.json messages/en.json messages/ja.json
git -C /Users/fengzhou/Code/newWith-truss commit -m "feat(venue): 3D 看天花板仰视预设"
```

---

### Task 5: 2D 配色 + Inspector 排除

**Files:** Modify `src/venue/VenueCanvas.tsx`, `src/venue/VenueInspector.tsx`

- [ ] **Step 1: VenueCanvas TYPE_STYLE 补 truss/light**

`TYPE_STYLE`(约 `:58`)增加:`truss: { fill: '#e2e8f0', stroke: '#334155' }`,`light: { fill: '#fef9c3', stroke: '#ca8a04' }`。（truss/light 是非 marker → 自动走 `<VenueShape>` 可缩放矩形;配色即可区分。可选:不做额外符号。）

- [ ] **Step 2: Inspector 排除地面/空中开关**

`src/venue/VenueInspector.tsx` 里 placement 开关的显示条件(现含 `&& item.type !== 'window'`)再加 `&& item.type !== 'truss' && item.type !== 'light'`（truss/light 恒 aerial)。`grep -n "item.type !== 'window'" src/venue/VenueInspector.tsx` 定位。

- [ ] **Step 3: tsc + build** — `npx tsc --noEmit && npm run build`（通过）。

- [ ] **Step 4: 提交**
```bash
git -C /Users/fengzhou/Code/newWith-truss add src/venue/VenueCanvas.tsx src/venue/VenueInspector.tsx
git -C /Users/fengzhou/Code/newWith-truss commit -m "feat(venue): 2D 桁架/吊灯配色 + Inspector 排除地面空中"
```

---

### Task 6: 入口按钮 + 图标 + 文案

**Files:** Modify `src/app/[locale]/(app)/guild-venue/page.tsx`, `messages/{zh,en,ja}.json`

- [ ] **Step 1: 文案** — 三个 `messages/*.json` 的 `venue` 下加:`addTypes.truss`(zh `+ 桁架`/en `+ Truss`/ja `+ トラス`)、`addTypes.light`(zh `+ 灯`/en `+ Light`/ja `+ ライト`)、`types.truss`(zh `桁架`/en `Truss`/ja `トラス`)、`types.light`(zh `吊灯`/en `Light`/ja `ライト`)。改后确认三个 JSON 合法(`python3 -c "import json;json.load(open('messages/zh.json'))"` 等)。

- [ ] **Step 2: TOOL_ICON + 按钮**

`page.tsx`:`const TOOL_ICON: Record<VenueItemType, …>` 增加 `truss: GitCommitHorizontal`,`light: Lightbulb`(从 `lucide-react` 导入 `GitCommitHorizontal, Lightbulb`)。在「+ 窗户」按钮后加两个:
```tsx
<ToolbarButton icon={TOOL_ICON.truss} label={t('addTypes.truss')} onClick={() => addItem('truss')} />
<ToolbarButton icon={TOOL_ICON.light} label={t('addTypes.light')} onClick={() => addItem('light')} />
```
(`grep -n "addItem('window')" "src/app/[locale]/(app)/guild-venue/page.tsx"` 定位窗户按钮。)

- [ ] **Step 3: tsc + build** — `npx tsc --noEmit && npm run build`（通过）。

- [ ] **Step 4: 提交**
```bash
git -C /Users/fengzhou/Code/newWith-truss add "src/app/[locale]/(app)/guild-venue/page.tsx" messages/zh.json messages/en.json messages/ja.json
git -C /Users/fengzhou/Code/newWith-truss commit -m "feat(venue): + 桁架/+ 灯 按钮 + 图标 + 文案"
```

---

### Task 7: 全量校验 + 人工 3D 验证 + changelog

- [ ] **Step 1: 全量** — `cd /Users/fengzhou/Code/newWith-truss && npm test && npx tsc --noEmit && npm run build`（测试全绿、tsc 干净、build 通过）。

- [ ] **Step 2: 人工 3D 验证(前置:迁移 038 已执行)** — dev(`PORT=3011 npm run dev` 避免端口冲突)或 PR 预览:加桁架(贴天花深色横梁)、加吊灯到桁架下方(八角柔光箱 + 竖直细杆连到桁架);点「看天花板」应切到仰视、能看清吊顶布局;吊灯远离桁架时无杆。`preview_screenshot` 留证。

- [ ] **Step 3: changelog** — `src/lib/changelog/entries.ts` 的 `2026-06-28` 块 items 顶部加:
```ts
{
  kind: 'feat',
  scope: '场地布置',
  title: '新增桁架 + 吊灯组件,并支持「看天花板」视角',
  details: '工具栏新增「+ 桁架」「+ 灯」。桁架是贴天花的横梁,吊灯会自动吸附最近的桁架、从其下方吊下(3D 里渲染成柔光箱 + 竖直吊臂),挂高可在 Inspector 调。3D 视图新增「看天花板」按钮,一键仰视吊顶,方便查看桁架/灯光布局。',
},
```
提交:`git -C /Users/fengzhou/Code/newWith-truss add src/lib/changelog/entries.ts && git -C /Users/fengzhou/Code/newWith-truss commit -m "docs(changelog): 桁架/吊灯 + 看天花板"`

---

## Self-Review notes
- **Spec 覆盖:** 类型/默认(T1)、迁移(T2)、3D 桁架梁+吊灯柔光箱/吊臂+匹配(T1 纯函数 + T3)、看天花板(T4)、2D+Inspector(T5)、入口+文案(T6)、验证+changelog(T7)。全覆盖。
- **类型一致:** `truss`/`light` 在 `VenueShapeType`、五张默认表、`VENUE_ITEM_TYPE_OPTIONS`、`TYPE_STYLE_3D`、`TYPE_STYLE`、`TOOL_ICON`、渲染循环、Inspector 排除处一致;`lightTrussAttachments(items): Map<string, number>`(lightId→trussElevation)在 T1 定义、T3 使用签名一致。
- **无新字段/无占位:** 复用 elevation/height3d/footprint;迁移 038 已确定(最新 037)。truss 无专属 3D 组件(复用默认盒),仅 light 有 `Light3D`。
