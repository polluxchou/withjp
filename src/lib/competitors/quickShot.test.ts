// src/lib/competitors/quickShot.test.ts
import assert from 'node:assert/strict'
import test from 'node:test'

import {
  bearerToken, buildReadings, indexByHandle, normalizeHandle, parseCoLive,
  parseViewerSource, resolveCapturedAt, shotOnFor, type CompetitorRef,
} from './quickShot.ts'

test('bearerToken：只认 Bearer 方案', () => {
  assert.equal(bearerToken('Bearer abc.def'), 'abc.def')
  assert.equal(bearerToken('bearer abc'), 'abc')
  assert.equal(bearerToken('Basic abc'), null)
  assert.equal(bearerToken('Bearer'), null)
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
