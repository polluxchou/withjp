import assert from 'node:assert/strict'
import test from 'node:test'

import { LOCALE_TIME_ZONE, formatDayTimeInLocaleZone, timeZoneForLocale } from './localeZone.ts'

test('timeZoneForLocale: 三种语言各自的时区', () => {
  assert.equal(timeZoneForLocale('ja'), 'Asia/Tokyo')
  assert.equal(timeZoneForLocale('zh'), 'Asia/Shanghai')
  assert.equal(timeZoneForLocale('en'), 'America/Los_Angeles')
})

test('timeZoneForLocale: 未知/缺失回落到默认语言(zh)，不看运行环境时区', () => {
  assert.equal(timeZoneForLocale('de'), LOCALE_TIME_ZONE.zh)
  assert.equal(timeZoneForLocale(undefined), LOCALE_TIME_ZONE.zh)
  assert.equal(timeZoneForLocale(''), LOCALE_TIME_ZONE.zh)
})

// 真实数据：1mb.fiora 2026-08-19 那场的开播时刻
test('formatDayTimeInLocaleZone: 同一 UTC 时刻在三种语言下的换算', () => {
  const iso = '2026-08-19T04:32:00Z'
  assert.equal(formatDayTimeInLocaleZone(iso, 'ja'), '08-19 13:32', 'JST = UTC+9')
  assert.equal(formatDayTimeInLocaleZone(iso, 'zh'), '08-19 12:32', '北京 = UTC+8')
  assert.equal(formatDayTimeInLocaleZone(iso, 'en'), '08-18 21:32', '加州夏令时 = UTC-7，且退回前一天')
})

test('formatDayTimeInLocaleZone: 加州冬令时按 UTC-8 算（夏令时不能写死偏移）', () => {
  const iso = '2026-01-15T04:32:00Z'
  assert.equal(formatDayTimeInLocaleZone(iso, 'en'), '01-14 20:32')
  assert.equal(formatDayTimeInLocaleZone(iso, 'ja'), '01-15 13:32', '日本无夏令时，全年 UTC+9')
})

test('formatDayTimeInLocaleZone: 午夜按 00 而不是 24 渲染', () => {
  // 2026-08-19T15:00Z = JST 次日 00:00
  assert.equal(formatDayTimeInLocaleZone('2026-08-19T15:00:00Z', 'ja'), '08-20 00:00')
})

test('formatDayTimeInLocaleZone: 缺失或非法时刻返回 null', () => {
  assert.equal(formatDayTimeInLocaleZone(null, 'ja'), null)
  assert.equal(formatDayTimeInLocaleZone(undefined, 'ja'), null)
  assert.equal(formatDayTimeInLocaleZone('', 'ja'), null)
  assert.equal(formatDayTimeInLocaleZone('not-a-date', 'ja'), null)
})
