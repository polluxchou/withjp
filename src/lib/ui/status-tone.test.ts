import { test } from 'node:test'
import assert from 'node:assert'
import { toneOf } from './status-tone.ts'

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
test('expense 域覆盖（ExpensePaymentStatus 中设计系统已登记的三态）', () => {
  assert.equal(toneOf('expense', 'paid'), 'success')
  assert.equal(toneOf('expense', 'ordered_unpaid'), 'warning')
  assert.equal(toneOf('expense', 'budgeted'), 'info')
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
test('未登记枚举回退 neutral（不抛错），含 expense 域未在 design-system 登记的退款态', () => {
  assert.equal(toneOf('creator', 'unknown-status'), 'neutral')
  assert.equal(toneOf('expense', 'refunded'), 'neutral')
  assert.equal(toneOf('expense', 'partially_refunded'), 'neutral')
})
