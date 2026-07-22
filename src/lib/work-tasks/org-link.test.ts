import assert from 'node:assert/strict'
import test from 'node:test'

import { POSITION_DEPARTMENT, departmentForPositions, prefillFromItem, matchItemByName } from './org-link.ts'
import type { TaskItem } from '../types/index.ts'

test('POSITION_DEPARTMENT: 覆盖全部 10 个岗位 key', () => {
  const keys = ['streamer','mc','agent','group_ops','makeup','dance_coach','video_editor','photographer','guild_leader','finance_tax']
  for (const k of keys) assert.ok(POSITION_DEPARTMENT[k], `missing mapping for ${k}`)
})

test('departmentForPositions: 单一部门 → 预填该部门', () => {
  assert.equal(departmentForPositions(['finance_tax']), 'finance')
  assert.equal(departmentForPositions(['streamer','makeup','dance_coach']), 'content')
})

test('departmentForPositions: 多部门或空 → null', () => {
  assert.equal(departmentForPositions(['finance_tax','streamer']), null)
  assert.equal(departmentForPositions([]), null)
  assert.equal(departmentForPositions(['unknown_key']), null)
})

const baseItem = (over: Partial<TaskItem> = {}): TaskItem => ({
  id: 'it1', task_id: 't1', name: '对账', sort_order: 1,
  owner_member_type: null, owner_user_id: null, owner_creator_id: null, ...over,
})

test('prefillFromItem: user 负责人 → 预填 owner_user_id,ownerIsCreator=false', () => {
  const r = prefillFromItem(baseItem({ owner_member_type: 'user', owner_user_id: 'u9' }), ['finance_tax'])
  assert.equal(r.business_task_item_id, 'it1')
  assert.equal(r.business_task_item_name, '对账')
  assert.equal(r.title, '对账')
  assert.equal(r.owner_user_id, 'u9')
  assert.equal(r.ownerIsCreator, false)
  assert.equal(r.department, 'finance')
})

test('prefillFromItem: creator 负责人 → 不预填 owner_user_id,ownerIsCreator=true', () => {
  const r = prefillFromItem(baseItem({ owner_member_type: 'creator', owner_creator_id: 'c3' }), ['streamer'])
  assert.equal(r.owner_user_id, null)
  assert.equal(r.ownerIsCreator, true)
  assert.equal(r.department, 'content')
})

test('prefillFromItem: 无负责人 + 多岗位 → owner null,department null', () => {
  const r = prefillFromItem(baseItem(), ['finance_tax','streamer'])
  assert.equal(r.owner_user_id, null)
  assert.equal(r.ownerIsCreator, false)
  assert.equal(r.department, null)
})

test('matchItemByName: 唯一大小写不敏感匹配 → 返回 id', () => {
  const items = [{ id: 'a', name: '对账' }, { id: 'b', name: '招募' }]
  assert.equal(matchItemByName(items, ' 对账 '), 'a')
  assert.equal(matchItemByName(items, '招募'), 'b')
})

test('matchItemByName: 无匹配或重名歧义 → null', () => {
  const items = [{ id: 'a', name: '对账' }, { id: 'b', name: '对账' }, { id: 'c', name: '招募' }]
  assert.equal(matchItemByName(items, '对账'), null)
  assert.equal(matchItemByName(items, '不存在'), null)
})
