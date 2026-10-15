import assert from 'node:assert/strict'
import test from 'node:test'

import { createWriteLedger, beginWrite, settleWrite } from './writeLedger.ts'

test('单次写入成功：不回滚；之后同字段写入失败时回到已落库的值', () => {
  const L = createWriteLedger()
  const a = beginWrite(L, 'i1', { is_important: true }, { is_important: null })
  assert.equal(settleWrite(L, a, { is_important: true }, true), null)
  const b = beginWrite(L, 'i1', { is_important: false }, { is_important: true })
  assert.deepEqual(settleWrite(L, b, { is_important: false }, false), { is_important: true })
})

test('单次写入失败：回到写入前的值', () => {
  const L = createWriteLedger()
  const a = beginWrite(L, 'i1', { is_important: true }, { is_important: null })
  assert.deepEqual(settleWrite(L, a, { is_important: true }, false), { is_important: null })
})

test('case A: 先写 is_important、再写 due_date；前者失败只回滚 is_important，后者成功不受影响', () => {
  const L = createWriteLedger()
  const a = beginWrite(L, 'i1', { is_important: true }, { is_important: null })
  const b = beginWrite(L, 'i1', { due_date: '2026-10-22' }, { due_date: null })
  assert.deepEqual(settleWrite(L, a, { is_important: true }, false), { is_important: null })
  assert.equal(settleWrite(L, b, { due_date: '2026-10-22' }, true), null)
})

test('case B: 同一字段的两次写入都失败，回到库里原值而不是前一笔乐观值', () => {
  const L = createWriteLedger()
  const a = beginWrite(L, 'i1', { is_important: true, due_date: '2026-10-22' }, { is_important: null, due_date: null })
  const b = beginWrite(L, 'i1', { due_date: '2026-11-01' }, { due_date: '2026-10-22' })
  // due_date 之后由 b 持有，a 失败时不回滚 due_date
  assert.deepEqual(settleWrite(L, a, { is_important: true, due_date: '2026-10-22' }, false), { is_important: null })
  assert.deepEqual(settleWrite(L, b, { due_date: '2026-11-01' }, false), { due_date: null })
})

test('先成功后失败：回到最近一次成功的值', () => {
  const L = createWriteLedger()
  const a = beginWrite(L, 'i1', { due_date: '2026-10-22' }, { due_date: null })
  const b = beginWrite(L, 'i1', { due_date: '2026-11-01' }, { due_date: '2026-10-22' })
  assert.equal(settleWrite(L, a, { due_date: '2026-10-22' }, true), null)
  assert.deepEqual(settleWrite(L, b, { due_date: '2026-11-01' }, false), { due_date: '2026-10-22' })
})

test('乱序成功：迟到的旧成功不覆盖已落库的新值，之后失败回到 blocked', () => {
  const L = createWriteLedger()
  const a = beginWrite(L, 'i1', { status: 'doing' }, { status: 'todo' })
  const b = beginWrite(L, 'i1', { status: 'blocked' }, { status: 'doing' })
  assert.equal(settleWrite(L, b, { status: 'blocked' }, true), null)
  assert.equal(settleWrite(L, a, { status: 'doing' }, true), null)
  const c = beginWrite(L, 'i1', { status: 'done' }, { status: 'blocked' })
  assert.deepEqual(settleWrite(L, c, { status: 'done' }, false), { status: 'blocked' })
})

test('不同事项互不影响：i1 失败只回到 i1 自己的已落库值', () => {
  const L = createWriteLedger()
  const x = beginWrite(L, 'i2', { status: 'done' }, { status: 'todo' })
  assert.equal(settleWrite(L, x, { status: 'done' }, true), null)
  const y = beginWrite(L, 'i1', { status: 'doing' }, { status: 'todo' })
  assert.deepEqual(settleWrite(L, y, { status: 'doing' }, false), { status: 'todo' })
  const z = beginWrite(L, 'i2', { status: 'blocked' }, { status: 'done' })
  assert.deepEqual(settleWrite(L, z, { status: 'blocked' }, false), { status: 'done' })
})
