import assert from 'node:assert/strict'
import test from 'node:test'
import {
  MAX_PRIOR_OUTCOME_CHARS,
  markSettled,
  outcomeSummary,
  priorContextOf,
  type Turn,
} from './conversation.ts'
import type { VenueAction } from '../../venue/layoutData.ts'

const pending = {
  kind: 'pending' as const,
  pendingActionId: 'pa-1',
  op: 'create' as const,
  preview: '新增 差旅费 320 元',
  expiresAt: '2026-08-20T10:00:00.000Z',
}

test('outcomeSummary 待确认动作带上 op 与 preview', () => {
  assert.equal(outcomeSummary(pending), '已暂存一个待确认的 create 操作：新增 差旅费 320 元')
})

test('outcomeSummary 占比查询给出百分比', () => {
  const r = {
    kind: 'query_result' as const,
    breadcrumbs: 'Q3 · 薪资',
    aggregate: 'sum_total' as const,
    numerator: { value: 1200, count: 3 },
    denominator: { value: 4800, count: 12, ratio: 0.25 },
  }
  assert.equal(outcomeSummary(r), '查询结果 25.0%（Q3 · 薪资）')
})

test('outcomeSummary 单值查询给出数值', () => {
  const r = {
    kind: 'query_result' as const,
    breadcrumbs: 'Q3 · 薪资',
    aggregate: 'sum_total' as const,
    numerator: { value: 4800, count: 12 },
  }
  assert.equal(outcomeSummary(r), '查询结果 4800（Q3 · 薪资）')
})

test('outcomeSummary 澄清 / 场地 / 错误各有前缀', () => {
  assert.equal(
    outcomeSummary({ kind: 'clarification', message: '有 3 笔都匹配' }),
    '需要澄清：有 3 笔都匹配',
  )
  assert.equal(
    // VenueAction 的其余字段与本函数无关（它只读 summary），用局部 cast
    // 而不是造一个完整的假 action。
    outcomeSummary({ kind: 'venue_preview', action: { summary: '新增空间 主直播间' } as VenueAction }),
    '场地改动预览：新增空间 主直播间',
  )
  assert.equal(
    outcomeSummary({ kind: 'error', message: '解析失败' }),
    '上一轮失败：解析失败',
  )
})

test('outcomeSummary 截断到上限，避免把长 preview 整段塞进 prompt', () => {
  const long = { ...pending, preview: 'x'.repeat(500) }
  const s = outcomeSummary(long)
  assert.equal(s.length, MAX_PRIOR_OUTCOME_CHARS)
  assert.ok(s.endsWith('…'))
})

test('priorContextOf 取最后一组 user + agent 配对', () => {
  const turns: Turn[] = [
    { id: '1', role: 'user',  text: '第一句' },
    { id: '2', role: 'agent', result: { kind: 'error', message: '旧的' } },
    { id: '3', role: 'user',  text: '第二句' },
    { id: '4', role: 'agent', result: { kind: 'clarification', message: '新的' } },
  ]
  assert.deepEqual(priorContextOf(turns), { text: '第二句', outcome: '需要澄清：新的' })
})

test('priorContextOf 跳过 system 气泡', () => {
  const turns: Turn[] = [
    { id: '1', role: 'user',   text: '新增一笔' },
    { id: '2', role: 'agent',  result: pending },
    { id: '3', role: 'system', kind: 'applied' },
  ]
  const prior = priorContextOf(turns)
  assert.equal(prior?.text, '新增一笔')
  assert.ok(prior?.outcome.startsWith('已暂存'))
})

test('priorContextOf 只有 user 没有 agent 时返回 null', () => {
  assert.equal(priorContextOf([{ id: '1', role: 'user', text: '在等回复' }]), null)
})

test('priorContextOf 空数组返回 null', () => {
  assert.equal(priorContextOf([]), null)
})

test('markSettled 只标中目标那条，其余引用不变', () => {
  const a: Turn = { id: '1', role: 'agent', result: pending }
  const b: Turn = { id: '2', role: 'agent', result: pending }
  const out = markSettled([a, b], '2')
  assert.equal(out[0], a)
  assert.notEqual(out[1], b)
  assert.equal(out[1].role === 'agent' && out[1].settled, true)
})

test('markSettled 找不到 id 时原数组原样返回', () => {
  const turns: Turn[] = [{ id: '1', role: 'agent', result: pending }]
  assert.equal(markSettled(turns, 'nope'), turns)
})
