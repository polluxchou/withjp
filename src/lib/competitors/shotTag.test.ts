// src/lib/competitors/shotTag.test.ts
import assert from 'node:assert/strict'
import test from 'node:test'

import { QUICK_SHOT_TAG } from './quickShot.ts'
import { AUTO_SHOT_TAG, shotTagDisplay } from './shotTag.ts'

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

test('shotTagDisplay: 只认精确的机器值，大小写或空白不同就当人写的文本', () => {
  assert.deepEqual(shotTagDisplay('LIVE_AUTO'), { kind: 'text', text: 'LIVE_AUTO' })
  assert.deepEqual(shotTagDisplay(' live_manual'), { kind: 'text', text: 'live_manual' })
})
