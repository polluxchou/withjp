# 场地「灯」拆成 4 种 3D 形态 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use checkbox (`- [ ]`).

**Goal:** 把单一 `light` 类型拆成 4 个独立类型(`light_grille4` 落地四角格栅 / `light_grille8_stand` 八角格栅+支架 / `light_spot` 桁架射灯 / `light_grille4_stand` 四角格栅+支架),各有独立 3D 形态;只有 `light_spot` 吸附桁架。

**Architecture:** 移除 `light` 联合成员会级联影响多处穷举 `Record<VenueItemType>` 表与 `=== 'light'` 引用,所以 **Task 1 做整套替换并保持编译通过**(4 种灯先临时都渲染旧的锥体),**Task 3 再补每种真实几何**(格栅板 / 支架 / 射灯)。数据丢弃现有 light(迁移删除)。

**Tech Stack:** Next.js + React Three Fiber + Supabase + `node --test --experimental-strip-types`。

**工作目录:** worktree `/Users/fengzhou/Code/newWith-lightforms`(分支 `feat/venue-light-forms`)。命令用 `cd /Users/fengzhou/Code/newWith-lightforms`;提交前分支须为 `feat/venue-light-forms`;只 `git add` 指名文件。

**可测性:** Task 1 的纯函数(默认值 / `isLightType` / `lightTrussAttachments`)走 TDD;跨文件的 3D/2D/入口改动靠 `npx tsc --noEmit` + `npm run build`。Task 3 的几何靠 build + 人工。

---

### Task 1: 全套类型替换(保持编译 + 功能,灯暂用旧锥体)

**Files:** `src/venue/layoutData.ts`(+ test)、`src/venue/Venue3DCanvas.client.tsx`、`src/venue/VenueCanvas.tsx`、`src/venue/VenueInspector.tsx`、`src/app/[locale]/(app)/guild-venue/page.tsx`、`messages/{zh,en,ja}.json`

- [ ] **Step 1: 写失败测试**(追加到 `src/venue/layoutData.test.ts`;把 `addVenueItem`、`DEFAULT_VENUE_LAYOUT`、`isLightType`、`lightTrussAttachments` 加入 `from './layoutData.ts'` 导入;`VenueItem`/`VenueItemType` 以 type 导入)

```ts
test('addVenueItem: 4 种灯默认值', () => {
  const fid = DEFAULT_VENUE_LAYOUT.floors[0].id
  const g4 = addVenueItem(DEFAULT_VENUE_LAYOUT, fid, 'light_grille4').floors[0].items.at(-1)!
  assert.equal(g4.placement, 'ground'); assert.equal(g4.elevation, 0)
  const g8 = addVenueItem(DEFAULT_VENUE_LAYOUT, fid, 'light_grille8_stand').floors[0].items.at(-1)!
  assert.equal(g8.placement, 'ground'); assert.equal(g8.elevation, 150)
  const sp = addVenueItem(DEFAULT_VENUE_LAYOUT, fid, 'light_spot').floors[0].items.at(-1)!
  assert.equal(sp.placement, 'aerial'); assert.equal(sp.elevation, 240)
  const g4s = addVenueItem(DEFAULT_VENUE_LAYOUT, fid, 'light_grille4_stand').floors[0].items.at(-1)!
  assert.equal(g4s.placement, 'ground'); assert.equal(g4s.elevation, 150)
})
test('isLightType: 4 种为 true,其它为 false', () => {
  for (const t of ['light_grille4','light_grille8_stand','light_spot','light_grille4_stand'] as VenueItemType[]) {
    assert.equal(isLightType(t), true)
  }
  for (const t of ['area','truss','window','equipment','door_inward'] as VenueItemType[]) {
    assert.equal(isLightType(t), false)
  }
})
test('lightTrussAttachments: 只有 light_spot 吸附桁架', () => {
  const mk = (o: Partial<VenueItem> & { id: string; type: VenueItemType }): VenueItem => ({
    x: 0, y: 0, width: 40, height: 40, rotation: 0, status: 'planned', note: '',
    name: '', height3d: 0, elevation: 0, thickness: 0, placement: 'aerial', ...o,
  })
  const items = [
    mk({ id: 't1', type: 'truss', x: 0, y: 0, width: 300, height: 20, elevation: 260 }),
    mk({ id: 'S', type: 'light_spot', x: 100, y: 5, elevation: 240 }),
    mk({ id: 'G', type: 'light_grille4', x: 100, y: 5, elevation: 0 }),
  ]
  const m = lightTrussAttachments(items)
  assert.equal(m.get('S'), 260)
  assert.equal(m.get('G'), undefined)
})
```

- [ ] **Step 2: 运行确认失败** — `cd /Users/fengzhou/Code/newWith-lightforms && npm test`。

