import assert from 'node:assert/strict'
import test from 'node:test'

import {
  addDaysYmd,
  formatDayTimeInZone,
  minuteOfDayInZone,
  weekdayOfYmd,
  zoneOffsetMinutes,
  zonedHm,
  zonedWallTimeToUtc,
  zonedYmd,
} from './zonedTime.ts'

const JST = 'Asia/Tokyo'
const PT = 'America/Los_Angeles'
const iso = (y: number, mo: number, d: number, h: number, mi: number, tz: string) =>
  zonedWallTimeToUtc({ year: y, month: mo, day: d, hour: h, minute: mi }, tz).toISOString()

test('zoneOffsetMinutes: 日本全年 +9，加州随夏令时在 -7 / -8 之间切换', () => {
  assert.equal(zoneOffsetMinutes(Date.UTC(2026, 0, 15), JST), 540)
  assert.equal(zoneOffsetMinutes(Date.UTC(2026, 6, 15), JST), 540)
  assert.equal(zoneOffsetMinutes(Date.UTC(2026, 6, 15), PT), -420)
  assert.equal(zoneOffsetMinutes(Date.UTC(2026, 11, 15), PT), -480)
})

test('zonedWallTimeToUtc: JST 墙上时间 → UTC', () => {
  assert.equal(iso(2026, 10, 9, 12, 4, JST), '2026-10-09T03:04:00.000Z')
  // 当地凌晨在 UTC 还是前一天
  assert.equal(iso(2026, 10, 9, 0, 30, JST), '2026-10-08T15:30:00.000Z')
})

test('zonedWallTimeToUtc: 加州夏令时与冬令时各按当时的偏移', () => {
  assert.equal(iso(2026, 10, 30, 19, 0, PT), '2026-10-31T02:00:00.000Z', 'PDT = UTC-7')
  assert.equal(iso(2026, 11, 3, 19, 0, PT), '2026-11-04T03:00:00.000Z', 'PST = UTC-8')
})

test('zonedWallTimeToUtc: 猜测时刻与真实时刻跨切换线时用复核后的偏移', () => {
  // 11-01 05:00 已是冬令时，但按「05:00Z」去查偏移会查到前一晚的夏令时 -7。
  assert.equal(iso(2026, 11, 1, 5, 0, PT), '2026-11-01T13:00:00.000Z')
  // 3 月拨快当天、切换之后的时刻
  assert.equal(iso(2026, 3, 8, 9, 0, PT), '2026-03-08T16:00:00.000Z')
})

test('zonedWallTimeToUtc: 回拨重复的那一小时取先出现的那次（夏令时）', () => {
  assert.equal(iso(2026, 11, 1, 1, 30, PT), '2026-11-01T08:30:00.000Z')
})

test('zonedWallTimeToUtc: 拨快空档里不存在的时刻顺延到切换之后', () => {
  // 2026-03-08 02:30 在洛杉矶不存在；与 JS Date 的本地时间一样顺延成 03:30 PDT。
  assert.equal(iso(2026, 3, 8, 2, 30, PT), '2026-03-08T10:30:00.000Z')
})

test('zonedYmd / zonedHm: 按指定时区取日期与时刻，非法时刻给 null', () => {
  const t = '2026-10-09T15:30:00.000Z'
  assert.equal(zonedYmd(t, JST), '2026-10-10')
  assert.equal(zonedYmd(t, PT), '2026-10-09')
  assert.equal(zonedHm(t, JST), '00:30', '午夜按 00 而不是 24')
  assert.equal(zonedHm(t, PT), '08:30')
  assert.equal(zonedYmd('not-a-date', JST), null)
  assert.equal(zonedHm('not-a-date', JST), null)
})

test('addDaysYmd / weekdayOfYmd: 纯日历运算，跨月跨年', () => {
  assert.equal(addDaysYmd('2026-12-31', 1), '2027-01-01')
  assert.equal(addDaysYmd('2026-03-01', -1), '2026-02-28')
  assert.equal(weekdayOfYmd('2026-10-09'), 5)
})

test('minuteOfDayInZone: 按时区取一天里的第几分钟', () => {
  assert.equal(minuteOfDayInZone('2026-10-09T03:04:00Z', 'Asia/Tokyo'), 12 * 60 + 4)
  assert.equal(minuteOfDayInZone('bad', 'Asia/Tokyo'), null)
})

test('formatDayTimeInZone: MM-DD HH:mm，非法返回 null', () => {
  assert.equal(formatDayTimeInZone('2026-10-09T03:04:00Z', 'Asia/Tokyo'), '10-09 12:04')
  assert.equal(formatDayTimeInZone(null, 'Asia/Tokyo'), null)
  // 非法时刻字符串同样给 null，而不是 "NaN-NaN"。
  assert.equal(formatDayTimeInZone('not-a-date', 'Asia/Tokyo'), null)
  // 跨日：UTC 还是前一天，当地已是次日。
  assert.equal(formatDayTimeInZone('2026-10-09T15:30:00Z', 'Asia/Tokyo'), '10-10 00:30')
})

test('时区格式化器按时区缓存：两个时区交替调用，每个函数每次都按各自的时区算', () => {
  // 守缓存键：若所有时区共用同一个格式化器，或键取错，第二个时区的结果会串成第一个。
  const t = '2026-10-09T15:30:00.000Z' // JST 10-10 00:30 · 加州（夏令时 UTC-7）10-09 08:30
  for (let i = 0; i < 4; i += 1) {
    assert.equal(zonedHm(t, JST), '00:30')
    assert.equal(zonedHm(t, PT), '08:30')
    assert.equal(zonedYmd(t, JST), '2026-10-10')
    assert.equal(zonedYmd(t, PT), '2026-10-09')
    assert.equal(minuteOfDayInZone(t, JST), 30)
    assert.equal(minuteOfDayInZone(t, PT), 8 * 60 + 30)
    assert.equal(zoneOffsetMinutes(Date.parse(t), JST), 540)
    assert.equal(zoneOffsetMinutes(Date.parse(t), PT), -420)
  }
})

test('时区名非法照旧抛 RangeError，且不污染缓存：之后合法时区与再次非法都表现如常', () => {
  const t = '2026-10-09T15:30:00.000Z'
  assert.throws(() => zonedHm(t, 'Not/AZone'), RangeError)
  assert.equal(zonedHm(t, JST), '00:30')
  assert.throws(() => zonedHm(t, 'Not/AZone'), RangeError)
})
