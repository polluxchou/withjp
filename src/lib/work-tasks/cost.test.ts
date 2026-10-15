import test from 'node:test'
import assert from 'node:assert/strict'

import { costVisibility } from './cost.ts'

test('管理员：合计与每个人的成本都显示（含没有薪资记录的人，行为不变）', () => {
  const v = costVisibility({ 'user-1': 15000 }, true)
  assert.equal(v.totals, true)
  assert.equal(v.user('user-1'), true)
  assert.equal(v.user('user-2'), true)
})

test('非管理员：只显示拿到了薪资的那个人（本人），合计不显示', () => {
  const v = costVisibility({ 'me': 12000 }, false)
  assert.equal(v.totals, false)
  assert.equal(v.user('me'), true)
  assert.equal(v.user('someone-else'), false)
})

test('非管理员：本人薪资为 0 也算已知，照样显示', () => {
  assert.equal(costVisibility({ 'me': 0 }, false).user('me'), true)
})

test('非管理员：原型链上的键不算拿到了薪资', () => {
  const v = costVisibility({}, false)
  assert.equal(v.user('toString'), false)
  assert.equal(v.user('constructor'), false)
})
