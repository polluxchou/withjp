import assert from 'node:assert/strict'
import test from 'node:test'

import {
  addVenueItem,
  applyVenueAction,
  calculateVenueCanvasFit,
  centimetersToMeters,
  createHistory,
  default3DForType,
  deleteVenueItem,
  formatVenueMeasurement,
  metersToCentimeters,
  moveVenueItemLayer,
  moveVenueItems,
  parseStoredVenueLayout,
  resolveVenueItemName,
  sanitizeViewBookmarks,
  pushHistory,
  redoHistory,
  snapVenueItemToAlignment,
  totalVenueAreaSquareMeters,
  undoHistory,
  updateVenueFloor,
  updateVenueItem,
  venueAreaSquareMeters,
  DEFAULT_FLOOR_HEIGHT,
  DEFAULT_VENUE_LAYOUT,
  loadVenueLayout,
  writeStoredVenueLayout,
  lightTrussAttachments,
  isLightType,
  VENUE_STORAGE_KEY,
  VENUE_LEGACY_STORAGE_KEY,
  VENUE_BACKUP_STORAGE_KEY,
  type VenueItem,
  type VenueItemType,
  type VenueLayout,
} from './layoutData.ts'

function makeStorage(initial: Record<string, string> = {}) {
  const data = new Map<string, string>(Object.entries(initial))
  return {
    data,
    getItem: (key: string) => (data.has(key) ? data.get(key)! : null),
    setItem: (key: string, value: string) => { data.set(key, value) },
  }
}

function makeItem(overrides: Partial<VenueItem>): VenueItem {
  return {
    id: 'item',
    type: 'area',
    name: '区域',
    x: 0,
    y: 0,
    width: 100,
    height: 100,
    rotation: 0,
    status: 'planned',
    note: '',
    height3d: 0,
    elevation: 0,
    thickness: 0,
    placement: 'ground',
    ...overrides,
  }
}

test('venueAreaSquareMeters converts width/height (cm) to square meters', () => {
  assert.equal(venueAreaSquareMeters({ width: 500, height: 850 }), 42.5)
})

test('totalVenueAreaSquareMeters sums only area-type items', () => {
  const items: VenueItem[] = [
    makeItem({ id: 'a', type: 'area', width: 500, height: 800 }),     // 40 m²
    makeItem({ id: 'b', type: 'area', width: 1000, height: 1000 }),   // 100 m²
    makeItem({ id: 'c', type: 'equipment', width: 200, height: 200 }), // excluded
    makeItem({ id: 'd', type: 'renovation', width: 300, height: 300 }), // excluded
    makeItem({ id: 'e', type: 'corridor', width: 400, height: 400 }),  // excluded
  ]
  assert.equal(totalVenueAreaSquareMeters(items), 140)
})

test('centimetersToMeters and metersToCentimeters convert layout units for the inspector', () => {
  assert.equal(centimetersToMeters(160), 1.6)
  assert.equal(centimetersToMeters(125), 1.25)
  assert.equal(metersToCentimeters(1.6), 160)
})

test('毫米精度:长度保留到 0.001m(0.1cm)', () => {
  // cm(可含 0.1cm)→ 米 3 位小数
  assert.equal(centimetersToMeters(590.5), 5.905)
  assert.equal(centimetersToMeters(590), 5.9)
  // 米 → cm 保留 0.1cm
  assert.equal(metersToCentimeters(5.905), 590.5)
  assert.equal(metersToCentimeters(5.9), 590)
  // 更细的输入四舍五入到毫米
  assert.equal(metersToCentimeters(1.2345), 123.5)
  // 标尺显示到毫米
  assert.ok(formatVenueMeasurement(590.5).includes('5.905'))
})

test('formatVenueMeasurement formats centimeters as concise meters', () => {
  assert.equal(formatVenueMeasurement(160), '1.6m')
  assert.equal(formatVenueMeasurement(125), '1.25m')
  assert.equal(formatVenueMeasurement(1200), '12m')
})

