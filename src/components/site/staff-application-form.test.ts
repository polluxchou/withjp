import assert from 'node:assert/strict'
import test from 'node:test'
import { checkStaffRequiredChoices } from './staff-application-form.ts'

test('两项都未选 → 两个字段都报 required', () => {
  const fields = checkStaffRequiredChoices({ kind: null, commuteMode: null })
  assert.deepEqual(fields, { kind: 'required', commuteMode: 'required' })
})

test('kind 缺失、commuteMode 已选 → 只报 kind', () => {
  const fields = checkStaffRequiredChoices({ kind: null, commuteMode: 'subway' })
  assert.deepEqual(fields, { kind: 'required' })
})

test('commuteMode 缺失、kind 已选 → 只报 commuteMode', () => {
  const fields = checkStaffRequiredChoices({ kind: 'photographer', commuteMode: null })
  assert.deepEqual(fields, { commuteMode: 'required' })
})

test('空字符串等同未选（FormData 理论上不会产出，但兜底）', () => {
  const fields = checkStaffRequiredChoices({ kind: '', commuteMode: '' })
  assert.deepEqual(fields, { kind: 'required', commuteMode: 'required' })
})

test('两项都已选 → 不报错，返回空对象', () => {
  const fields = checkStaffRequiredChoices({ kind: 'makeup', commuteMode: 'car' })
  assert.deepEqual(fields, {})
})
