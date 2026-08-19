import assert from 'node:assert/strict'
import test from 'node:test'

import { checkProfileLanguage } from './profileLanguage.ts'

test('没有观测到语言时返回 null', () => {
  assert.equal(checkProfileLanguage(null, 'JP'), null)
  assert.equal(checkProfileLanguage(undefined, 'JP'), null)
  assert.equal(checkProfileLanguage('', 'JP'), null)
  assert.equal(checkProfileLanguage('   ', 'JP'), null)
})

test('语言与人工地区一致时不提示', () => {
  // 1tb.boiz：bio 全英文看不出国别，language=ja 才定的案
  assert.deepEqual(checkProfileLanguage('ja', 'JP'), { language: 'ja', expectedRegion: 'JP', mismatch: false })
  assert.deepEqual(checkProfileLanguage('ko', 'KR'), { language: 'ko', expectedRegion: 'KR', mismatch: false })
})

test('语言能推出地区且与人工值冲突时提示', () => {
  // 修正前的实况：_k.queens 库里写 JP，主页语言是 ko
  const c = checkProfileLanguage('ko', 'JP')
  assert.equal(c?.expectedRegion, 'KR')
  assert.equal(c?.mismatch, true)
})

test('跨地区语言推不出地区,一律不提示', () => {
  const c = checkProfileLanguage('en', 'JP')
  assert.equal(c?.expectedRegion, null)
  assert.equal(c?.mismatch, false, 'en 用在哪个地区都正常,提示了就是噪音')
})

test('人工地区为空时不提示（没有可比对的权威值）', () => {
  assert.equal(checkProfileLanguage('ko', null)?.mismatch, false)
  assert.equal(checkProfileLanguage('ko', '')?.mismatch, false)
})

test('大小写与空白不影响判定', () => {
  assert.equal(checkProfileLanguage(' JA ', 'jp')?.mismatch, false)
  assert.equal(checkProfileLanguage('KO', ' jp ')?.mismatch, true)
})
