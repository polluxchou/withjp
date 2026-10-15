import test from 'node:test'
import assert from 'node:assert/strict'
import { canAccessExpenses, type ExpenseAccessActor } from './access.ts'

test('管理员可以访问支出管理', () => {
  assert.equal(canAccessExpenses({ is_admin: true }), true)
})

test('非管理员不能访问支出管理（包括 role 是 finance 的人）', () => {
  assert.equal(canAccessExpenses({ is_admin: false }), false)
  // role 是用户可自选的部门标签，不参与判定
  const financeMember = { is_admin: false, role: 'finance' } as ExpenseAccessActor
  assert.equal(canAccessExpenses(financeMember), false)
})

test('查不到 profile（null / undefined）一律拒绝', () => {
  assert.equal(canAccessExpenses(null), false)
  assert.equal(canAccessExpenses(undefined), false)
})

test('is_admin 只认布尔 true，不认真值', () => {
  const sloppy = { is_admin: 'true' } as unknown as ExpenseAccessActor
  assert.equal(canAccessExpenses(sloppy), false)
})