test('calculateVenueCanvasFit treats 100 percent as fitting the whole floor in the viewport', () => {
  const fit = calculateVenueCanvasFit({
    floorWidth: 4000,
    floorHeight: 1800,
    viewportWidth: 1320,
    viewportHeight: 820,
    zoom: 1,
    padding: 40,
  })

  assert.equal(fit.scale, 0.32)
  assert.equal(fit.width, 1280)
  assert.equal(fit.height, 576)
})

test('calculateVenueCanvasFit scales from the fitted 100 percent size', () => {
  const fit = calculateVenueCanvasFit({
    floorWidth: 4000,
    floorHeight: 1800,
    viewportWidth: 1320,
    viewportHeight: 820,
    zoom: 1.7,
    padding: 40,
  })

  assert.equal(fit.scale, 0.544)
  assert.equal(fit.width, 2176)
  assert.equal(fit.height, 979)
})

test('addVenueItem creates a unique item with default geometry and status', () => {
  const layout = DEFAULT_VENUE_LAYOUT
  const floorId = layout.floors[0].id
  const beforeCount = layout.floors[0].items.length

  const next = addVenueItem(layout, floorId, 'equipment')
  const item = next.floors[0].items.at(-1)

  assert.equal(next.floors[0].items.length, beforeCount + 1)
  assert.ok(item)
  assert.equal(item?.type, 'equipment')
  assert.equal(item?.status, 'planned')
  assert.equal(item?.width, 160)
  assert.equal(item?.height, 80)
  assert.notEqual(item?.id, layout.floors[0].items[0].id)
})

test('updateVenueItem changes only the targeted item', () => {
  const layout = DEFAULT_VENUE_LAYOUT
  const floorId = layout.floors[0].id
  const first = layout.floors[0].items[0]
  const second = layout.floors[0].items[1]

  const next = updateVenueItem(layout, floorId, first.id, { name: '新设备架', x: 240 })

  const changed = next.floors[0].items.find((item) => item.id === first.id)
  const untouched = next.floors[0].items.find((item) => item.id === second.id)
  assert.equal(changed?.name, '新设备架')
  assert.equal(changed?.x, 240)
  assert.deepEqual(untouched, second)
})

test('moveVenueItems moves every selected item by the same delta', () => {
  const layout = DEFAULT_VENUE_LAYOUT
  const floorId = layout.floors[0].id
  const first = layout.floors[0].items[0]
  const second = layout.floors[0].items[1]
  const third = layout.floors[0].items[2]

  const next = moveVenueItems(layout, floorId, [first.id, second.id], { x: 24, y: -12 })

  assert.equal(next.floors[0].items[0].x, first.x + 24)
  assert.equal(next.floors[0].items[0].y, first.y - 12)
  assert.equal(next.floors[0].items[1].x, second.x + 24)
  assert.equal(next.floors[0].items[1].y, second.y - 12)
  assert.deepEqual(next.floors[0].items[2], third)
})

test('updateVenueFloor changes canvas dimensions and keeps them usable', () => {
  const layout = DEFAULT_VENUE_LAYOUT
  const floorId = layout.floors[0].id

  const resized = updateVenueFloor(layout, floorId, { width: 1800, height: 1100 })
  const clamped = updateVenueFloor(layout, floorId, { width: -20, height: Number.NaN })

  assert.equal(resized.floors[0].width, 1800)
  assert.equal(resized.floors[0].height, 1100)
  assert.equal(resized.floors[1].width, layout.floors[1].width)
  assert.equal(clamped.floors[0].width, 100)
  assert.equal(clamped.floors[0].height, 100)
})

test('deleteVenueItem removes the item and clears selection when necessary', () => {
  const layout = DEFAULT_VENUE_LAYOUT
  const floorId = layout.floors[0].id
  const selectedId = layout.floors[0].items[0].id

  const result = deleteVenueItem(layout, floorId, selectedId, selectedId)

  assert.equal(result.layout.floors[0].items.some((item) => item.id === selectedId), false)
  assert.equal(result.selectedItemId, null)
})

