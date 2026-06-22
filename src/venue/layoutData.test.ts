import assert from 'node:assert/strict'
import test from 'node:test'

import {
  addVenueItem,
  centimetersToMeters,
  createHistory,
  deleteVenueItem,
  metersToCentimeters,
  parseStoredVenueLayout,
  redoHistory,
  undoHistory,
  updateVenueFloor,
  updateVenueItem,
  DEFAULT_VENUE_LAYOUT,
  type VenueItem,
} from './layoutData.ts'

test('centimetersToMeters and metersToCentimeters convert layout units for the inspector', () => {
  assert.equal(centimetersToMeters(160), 1.6)
  assert.equal(centimetersToMeters(125), 1.25)
  assert.equal(metersToCentimeters(1.6), 160)
  assert.equal(metersToCentimeters(1.255), 126)
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

test('parseStoredVenueLayout falls back to default layout for invalid JSON', () => {
  assert.deepEqual(parseStoredVenueLayout('{bad-json'), DEFAULT_VENUE_LAYOUT)
})

test('parseStoredVenueLayout accepts a valid stored layout', () => {
  const customItem: VenueItem = {
    id: 'custom-1',
    type: 'exit',
    name: '临时出口',
    x: 10,
    y: 20,
    width: 90,
    height: 40,
    rotation: 0,
    status: 'maintenance',
    note: '测试',
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
