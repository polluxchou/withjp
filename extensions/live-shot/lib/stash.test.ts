import assert from 'node:assert/strict'
import test from 'node:test'

import { STALE_AFTER_MS, STASH_MAX, evictionNotice, isStale, planInsert, stampTime, stripOrder, tileTime } from './stash.js'

const TZ = 'Asia/Tokyo'
const NOW = Date.UTC(2026, 9, 10, 3, 0) // 日本时间 2026-10-10 12:00
const MIN = 60_000
const shot = (id: string, capturedAt: unknown, handle = '1mb.dear') => ({ id, handle, reading: { capturedAt }, partial: false })
const ids = (xs: { id: string }[]) => xs.map((x) => x.id)

test('planInsert：未满不挤', () => {
  const items = Array.from({ length: STASH_MAX - 1 }, (_, i) => shot(`s${i}`, NOW - i * MIN))
  assert.deepEqual(planInsert(items, shot('new', NOW + MIN)), [])
})

test('planInsert：满 9 张再来一张 → 挤掉最旧的那一张', () => {
  const items = Array.from({ length: STASH_MAX }, (_, i) => shot(`s${i}`, NOW - i * MIN))
  assert.deepEqual(ids(planInsert(items, shot('new', NOW + MIN))), ['s8'])
})

test('planInsert：已经超了（两个窗口各写了一张之类）→ 一次挤到只剩 9 张，最旧的在前', () => {
  const items = Array.from({ length: STASH_MAX + 2 }, (_, i) => shot(`s${i}`, NOW - i * MIN))
  assert.deepEqual(ids(planInsert(items, shot('new', NOW + MIN))), ['s10', 's9', 's8'])
})

test('planInsert：本机时钟被往回拨、新截的反而最「旧」→ 新截的这张不挤，挤别的里最旧的', () => {
  const items = Array.from({ length: STASH_MAX }, (_, i) => shot(`s${i}`, NOW - i * MIN))
  assert.deepEqual(ids(planInsert(items, shot('new', NOW - 60 * MIN))), ['s8'])
})

test('planInsert：同一时刻按 id 定序，输入顺序不影响结果', () => {
  const items = ['c', 'a', 'i', 'b', 'h', 'd', 'g', 'e', 'f'].map((id) => shot(id, NOW))
  assert.deepEqual(ids(planInsert(items, shot('z', NOW))), ['a'])
  assert.deepEqual(ids(planInsert([...items].reverse(), shot('z', NOW))), ['a'])
})

test('planInsert：同一 id 重复写入不算两张', () => {
  const items = Array.from({ length: STASH_MAX }, (_, i) => shot(`s${i}`, NOW - i * MIN))
  assert.deepEqual(planInsert(items, shot('s0', NOW)), [])
})

test('planInsert：截图时刻坏了的记录最先被挤', () => {
  const items = [...Array.from({ length: STASH_MAX - 1 }, (_, i) => shot(`s${i}`, NOW - i * MIN)), shot('bad', 'x')]
  assert.deepEqual(ids(planInsert(items, shot('new', NOW + MIN))), ['bad'])
})

test('planInsert：越界的截图时刻（1e20，有限数但超出 Date 范围）同样最先被挤', () => {
  const items = [...Array.from({ length: STASH_MAX - 1 }, (_, i) => shot(`s${i}`, NOW - i * MIN)), shot('bad', 1e20)]
  assert.deepEqual(ids(planInsert(items, shot('new', NOW + MIN))), ['bad'])
})

test('isStale：满 23 小时 50 分才置灰（比后台的 24 小时提前 10 分钟）', () => {
  assert.equal(STALE_AFTER_MS, (23 * 60 + 50) * MIN)
  assert.equal(isStale(shot('a', NOW - STALE_AFTER_MS + 1000), NOW), false)
  assert.equal(isStale(shot('a', NOW - STALE_AFTER_MS), NOW), true)
  assert.equal(isStale(shot('a', NOW + 5 * MIN), NOW), false, '截图时刻在未来（本机时钟被往回拨）不算过期')
})

test('isStale：截图时刻坏了（缺失 / 字符串 / NaN / 连 reading 都没有）→ 当作过期，只能删', () => {
  assert.equal(isStale(shot('a', undefined), NOW), true)
  assert.equal(isStale(shot('a', String(NOW)), NOW), true)
  assert.equal(isStale(shot('a', Number.NaN), NOW), true)
  assert.equal(isStale({ id: 'a', handle: 'a' }, NOW), true)
})

test('isStale：越界的截图时刻（有限数但超出 Date 范围）也当坏的；8.64e15 是 Date 上界，本身合法', () => {
  assert.equal(isStale(shot('a', 1e20), NOW), true)
  assert.equal(isStale(shot('a', 1e16), NOW), true)
  assert.equal(isStale(shot('a', Number.MAX_VALUE), NOW), true)
  assert.equal(isStale(shot('a', -1e20), NOW), true)
  assert.equal(isStale(shot('a', 8.64e15 + 1), NOW), true)
  assert.equal(isStale(shot('a', 8.64e15), NOW), false, '上界本身合法，且在未来，不过期')
})

