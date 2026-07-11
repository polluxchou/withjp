import assert from 'node:assert/strict'
import test from 'node:test'

import { validatePersonRef, ownerNameOf, sortByOrder } from './tree.ts'
import type { PersonOption } from '../types/index.ts'

const people: PersonOption[] = [
  { member_type: 'user',    id: 'u1', name: '张三' },
  { member_type: 'creator', id: 'c1', name: '主播A' },
]

test('validatePersonRef: user 型必须只有 user_id', () => {
  assert.equal(validatePersonRef({ member_type: 'user', user_id: 'u1', creator_id: null }), true)
  assert.equal(validatePersonRef({ member_type: 'user', user_id: null, creator_id: null }), false)
  assert.equal(validatePersonRef({ member_type: 'user', user_id: 'u1', creator_id: 'c1' }), false)
})

test('validatePersonRef: creator 型必须只有 creator_id', () => {
  assert.equal(validatePersonRef({ member_type: 'creator', user_id: null, creator_id: 'c1' }), true)
  assert.equal(validatePersonRef({ member_type: 'creator', user_id: 'u1', creator_id: null }), false)
})

test('ownerNameOf: 按 member_type 从候选人里查名字，查不到返回 null', () => {
  assert.equal(ownerNameOf({ member_type: 'user', user_id: 'u1', creator_id: null }, people), '张三')
  assert.equal(ownerNameOf({ member_type: 'creator', user_id: null, creator_id: 'c1' }, people), '主播A')
  assert.equal(ownerNameOf({ member_type: 'user', user_id: 'uX', creator_id: null }, people), null)
  assert.equal(ownerNameOf({ member_type: 'user', user_id: null, creator_id: null }, people), null)
})

test('sortByOrder: 按 sort_order 升序（稳定）', () => {
  const input = [{ sort_order: 2, name: 'b' }, { sort_order: 1, name: 'a' }, { sort_order: 2, name: 'c' }]
  assert.deepEqual(sortByOrder(input).map((x) => x.name), ['a', 'b', 'c'])
})
