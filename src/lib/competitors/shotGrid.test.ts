// src/lib/competitors/shotGrid.test.ts
import assert from 'node:assert/strict'
import test from 'node:test'

import { UNDATED_KEY, isValidShotDate } from './shotGrid.ts'

test('UNDATED_KEY: 无日期占位键', () => {
  assert.equal(UNDATED_KEY, '—')
})

test('isValidShotDate: 合法日期与 null', () => {
  assert.equal(isValidShotDate('2026-08-10'), true)
  assert.equal(isValidShotDate('2026-02-28'), true)
  assert.equal(isValidShotDate(null), true)
  assert.equal(isValidShotDate(undefined), true)
})

test('isValidShotDate: 越界月日', () => {
  assert.equal(isValidShotDate('2026-13-01'), false)
  assert.equal(isValidShotDate('2026-02-30'), false)
  assert.equal(isValidShotDate('2026-00-10'), false)
})

test('isValidShotDate: 格式不合规', () => {
  assert.equal(isValidShotDate('2026-2-3'), false)
  assert.equal(isValidShotDate(''), false)
  assert.equal(isValidShotDate('2026-08-10T00:00:00Z'), false)
})

test('isValidShotDate: 非字符串类型', () => {
  assert.equal(isValidShotDate(20260810), false)
  assert.equal(isValidShotDate({}), false)
})