- [ ] **Step 3: layoutData.ts 改造**
1. `VenueShapeType`:删 `'light'`,加 `'light_grille4' | 'light_grille8_stand' | 'light_spot' | 'light_grille4_stand'`。
2. 各 `Record<VenueItemType,…>` 表把原 `light:` 行替换为 4 行(`grep -n "light:" src/venue/layoutData.ts` 定位每个表):
   - `DEFAULT_SIZE`:`light_grille4:{width:60,height:60}`、`light_grille8_stand:{width:70,height:70}`、`light_spot:{width:30,height:30}`、`light_grille4_stand:{width:60,height:60}`
   - `DEFAULT_3D`:`light_grille4:{height3d:8,elevation:0}`、`light_grille8_stand:{height3d:10,elevation:150}`、`light_spot:{height3d:25,elevation:240}`、`light_grille4_stand:{height3d:8,elevation:150}`
   - `DEFAULT_THICKNESS`:4 个都 `0`
   - `DEFAULT_PLACEMENT`:`light_grille4:'ground'`、`light_grille8_stand:'ground'`、`light_spot:'aerial'`、`light_grille4_stand:'ground'`
   - 名称表:`light_grille4:'格栅灯'`、`light_grille8_stand:'八角格栅灯'`、`light_spot:'射灯'`、`light_grille4_stand:'格栅灯(支架)'`
3. `VENUE_ITEM_TYPE_OPTIONS`:把 `{ value:'light', label:'吊灯' }` 换成 4 项:`{value:'light_grille4',label:'格栅灯'}`、`{value:'light_grille8_stand',label:'八角格栅灯'}`、`{value:'light_spot',label:'射灯'}`、`{value:'light_grille4_stand',label:'格栅灯·支架'}`。
4. 新增 helper(放在 `isVenueMarkerType` 附近):
   ```ts
   const LIGHT_TYPE_SET = new Set<string>(['light_grille4','light_grille8_stand','light_spot','light_grille4_stand'])
   export function isLightType(type: VenueItemType): boolean {
     return LIGHT_TYPE_SET.has(type)
   }
   ```
5. `lightTrussAttachments`:把 `if (light.type !== 'light') continue` 改为 `if (light.type !== 'light_spot') continue`。

- [ ] **Step 4: 跨文件修好级联引用(保持编译,灯暂用旧锥体)**
- `src/venue/Venue3DCanvas.client.tsx`:
  - `TYPE_STYLE_3D`:删 `light:` 行,加 4 行:`light_grille4:{fill:'#1f2937',stroke:'#eab308'}`、`light_grille8_stand:{fill:'#1f2937',stroke:'#d97706'}`、`light_spot:{fill:'#1f2937',stroke:'#ea580c'}`、`light_grille4_stand:{fill:'#1f2937',stroke:'#65a30d'}`。
  - 渲染循环:`if (item.type === 'light')` → `if (isLightType(item.type))`(从 `@/venue/layoutData` 导入 `isLightType`)。
  - `Light3D` 内 `const style = TYPE_STYLE_3D.light` → `const style = TYPE_STYLE_3D[item.type]`。其余锥体几何**暂不动**(4 种灯先都渲染成旧锥体;Task 3 再分形态)。
- `src/venue/VenueCanvas.tsx` `TYPE_STYLE`:删 `light:`,加 4 行:`light_grille4:{fill:'#fef9c3',stroke:'#ca8a04'}`、`light_grille8_stand:{fill:'#fde68a',stroke:'#d97706'}`、`light_spot:{fill:'#ffedd5',stroke:'#ea580c'}`、`light_grille4_stand:{fill:'#ecfccb',stroke:'#65a30d'}`。
- `src/venue/VenueInspector.tsx`:placement 开关排除条件里的 `&& item.type !== 'light'` 改为 `&& !isLightType(item.type)`(从 `@/venue/layoutData` 导入 `isLightType`)。
- `src/app/[locale]/(app)/guild-venue/page.tsx`:
  - `FACILITY_MENU_TYPES` 由 `['window','truss','light']` 改为 `['window','truss','light_grille4','light_grille4_stand','light_grille8_stand','light_spot']`。
  - `TOOL_ICON`:删 `light:`,加 4 行。导入所需 lucide 图标(试 `LampFloor`、`LampCeiling`、`Octagon`;若某个在已装版本不存在,回退到已导入的 `Grid3X3`/`Lightbulb`,并在报告里说明):`light_grille4:Grid3X3`、`light_grille4_stand:LampFloor`、`light_grille8_stand:Octagon`、`light_spot:LampCeiling`。
