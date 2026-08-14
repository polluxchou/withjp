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

test('ja 为纯空白时返回空白 —— 由数据库 check 约束保证不会发生', () => {
  // 本函数不防守这种输入：site_news 的 title_ja/lead_ja/body_ja 有
  // `btrim(...) <> ''` 约束，纯空白进不了库。这条测试是那个假设的书面凭据 ——
  // 哪天有人放宽了 DB 约束，这里的期望值就该跟着改，而不是默默通过。
  assert.equal(pickLocaleText('zh', { ja: '   ' }), '   ')
})