test('moveVenueItemLayer changes item drawing order within a floor', () => {
  const layout = DEFAULT_VENUE_LAYOUT
  const floorId = layout.floors[0].id
  const itemIds = layout.floors[0].items.map((item) => item.id)

  const forward = moveVenueItemLayer(layout, floorId, itemIds[1], 'forward')
  assert.deepEqual(
    forward.floors[0].items.map((item) => item.id),
    [itemIds[0], itemIds[2], itemIds[1], ...itemIds.slice(3)],
  )

  const front = moveVenueItemLayer(layout, floorId, itemIds[1], 'front')
  assert.deepEqual(
    front.floors[0].items.map((item) => item.id),
    [itemIds[0], ...itemIds.slice(2), itemIds[1]],
  )

  const back = moveVenueItemLayer(layout, floorId, itemIds[2], 'back')
  assert.deepEqual(
    back.floors[0].items.map((item) => item.id),
    [itemIds[2], itemIds[0], itemIds[1], ...itemIds.slice(3)],
  )
})

test('moveVenueItemLayer returns the same layout when the item cannot move', () => {
  const layout = DEFAULT_VENUE_LAYOUT
  const floorId = layout.floors[0].id
  const firstId = layout.floors[0].items[0].id
  const lastId = layout.floors[0].items.at(-1)?.id ?? ''

  assert.equal(moveVenueItemLayer(layout, floorId, firstId, 'backward'), layout)
  assert.equal(moveVenueItemLayer(layout, floorId, firstId, 'back'), layout)
  assert.equal(moveVenueItemLayer(layout, floorId, lastId, 'forward'), layout)
  assert.equal(moveVenueItemLayer(layout, floorId, lastId, 'front'), layout)
  assert.equal(moveVenueItemLayer(layout, floorId, 'missing', 'front'), layout)
})

test('snapVenueItemToAlignment aligns moving item edges and centers to nearby items', () => {
  const layout = DEFAULT_VENUE_LAYOUT
  const target = layout.floors[0].items[0]
  const moving = layout.floors[0].items[1]

  const snapped = snapVenueItemToAlignment(
    moving,
    layout.floors[0].items,
    {
      x: target.x + target.width - moving.width + 6,
      y: target.y + target.height / 2 - moving.height / 2 - 5,
    },
    8,
  )

  assert.equal(snapped.x, target.x + target.width - moving.width)
  assert.equal(snapped.y, target.y + target.height / 2 - moving.height / 2)
  assert.equal(snapped.guides.length, 2)
  assert.deepEqual(snapped.guides.map((guide) => guide.axis).sort(), ['x', 'y'])
})

test('snapVenueItemToAlignment leaves position unchanged outside the threshold', () => {
  const layout = DEFAULT_VENUE_LAYOUT
  const moving = layout.floors[0].items[1]
  const position = { x: 700, y: 333 }

  const snapped = snapVenueItemToAlignment(moving, layout.floors[0].items, position, 4)

  assert.equal(snapped.x, position.x)
  assert.equal(snapped.y, position.y)
  assert.deepEqual(snapped.guides, [])
})

test('undoHistory and redoHistory preserve previous and next layouts', () => {
  const initial = createHistory(DEFAULT_VENUE_LAYOUT)
  const floorId = DEFAULT_VENUE_LAYOUT.floors[0].id
  const changedLayout = updateVenueItem(
    DEFAULT_VENUE_LAYOUT,
    floorId,
    DEFAULT_VENUE_LAYOUT.floors[0].items[0].id,
    { x: 333 },
  )

  const changed = createHistory(changedLayout, [DEFAULT_VENUE_LAYOUT], [])
  const undone = undoHistory(changed)
  const redone = redoHistory(undone)

  assert.equal(initial.present.floors[0].items[0].x, DEFAULT_VENUE_LAYOUT.floors[0].items[0].x)
  assert.equal(undone.present.floors[0].items[0].x, DEFAULT_VENUE_LAYOUT.floors[0].items[0].x)
  assert.equal(undone.future.length, 1)
  assert.equal(redone.present.floors[0].items[0].x, 333)
  assert.equal(redone.past.length, 1)
})

