import assert from 'node:assert/strict'
import test from 'node:test'

import { rowsToLayout, layoutToRows } from './layout-sync.ts'
import type { VenueLayout } from '@/venue/layoutData'

const SAMPLE: VenueLayout = {
  venueId: 'guild-main',
  name: '主场地',
  width: 1200,
  height: 800,
  floors: [
    {
      id: 'floor-1',
      name: '1F',
      width: 1200,
      height: 800,
      floorHeight: 280,
      backgroundImage: 'data:image/png;base64,xxx',
      items: [
        { id: 'eq-1', type: 'equipment', name: '设备', x: 1, y: 2, width: 3, height: 4, rotation: 0, status: 'completed', note: 'n', height3d: 100, elevation: 0 },
        { id: 'area-1', type: 'area', name: '空间', x: 5, y: 6, width: 7, height: 8, rotation: 3, status: 'planned', note: '', height3d: 0, elevation: 0 },
      ],
    },
    { id: 'floor-2', name: '2F', width: 1200, height: 800, floorHeight: 280, items: [] },
  ],
}

test('layoutToRows flattens floors/items with sort_order + z_index + floor_id', () => {
  const { venue, floors, items } = layoutToRows(SAMPLE)
  assert.deepEqual(venue, { id: 'guild-main', name: '主场地', width: 1200, height: 800 })
  assert.equal(floors.length, 2)
  assert.deepEqual(
    floors.map((f) => [f.id, f.venue_id, f.sort_order, f.background_image]),
    [['floor-1', 'guild-main', 0, 'data:image/png;base64,xxx'], ['floor-2', 'guild-main', 1, null]],
  )
  assert.equal(items.length, 2)
  assert.deepEqual(
    items.map((i) => [i.id, i.floor_id, i.z_index]),
    [['eq-1', 'floor-1', 0], ['area-1', 'floor-1', 1]],
  )
})

test('rowsToLayout reassembles nested layout ordered by sort_order / z_index', () => {
  const { venue, floors, items } = layoutToRows(SAMPLE)
  const shuffledFloors = [floors[1], floors[0]]
  const shuffledItems = [items[1], items[0]]
  const rebuilt = rowsToLayout(venue, shuffledFloors, shuffledItems)
  assert.deepEqual(rebuilt, SAMPLE)
})

test('rowsToLayout drops background_image when null', () => {
  const rebuilt = rowsToLayout(
    { id: 'v', name: 'n', width: 10, height: 10 },
    [{ id: 'f1', venue_id: 'v', name: 'F', width: 10, height: 10, floor_height: 280, background_image: null, sort_order: 0 }],
    [],
  )
  assert.equal('backgroundImage' in rebuilt.floors[0], false)
  assert.equal(rebuilt.floors[0].floorHeight, 280)
})