- `messages/{zh,en,ja}.json`:`venue.types` 与 `venue.addTypes` 删 `light`,各加 4 项:
  - `types`:grille4=格栅灯/Grille light/グリッドライト;grille8_stand=八角格栅灯/Octagon grille/八角グリッド;spot=射灯/Spotlight/スポットライト;grille4_stand=格栅灯(支架)/Grille light (stand)/グリッド(スタンド)。
  - `addTypes`:同名加 `+ ` 前缀(zh `+ 格栅灯` 等)。改后 `python3 -c "import json;json.load(open('messages/zh.json'))"` 三个都验证。

- [ ] **Step 5: 通过 + 编译** — `npm test`(全绿,3 组新用例);`npx tsc --noEmit`(干净);`npm run build`(通过)。

- [ ] **Step 6: 提交**
```bash
git -C /Users/fengzhou/Code/newWith-lightforms add src/venue/layoutData.ts src/venue/layoutData.test.ts src/venue/Venue3DCanvas.client.tsx src/venue/VenueCanvas.tsx src/venue/VenueInspector.tsx "src/app/[locale]/(app)/guild-venue/page.tsx" messages/zh.json messages/en.json messages/ja.json
git -C /Users/fengzhou/Code/newWith-lightforms commit -m "feat(venue): 灯拆为 4 种类型(数据+接线,暂用旧几何)"
```

---

### Task 2: 迁移 039(删旧灯 + 换约束)

**Files:** Create `supabase/migrations/039_venue_item_light_forms.sql`

- [ ] **Step 1: 写迁移**
```sql
-- 丢弃旧 light 数据;venue_items.type 用 4 种新灯替换 'light'(保留 truss)。
delete from venue_items where type = 'light';
alter table venue_items drop constraint venue_items_type_valid;
alter table venue_items add constraint venue_items_type_valid check (type in
  ('equipment','renovation','area','corridor','window',
   'door_inward','door_outward','door_sliding','fire','power','network',
   'truss','light_grille4','light_grille8_stand','light_spot','light_grille4_stand'));
```

- [ ] **Step 2: 提交 + 提醒**
```bash
git -C /Users/fengzhou/Code/newWith-lightforms add supabase/migrations/039_venue_item_light_forms.sql
git -C /Users/fengzhou/Code/newWith-lightforms commit -m "feat(venue): 迁移 039 — 4 种灯 type 约束 + 删旧 light"
```
实现末尾**提醒用户执行迁移 039**(含 `delete`,会清掉旧 light 数据,已授权)。

---

### Task 3: 每种灯的真实 3D 几何

**Files:** Modify `src/venue/Venue3DCanvas.client.tsx`(`Light3D`)

把 `Light3D` 从「所有灯都锥体」改为按 `item.type` 分形态。READ 当前 `Light3D`。`cx=item.x+item.width/2`、`cz=item.y+item.height/2`、`r=Math.max(1,Math.min(item.width,item.height)/2)`、`h3=Math.max(1,item.height3d)`、`elev=item.elevation`。`style=TYPE_STYLE_3D[item.type]`。

- [ ] **Step 1: 重写 Light3D 主体**（保留签名 `{ item, trussElevation, selected, onSelect }` 与 `handleClick`;把 return 换成按类型分支)

