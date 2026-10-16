import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildFloorItems,
  buildPlacedItems,
  countListTabs,
  filterCollaborators,
  isInMarkersTab,
  listTabItems,
  sumItemCost,
  topAreaRank,
} from './floor-items.ts'
import type { Item } from '@/lib/items/types'
import type { Expense } from '@/lib/types'
import type { VenueItem, VenueItemType } from '@/venue/layoutData'

function venueItem(id: string, type: VenueItemType, width = 100, height = 100): VenueItem {
  return {
    id, type, name: `名-${id}`, x: 0, y: 0, width, height, rotation: 0, status: 'planned', note: '',
    height3d: 0, elevation: 0, thickness: 0, placement: 'ground',
  }
}

function stock(id: string, zone: string | null, expenseId: string | null, quantity = 1): Item {
  return { id, item_code: `IT-${id}`, name: `物品${id}`, quantity, placement_venue_item_id: zone, expense_id: expenseId } as Item
}

const expenses = {
  e1: { id: 'e1', unit_price: '120.5' },
  e2: { id: 'e2', unit_price: 30 },
} as unknown as Record<string, Expense>

// ── 物品联动 ──

test('buildPlacedItems: 只取放在该区域的物品,成本 = 单价 × 数量', () => {
  const items = [stock('1', 'zone-a', 'e1', 2), stock('2', 'zone-b', 'e2'), stock('3', 'zone-a', null, 5)]
  assert.deepEqual(buildPlacedItems(items, expenses, { id: 'zone-a' }), [
    { id: '1', item_code: 'IT-1', name: '物品1', quantity: 2, cost: 241 },
    { id: '3', item_code: 'IT-3', name: '物品3', quantity: 5, cost: 0 },
  ])
})

test('buildPlacedItems: 没选区域为空;支出看不到(不在表里)按 0', () => {
  assert.deepEqual(buildPlacedItems([stock('1', 'zone-a', 'e1')], expenses, null), [])
  assert.equal(buildPlacedItems([stock('1', 'zone-a', 'e1')], {}, { id: 'zone-a' })[0].cost, 0)
})

test('buildFloorItems: 汇总落在本楼层任意组件上的物品,带区域名', () => {
  const floor = { items: [venueItem('zone-a', 'area'), venueItem('zone-b', 'equipment')] }
  const items = [stock('1', 'zone-a', 'e2', 3), stock('2', 'other-floor', 'e1'), stock('3', null, 'e1'), stock('4', 'zone-b', null)]
  assert.deepEqual(buildFloorItems(items, expenses, floor), [
    { id: '1', item_code: 'IT-1', name: '物品1', quantity: 3, cost: 90, zoneName: '名-zone-a' },
    { id: '4', item_code: 'IT-4', name: '物品4', quantity: 1, cost: 0, zoneName: '名-zone-b' },
  ])
  assert.deepEqual(buildFloorItems(items, expenses, undefined), [])
})

test('sumItemCost: 累加 cost', () => {
  assert.equal(sumItemCost([{ cost: 1.5 }, { cost: 2 }, { cost: 0 }]), 3.5)
  assert.equal(sumItemCost([]), 0)
})

// ── 组件清单 ──

test('isInMarkersTab: 标识类型 + 结构(corridor)归「标识」页', () => {
  assert.equal(isInMarkersTab('door_inward'), true)
  assert.equal(isInMarkersTab('network'), true)
  assert.equal(isInMarkersTab('corridor'), true)
  assert.equal(isInMarkersTab('area'), false)
  assert.equal(isInMarkersTab('window'), false)
})

test('countListTabs: 两个分页的计数', () => {
  const items = [venueItem('a', 'area'), venueItem('c', 'corridor'), venueItem('d', 'door_inward'), venueItem('e', 'equipment')]
  assert.deepEqual(countListTabs(items), { markerCount: 2, shapeCount: 2 })
})

test('listTabItems: 按分页与类型筛选,面积从大到小', () => {
  const items = [
    venueItem('small', 'area', 100, 100),
    venueItem('big', 'equipment', 300, 300),
    venueItem('mid', 'area', 200, 200),
    venueItem('door', 'door_inward'),
    venueItem('hall', 'corridor', 500, 500),
  ]
  const all = new Set<VenueItemType>(['area', 'equipment', 'door_inward', 'corridor'])
  assert.deepEqual(listTabItems(items, all, 'shapes').map((i) => i.id), ['big', 'mid', 'small'])
  assert.deepEqual(listTabItems(items, all, 'markers').map((i) => i.id), ['hall', 'door'])
  assert.deepEqual(listTabItems(items, new Set<VenueItemType>(['area']), 'shapes').map((i) => i.id), ['mid', 'small'])
  // 原数组不被排序改动
  assert.equal(items[0].id, 'small')
})

test('topAreaRank: 只排空间,取面积前三,与筛选无关', () => {
  const items = [
    venueItem('a1', 'area', 100, 100),
    venueItem('eq', 'equipment', 900, 900),
    venueItem('a2', 'area', 400, 400),
    venueItem('a3', 'area', 300, 300),
    venueItem('a4', 'area', 200, 200),
  ]
  assert.deepEqual(Array.from(topAreaRank(items)), [['a2', 0], ['a3', 1], ['a4', 2]])
})

// ── 协作者 ──

test('filterCollaborators: 姓名/邮箱忽略大小写匹配,空查询原样返回', () => {
  const users = [
    { id: '1', name: 'Alice Wang', email: 'alice@example.com' },
    { id: '2', name: '小林', email: null },
    { id: '3', name: 'Bob', email: 'BOB@Example.com' },
  ]
  assert.deepEqual(filterCollaborators(users, '  ALICE ').map((u) => u.id), ['1'])
  assert.deepEqual(filterCollaborators(users, 'example').map((u) => u.id), ['1', '3'])
  assert.deepEqual(filterCollaborators(users, '小林').map((u) => u.id), ['2'])
  assert.equal(filterCollaborators(users, '   '), users)
})
