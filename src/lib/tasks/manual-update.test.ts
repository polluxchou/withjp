import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { TASK_STATUSES, pickTaskManualUpdate } from './manual-update.ts'

test('只改 status：合法值原样放行', () => {
  for (const status of TASK_STATUSES) {
    assert.deepEqual(pickTaskManualUpdate({ status }), { ok: true, patch: { status } })
  }
})

test('只改 next_action：字符串与 null 都放行', () => {
  assert.deepEqual(pickTaskManualUpdate({ next_action: '跟进报价' }), { ok: true, patch: { next_action: '跟进报价' } })
  assert.deepEqual(pickTaskManualUpdate({ next_action: '' }), { ok: true, patch: { next_action: '' } })
  assert.deepEqual(pickTaskManualUpdate({ next_action: null }), { ok: true, patch: { next_action: null } })
})

test('两个字段一起改', () => {
  assert.deepEqual(pickTaskManualUpdate({ status: 'pending', next_action: null }), {
    ok: true,
    patch: { status: 'pending', next_action: null },
  })
})

test('非法 status 拒绝', () => {
  for (const status of ['cancelled', 'DONE', '', null, 1, undefined, ['done']]) {
    const r = pickTaskManualUpdate({ status })
    assert.equal(r.ok, false, JSON.stringify(status))
    assert.match(!r.ok ? r.error : '', /status/)
  }
})

test('next_action 不是字符串或 null 时拒绝', () => {
  for (const next_action of [1, true, {}, ['x'], undefined]) {
    const r = pickTaskManualUpdate({ next_action })
    assert.equal(r.ok, false, JSON.stringify(next_action))
    assert.match(!r.ok ? r.error : '', /next_action/)
  }
})

// 白名单外的字段整单拒绝，不悄悄丢掉——合法字段也不写。
test('白名单外的字段一律拒绝，并在错误里点名', () => {
  for (const key of ['output', 'agent_id', 'creator_id', 'input', 'parent_task_id', 'title', 'id', 'created_at', 'updated_at', 'action', '__proto__']) {
    const body = JSON.parse(`{"status":"done",${JSON.stringify(key)}:"x"}`)
    const r = pickTaskManualUpdate(body)
    assert.equal(r.ok, false, key)
    assert.ok(!r.ok && r.error.includes(key), `${key} 应出现在错误里`)
  }
})

test('不是对象的 body 拒绝，错误说明要 JSON 对象', () => {
  for (const body of [null, undefined, 'done', 1, [], [{ status: 'done' }]]) {
    const r = pickTaskManualUpdate(body)
    assert.equal(r.ok, false, JSON.stringify(body))
    assert.match(!r.ok ? r.error : '', /JSON object/, JSON.stringify(body))
  }
})

test('空对象拒绝：没有可改的字段', () => {
  const r = pickTaskManualUpdate({})
  assert.equal(r.ok, false)
  assert.match(!r.ok ? r.error : '', /Nothing to update/)
})

test('返回的 patch 是新对象，只含白名单字段', () => {
  const body = { status: 'done', next_action: 'x' }
  const r = pickTaskManualUpdate(body)
  assert.ok(r.ok)
  assert.notEqual(r.patch, body)
  assert.deepEqual(Object.keys(r.patch).sort(), ['next_action', 'status'])
})

// TASK_STATUSES 要与数据库的 task_status 枚举一致，否则合法值会被拒或非法值落库报 500。
test('TASK_STATUSES 与 task_status 枚举一致', () => {
  const sql = readFileSync(new URL('../../../supabase/migrations/20260510190403_initial_schema.sql', import.meta.url), 'utf8')
  const m = sql.match(/create type task_status as enum \(([^)]*)\)/)
  assert.ok(m, '找不到 task_status 枚举')
  const values = Array.from(m[1].matchAll(/'([^']+)'/g), (x) => x[1])
  assert.deepEqual([...TASK_STATUSES], values)
})
