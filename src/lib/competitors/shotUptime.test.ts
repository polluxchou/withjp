// src/lib/competitors/shotUptime.test.ts
import assert from 'node:assert/strict'
import test from 'node:test'

import { shotUptimeParts } from './types.ts'

test('shotUptimeParts: 拆成小时/分钟', () => {
  // 12:33 开播 → 15:27 截图 = 2h54m
  assert.deepEqual(
    shotUptimeParts('2026-08-18T03:33:07Z', '2026-08-18T06:27:43Z'),
    { h: 2, m: 54 },
  )
})

test('shotUptimeParts: 不足一小时 h=0', () => {
  assert.deepEqual(
    shotUptimeParts('2026-08-18T05:33:19Z', '2026-08-18T06:29:22Z'),
    { h: 0, m: 56 },
  )
})

test('shotUptimeParts: 任一端缺失返回 null', () => {
  assert.equal(shotUptimeParts(null, '2026-08-18T06:00:00Z'), null)
  assert.equal(shotUptimeParts('2026-08-18T06:00:00Z', null), null)
  assert.equal(shotUptimeParts(null, null), null)
})

test('shotUptimeParts: 截图早于开播（异常）返回 null', () => {
  assert.equal(shotUptimeParts('2026-08-18T07:00:00Z', '2026-08-18T06:00:00Z'), null)
})