test('pushHistory keeps only the latest 20 undo steps', () => {
  let history = createHistory(DEFAULT_VENUE_LAYOUT)
  const floorId = DEFAULT_VENUE_LAYOUT.floors[0].id
  const itemId = DEFAULT_VENUE_LAYOUT.floors[0].items[0].id

  for (let index = 1; index <= 25; index += 1) {
    history = pushHistory(
      history,
      updateVenueItem(history.present, floorId, itemId, { x: index }),
    )
  }

  assert.equal(history.past.length, 20)
  assert.equal(history.past[0].floors[0].items[0].x, 5)
  assert.equal(history.present.floors[0].items[0].x, 25)
})

test('parseStoredVenueLayout falls back to default layout for invalid JSON', () => {
  assert.deepEqual(parseStoredVenueLayout('{bad-json'), DEFAULT_VENUE_LAYOUT)
})

test('parseStoredVenueLayout accepts a valid stored layout', () => {
  const customItem: VenueItem = {
    id: 'custom-1',
    type: 'corridor',
    name: '临时通道',
    x: 10,
    y: 20,
    width: 90,
    height: 40,
    rotation: 0,
    status: 'maintenance',
    note: '测试',
    height3d: 0,
    elevation: 0,
    thickness: 0,
    placement: 'ground',
  }
  const stored = {
    ...DEFAULT_VENUE_LAYOUT,
    name: '自定义场地',
    floors: [{ ...DEFAULT_VENUE_LAYOUT.floors[0], items: [customItem] }],
  }

  const parsed = parseStoredVenueLayout(JSON.stringify(stored))

  assert.equal(parsed.name, '自定义场地')
  assert.deepEqual(parsed.floors[0].items, [customItem])
})

test('parseStoredVenueLayout drops items of removed types but keeps the rest', () => {
  const keep = makeItem({ id: 'keep-1', type: 'area', name: '空间', width: 500, height: 400 })
  const stored = {
    ...DEFAULT_VENUE_LAYOUT,
    name: '迁移场地',
    floors: [{
      ...DEFAULT_VENUE_LAYOUT.floors[0],
      items: [keep, { ...keep, id: 'old-1', type: 'workstation' } as unknown as VenueItem],
    }],
  }

  const parsed = parseStoredVenueLayout(JSON.stringify(stored))

  assert.equal(parsed.name, '迁移场地')
  assert.deepEqual(parsed.floors[0].items.map((item) => item.id), ['keep-1'])
})

test('default3DForType returns per-type extrusion and elevation defaults', () => {
  assert.deepEqual(default3DForType('equipment'),  { height3d: 100, elevation: 0  })
  assert.deepEqual(default3DForType('renovation'), { height3d: 280, elevation: 0  })
  assert.deepEqual(default3DForType('area'),       { height3d: 280, elevation: 0  })
  assert.deepEqual(default3DForType('corridor'),   { height3d: 0,   elevation: 0  })
  assert.deepEqual(default3DForType('door_inward'),{ height3d: 200, elevation: 0  })
  assert.deepEqual(default3DForType('fire'),       { height3d: 60,  elevation: 0  })
  assert.deepEqual(default3DForType('power'),      { height3d: 15,  elevation: 30 })
  assert.deepEqual(default3DForType('network'),    { height3d: 10,  elevation: 30 })
})

test('addVenueItem stamps the per-type 3D defaults on the new item', () => {
  const layout = DEFAULT_VENUE_LAYOUT
  const floorId = layout.floors[0].id

  const afterEquipment = addVenueItem(layout, floorId, 'equipment')
  const equipment = afterEquipment.floors[0].items.at(-1)
  assert.equal(equipment?.height3d, 100)
  assert.equal(equipment?.elevation, 0)

  const afterPower = addVenueItem(layout, floorId, 'power')
  const power = afterPower.floors[0].items.at(-1)
  assert.equal(power?.height3d, 15)
  assert.equal(power?.elevation, 30)
})

