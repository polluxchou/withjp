import assert from 'node:assert/strict'
import test from 'node:test'
import { FAST_DEEPSEEK, FAST_GEMINI, STRONG_MODEL, resolveFastModel } from './models.ts'

test('默认（env 未设）走 deepseek', () => {
  assert.deepEqual(resolveFastModel(undefined), FAST_DEEPSEEK)
})

test("显式 'gemini' 退回 gemini flash", () => {
  assert.deepEqual(resolveFastModel('gemini'), FAST_GEMINI)
})

test("显式 'deepseek' 走 deepseek", () => {
  assert.deepEqual(resolveFastModel('deepseek'), FAST_DEEPSEEK)
})

test('大小写与空白不敏感', () => {
  assert.deepEqual(resolveFastModel('  GEMINI '), FAST_GEMINI)
})

test('非法值退回默认而不是抛 —— 一个拼错的 env 不该让整站的意图解析挂掉', () => {
  assert.deepEqual(resolveFastModel('gemni'), FAST_DEEPSEEK)
  assert.deepEqual(resolveFastModel(''), FAST_DEEPSEEK)
})

test('强档恒为 gemini pro —— 降级要跨供应商才有意义', () => {
  assert.deepEqual(STRONG_MODEL, { provider: 'gemini', model: 'gemini-2.5-pro' })
})

test('快档两个候选都不是 pro —— 否则降级会退化成同档重试', () => {
  assert.notEqual(FAST_DEEPSEEK.model, STRONG_MODEL.model)
  assert.notEqual(FAST_GEMINI.model, STRONG_MODEL.model)
})
