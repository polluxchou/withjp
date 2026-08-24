import assert from 'node:assert/strict'
import test from 'node:test'
import {
  MAX_PRIOR_OUTCOME_CHARS,
  askHistoryOf,
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

test('outcomeSummary 竞品问答给出带前缀的摘要', () => {
  assert.equal(
    outcomeSummary({ kind: 'competitor_answer', answer: 'solulune 最近一次采集到的开播是 2026-08-19 21:30' }),
    '竞品问答：solulune 最近一次采集到的开播是 2026-08-19 21:30',
  )
})

test('outcomeSummary 竞品问答同样按上限截断', () => {
  const s = outcomeSummary({ kind: 'competitor_answer', answer: 'x'.repeat(500) })
  assert.equal(s.length, MAX_PRIOR_OUTCOME_CHARS)
  assert.ok(s.endsWith('…'))
})

test('priorContextOf 跳过 competitor_answer：不把竞品问答当成支出/工时任务的上一轮上下文', () => {
  const turns: Turn[] = [
    { id: '1', role: 'user',  text: '新增差旅费 320 元' },
    { id: '2', role: 'agent', result: { kind: 'clarification', message: '有 3 笔都匹配' } },
    { id: '3', role: 'user',  text: 'solulune 昨天开播了吗' },
    { id: '4', role: 'agent', result: { kind: 'competitor_answer', answer: '没有采到 solulune 的截图' } },
  ]
  // 最新一条 agent 回复是 competitor_answer，priorContextOf 必须跳过它，
  // 继续往前找到真正与支出/工时任务解析相关的那一轮。
  assert.deepEqual(priorContextOf(turns), { text: '新增差旅费 320 元', outcome: '需要澄清：有 3 笔都匹配' })
})

test('priorContextOf 最新一轮就是唯一一轮竞品问答时返回 null', () => {
  const turns: Turn[] = [
    { id: '1', role: 'user',  text: 'solulune 昨天开播了吗' },
    { id: '2', role: 'agent', result: { kind: 'competitor_answer', answer: '没有采到 solulune 的截图' } },
  ]
  assert.equal(priorContextOf(turns), null)
})

test('askHistoryOf：user 轮次映射成 user，competitor_answer 映射成 assistant，其余 agent/system 轮次跳过', () => {
  const turns: Turn[] = [
    { id: '1', role: 'user',   text: 'solulune 最近涨粉怎么样' },
    { id: '2', role: 'agent',  result: { kind: 'competitor_answer', answer: '最近一次涨了 5200' } },
    { id: '3', role: 'user',   text: '新增差旅费 320 元' },
    { id: '4', role: 'agent',  result: pending },
    { id: '5', role: 'system', kind: 'applied' },
    { id: '6', role: 'user',   text: '那上周呢' },
    { id: '7', role: 'agent',  result: { kind: 'competitor_answer', answer: '上周涨了 4800' } },
  ]
  assert.deepEqual(askHistoryOf(turns), [
    { role: 'user', content: 'solulune 最近涨粉怎么样' },
    { role: 'assistant', content: '最近一次涨了 5200' },
    { role: 'user', content: '新增差旅费 320 元' },
    { role: 'user', content: '那上周呢' },
    { role: 'assistant', content: '上周涨了 4800' },
  ])
})

test('askHistoryOf：只取最近 limit 条', () => {
  const turns: Turn[] = []
  for (let i = 0; i < 10; i++) {
    turns.push({ id: `u${i}`, role: 'user', text: `q${i}` })
    turns.push({ id: `a${i}`, role: 'agent', result: { kind: 'competitor_answer', answer: `a${i}` } })
  }
  const history = askHistoryOf(turns, 4)
  assert.equal(history.length, 4)
  assert.deepEqual(history, [
    { role: 'user', content: 'q8' },
    { role: 'assistant', content: 'a8' },
    { role: 'user', content: 'q9' },
    { role: 'assistant', content: 'a9' },
  ])
})

test('askHistoryOf：默认 limit 是 20', () => {
  const turns: Turn[] = []
  for (let i = 0; i < 25; i++) turns.push({ id: `u${i}`, role: 'user', text: `q${i}` })
  assert.equal(askHistoryOf(turns).length, 20)
})

test('askHistoryOf：空消息流返回空数组', () => {
  assert.deepEqual(askHistoryOf([]), [])
})

test('askHistoryOf：limit=0 不会退化成 slice(-0)==slice(0) 返回全部——钳到空数组，同 trimHistory 已钉住的陷阱', () => {
  const turns: Turn[] = [
    { id: '1', role: 'user',  text: 'q1' },
    { id: '2', role: 'agent', result: { kind: 'competitor_answer', answer: 'a1' } },
  ]
  assert.deepEqual(askHistoryOf(turns, 0), [])
})

test('askHistoryOf：limit 为负数时同样返回空数组', () => {
  const turns: Turn[] = [{ id: '1', role: 'user', text: 'q1' }]
  assert.deepEqual(askHistoryOf(turns, -5), [])
})

test('askHistoryOf：竞品答案回放进历史前裁到 2000 字符，避免下一轮请求被 parseAskBody 的 MAX_CONTENT 整体拒收', () => {
  const longAnswer = 'x'.repeat(2500)
  const turns: Turn[] = [
    { id: '1', role: 'user',  text: 'solulune 数据详情' },
    { id: '2', role: 'agent', result: { kind: 'competitor_answer', answer: longAnswer } },
  ]
  const history = askHistoryOf(turns)
  assert.equal(history.length, 2)
  assert.equal(history[1].role, 'assistant')
  assert.equal(history[1].content.length, 2000)
  assert.equal(history[1].content, longAnswer.slice(0, 2000))
})
