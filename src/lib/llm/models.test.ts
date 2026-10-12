import assert from 'node:assert/strict'
import test from 'node:test'
import {
  FAST_DEEPSEEK, FAST_GEMINI, STRONG_DEEPSEEK, STRONG_GEMINI,
  modelLadder, resolveFastModel, resolveStrongModel,
} from './models.ts'

// ── 快档 ──────────────────────────────────────────────────────

test('快档默认（env 未设）走 deepseek', () => {
  assert.deepEqual(resolveFastModel(undefined), FAST_DEEPSEEK)
})

test("快档显式 'gemini' 退回 gemini flash", () => {
  assert.deepEqual(resolveFastModel('gemini'), FAST_GEMINI)
})

test("快档显式 'deepseek' 走 deepseek", () => {
  assert.deepEqual(resolveFastModel('deepseek'), FAST_DEEPSEEK)
})

test('快档大小写与空白不敏感', () => {
  assert.deepEqual(resolveFastModel('  GEMINI '), FAST_GEMINI)
})

test('快档非法值退回默认而不是抛 —— 一个拼错的 env 不该让整站的意图解析挂掉', () => {
  assert.deepEqual(resolveFastModel('gemni'), FAST_DEEPSEEK)
  assert.deepEqual(resolveFastModel(''), FAST_DEEPSEEK)
})

// ── 强档 ──────────────────────────────────────────────────────

test('强档默认（env 未设）走 deepseek —— Gemini 项目消费上限耗尽时 pro 全 429', () => {
  assert.deepEqual(resolveStrongModel(undefined), STRONG_DEEPSEEK)
})

test("强档显式 'gemini' 退回 gemini pro", () => {
  assert.deepEqual(resolveStrongModel('gemini'), STRONG_GEMINI)
})

test('强档大小写与空白不敏感，非法值退回默认', () => {
  assert.deepEqual(resolveStrongModel('  GEMINI '), STRONG_GEMINI)
  assert.deepEqual(resolveStrongModel('gemni'), STRONG_DEEPSEEK)
  assert.deepEqual(resolveStrongModel(''), STRONG_DEEPSEEK)
})

test('两档的固定形态：gemini 强档是 pro，deepseek 强档是 chat', () => {
  assert.deepEqual(STRONG_GEMINI,   { provider: 'gemini',   model: 'gemini-2.5-pro' })
  assert.deepEqual(STRONG_DEEPSEEK, { provider: 'deepseek', model: 'deepseek-chat' })
})

// ── 模型梯子 ──────────────────────────────────────────────────

test('默认配置：两档同为 deepseek-chat 时梯子坍缩成 deepseek → gemini pro', () => {
  assert.deepEqual(modelLadder(FAST_DEEPSEEK, STRONG_DEEPSEEK), [FAST_DEEPSEEK, STRONG_GEMINI])
})

test('梯子首档永远是首选模型', () => {
  assert.deepEqual(modelLadder(FAST_GEMINI, STRONG_DEEPSEEK)[0], FAST_GEMINI)
  assert.deepEqual(modelLadder(STRONG_GEMINI, STRONG_GEMINI)[0], STRONG_GEMINI)
})

test('任何配置下梯子里两家供应商都在 —— 单家整体 429 时总有另一家兜底', () => {
  const combos: [typeof FAST_DEEPSEEK, typeof FAST_DEEPSEEK][] = [
    [FAST_DEEPSEEK,   STRONG_DEEPSEEK],
    [FAST_DEEPSEEK,   STRONG_GEMINI],
    [FAST_GEMINI,     STRONG_DEEPSEEK],
    [FAST_GEMINI,     STRONG_GEMINI],
    [STRONG_DEEPSEEK, STRONG_DEEPSEEK],
    [STRONG_GEMINI,   STRONG_GEMINI],
  ]
  for (const [first, strong] of combos) {
    const providers = new Set(modelLadder(first, strong).map(m => m.provider))
    assert.ok(providers.has('deepseek'), `deepseek 缺席：${JSON.stringify([first, strong])}`)
    assert.ok(providers.has('gemini'),   `gemini 缺席：${JSON.stringify([first, strong])}`)
  }
})

test('全 gemini 配置：flash → pro → deepseek 逃生档，三档都在', () => {
  assert.deepEqual(modelLadder(FAST_GEMINI, STRONG_GEMINI), [FAST_GEMINI, STRONG_GEMINI, STRONG_DEEPSEEK])
})

test('梯子无重复档 —— 降级绝不会是同模型空转重试', () => {
  const ladders = [
    modelLadder(FAST_DEEPSEEK,   STRONG_DEEPSEEK),
    modelLadder(FAST_DEEPSEEK,   STRONG_GEMINI),
    modelLadder(FAST_GEMINI,     STRONG_GEMINI),
    modelLadder(STRONG_DEEPSEEK, STRONG_DEEPSEEK),
    modelLadder(STRONG_GEMINI,   STRONG_GEMINI),
  ]
  for (const ladder of ladders) {
    const keys = ladder.map(m => `${m.provider}:${m.model}`)
    assert.equal(new Set(keys).size, keys.length, `重复档：${keys.join(', ')}`)
  }
})
