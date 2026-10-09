// src/lib/competitors/quickShot.test.ts
import assert from 'node:assert/strict'
import test from 'node:test'

import {
  bearerToken, buildReadings, indexByHandle, normalizeHandle, parseCoLive,
  parseViewerSource, parseViewerText, resolveCapturedAt, shotOnFor, type CompetitorRef,
} from './quickShot.ts'

test('bearerToken：只认 Bearer 方案', () => {
  assert.equal(bearerToken('Bearer abc.def'), 'abc.def')
  assert.equal(bearerToken('bearer abc'), 'abc')
  assert.equal(bearerToken('Basic abc'), null)
  assert.equal(bearerToken('Bearer'), null)
  assert.equal(bearerToken('Bearer a b'), null, '令牌里不能夹空白')
  assert.equal(bearerToken(null), null)
})

test('normalizeHandle：去 @、去空白、转小写；非字符串给空串', () => {
  assert.equal(normalizeHandle(' @1MB.Dear '), '1mb.dear')
  assert.equal(normalizeHandle('heroangels_'), 'heroangels_')
  assert.equal(normalizeHandle(null), '')
  assert.equal(normalizeHandle(42), '')
})

test('resolveCapturedAt：正常用客户端时刻；比服务器快 5 分钟以上或非法就用服务器时间', () => {
  const server = 1_760_000_000_000
  assert.equal(resolveCapturedAt(String(server - 60_000), server), server - 60_000, '弹窗开着等了一分钟再上传，记真实读数时刻')
  assert.equal(resolveCapturedAt(String(server + 4 * 60_000), server), server + 4 * 60_000)
  assert.equal(resolveCapturedAt(String(server + 6 * 60_000), server), server, '本机时钟快了')
  assert.equal(resolveCapturedAt('abc', server), server)
  assert.equal(resolveCapturedAt(null, server), server)
  assert.equal(resolveCapturedAt('0', server), server)
})

test('resolveCapturedAt：太久以前（秒/毫秒单位搞混、1970 年）也回落到服务器时间，只认 1 小时内', () => {
  const server = 1_760_000_000_000
  assert.equal(resolveCapturedAt(String(Math.floor(server / 1000)), server), server, '客户端传了秒而不是毫秒')
  assert.equal(resolveCapturedAt('1', server), server)
  assert.equal(resolveCapturedAt('0.4', server), server, '四舍五入后为 0')
  assert.equal(resolveCapturedAt(String(server - 2 * 60 * 60_000), server), server, '2 小时前')
  assert.equal(resolveCapturedAt(String(server - 59 * 60_000), server), server - 59 * 60_000, '59 分钟前仍是真实读数时刻')
})

test('shotOnFor：按日本时间算日期，UTC 15:00 之后就是日本的第二天', () => {
  assert.equal(shotOnFor(Date.UTC(2026, 9, 8, 14, 59)), '2026-10-08')
  assert.equal(shotOnFor(Date.UTC(2026, 9, 8, 15, 0)), '2026-10-09')
})

test('parseViewerSource：只认三档来源', () => {
  assert.equal(parseViewerSource('room'), 'room')
  assert.equal(parseViewerSource('anchored'), 'anchored')
  assert.equal(parseViewerSource('sole'), 'sole')
  assert.equal(parseViewerSource('sidebar'), null)
  assert.equal(parseViewerSource(null), null)
})

test('parseCoLive：容错解析，handle 规范化，空人数记 null，坏数据丢弃', () => {
  const raw = JSON.stringify([
    { handle: '@1MB.Dear', viewer: '103' },
    { handle: 'uni.chuuu', viewer: '' },
    { handle: '', viewer: '5' },
    'junk',
    null,
  ])
  assert.deepEqual(parseCoLive(raw), [
    { handle: '1mb.dear', viewer: '103' },
    { handle: 'uni.chuuu', viewer: null },
  ])
  assert.deepEqual(parseCoLive('not json'), [])
  assert.deepEqual(parseCoLive('{"a":1}'), [])
  assert.deepEqual(parseCoLive(null), [])
})

