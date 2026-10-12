// src/lib/competitors/liveSessionPack.test.ts
import assert from 'node:assert/strict'
import test from 'node:test'
import { diffAgainstExisting } from './liveHistory.ts'
import { liveSessionRows, packLiveSessions, unpackLiveSessions, type LiveSessionFields } from './liveSessionPack.ts'
import { liveSpansOf } from './liveSessions.ts'

const MIN = 60_000
const row = (started_at: string, ended_at: string, likes: number | null = 100, title = 'Sample LIVE'): LiveSessionFields =>
  ({ started_at, ended_at, likes, title })
/** 解包后的期望值：时刻统一成 toISOString 写法，其余原样。 */
const norm = (r: LiveSessionFields): LiveSessionFields => ({
  started_at: new Date(r.started_at).toISOString(),
  ended_at: new Date(r.ended_at).toISOString(),
  likes: r.likes,
  title: r.title,
})

test('整分钟：按分钟存，开播 = epoch 分钟，时长 = 分钟数，点赞与标题按列原样', () => {
  const pack = packLiveSessions([
    row('2026-10-10T13:17:00+00:00', '2026-10-10T14:01:00+00:00', 786, 'Sample A'),
    row('2026-10-09T03:04:00Z', '2026-10-09T05:00:00Z', null, ''),
  ])
  assert.deepEqual(pack, {
    unitMs: 60_000,
    start: [Date.parse('2026-10-10T13:17:00Z') / MIN, Date.parse('2026-10-09T03:04:00Z') / MIN],
    dur: [44, 116],
    likes: [786, null],
    title: ['Sample A', ''],
  })
})

test('任一行带秒：整个账号退回按毫秒存，往返无损', () => {
  const rows = [
    row('2026-10-10T13:17:00Z', '2026-10-10T14:01:30Z'), // 下播带秒（校验器只要求开播整分钟）
    row('2026-10-09T03:04:00Z', '2026-10-09T05:00:00Z'),
  ]
  const pack = packLiveSessions(rows)
  assert.equal(pack.unitMs, 1)
  assert.deepEqual(pack.start, [Date.parse('2026-10-10T13:17:00Z'), Date.parse('2026-10-09T03:04:00Z')])
  assert.deepEqual(pack.dur, [44 * MIN + 30_000, 116 * MIN])
  assert.deepEqual(unpackLiveSessions(pack), rows.map(norm))
})

test('毫秒与微秒：毫秒原样保留，微秒截到毫秒（与 Date.parse 的现状一致）', () => {
  const pack = packLiveSessions([row('2026-10-10T13:17:00Z', '2026-10-10T14:01:00.123456+00:00')])
  assert.equal(pack.unitMs, 1)
  assert.equal(unpackLiveSessions(pack)[0].ended_at, '2026-10-10T14:01:00.123Z')
})

test('同一时刻的不同写法（+00:00 / Z / .000Z / +09:00）打包结果相同', () => {
  const a = packLiveSessions([row('2026-10-09T03:04:00+00:00', '2026-10-09T05:00:00+00:00')])
  const b = packLiveSessions([row('2026-10-09T12:04:00+09:00', '2026-10-09T05:00:00.000Z')])
  assert.deepEqual(a, b)
})

test('往返：解包得到同序、同值的行（时刻写成 toISOString），不重排输入顺序', () => {
  const rows = [
    row('2026-09-01T03:00:00Z', '2026-09-01T05:00:00Z', 5, 'Sample old first'), // 故意不按时刻排
    row('2026-10-01T03:00:00Z', '2026-10-01T04:00:00Z', null, ''),
    row('2026-08-01T03:00:00Z', '2026-08-01T03:00:00Z', 0, 'Sample zero length'),
  ]
  assert.deepEqual(unpackLiveSessions(packLiveSessions(rows)), rows.map(norm))
})

test('空列表：四个空数组、单位取分钟；解包为空', () => {
  const pack = packLiveSessions([])
  assert.deepEqual(pack, { unitMs: 60_000, start: [], dur: [], likes: [], title: [] })
  assert.deepEqual(unpackLiveSessions(pack), [])
})

test('读不出的时刻整行跳过（与 liveSpansOf 一致），不影响其余行的单位', () => {
  const good = row('2026-10-08T03:04:00Z', '2026-10-08T05:00:00Z')
  const pack = packLiveSessions([
    row('not a date', '2026-10-09T05:00:00Z'),
    row('2026-10-09T03:04:30Z', 'also bad'), // 带秒但整行被跳过：不该把单位拖成毫秒
    good,
  ])
  assert.equal(pack.unitMs, 60_000)
  assert.deepEqual(unpackLiveSessions(pack), [norm(good)])
})

