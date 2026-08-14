import assert from 'node:assert/strict'
import test from 'node:test'
import { pickLocaleText } from './i18n-content.ts'

test('有对应语言就用它', () => {
  assert.equal(pickLocaleText('zh', { ja: 'JA', zh: 'ZH', en: 'EN' }), 'ZH')
  assert.equal(pickLocaleText('en', { ja: 'JA', zh: 'ZH', en: 'EN' }), 'EN')
  assert.equal(pickLocaleText('ja', { ja: 'JA', zh: 'ZH', en: 'EN' }), 'JA')
})

test('缺失回退日语', () => {
  assert.equal(pickLocaleText('zh', { ja: 'JA' }), 'JA')
  assert.equal(pickLocaleText('en', { ja: 'JA', en: null }), 'JA')
})

test('空串与 null 同等对待', () => {
  assert.equal(pickLocaleText('zh', { ja: 'JA', zh: '' }), 'JA')
  assert.equal(pickLocaleText('zh', { ja: 'JA', zh: '   ' }), 'JA')
})