test('stripOrder：新的在前，不改原数组', () => {
  const items = [shot('old', NOW - 2 * MIN), shot('new', NOW), shot('mid', NOW - MIN)]
  assert.deepEqual(ids(stripOrder(items)), ['new', 'mid', 'old'])
  assert.deepEqual(ids(items), ['old', 'new', 'mid'])
})

test('tileTime：同一天给时:分，前一天加「昨」，其它给月-日（按传入时区）', () => {
  assert.equal(tileTime(Date.UTC(2026, 9, 10, 0, 5), NOW, TZ), '09:05')
  assert.equal(tileTime(Date.UTC(2026, 9, 9, 15, 0), NOW, TZ), '00:00')
  assert.equal(tileTime(Date.UTC(2026, 9, 9, 14, 59), NOW, TZ), '昨 23:59')
  assert.equal(tileTime(Date.UTC(2026, 9, 8, 3, 0), NOW, TZ), '10-08 12:00')
  assert.equal(tileTime(NOW + 26 * 60 * MIN, NOW, TZ), '10-11 14:00', '在未来也不说「今天」')
})

test('tileTime：时区决定「同一天」——同一时刻在东京是今天、在上海是昨天', () => {
  const t = Date.UTC(2026, 9, 9, 15, 30) // 东京 10-10 00:30，上海 10-09 23:30
  assert.equal(tileTime(t, NOW, TZ), '00:30')
  assert.equal(tileTime(t, NOW, 'Asia/Shanghai'), '昨 23:30')
})

test('tileTime：洛杉矶时区（NOW 是 LA 10-09 20:00）——「同一天」与「昨」两个分支都必须用传入的时区', () => {
  const LA = 'America/Los_Angeles'
  assert.equal(tileTime(Date.UTC(2026, 9, 9, 20, 0), NOW, LA), '13:00', 'LA 10-09 13:00，与 NOW 同一天')
  assert.equal(tileTime(Date.UTC(2026, 9, 9, 3, 0), NOW, LA), '昨 20:00', 'LA 10-08 20:00，是 LA 的昨天')
  assert.equal(tileTime(Date.UTC(2026, 9, 10, 6, 0), NOW, LA), '23:00', 'LA 10-09 23:00，与 NOW 同一天（LA）')
})

const pad = (n: number) => String(n).padStart(2, '0')

test('tileTime / stampTime：不传时区 → 按运行机器的本机时区（不硬编码 Asia/Tokyo 或 UTC）', () => {
  const t = NOW - 30 * MIN
  const d = new Date(t)
  const hm = `${pad(d.getHours())}:${pad(d.getMinutes())}`
  const md = `${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
  assert.equal(stampTime(t), `${md} ${hm}`)
  const sameDay = d.toDateString() === new Date(NOW).toDateString()
  const yesterday = d.toDateString() === new Date(NOW - 24 * 60 * MIN).toDateString()
  const expected = sameDay ? hm : yesterday ? `昨 ${hm}` : `${md} ${hm}`
  assert.equal(tileTime(t, NOW), expected)
})

test('tileTime / stampTime：时刻坏了给「—」，不抛错（Intl 遇到无效日期会抛 RangeError）', () => {
  assert.equal(tileTime(Number.NaN, NOW, TZ), '—')
  assert.equal(tileTime(undefined, NOW, TZ), '—')
  assert.equal(tileTime('1760000000000', NOW, TZ), '—')
  assert.equal(stampTime(Number.NaN, TZ), '—')
  assert.equal(stampTime(undefined, TZ), '—')
})

test('tileTime / stampTime：越界的时刻（1e16、1e20、MAX_VALUE）给「—」，不抛错；上界 8.64e15 照常格式化', () => {
  assert.equal(tileTime(1e20, NOW, TZ), '—')
  assert.equal(stampTime(1e16, TZ), '—')
  for (const v of [1e16, 1e20, Number.MAX_VALUE, -1e20, 8.64e15 + 1]) {
    assert.equal(tileTime(v, NOW, TZ), '—')
    assert.equal(stampTime(v, TZ), '—')
  }
  assert.equal(stampTime(8.64e15, TZ), '09-13 09:00', 'Date 上界本身合法')
})

test('stampTime：月-日 时:分', () => {
  assert.equal(stampTime(Date.UTC(2026, 9, 10, 4, 41), TZ), '10-10 13:41')
})

test('evictionNotice：没挤是空串；一张写账号和时间；多张写张数和最早那张', () => {
  assert.equal(evictionNotice([], NOW, TZ), '')
  assert.equal(evictionNotice([shot('x', Date.UTC(2026, 9, 10, 1, 2))], NOW, TZ), '最早 1 张未上传的已被挤掉（@1mb.dear 10:02）')
  assert.equal(
    evictionNotice([shot('y', Date.UTC(2026, 9, 10, 1, 5), 'uni.chuuu'), shot('x', Date.UTC(2026, 9, 9, 14, 0), '1mb.rizz')], NOW, TZ),
    '最早 2 张未上传的已被挤掉（最早一张 @1mb.rizz 昨 23:00）',
  )
})

test('evictionNotice：被挤的记录截图时刻越界（1e20）→ 不抛错，时间写「—」', () => {
  assert.equal(evictionNotice([shot('x', 1e20)], NOW, TZ), '最早 1 张未上传的已被挤掉（@1mb.dear —）')
})