test('parseViewerText：去空白，空串、超长（>16 字符）、非字符串都给 null', () => {
  assert.equal(parseViewerText(' 99 '), '99')
  assert.equal(parseViewerText(''), null)
  assert.equal(parseViewerText('   '), null)
  assert.equal(parseViewerText('1'.repeat(16)), '1'.repeat(16))
  assert.equal(parseViewerText('1'.repeat(17)), null)
  assert.equal(parseViewerText(99), null)
  assert.equal(parseViewerText(null), null)
})

test('parseCoLive：整串超过 16KB 直接丢弃，连 JSON.parse 都不做', () => {
  const huge = JSON.stringify([{ handle: 'a', viewer: '1' }]) + ' '.repeat(16 * 1024)
  assert.ok(huge.length > 16 * 1024)
  assert.deepEqual(parseCoLive(huge), [])
})

test('parseCoLive：handle 超过 64 字符的条目丢弃；人数去空白、超长记 null（条目保留）', () => {
  const raw = JSON.stringify([
    { handle: 'a'.repeat(65), viewer: '1' },
    { handle: 'a'.repeat(64), viewer: ' 103 ' },
    { handle: 'long.viewer', viewer: '1'.repeat(17) },
  ])
  assert.deepEqual(parseCoLive(raw), [
    { handle: 'a'.repeat(64), viewer: '103' },
    { handle: 'long.viewer', viewer: null },
  ])
})

test('parseCoLive：最多收 50 条，防止异常请求灌库', () => {
  const many = JSON.stringify(Array.from({ length: 80 }, (_, i) => ({ handle: `h${i}`, viewer: '1' })))
  assert.equal(parseCoLive(many).length, 50)
})

const LIB: CompetitorRef[] = [
  { id: 'c-dear', handle: '1mb.dear', display_name: '1MB DEAR' },
  { id: 'c-uni', handle: 'UNI.CHUUU', display_name: null },
]

test('indexByHandle：按规范化 handle 建索引', () => {
  const m = indexByHandle(LIB)
  assert.equal(m.get('uni.chuuu')?.id, 'c-uni')
  assert.equal(m.get('1mb.dear')?.id, 'c-dear')
})

test('indexByHandle：规范化后撞车时先到的赢', () => {
  const m = indexByHandle([
    { id: 'first', handle: 'Foo', display_name: null },
    { id: 'second', handle: 'foo', display_name: null },
  ])
  assert.equal(m.size, 1)
  assert.equal(m.get('foo')?.id, 'first')
})

test('buildReadings：当前房间一行 current + 在库的侧栏条目各一行 sidebar，不在库的丢掉', () => {
  const rows = buildReadings({
    library: indexByHandle(LIB),
    current: { competitorId: 'c-dear', viewerText: '99', viewerSource: 'room' },
    coLive: [
      { handle: '1mb.dear', viewer: '103' },
      { handle: 'uni.chuuu', viewer: '1.3K' },
      { handle: 'stranger', viewer: '692' },
    ],
    capturedAtIso: '2026-10-09T09:42:00.000Z',
    shotId: 'shot-1',
    userId: 'user-1',
  })
  const base = { captured_at: '2026-10-09T09:42:00.000Z', shot_id: 'shot-1', created_by: 'user-1' }
  assert.deepEqual(rows, [
    { ...base, competitor_id: 'c-dear', viewer_count: 99, viewer_text: '99', source: 'current', viewer_source: 'room' },
    { ...base, competitor_id: 'c-dear', viewer_count: 103, viewer_text: '103', source: 'sidebar', viewer_source: null },
    { ...base, competitor_id: 'c-uni', viewer_count: 1300, viewer_text: '1.3K', source: 'sidebar', viewer_source: null },
  ])
})

test('buildReadings：当前房间人数没读到就不写 current 行；侧栏同一账号只留第一条', () => {
  const rows = buildReadings({
    library: indexByHandle(LIB),
    current: { competitorId: 'c-dear', viewerText: null, viewerSource: null },
    coLive: [{ handle: 'uni.chuuu', viewer: null }, { handle: 'uni.chuuu', viewer: '64' }],
    capturedAtIso: '2026-10-09T09:42:00.000Z',
    shotId: 'shot-1',
    userId: 'user-1',
  })
  assert.equal(rows.length, 1)
  assert.equal(rows[0].source, 'sidebar')
  assert.equal(rows[0].viewer_count, null)
  assert.equal(rows[0].viewer_text, null)
})
