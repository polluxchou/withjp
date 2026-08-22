// src/lib/venue/venue-intent.test.ts
import assert from 'node:assert/strict'
import test from 'node:test'

import { parseVenueIntent } from './venue-intent.ts'
import type { LlmModel } from '../llm/json.ts'

const ITEMS = [{ id: 'it-1', name: '主直播间', type: 'area' as const }]

const ADD_JSON = JSON.stringify({
  op: 'add', itemType: 'area', name: '化妆间', widthM: 3, heightM: 4, summary: '新增化妆间 3×4 米',
})

/** 记录每次调用的 provider，按脚本逐档返回/抛出。 */
function scriptedLlm(script: Record<string, () => string>) {
  const calls: string[] = []
  const llm = async (m: LlmModel, _prompt: string): Promise<string> => {
    calls.push(m.provider)
    const step = script[m.provider]
    if (!step) throw new Error(`unexpected provider ${m.provider}`)
    return step()
  }
  return { llm, calls }
}

test('容灾主线:deepseek 整体 429 时自动换到 gemini 档,解析仍成功', async () => {
  const { llm, calls } = scriptedLlm({
    deepseek: () => { throw new Error('deepseek:deepseek-chat 429: monthly quota') },
    gemini:   () => ADD_JSON,
  })
  const r = await parseVenueIntent('新增化妆间 3米×4米', ITEMS, { llm })
  assert.equal(r.ok, true)
  assert.deepEqual(calls, ['deepseek', 'gemini'])
  if (r.ok) assert.equal(r.action.op, 'add')
})

test('op:none 是语义回答不是故障——不换档,只调一次', async () => {
  const { llm, calls } = scriptedLlm({
    deepseek: () => JSON.stringify({ op: 'none', reason: '非场地操作' }),
    gemini:   () => { throw new Error('should not be called') },
  })
  const r = await parseVenueIntent('新增差旅费 320 元', ITEMS, { llm })
  assert.equal(r.ok, false)
  if (!r.ok) assert.equal(r.reason, '非场地操作')
  assert.deepEqual(calls, ['deepseek'])
})

test('坏 JSON 前进换档,下一档成功', async () => {
  const { llm, calls } = scriptedLlm({
    deepseek: () => 'not json at all',
    gemini:   () => ADD_JSON,
  })
  const r = await parseVenueIntent('新增化妆间', ITEMS, { llm })
  assert.equal(r.ok, true)
  assert.deepEqual(calls, ['deepseek', 'gemini'])
})

test('schema 不过前进换档,下一档成功', async () => {
  const { llm, calls } = scriptedLlm({
    deepseek: () => JSON.stringify({ op: 'add', itemType: 'area', widthM: -5, summary: 'x' }),
    gemini:   () => ADD_JSON,
  })
  const r = await parseVenueIntent('新增化妆间', ITEMS, { llm })
  assert.equal(r.ok, true)
  assert.deepEqual(calls, ['deepseek', 'gemini'])
})

test('全梯失败才报错,reason 逐档带上失败原因', async () => {
  const { llm, calls } = scriptedLlm({
    deepseek: () => { throw new Error('deepseek:deepseek-chat 429: cap') },
    gemini:   () => { throw new Error('gemini:gemini-2.5-pro 429: cap') },
  })
  const r = await parseVenueIntent('把主直播间旋转90度', ITEMS, { llm })
  assert.equal(r.ok, false)
  if (!r.ok) {
    assert.ok(r.reason.includes('deepseek'))
    assert.ok(r.reason.includes('gemini'))
  }
  assert.deepEqual(calls, ['deepseek', 'gemini'])
})

test('首档直接成功时不再碰后面的档', async () => {
  const { llm, calls } = scriptedLlm({
    deepseek: () => ADD_JSON,
    gemini:   () => { throw new Error('should not be called') },
  })
  const r = await parseVenueIntent('新增化妆间', ITEMS, { llm })
  assert.equal(r.ok, true)
  assert.deepEqual(calls, ['deepseek'])
})
