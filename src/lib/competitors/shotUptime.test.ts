// src/lib/competitors/shotUptime.test.ts
import assert from 'node:assert/strict'
import test from 'node:test'

import { shotUptimeLabel } from './types.ts'

test('shotUptimeLabel: 正常时长格式化为 H:MM', () => {
  // 12:33 开播 → 15:27 截图 = 2h54m
  assert.equal(
    shotUptimeLabel('2026-08-18T03:33:07Z', '2026-08-18T06:27:43Z'),
    '2:54',
  )
})

test('shotUptimeLabel: 不足一小时补零分钟', () => {
  assert.equal(
    shotUptimeLabel('2026-08-18T05:33:19Z', '2026-08-18T06:29:22Z'),
    '0:56',
  )
})

test('shotUptimeLabel: 任一端缺失返回 null', () => {
  assert.equal(shotUptimeLabel(null, '2026-08-18T06:00:00Z'), null)
  assert.equal(shotUptimeLabel('2026-08-18T06:00:00Z', null), null)
  assert.equal(shotUptimeLabel(null, null), null)
})

test('shotUptimeLabel: 截图早于开播（异常）返回 null 而非负数', () => {
  assert.equal(shotUptimeLabel('2026-08-18T07:00:00Z', '2026-08-18T06:00:00Z'), null)
})
