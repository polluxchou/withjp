// src/lib/competitors/shotTag.test.ts
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import { QUICK_SHOT_TAG } from './quickShot.ts'
import { AUTO_SHOT_TAG, shotTagDisplay, shotTagLabel } from './shotTag.ts'

test('机器值常量与写入方一致', () => {
  assert.equal(AUTO_SHOT_TAG, 'live_auto')
  assert.equal(QUICK_SHOT_TAG, 'live_manual')
})

test('shotTagDisplay: 空值与纯空白不显示', () => {
  assert.equal(shotTagDisplay(null), null)
  assert.equal(shotTagDisplay(undefined), null)
  assert.equal(shotTagDisplay(''), null)
  assert.equal(shotTagDisplay('   '), null)
})

test('shotTagDisplay: 两个机器值换成文案键', () => {
  assert.deepEqual(shotTagDisplay('live_auto'), { kind: 'known', key: 'live_auto' })
  assert.deepEqual(shotTagDisplay('live_manual'), { kind: 'known', key: 'live_manual' })
})

test('shotTagDisplay: 人写的自由文本原样显示（去首尾空白）', () => {
  assert.deepEqual(shotTagDisplay('全妆'), { kind: 'text', text: '全妆' })
  assert.deepEqual(shotTagDisplay('  常服 '), { kind: 'text', text: '常服' })
})

test('shotTagDisplay: 只认精确的机器值，大小写或首尾空白不同就当人写的文本（两个机器值都测）', () => {
  for (const machine of [AUTO_SHOT_TAG, QUICK_SHOT_TAG]) {
    assert.deepEqual(shotTagDisplay(machine.toUpperCase()), { kind: 'text', text: machine.toUpperCase() })
    assert.deepEqual(shotTagDisplay(` ${machine}`), { kind: 'text', text: machine })
    assert.deepEqual(shotTagDisplay(`${machine} `), { kind: 'text', text: machine })
  }
})

// 两个互不相同、也不等于键名的假文案：映射错位（对调）或返回键名都会被区分出来。
const FAKE = { live_auto: '<<自动文案>>', live_manual: '<<插件文案>>' }

test('shotTagLabel: 机器值映射到各自的文案（不对调、不返回键名）', () => {
  assert.equal(shotTagLabel('live_auto', FAKE), '<<自动文案>>')
  assert.equal(shotTagLabel('live_manual', FAKE), '<<插件文案>>')
  assert.equal(shotTagLabel(AUTO_SHOT_TAG, FAKE), FAKE.live_auto)
  assert.equal(shotTagLabel(QUICK_SHOT_TAG, FAKE), FAKE.live_manual)
})

test('shotTagLabel: 自由文本返回去首尾空白后的原文，不取文案', () => {
  assert.equal(shotTagLabel('全妆', FAKE), '全妆')
  assert.equal(shotTagLabel('  常服 ', FAKE), '常服')
  assert.equal(shotTagLabel('LIVE_AUTO', FAKE), 'LIVE_AUTO')
  assert.equal(shotTagLabel(' live_manual', FAKE), 'live_manual')
})

test('shotTagLabel: 空值与纯空白返回 null', () => {
  assert.equal(shotTagLabel(null, FAKE), null)
  assert.equal(shotTagLabel(undefined, FAKE), null)
  assert.equal(shotTagLabel('', FAKE), null)
  assert.equal(shotTagLabel('   ', FAKE), null)
})

const MESSAGES = (lang: string) => JSON.parse(readFileSync(new URL(`../../../messages/${lang}.json`, import.meta.url), 'utf8'))

test('三语文案：competitors.shotTag 逐字钉住', () => {
  assert.deepEqual(MESSAGES('zh').competitors.shotTag, { live_auto: '自动巡检', live_manual: '插件' })
  assert.deepEqual(MESSAGES('en').competitors.shotTag, { live_auto: 'Auto patrol', live_manual: 'Extension' })
  assert.deepEqual(MESSAGES('ja').competitors.shotTag, { live_auto: '自動巡回', live_manual: '拡張機能' })
})

test('三语文案：两条文案互不相同，且都不是机器值原文', () => {
  for (const lang of ['zh', 'en', 'ja']) {
    const tags = MESSAGES(lang).competitors.shotTag as { live_auto: string; live_manual: string }
    assert.notEqual(tags.live_auto, tags.live_manual, `${lang}: 两条文案不能相同`)
    for (const label of [tags.live_auto, tags.live_manual]) {
      assert.ok(label.trim().length > 0, `${lang}: 文案不能为空`)
      assert.notEqual(label, AUTO_SHOT_TAG, `${lang}: 文案不能是机器值原文`)
      assert.notEqual(label, QUICK_SHOT_TAG, `${lang}: 文案不能是机器值原文`)
    }
  }
})
