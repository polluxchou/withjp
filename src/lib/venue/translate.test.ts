import assert from 'node:assert/strict'
import test from 'node:test'

import { pendingTranslations, parseTranslateResponse } from './translate.ts'

test('pendingTranslations: 命中空译名与改名,跳过已同步与空名', () => {
  const rows = [
    { id: 'a', name: '设备架', name_ja: '', name_en: '', name_i18n_source: '' },
    { id: 'b', name: '门口',   name_ja: '入口', name_en: 'Door', name_i18n_source: '门口' },
    { id: 'c', name: '会议室', name_ja: '会議室', name_en: 'Room', name_i18n_source: '办公室' },
    { id: 'd', name: '',       name_ja: '', name_en: '', name_i18n_source: '' },
  ]
  const pending = pendingTranslations(rows)
  assert.deepEqual(pending.map((r) => r.id), ['a', 'c'])
})

test('parseTranslateResponse: 解析合法 JSON 数组', () => {
  const raw = '[{"ja":"設備ラック","en":"Equipment rack"},{"ja":"会議室","en":"Meeting room"}]'
  assert.deepEqual(parseTranslateResponse(raw, 2), [
    { ja: '設備ラック', en: 'Equipment rack' },
    { ja: '会議室', en: 'Meeting room' },
  ])
})

test('parseTranslateResponse: 解包对象里的数组(DeepSeek json_object 模式)', () => {
  const raw = '{"result":[{"ja":"設備ラック","en":"Equipment rack"},{"ja":"会議室","en":"Meeting room"}]}'
  assert.deepEqual(parseTranslateResponse(raw, 2), [
    { ja: '設備ラック', en: 'Equipment rack' },
    { ja: '会議室', en: 'Meeting room' },
  ])
})

test('parseTranslateResponse: 对象里无数组返回 null', () => {
  assert.equal(parseTranslateResponse('{"foo":"bar"}', 1), null)
})

test('parseTranslateResponse: 数量不匹配返回 null', () => {
  assert.equal(parseTranslateResponse('[{"ja":"x","en":"y"}]', 2), null)
})

test('parseTranslateResponse: 非法 JSON 返回 null', () => {
  assert.equal(parseTranslateResponse('not json', 1), null)
})
