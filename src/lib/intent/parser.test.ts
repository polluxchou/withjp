import assert from 'node:assert/strict'
import test from 'node:test'
import { classifyEntity, parseExpenseIntent, parseWorkTaskIntent } from './parser.ts'
import type { LlmModel } from '../llm/json.ts'

// parser 对外承诺不抛：一切失败都折叠成 { ok:false, reason }。这里注入假
// transport（ParserDeps.llm）复现 2026-08 生产事故的形态 —— 某家供应商整体
// 429（月度消费上限耗尽），另一家可用。解析必须沿模型梯子换供应商完成，
// 而不是把 parser_failed 抛给用户。

const CTX = { todayISO: '2026-08-21' }

const QUERY_INTENT = JSON.stringify({
  op: 'query', entity: 'expense', filters: {}, aggregate: 'sum_total', breadcrumbs: '全部支出合计',
})

const CREATE_INTENT = JSON.stringify({
  op: 'create', entity: 'expense',
  payload: { item_name: '打车', unit_price: 320, quantity: 1, expense_date: '2026-05-10', payment_status: 'paid' },
  summary: '新增一笔打车支出',
})

const WORK_TASK_INTENT = JSON.stringify({
  op: 'create', entity: 'work_task', payload: { title: '完成转账' }, summary: '创建任务：完成转账',
})

// 按 prompt 内容分辨阶段：写/查分类 prompt 带 {"kind"，实体分类带 {"entity"，
// 其余是抽取。
function answerFor(prompt: string, kind: 'query' | 'write', extractJson: string): string {
  if (prompt.includes('{"kind"'))   return JSON.stringify({ kind })
  if (prompt.includes('{"entity"')) return JSON.stringify({ entity: 'work_task' })
  return extractJson
}

// 测试要控制 INTENT_FAST_PROVIDER / INTENT_STRONG_PROVIDER：两者在每次调用时
// 读 process.env，改完要还原，不能漏到别的测试里。
async function withEnv<T>(vars: Record<string, string | undefined>, fn: () => Promise<T>): Promise<T> {
  const saved: Record<string, string | undefined> = {}
  for (const [k, v] of Object.entries(vars)) {
    saved[k] = process.env[k]
    if (v === undefined) delete process.env[k]
    else process.env[k] = v
  }
  try {
    return await fn()
  } finally {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k]
      else process.env[k] = v
    }
  }
}

const DEFAULT_ENV = { INTENT_FAST_PROVIDER: undefined, INTENT_STRONG_PROVIDER: undefined }

test('正常路径：查询在 deepseek 首档一次成功，gemini 一次都不会被碰', async () => {
  await withEnv(DEFAULT_ENV, async () => {
    const calls: string[] = []
    const llm = async (m: LlmModel, prompt: string) => {
      calls.push(`${m.provider}:${m.model}`)
      return answerFor(prompt, 'query', QUERY_INTENT)
    }
    const r = await parseExpenseIntent('这个月打车花了多少', CTX, { llm })
    assert.ok(r.ok, `expected ok, got: ${!r.ok ? r.reason : ''}`)
    assert.equal(r.modelUsed, 'deepseek:deepseek-chat')
    assert.ok(calls.every(c => c.startsWith('deepseek:')), `不该碰 gemini：${calls.join(', ')}`)
  })
})

test('deepseek 整体 429 时，查询沿梯子换到 gemini 成功而不是 parser_failed', async () => {
  await withEnv(DEFAULT_ENV, async () => {
    const calls: string[] = []
    const llm = async (m: LlmModel, prompt: string) => {
      calls.push(`${m.provider}:${m.model}`)
      if (m.provider === 'deepseek') throw new Error('deepseek:deepseek-chat 429: rate limited')
      return answerFor(prompt, 'query', QUERY_INTENT)
    }
    const r = await parseExpenseIntent('这个月打车花了多少', CTX, { llm })
    assert.ok(r.ok, `expected ok, got: ${!r.ok ? r.reason : ''}`)
    assert.equal(r.modelUsed, 'gemini:gemini-2.5-pro')
    assert.ok(calls.some(c => c.startsWith('deepseek:')), '首档必须先试 deepseek')
  })
})

