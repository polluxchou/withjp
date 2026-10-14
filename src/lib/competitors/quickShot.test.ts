// src/lib/competitors/quickShot.test.ts
import assert from 'node:assert/strict'
import test from 'node:test'

import {
  bearerToken, buildReadings, indexByHandle, jstDayBounds, normalizeHandle, parseCoLive, parseShotKeys,
  parseViewerSource, parseViewerText, resolveCapturedAt, shotOnFor, toViewerCount, type CompetitorRef,
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

test('resolveCapturedAt：太久以前（秒/毫秒单位搞混、1970 年）也回落到服务器时间，只认 24 小时内', () => {
  const server = 1_760_000_000_000
  const DAY = 24 * 60 * 60_000
  assert.equal(resolveCapturedAt(String(Math.floor(server / 1000)), server), server, '客户端传了秒而不是毫秒')
  assert.equal(resolveCapturedAt('1', server), server)
  assert.equal(resolveCapturedAt('0.4', server), server, '四舍五入后为 0')
  assert.equal(resolveCapturedAt(String(server - 2 * 60 * 60_000), server), server - 2 * 60 * 60_000, '插件暂存 2 小时后补传，仍是真实截图时刻')
  assert.equal(resolveCapturedAt(String(server - (23 * 60 + 59) * 60_000), server), server - (23 * 60 + 59) * 60_000, '23 小时 59 分前')
  assert.equal(resolveCapturedAt(String(server - DAY), server), server - DAY, '恰好 24 小时仍认')
  assert.equal(resolveCapturedAt(String(server - DAY - 1), server), server, '超过 24 小时 → 服务器时间')
  assert.equal(resolveCapturedAt(String(server - 25 * 60 * 60_000), server), server, '25 小时前')
})

test('shotOnFor：按日本时间算日期，UTC 15:00 之后就是日本的第二天', () => {
  assert.equal(shotOnFor(Date.UTC(2026, 9, 8, 14, 59)), '2026-10-08')
  assert.equal(shotOnFor(Date.UTC(2026, 9, 8, 15, 0)), '2026-10-09')
})

test('jstDayBounds：日本时间自然日的 [00:00, 次日 00:00)，UTC 跨日也对', () => {
  const oct10 = { startIso: '2026-10-09T15:00:00.000Z', endIso: '2026-10-10T15:00:00.000Z' }
  assert.deepEqual(jstDayBounds(Date.UTC(2026, 9, 9, 15, 30)), oct10, '日本 10-10 00:30（UTC 还是 10-09）')
  assert.deepEqual(jstDayBounds(Date.UTC(2026, 9, 10, 3, 0)), oct10, '日本 10-10 12:00')
  assert.deepEqual(jstDayBounds(Date.UTC(2026, 9, 10, 14, 59, 59, 999)), oct10, '日本 10-10 23:59:59.999')
  assert.deepEqual(jstDayBounds(Date.UTC(2026, 9, 10, 15, 0)), { startIso: '2026-10-10T15:00:00.000Z', endIso: '2026-10-11T15:00:00.000Z' }, '恰好日本零点属于新的一天')
  assert.deepEqual(jstDayBounds(Date.UTC(2026, 9, 9, 14, 59, 59, 999)), { startIso: '2026-10-08T15:00:00.000Z', endIso: '2026-10-09T15:00:00.000Z' })
})

test('jstDayBounds：与 shotOnFor 同一口径——起点的日本日期就是 shotOnFor(ms)', () => {
  for (const ms of [Date.UTC(2026, 0, 1, 0, 0), Date.UTC(2026, 11, 31, 14, 59), Date.UTC(2026, 11, 31, 15, 0), Date.UTC(2026, 9, 10, 3, 0)]) {
    const { startIso } = jstDayBounds(ms)
    assert.equal(shotOnFor(Date.parse(startIso)), shotOnFor(ms))
  }
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

test('toViewerCount：只放行 0..int4 上限内的整数，其余按没读到处理', () => {
  assert.equal(toViewerCount('99'), 99)
  assert.equal(toViewerCount('1.2K'), 1200)
  assert.equal(toViewerCount('0'), 0)
  assert.equal(toViewerCount('2147483647'), 2_147_483_647, 'int4 上限本身可写')
  assert.equal(toViewerCount('2147483648'), null, '超出 int4 写库会被拒')
  assert.equal(toViewerCount('1.5'), null, '小数写不进 integer 列')
  assert.equal(toViewerCount('2.5B'), null, '25 亿超出 int4')
  assert.equal(toViewerCount('9999999999'), null)
  assert.equal(toViewerCount(null), null)
  assert.equal(toViewerCount('abc'), null)
})

test('buildReadings：超出 int4 或带小数的人数 viewer_count 记 null，原文照留', () => {
  const rows = buildReadings({
    library: indexByHandle(LIB),
    current: { competitorId: 'c-dear', viewerText: '1.5', viewerSource: 'room' },
    coLive: [{ handle: 'uni.chuuu', viewer: '2.5B' }],
    capturedAtIso: '2026-10-09T09:42:00.000Z',
    shotId: 'shot-1',
    userId: 'user-1',
  })
  assert.deepEqual(rows.map((r) => [r.source, r.viewer_count, r.viewer_text]), [
    ['current', null, '1.5'],
    ['sidebar', null, '2.5B'],
  ])
})

test('parseShotKeys：「handle@毫秒」逗号分隔，handle 规范化，key 原样保留供插件对号', () => {
  assert.deepEqual(parseShotKeys('1mb.era@1760341387518,@UNI.chuuu@1760341393231'), [
    { key: '1mb.era@1760341387518', handle: '1mb.era', ms: 1760341387518 },
    { key: '@UNI.chuuu@1760341393231', handle: 'uni.chuuu', ms: 1760341393231 },
  ])
})

test('parseShotKeys：空值与坏项丢掉——没有 @、handle 为空或超长、毫秒不是正整数或超出 Date 范围', () => {
  assert.deepEqual(parseShotKeys(null), [])
  assert.deepEqual(parseShotKeys(''), [])
  const bad = ['nohandle', '@1760341387518', ' @1760341387518', 'a@', 'a@-5', 'a@0', 'a@1.5', 'a@1e12', 'a@12x',
    `${'h'.repeat(65)}@1760341387518`, 'a@8640000000000001', '']
  assert.deepEqual(parseShotKeys(bad.join(',')), [])
  // 64 位 handle 和 Date 上限本身还认
  assert.equal(parseShotKeys(`${'h'.repeat(64)}@8640000000000000`).length, 1)
})

test('parseShotKeys：只看前 20 项，第 21 项起不查', () => {
  const keys = Array.from({ length: 25 }, (_, i) => `h${i}@${1760000000000 + i}`)
  const out = parseShotKeys(keys.join(','))
  assert.equal(out.length, 20)
  assert.equal(out[19].key, 'h19@1760000000019')
})