```tsx
  const cx = item.x + item.width / 2
  const cz = item.y + item.height / 2
  const r = Math.max(1, Math.min(item.width, item.height) / 2)
  const h3 = Math.max(1, item.height3d)
  const elev = item.elevation
  const edge = selected ? SELECTION_ACCENT : style.stroke
  const emissive = selected ? SELECTION_ACCENT : '#000000'
  const emi = selected ? 0.25 : 0

  // 灯面(格栅):四角=扁平方板;八角=八边扁棱柱。放在 y=panelY。
  const grillePanel = (octagon: boolean, panelY: number) => (
    <mesh position={[0, panelY, 0]}>
      {octagon
        ? <cylinderGeometry args={[r, r, h3, 8]} />
        : <boxGeometry args={[item.width, h3, item.height]} />}
      <meshStandardMaterial color={style.fill} emissive={emissive} emissiveIntensity={emi} />
      <Edges threshold={15} color={edge} scale={1.001} />
    </mesh>
  )
  // 支架:细杆从地面到 elev + 小底座
  const stand = (
    <>
      <mesh position={[0, elev / 2, 0]}>
        <boxGeometry args={[6, elev, 6]} />
        <meshStandardMaterial color="#334155" />
      </mesh>
      <mesh position={[0, 2, 0]}>
        <boxGeometry args={[24, 4, 24]} />
        <meshStandardMaterial color="#334155" />
      </mesh>
    </>
  )

  let body: React.ReactNode
  if (item.type === 'light_grille4') {
    body = grillePanel(false, h3 / 2)                    // 贴地方板
  } else if (item.type === 'light_grille4_stand') {
    body = <>{stand}{grillePanel(false, elev + h3 / 2)}</>
  } else if (item.type === 'light_grille8_stand') {
    body = <>{stand}{grillePanel(true, elev + h3 / 2)}</>
  } else {
    // light_spot:小筒 + 朝下短锥 + 吊臂到桁架
    const spotTopY = elev + h3
    const rodH = trussElevation !== undefined ? trussElevation - spotTopY : 0
    body = (
      <>
        <mesh position={[0, elev + h3 / 2, 0]}>
          <cylinderGeometry args={[6, 6, h3, 16]} />
          <meshStandardMaterial color={style.fill} emissive={emissive} emissiveIntensity={emi} />
          <Edges threshold={15} color={edge} scale={1.001} />
        </mesh>
        <mesh position={[0, elev - 5, 0]}>
          <coneGeometry args={[8, 10, 16]} />
          <meshStandardMaterial color={style.fill} emissive={emissive} emissiveIntensity={emi} />
        </mesh>
        {rodH > 0 && (
          <mesh position={[0, spotTopY + rodH / 2, 0]}>
            <boxGeometry args={[4, rodH, 4]} />
            <meshStandardMaterial color="#334155" />
          </mesh>
        )}
      </>
    )
  }

  return (
    <group position={[cx, 0, cz]} onClick={handleClick}>
      {body}
    </group>
  )
```
(删除旧的 `coneH`/`softboxCenterY`/`softboxTopY`/`rodH` 顶部变量,用上面新变量。若 `React` 未导入,用 `JSX.Element`/`ReactNode` 时改成不标注或从 react 导入 —— 沿用文件现有风格,让 tsc 通过。`Edges`/`SELECTION_ACCENT`/`ThreeEvent` 已在文件中。)

- [ ] **Step 2: tsc + build** — `cd /Users/fengzhou/Code/newWith-lightforms && npx tsc --noEmit && npm run build`（通过）。

- [ ] **Step 3: 提交**
```bash
git -C /Users/fengzhou/Code/newWith-lightforms add src/venue/Venue3DCanvas.client.tsx
git -C /Users/fengzhou/Code/newWith-lightforms commit -m "feat(venue): 4 种灯的真实 3D 几何(格栅/支架/射灯)"
```

---

### Task 4: 全量校验 + 人工 3D 验证 + changelog

- [ ] **Step 1: 全量** — `cd /Users/fengzhou/Code/newWith-lightforms && npm test && npx tsc --noEmit && npm run build`（测试全绿、tsc 干净、build 通过）。

- [ ] **Step 2: 人工 3D 验证(前置:迁移 039 已执行)** — dev(`PORT=3012 npm run dev`)或 PR 预览。「+ 设施」下拉应有:窗户 / 桁架 / 格栅灯 / 格栅灯·支架 / 八角格栅灯 / 射灯。逐个添加、切 3D 确认:格栅灯贴地方板;支架款有竖杆+底座、灯面抬高;八角款灯面是八边形;射灯是小筒+锥、放到桁架下有竖直吊臂。`preview_screenshot` 留证。

- [ ] **Step 3: changelog** — `src/lib/changelog/entries.ts` 的最新日期块 items 顶部加(日期用当天 `2026-07-01`;若该日期块不存在则新建一个,加到数组顶部):
```ts
{
  kind: 'improve',
  scope: '场地布置',
  title: '灯拆成 4 种形态:落地格栅灯 / 支架格栅灯 / 八角格栅灯 / 桁架射灯',
  details: '原来的「灯」拆成 4 种独立组件,各有真实 3D 外观:直接落地的四角格栅灯、带支架的四角/八角格栅灯、以及吸附桁架吊在天花的射灯。都在工具栏「+ 设施」下拉里选择。',
},
```
提交:`git -C /Users/fengzhou/Code/newWith-lightforms add src/lib/changelog/entries.ts && git -C /Users/fengzhou/Code/newWith-lightforms commit -m "docs(changelog): 灯拆 4 种形态"`

---

## Self-Review notes
- **Spec 覆盖:** 4 类型+默认(T1)、迁移删旧+约束(T2)、每形态几何(T3)、验证+changelog(T4)。isLightType / lightTrussAttachments→light_spot / 各穷举表 / 入口 / i18n 均在 T1。
- **类型一致:** 4 个类型 id 全程一致;`isLightType` T1 定义,T1(渲染循环/Inspector)+ 隐含使用一致;`lightTrussAttachments` 只对 `light_spot`;`Light3D` 签名不变,T1 用旧锥体、T3 换真实几何。
- **绿色中间态:** T1 完成即编译+测试+构建通过(灯为临时锥体),可独立 review;T3 只改 Light3D 几何。
- **无占位:** 迁移 039 已定;lucide 图标给了首选 + 回退说明。