test('DEFAULT_VENUE_LAYOUT seeds every floor with floorHeight and every item with 3D fields', () => {
  for (const floor of DEFAULT_VENUE_LAYOUT.floors) {
    assert.equal(floor.floorHeight, DEFAULT_FLOOR_HEIGHT)
    for (const item of floor.items) {
      assert.equal(typeof item.height3d, 'number')
      assert.equal(typeof item.elevation, 'number')
      assert.ok(item.height3d >= 0)
      assert.ok(item.elevation >= 0)
    }
  }
})

test('updateVenueItem persists a height3d patch and leaves siblings untouched', () => {
  const layout = DEFAULT_VENUE_LAYOUT
  const floorId = layout.floors[0].id
  const target = layout.floors[0].items[0]
  const sibling = layout.floors[0].items[1]

  const next = updateVenueItem(layout, floorId, target.id, { height3d: 175, elevation: 12 })

  const changed = next.floors[0].items.find((item) => item.id === target.id)
  const untouched = next.floors[0].items.find((item) => item.id === sibling.id)
  assert.equal(changed?.height3d, 175)
  assert.equal(changed?.elevation, 12)
  assert.deepEqual(untouched, sibling)
})

test('updateVenueItem clamps negative 3D values to zero (normalize)', () => {
  const layout = DEFAULT_VENUE_LAYOUT
  const floorId = layout.floors[0].id
  const target = layout.floors[0].items[0]

  const next = updateVenueItem(layout, floorId, target.id, { height3d: -50, elevation: Number.NaN })

  const changed = next.floors[0].items.find((item) => item.id === target.id)
  assert.equal(changed?.height3d, 0)
  assert.equal(changed?.elevation, 0)
})

test('updateVenueFloor clamps floorHeight to a sane minimum and rejects NaN', () => {
  const layout = DEFAULT_VENUE_LAYOUT
  const floorId = layout.floors[0].id

  const resized = updateVenueFloor(layout, floorId, { floorHeight: 320 })
  const clamped = updateVenueFloor(layout, floorId, { floorHeight: 40 })
  const naned = updateVenueFloor(layout, floorId, { floorHeight: Number.NaN })

  assert.equal(resized.floors[0].floorHeight, 320)
  assert.equal(clamped.floors[0].floorHeight, 100)
  assert.equal(naned.floors[0].floorHeight, DEFAULT_FLOOR_HEIGHT)
})

test('parseStoredVenueLayout backfills 3D fields and floorHeight on a legacy layout', () => {
  // Mimic an on-disk layout written before the 3D fields existed: no height3d,
  // no elevation on items; no floorHeight on the floor.
  const legacy = {
    venueId: 'guild-main',
    name: '旧场地',
    width: 1200,
    height: 800,
    floors: [
      {
        id: 'floor-1',
        name: '1F',
        width: 1200,
        height: 800,
        items: [
          { id: 'legacy-eq', type: 'equipment', name: '设备', x: 0, y: 0, width: 100, height: 60, rotation: 0, status: 'planned', note: '' },
          { id: 'legacy-power', type: 'power', name: '电源', x: 200, y: 200, width: 32, height: 32, rotation: 0, status: 'planned', note: '' },
        ],
      },
    ],
  }

  const parsed: VenueLayout = parseStoredVenueLayout(JSON.stringify(legacy))

  assert.equal(parsed.floors[0].floorHeight, DEFAULT_FLOOR_HEIGHT)
  const eq = parsed.floors[0].items.find((item) => item.id === 'legacy-eq')
  const power = parsed.floors[0].items.find((item) => item.id === 'legacy-power')
  assert.equal(eq?.height3d, 100)
  assert.equal(eq?.elevation, 0)
  assert.equal(power?.height3d, 15)
  assert.equal(power?.elevation, 30)
})

