import assert from 'node:assert/strict'
import test from 'node:test'

import { validateItem, type EffectiveItem } from './validation.ts'

const basePhysical: EffectiveItem = {
  name: '椅子',
  kind: 'physical',
  expense_id: 'e1',
  placement_venue_item_id: 'v1',
  quantity: 1,
  status: 'in_use',
}

test('valid physical item passes', () => {
  assert.equal(validateItem(basePhysical), null)
})
test('physical without expense fails', () => {
  assert.match(String(validateItem({ ...basePhysical, expense_id: null })), /成本/)
})
test('physical without placement fails', () => {
  assert.match(String(validateItem({ ...basePhysical, placement_venue_item_id: null })), /位置/)
})
test('virtual with placement fails', () => {
  const v: EffectiveItem = { name: '会员', kind: 'virtual', expense_id: null, placement_venue_item_id: 'v1', quantity: 1, status: 'in_use' }
  assert.match(String(validateItem(v)), /虚拟/)
})
test('virtual without cost or placement passes', () => {
  const v: EffectiveItem = { name: '会员', kind: 'virtual', expense_id: null, placement_venue_item_id: null, quantity: 1, status: 'in_use' }
  assert.equal(validateItem(v), null)
})
test('empty name fails', () => {
  assert.match(String(validateItem({ ...basePhysical, name: '  ' })), /名称/)
})
test('quantity below 1 fails', () => {
  assert.match(String(validateItem({ ...basePhysical, quantity: 0 })), /数量/)
})
test('invalid kind fails', () => {
  assert.match(String(validateItem({ ...basePhysical, kind: 'weird' as EffectiveItem['kind'] })), /类型/)
})
test('invalid status fails', () => {
  assert.match(String(validateItem({ ...basePhysical, status: 'gone' as EffectiveItem['status'] })), /状态/)
})