test('gemini 整体 429 时（生产事故形态），写操作在 deepseek 强档上完成', async () => {
  await withEnv(DEFAULT_ENV, async () => {
    const llm = async (m: LlmModel, prompt: string) => {
      if (m.provider === 'gemini') throw new Error('gemini:gemini-2.5-pro 429: monthly spending cap exceeded')
      return answerFor(prompt, 'write', CREATE_INTENT)
    }
    const r = await parseExpenseIntent('新增差旅费 5月10日打车 320', CTX, { llm })
    assert.ok(r.ok, `expected ok, got: ${!r.ok ? r.reason : ''}`)
    assert.equal(r.modelUsed, 'deepseek:deepseek-chat')
    assert.equal(r.classifiedAs, 'write')
  })
})

test('INTENT_STRONG_PROVIDER=gemini 时写操作首选 gemini pro（回滚开关）', async () => {
  await withEnv({ ...DEFAULT_ENV, INTENT_STRONG_PROVIDER: 'gemini' }, async () => {
    const llm = async (m: LlmModel, prompt: string) => answerFor(prompt, 'write', CREATE_INTENT)
    const r = await parseExpenseIntent('新增差旅费 5月10日打车 320', CTX, { llm })
    assert.ok(r.ok, `expected ok, got: ${!r.ok ? r.reason : ''}`)
    assert.equal(r.modelUsed, 'gemini:gemini-2.5-pro')
  })
})

test('首档输出过不了 schema 时换档重试 —— 原有降级语义保留', async () => {
  await withEnv(DEFAULT_ENV, async () => {
    const llm = async (m: LlmModel, prompt: string) => {
      if (prompt.includes('{"kind"')) return JSON.stringify({ kind: 'query' })
      // deepseek 的抽取输出缺必填字段，schema 过不了；gemini 给合法输出。
      return m.provider === 'deepseek' ? JSON.stringify({ op: 'query' }) : QUERY_INTENT
    }
    const r = await parseExpenseIntent('这个月打车花了多少', CTX, { llm })
    assert.ok(r.ok, `expected ok, got: ${!r.ok ? r.reason : ''}`)
    assert.equal(r.modelUsed, 'gemini:gemini-2.5-pro')
  })
})

test('两家都失败 → ok:false 不抛，reason 报出每一档的失败', async () => {
  await withEnv(DEFAULT_ENV, async () => {
    const llm = async (m: LlmModel) => {
      throw new Error(`${m.provider} is down`)
    }
    const r = await parseExpenseIntent('这个月打车花了多少', CTX, { llm })
    assert.equal(r.ok, false)
    if (r.ok) return
    assert.ok(r.reason.includes('deepseek'), `reason 缺 deepseek：${r.reason}`)
    assert.ok(r.reason.includes('gemini'),   `reason 缺 gemini：${r.reason}`)
  })
})

test('工时任务：deepseek 整体 429 时换到 gemini 兜底', async () => {
  await withEnv(DEFAULT_ENV, async () => {
    const llm = async (m: LlmModel) => {
      if (m.provider === 'deepseek') throw new Error('deepseek:deepseek-chat 429: rate limited')
      return WORK_TASK_INTENT
    }
    const r = await parseWorkTaskIntent('明天完成转账', CTX, { llm })
    assert.ok(r.ok, `expected ok, got: ${!r.ok ? r.reason : ''}`)
    assert.equal(r.modelUsed, 'gemini:gemini-2.5-pro')
  })
})

test('实体分类：deepseek 整体 429 时换供应商拿到结果，而不是退成 unknown', async () => {
  await withEnv(DEFAULT_ENV, async () => {
    const llm = async (m: LlmModel) => {
      if (m.provider === 'deepseek') throw new Error('deepseek:deepseek-chat 429: rate limited')
      return JSON.stringify({ entity: 'work_task' })
    }
    assert.equal(await classifyEntity('安排小王明天去转账', undefined, { llm }), 'work_task')
  })
})

test('实体分类：全部供应商都失败时才退 unknown，且不抛', async () => {
  await withEnv(DEFAULT_ENV, async () => {
    const llm = async () => {
      throw new Error('all down')
    }
    assert.equal(await classifyEntity('安排小王明天去转账', undefined, { llm }), 'unknown')
  })
})