test('JSON 往返（服务端组件传 props、接口返回 JSON）后照样解包', () => {
  const rows = [
    row('2026-10-10T13:17:00Z', '2026-10-10T14:01:30Z', null, ''),
    row('2026-10-09T03:04:00Z', '2026-10-09T05:00:00Z'),
  ]
  const pack = packLiveSessions(rows)
  assert.deepEqual(unpackLiveSessions(JSON.parse(JSON.stringify(pack))), rows.map(norm))
})

test('liveSessionRows：有包就解包，缺包（null / 没有这个字段）当没有开播记录', () => {
  const rows = [row('2026-10-09T03:04:00Z', '2026-10-09T05:00:00Z')]
  assert.deepEqual(liveSessionRows({ liveSessionPack: packLiveSessions(rows) }), rows.map(norm))
  assert.deepEqual(liveSessionRows({ liveSessionPack: null }), [])
  assert.deepEqual(liveSessionRows({}), [])
})

test('等价：liveSpansOf 吃解包后的行与吃原始行结果逐项相同（含标题、点赞、与截图合并去重）', () => {
  const rows = [
    row('2026-08-20T00:04:00+00:00', '2026-08-20T02:44:00+00:00', 1200, 'Sample A'),
    row('2026-08-19T00:04:00+00:00', '2026-08-19T02:44:30+00:00', null, ''),
  ]
  const shots = [
    { stream_started_at: '2026-08-20T01:11:00Z', captured_at: '2026-08-20T01:30:00Z' }, // 断线重连：落在导入场次内，丢掉
    { stream_started_at: '2026-08-21T10:00:00Z', captured_at: '2026-08-21T11:00:00Z' }, // 只有截图的一场
  ]
  assert.deepEqual(
    liveSpansOf({ live_sessions: unpackLiveSessions(packLiveSessions(rows)), shots }),
    liveSpansOf({ live_sessions: rows, shots }),
  )
})

test('等价（批量）：确定性生成 300 行，分钟路径与毫秒路径下 liveSpansOf 都与原始行相同', () => {
  // Park–Miller 最小标准生成器：结果固定、全程在安全整数内，便于复现。
  let seed = 42
  const rand = (n: number) => {
    seed = (seed * 48271) % 2147483647
    return seed % n
  }
  const base = Date.parse('2026-07-01T00:00:00Z')
  const gen = (withSeconds: boolean): LiveSessionFields[] =>
    Array.from({ length: 300 }, (_, i) => {
      const start = base + i * 6 * 3_600_000 + rand(300) * MIN
      const end = start + rand(400) * MIN + (withSeconds && i % 7 === 0 ? rand(59_000) + 1 : 0)
      return {
        started_at: new Date(start).toISOString(),
        ended_at: new Date(end).toISOString(),
        likes: i % 5 === 0 ? null : rand(100_000),
        title: i % 3 === 0 ? '' : `Sample ${i % 4}`,
      }
    }).reverse()
  for (const withSeconds of [false, true]) {
    const rows = gen(withSeconds)
    const pack = packLiveSessions(rows)
    assert.equal(pack.unitMs, withSeconds ? 1 : 60_000)
    assert.deepEqual(
      liveSpansOf({ live_sessions: unpackLiveSessions(pack), shots: [] }),
      liveSpansOf({ live_sessions: rows, shots: [] }),
    )
  }
})

test('导入预览：已有场次换成解包后的行，「新增 / 更新」计数与用库行算的一样', () => {
  const dbRows = [
    row('2026-10-09T03:04:00+00:00', '2026-10-09T05:00:00+00:00'),
    row('2026-10-08T03:04:00+00:00', '2026-10-08T05:00:00+00:00'),
  ]
  const parsed = [{ started_at: '2026-10-09T03:04:00.000Z' }, { started_at: '2026-10-10T03:04:00.000Z' }]
  const viaPack = diffAgainstExisting(parsed, unpackLiveSessions(packLiveSessions(dbRows)))
  assert.deepEqual(viaPack, diffAgainstExisting(parsed, dbRows))
  assert.deepEqual(viaPack, { added: 1, updated: 1 })
})
