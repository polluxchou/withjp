import { test } from 'node:test'
import assert from 'node:assert'
import { toneOf } from './status-tone.ts'
import type { Domain } from './status-tone.ts'

// 枚举取自 src/lib/types/index.ts 的真实类型定义（CreatorStatus /
// TaskStatus / ExpensePaymentStatus / MilestoneStatus）与
// src/lib/items/types.ts 的 ItemStatus，而非本文件模板臆造。

test('creator 生命周期映射与 design-system §1.3 一致', () => {
  assert.equal(toneOf('creator', 'prospect'), 'neutral')
  assert.equal(toneOf('creator', 'contacted'), 'info')
  assert.equal(toneOf('creator', 'engaged'), 'info')
  assert.equal(toneOf('creator', 'onboarded'), 'violet')
  assert.equal(toneOf('creator', 'live_ready'), 'warning')
  assert.equal(toneOf('creator', 'live'), 'success')
  assert.equal(toneOf('creator', 'monetized'), 'success')
  assert.equal(toneOf('creator', 'terminated'), 'danger')
})
test('task 域覆盖（TaskStatus: pending/running/done/failed）', () => {
  assert.equal(toneOf('task', 'pending'), 'warning')
  assert.equal(toneOf('task', 'running'), 'info')
  assert.equal(toneOf('task', 'done'), 'success')
  assert.equal(toneOf('task', 'failed'), 'danger')
})
test('expense 域覆盖（ExpensePaymentStatus 五态完整登记）', () => {
  assert.equal(toneOf('expense', 'paid'), 'success')
  assert.equal(toneOf('expense', 'ordered_unpaid'), 'warning')
  assert.equal(toneOf('expense', 'budgeted'), 'info')
  assert.equal(toneOf('expense', 'refunded'), 'info')
  assert.equal(toneOf('expense', 'partially_refunded'), 'warning')
})
test('work_task 域覆盖（WorkTaskStatus: planned/doing/done/cancelled）', () => {
  assert.equal(toneOf('work_task', 'planned'), 'neutral')
  assert.equal(toneOf('work_task', 'doing'), 'info')
  assert.equal(toneOf('work_task', 'done'), 'success')
  assert.equal(toneOf('work_task', 'cancelled'), 'neutral')
})
test('milestone 域覆盖（MilestoneStatus: planned/active/at_risk/completed/missed）', () => {
  assert.equal(toneOf('milestone', 'planned'), 'neutral')
  assert.equal(toneOf('milestone', 'active'), 'info')
  assert.equal(toneOf('milestone', 'at_risk'), 'warning')
  assert.equal(toneOf('milestone', 'completed'), 'success')
  assert.equal(toneOf('milestone', 'missed'), 'danger')
})
test('item 域覆盖（ItemStatus: in_use/in_storage/under_repair/disposed）', () => {
  assert.equal(toneOf('item', 'in_use'), 'success')
  assert.equal(toneOf('item', 'in_storage'), 'neutral')
  assert.equal(toneOf('item', 'under_repair'), 'warning')
  assert.equal(toneOf('item', 'disposed'), 'danger')
})
test('未登记枚举回退 neutral（不抛错），且不因原型链键误判', () => {
  assert.equal(toneOf('creator', 'unknown-status'), 'neutral')
  assert.equal(toneOf('creator', 'toString'), 'neutral')
})
test('未登记 domain 安全回退 neutral（不抛 TypeError）', () => {
  assert.equal(toneOf('nope' as Domain, 'x'), 'neutral')
})
test('domain 轴原型链键不被误判为已登记域', () => {
  assert.equal(toneOf('__proto__' as Domain, 'toString'), 'neutral')
})