test('loadVenueLayout migrates from the legacy key without overwriting it', () => {
  const legacy = { ...DEFAULT_VENUE_LAYOUT, name: '旧场地' }
  const storage = makeStorage({ [VENUE_LEGACY_STORAGE_KEY]: JSON.stringify(legacy) })

  const result = loadVenueLayout(storage)

  assert.equal(result.layout.name, '旧场地')
  assert.equal(result.persistable, true)
  assert.equal(result.migratedFromLegacy, true)
  // Legacy key is left intact as a recovery backup.
  assert.ok(storage.data.has(VENUE_LEGACY_STORAGE_KEY))
})

test('loadVenueLayout marks present-but-invalid data as non-persistable', () => {
  const storage = makeStorage({ [VENUE_STORAGE_KEY]: '{bad-json' })

  const result = loadVenueLayout(storage)

  assert.equal(result.layout, DEFAULT_VENUE_LAYOUT)
  assert.equal(result.persistable, false)
})

test('writeStoredVenueLayout snapshots the previous value to the backup key', () => {
  const first = { ...DEFAULT_VENUE_LAYOUT, name: '第一版' }
  const second = { ...DEFAULT_VENUE_LAYOUT, name: '第二版' }
  const storage = makeStorage()

  writeStoredVenueLayout(storage, first)
  writeStoredVenueLayout(storage, second)

  assert.equal(JSON.parse(storage.getItem(VENUE_STORAGE_KEY)!).name, '第二版')
  assert.equal(JSON.parse(storage.getItem(VENUE_BACKUP_STORAGE_KEY)!).name, '第一版')
})

test('sanitizeViewBookmarks keeps valid entries, caps at 3, and drops empties', () => {
  assert.equal(sanitizeViewBookmarks(undefined), undefined)
  assert.equal(sanitizeViewBookmarks([]), undefined)
  assert.equal(sanitizeViewBookmarks([{ zoom: 1 }]), undefined) // missing left/top
  assert.deepEqual(
    sanitizeViewBookmarks([{ zoom: 1.2, left: 10, top: 20 }, { zoom: 'x', left: 0, top: 0 }]),
    [{ zoom: 1.2, left: 10, top: 20 }],
  )
  const five = Array.from({ length: 5 }, (_, i) => ({ zoom: 1, left: i, top: i }))
  assert.equal(sanitizeViewBookmarks(five)?.length, 3)
})

test('applyVenueAction add/update/delete/floor mutate only the target on the active floor', () => {
  const floorId = DEFAULT_VENUE_LAYOUT.floors[0].id
  const beforeCount = DEFAULT_VENUE_LAYOUT.floors[0].items.length

  // add: new area with name + size (meters → cm)
  const added = applyVenueAction(DEFAULT_VENUE_LAYOUT, floorId, { op: 'add', itemType: 'area', name: '主直播间', widthM: 5, heightM: 8, summary: '' }, null)
  const newItem = added.layout.floors[0].items.at(-1)!
  assert.equal(added.layout.floors[0].items.length, beforeCount + 1)
  assert.equal(newItem.type, 'area')
  assert.equal(newItem.name, '主直播间')
  assert.equal(newItem.width, 500)
  assert.equal(newItem.height, 800)
  assert.equal(added.selectedItemId, newItem.id)

  // update: rotate the added item, leave others untouched
  const updated = applyVenueAction(added.layout, floorId, { op: 'update', targetId: newItem.id, rotationDeg: 90, summary: '' }, newItem.id)
  assert.equal(updated.layout.floors[0].items.find((i) => i.id === newItem.id)?.rotation, 90)

  // unknown target → error, layout unchanged
  const bad = applyVenueAction(updated.layout, floorId, { op: 'delete', targetId: 'nope', summary: '' }, null)
  assert.equal(bad.error, 'target_not_found')
  assert.equal(bad.layout, updated.layout)

  // delete the added item
  const deleted = applyVenueAction(updated.layout, floorId, { op: 'delete', targetId: newItem.id, summary: '' }, newItem.id)
  assert.equal(deleted.layout.floors[0].items.some((i) => i.id === newItem.id), false)

  // floor: resize canvas (meters → cm)
  const resized = applyVenueAction(DEFAULT_VENUE_LAYOUT, floorId, { op: 'floor', widthM: 22, storeyHeightM: 3, summary: '' }, null)
  assert.equal(resized.layout.floors[0].width, 2200)
  assert.equal(resized.layout.floors[0].floorHeight, 300)
})

test('resolveVenueItemName: zh 用原名', () => {
  assert.equal(resolveVenueItemName('设备架', 'a', 'zh', { a: { ja: '設備', en: 'Rack' } }), '设备架')
})
test('resolveVenueItemName: ja 用译名,缺失回退原名', () => {
  assert.equal(resolveVenueItemName('设备架', 'a', 'ja', { a: { ja: '設備', en: 'Rack' } }), '設備')
  assert.equal(resolveVenueItemName('设备架', 'b', 'ja', {}), '设备架')
})
test('resolveVenueItemName: en 译名为空时回退原名', () => {
  assert.equal(resolveVenueItemName('设备架', 'a', 'en', { a: { ja: '設備', en: '' } }), '设备架')
})

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

test('addVenueItem(truss): 贴天花横梁默认', () => {
  const l = addVenueItem(DEFAULT_VENUE_LAYOUT, DEFAULT_VENUE_LAYOUT.floors[0].id, 'truss')
  const it = l.floors[0].items.at(-1)!
  assert.equal(it.type, 'truss'); assert.equal(it.placement, 'aerial')
  assert.equal(it.elevation, 260); assert.equal(it.height3d, 15)
})
test('addVenueItem: 4 种灯默认值', () => {
  const fid = DEFAULT_VENUE_LAYOUT.floors[0].id
  const g4 = addVenueItem(DEFAULT_VENUE_LAYOUT, fid, 'light_grille4').floors[0].items.at(-1)!
  assert.equal(g4.placement, 'ground'); assert.equal(g4.elevation, 0)
  const g8 = addVenueItem(DEFAULT_VENUE_LAYOUT, fid, 'light_grille8_stand').floors[0].items.at(-1)!
  assert.equal(g8.placement, 'aerial'); assert.equal(g8.elevation, 200)
  const sp = addVenueItem(DEFAULT_VENUE_LAYOUT, fid, 'light_spot').floors[0].items.at(-1)!
  assert.equal(sp.placement, 'aerial'); assert.equal(sp.elevation, 240)
  const g4s = addVenueItem(DEFAULT_VENUE_LAYOUT, fid, 'light_grille4_stand').floors[0].items.at(-1)!
  assert.equal(g4s.placement, 'ground'); assert.equal(g4s.elevation, 150)
})
test('isLightType: 4 种为 true,其它为 false', () => {
  for (const t of ['light_grille4','light_grille8_stand','light_spot','light_grille4_stand'] as VenueItemType[]) assert.equal(isLightType(t), true)
  for (const t of ['area','truss','window','equipment','door_inward'] as VenueItemType[]) assert.equal(isLightType(t), false)
})
test('lightTrussAttachments: 射灯与八角格栅灯吸附桁架,落地格栅灯不吸附', () => {
  const mk = (o: Partial<VenueItem> & { id: string; type: VenueItemType }): VenueItem => ({
    x: 0, y: 0, width: 40, height: 40, rotation: 0, status: 'planned', note: '',
    name: '', height3d: 0, elevation: 0, thickness: 0, placement: 'aerial', ...o,
  })
  const items = [
    mk({ id: 't1', type: 'truss', x: 0, y: 0, width: 300, height: 20, elevation: 260 }),
    mk({ id: 'S', type: 'light_spot', x: 100, y: 5, elevation: 240 }),
    mk({ id: 'O', type: 'light_grille8_stand', x: 100, y: 5, elevation: 200 }),
    mk({ id: 'G', type: 'light_grille4', x: 100, y: 5, elevation: 0 }),
  ]
  const m = lightTrussAttachments(items)
  assert.equal(m.get('S'), 260); assert.equal(m.get('O'), 260); assert.equal(m.get('G'), undefined)
})
