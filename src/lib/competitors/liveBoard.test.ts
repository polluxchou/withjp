// 仓库是 public：夹具一律是合成数据，不放任何真实竞品的名字或 handle。
import assert from 'node:assert/strict'
import test from 'node:test'
import type { LiveSpan } from './liveSessions.ts'
import type { CompetitorWithHistory } from './types.ts'
import {
  OUR_SCHEDULE_JST,
  barClock,
  clampMonth,
  countryAccounts,
  countryMonthKpis,
  densityColumn,
  findCompetitor,
  flattenAccounts,
  groupByCompany,
  heatAlpha,
  liveCountries,
  monthBounds,
  monthDays,
  monthRow,
  monthTotals,
  peakBucket,
  pickCountry,
  shiftMonth,
  spanSource,
  type LiveAccount,
} from './liveBoard.ts'
import { coverageHistogram, locateSpans, BUCKETS } from './liveStats.ts'

const TZ = 'Asia/Tokyo'
const j = (ymd: string, hm: string) => new Date(`${ymd}T${hm}:00+09:00`).toISOString()
const h = (ymd: string, a: string, b: string, endYmd = ymd): LiveSpan =>
  ({ startedAt: j(ymd, a), endedAt: j(endYmd, b), approxEnd: false, likes: 1, title: '', source: 'history' })
const s = (ymd: string, a: string, b: string): LiveSpan =>
  ({ startedAt: j(ymd, a), endedAt: j(ymd, b), approxEnd: true, likes: null, title: '', source: 'shot' })
const acc = (spans: LiveSpan[]) => ({ id: 'x', handle: 'sample.a', name: 'Sample', region: 'JP', company: null, spans })

// 最小的 CompetitorWithHistory 夹具：只填 flattenAccounts 会读的字段，其余给中性值。
function comp(over: Partial<CompetitorWithHistory> & { id: string; handle: string }): CompetitorWithHistory {
  return {
    platform: 'tiktok',
    profile_url: '',
    display_name: null,
    note: '',
    created_at: '2026-07-01T00:00:00Z',
    parent_id: null,
    avatar_url: null,
    region: 'JP',
    member_count: null,
    composition: null,
    launch_city: null,
    launched_on: null,
    mc_note: null,
    online_note: null,
    latest_videos: null,
    latest: null,
    history: [],
    shots: [],
    descriptions: [],
    live_sessions: [],
    weekly: [],
    related: [],
    ...over,
  }
}

test('monthDays: 月份天数含闰年', () => {
  assert.equal(monthDays('2026-09').length, 30)
  assert.equal(monthDays('2028-02').length, 29)
  assert.equal(monthDays('2026-08')[0], '2026-08-01')
})

test('monthDays: 平年二月、31 天的月、末日写法、世纪闰年规则、坏输入', () => {
  assert.equal(monthDays('2026-02').length, 28)
  assert.equal(monthDays('2026-12').length, 31)
  assert.equal(monthDays('2026-12')[30], '2026-12-31')
  assert.equal(monthDays('2026-02')[27], '2026-02-28')
  assert.equal(monthDays('2100-02').length, 28, '2100 不是闰年')
  assert.equal(monthDays('2000-02').length, 29, '2000 是闰年')
  assert.deepEqual(monthDays('2026-13'), [])
  assert.deepEqual(monthDays('2026-00'), [])
  assert.deepEqual(monthDays('2026-9'), [])
  assert.deepEqual(monthDays(''), [])
})

test('flattenAccounts: 名称回落链 latest.display_name → display_name → handle', () => {
  const out = flattenAccounts([
    comp({ id: 'a', handle: 'sample.a', display_name: 'Profile Name', latest: { display_name: 'Latest Name' } as CompetitorWithHistory['latest'] }),
    comp({ id: 'b', handle: 'sample.b', display_name: 'Profile Name' }),
    comp({ id: 'c', handle: 'sample.c' }),
  ], {})
  assert.deepEqual(out.map((a) => a.name), ['Latest Name', 'Profile Name', 'sample.c'])
  assert.deepEqual(out.map((a) => a.handle), ['sample.a', 'sample.b', 'sample.c'])
})

test('flattenAccounts: 递归展开 related，子账号公司回落到父账号，没有场次的号也保留', () => {
  const grandchild = comp({ id: 'g', handle: 'sample.g', parent_id: 'c1', region: null })
  const child = comp({
    id: 'c1',
    handle: 'sample.c1',
    parent_id: 'p',
    region: 'MY',
    shots: [{ stream_started_at: j('2026-09-02', '20:00'), captured_at: j('2026-09-02', '21:00') } as CompetitorWithHistory['shots'][number]],
    related: [grandchild],
  })
  const own = comp({ id: 'c2', handle: 'sample.c2', parent_id: 'p' })
  const parent = comp({
    id: 'p',
    handle: 'sample.p',
    live_sessions: [{ started_at: j('2026-09-01', '12:00'), ended_at: j('2026-09-01', '14:00'), likes: 5, title: 'T' } as CompetitorWithHistory['live_sessions'][number]],
    related: [child, own],
  })
  const out = flattenAccounts([parent, comp({ id: 'q', handle: 'sample.q' })], { p: 'Guild A', c2: 'Guild B' })
  // 先父后子、深度优先，再接下一个顶层账号
  assert.deepEqual(out.map((a) => a.id), ['p', 'c1', 'g', 'c2', 'q'])
  assert.deepEqual(out.map((a) => a.company), ['Guild A', 'Guild A', 'Guild A', 'Guild B', null])
  assert.equal(out[1].region, 'MY')
  assert.equal(out[2].region, null)
  // 场次来自 liveSpansOf：导入 + 截图
  assert.equal(out[0].spans.length, 1)
  assert.equal(out[0].spans[0].source, 'history')
  assert.equal(out[1].spans.length, 1)
  assert.equal(out[1].spans[0].source, 'shot')
  // 没有任何场次的号保留，视图自己过滤
  assert.deepEqual(out[2].spans, [])
  assert.deepEqual(out[4].spans, [])
})

test('flattenAccounts: 子账号自己登记了公司就用自己的', () => {
  const out = flattenAccounts(
    [comp({ id: 'p', handle: 'sample.p', related: [comp({ id: 'c', handle: 'sample.c' })] })],
    { p: 'Guild A', c: 'Guild C' },
  )
  assert.deepEqual(out.map((a) => a.company), ['Guild A', 'Guild C'])
})

test('findCompetitor: 按 id 递归 related 找原始记录；找不到为 null', () => {
  const kid = comp({ id: 'k1', handle: 'sample.kid' })
  const tree = [comp({ id: 'p1', handle: 'sample.a' }), comp({ id: 'p2', handle: 'sample.b', related: [kid] })]
  assert.equal(findCompetitor(tree, 'p1')?.handle, 'sample.a')
  assert.equal(findCompetitor(tree, 'k1'), kid)
  assert.equal(findCompetitor(tree, 'nope'), null)
  assert.equal(findCompetitor([], 'p1'), null)
})

test('OUR_SCHEDULE_JST: 14:30–17:30 与 18:30–21:30（分钟）', () => {
  assert.deepEqual(OUR_SCHEDULE_JST.map((r) => [...r]), [[870, 1050], [1110, 1290]])
})

test('monthRow: 有场次=live、有数据没场次=idle、其余=nodata；跨午夜画到 24 点后', () => {
  const row = monthRow(acc([h('2026-09-01', '12:00', '14:00'), h('2026-09-03', '19:19', '00:24', '2026-09-04')]), '2026-09', TZ, new Set())
  assert.equal(row.cells.length, 30)
  assert.equal(row.cells[0].status, 'live')
  assert.equal(row.cells[1].status, 'idle')
  assert.equal(row.cells[2].bars[0].end, 24 * 60 + 24)
  assert.equal(row.cells[4].status, 'nodata')
  assert.equal(row.liveDays, 2)
  assert.equal(row.earliest, 12 * 60)
  assert.equal(row.latest, 19 * 60 + 19)
})

test('monthRow: 每格带日期；同一天多场按开播升序、liveDays 只算一天；firstStart 取第一场', () => {
  const row = monthRow(acc([h('2026-09-05', '19:00', '21:00'), s('2026-09-05', '12:30', '13:00'), h('2026-09-05', '15:00', '16:00')]), '2026-09', TZ, new Set())
  assert.equal(row.cells[0].date, '2026-09-01')
  assert.equal(row.cells[29].date, '2026-09-30')
  const cell = row.cells[4]
  assert.equal(cell.date, '2026-09-05')
  assert.equal(cell.status, 'live')
  assert.deepEqual(cell.bars.map((b) => b.start), [12 * 60 + 30, 15 * 60, 19 * 60])
  assert.deepEqual(cell.bars.map((b) => b.approx), [true, false, false], '截图推断的下播标 approx')
  assert.equal(cell.firstStart, 12 * 60 + 30)
  assert.equal(row.liveDays, 1)
  assert.equal(row.earliest, 12 * 60 + 30)
  assert.equal(row.latest, 12 * 60 + 30, '最晚是各天第一场里最晚的，不是当天最后一场')
})

test('monthRow: tip 给每场精确起止（含越过画布的部分），bars 夹在轴内画', () => {
  // 23:30 开播、播到次日 03:30：轴只到 02:00（1560），画出来的竖条要截在轴尾，提示里仍写真实下播
  const row = monthRow(acc([h('2026-09-10', '23:30', '03:30', '2026-09-11')]), '2026-09', TZ, new Set())
  const cell = row.cells[9]
  assert.deepEqual(cell.tip, [{ start: 23 * 60 + 30, end: 27 * 60 + 30, approx: false }])
  assert.deepEqual(cell.bars, [{ start: 23 * 60 + 30, end: 26 * 60, approx: false }])
  // 截图推断的场次，提示里也要带 approx（界面据此在下播前写「约」）
  const approxCell = monthRow(acc([s('2026-09-01', '13:30', '14:00')]), '2026-09', TZ, new Set()).cells[0]
  assert.deepEqual(approxCell.tip, [{ start: 13 * 60 + 30, end: 14 * 60, approx: true }])
  // 没越过轴尾时两者一致
  const plain = monthRow(acc([h('2026-09-01', '12:00', '14:00')]), '2026-09', TZ, new Set()).cells[0]
  assert.deepEqual(plain.bars, plain.tip)
})

test('monthRow: 凌晨开播（早于 06:00）归开播当天，画在轴的底部', () => {
  const row = monthRow(acc([h('2026-09-02', '01:30', '03:00')]), '2026-09', TZ, new Set())
  assert.equal(row.cells[1].status, 'live')
  assert.equal(row.cells[1].firstStart, 24 * 60 + 90)
  assert.equal(row.cells[1].tip[0].end, 24 * 60 + 180)
  assert.equal(row.cells[1].bars[0].end, 26 * 60, '03:00 越过轴尾 02:00，夹到 1560')
  assert.equal(row.cells[0].status, 'nodata')
})

test('monthRow: 02:00 之后才开播的场次（轴外）bars 整个夹在轴尾，tip 照实写', () => {
  // 03:00 开播在轴上是 1620，已经在 02:00（1560）之后：画不出来的部分不能让 bars 的起点跑出格子
  const cell = monthRow(acc([h('2026-09-02', '03:00', '04:00')]), '2026-09', TZ, new Set()).cells[1]
  assert.deepEqual(cell.bars, [{ start: 26 * 60, end: 26 * 60, approx: false }])
  assert.deepEqual(cell.tip, [{ start: 27 * 60, end: 28 * 60, approx: false }])
  assert.equal(cell.firstStart, 27 * 60)
})

test('monthRow: 不属于本月的场次不进格子也不计入汇总', () => {
  const row = monthRow(acc([h('2026-08-31', '12:00', '13:00'), h('2026-09-01', '20:00', '21:00'), h('2026-10-01', '09:00', '10:00')]), '2026-09', TZ, new Set())
  assert.equal(row.liveDays, 1)
  assert.equal(row.earliest, 20 * 60)
  assert.equal(row.latest, 20 * 60)
  // 8/31 与 10/1 的导入场次撑出了首末区间，9 月其余日子是「确实没播」
  assert.equal(row.cells[1].status, 'idle')
  assert.equal(row.cells[29].status, 'idle')
})

test('monthRow: 没有任何场次也没有巡检日 = 整月无数据，汇总为空', () => {
  const row = monthRow(acc([]), '2026-09', TZ, new Set())
  assert.equal(row.cells.length, 30)
  assert.ok(row.cells.every((c) => c.status === 'nodata' && c.bars.length === 0 && c.tip.length === 0 && c.firstStart === null))
  assert.equal(row.liveDays, 0)
  assert.equal(row.earliest, null)
  assert.equal(row.latest, null)
})

test('monthRow: 截图号只有巡检日才算有数据（口径来自 coverageOf）', () => {
  const row = monthRow(acc([s('2026-09-02', '13:30', '14:00')]), '2026-09', TZ, new Set(['2026-09-01', '2026-09-02', '2026-09-03']))
  assert.deepEqual(row.cells.slice(0, 5).map((c) => c.status), ['idle', 'live', 'idle', 'nodata', 'nodata'])
})

test('monthRow: 按传入的时区落日期（同一时刻在吉隆坡晚一小时）', () => {
  // JST 00:30 = 吉隆坡前一天 23:30
  const spans = [h('2026-09-05', '00:30', '02:00')]
  const jp = monthRow(acc(spans), '2026-09', 'Asia/Tokyo', new Set())
  const my = monthRow(acc(spans), '2026-09', 'Asia/Kuala_Lumpur', new Set())
  assert.equal(jp.cells[4].status, 'live')
  assert.equal(jp.cells[4].firstStart, 24 * 60 + 30)
  assert.equal(my.cells[3].status, 'live')
  assert.equal(my.cells[3].firstStart, 23 * 60 + 30)
  // 吉隆坡口径下唯一一场落在 9/4，导入区间只有这一天，9/5 已经在区间之外 = 无数据
  assert.equal(my.cells[4].status, 'nodata')
  assert.equal(my.liveDays, 1)
})

test('monthTotals: 每天开播号数与有数据号数', () => {
  const a = monthRow(acc([h('2026-09-01', '12:00', '13:00'), h('2026-09-02', '12:00', '13:00')]), '2026-09', TZ, new Set())
  const b = monthRow(acc([s('2026-09-02', '12:00', '13:00')]), '2026-09', TZ, new Set(['2026-09-01', '2026-09-02']))
  const t = monthTotals([a.cells, b.cells])
  assert.deepEqual(t[0], { live: 1, withData: 2 })
  assert.deepEqual(t[1], { live: 2, withData: 2 })
  assert.deepEqual(t[2], { live: 0, withData: 0 })
})

test('monthTotals: 一天长度 = 月天数；没有行返回空；idle 算有数据但不算开播', () => {
  assert.deepEqual(monthTotals([]), [])
  const a = monthRow(acc([h('2026-09-01', '12:00', '13:00'), h('2026-09-03', '12:00', '13:00')]), '2026-09', TZ, new Set())
  const t = monthTotals([a.cells])
  assert.equal(t.length, 30)
  assert.deepEqual(t[1], { live: 0, withData: 1 }, '9/2 在首末导入日之间：没播但有数据')
  assert.deepEqual(t[3], { live: 0, withData: 0 })
})

test('densityColumn: 导入档给出开播与下播中位，截图档只给开播', () => {
  const hist = densityColumn([
    h('2026-09-01', '12:05', '14:40'), h('2026-09-02', '12:07', '14:45'), h('2026-09-03', '12:10', '14:50'),
  ], { from: '2026-09-01', to: '2026-09-30', timeZone: TZ })
  assert.deepEqual(hist.slots, [{ start: 12 * 60 + 7, end: 14 * 60 + 45, count: 3 }])
  assert.equal(hist.source, 'history')
  const shot = densityColumn([s('2026-08-19', '13:30', '14:00'), s('2026-08-20', '13:35', '14:10')], { from: '2026-08-01', to: '2026-08-31', timeZone: TZ })
  assert.deepEqual(shot.slots, [{ start: 13 * 60 + 30, end: null, count: 2 }])
  assert.equal(shot.source, 'shot')
  assert.equal(densityColumn([], { from: '2026-08-01', to: '2026-08-31', timeZone: TZ }).source, 'none')
})

test('densityColumn: 份额与 coverageHistogram 逐格一致，场次数只算区间内', () => {
  const spans = [
    h('2026-09-01', '12:00', '14:00'), h('2026-09-02', '12:00', '13:00'), h('2026-09-02', '19:00', '21:00'),
    h('2026-08-20', '12:00', '14:00'), // 区间外
  ]
  const opts = { from: '2026-09-01', to: '2026-09-30', timeZone: TZ }
  const col = densityColumn(spans, opts)
  assert.equal(col.shares.length, BUCKETS)
  assert.deepEqual(col.shares, coverageHistogram(locateSpans(spans, TZ), opts.from, opts.to).shares)
  assert.equal(col.sessions, 3)
  // 12:00–13:00 两天都在播；13:00–14:00 只有 9/1；19:00–21:00 只有 9/2；分母是在播天数 2
  const at = (hm: string) => col.shares[((Number(hm.slice(0, 2)) * 60 + Number(hm.slice(3))) - 360) / 15]
  assert.equal(at('12:00'), 1)
  assert.equal(at('13:30'), 0.5)
  assert.equal(at('19:30'), 0.5)
  assert.equal(at('16:00'), 0)
})

test('densityColumn: 区间边界两端都含，按账号时区的当地日期判', () => {
  const spans = [h('2026-09-01', '12:00', '13:00'), h('2026-09-30', '12:00', '13:00'), h('2026-10-01', '12:00', '13:00')]
  assert.equal(densityColumn(spans, { from: '2026-09-01', to: '2026-09-30', timeZone: TZ }).sessions, 2)
  // 吉隆坡比东京晚一小时：JST 00:30 开播的场次在吉隆坡算前一天 23:30，落进 8 月 → 区间外
  const edge = [h('2026-09-01', '00:30', '01:30')]
  assert.equal(densityColumn(edge, { from: '2026-09-01', to: '2026-09-30', timeZone: TZ }).sessions, 1)
  assert.equal(densityColumn(edge, { from: '2026-09-01', to: '2026-09-30', timeZone: 'Asia/Kuala_Lumpur' }).sessions, 0)
})

test('densityColumn: 开播时刻按传入时区算（吉隆坡整体早一小时）', () => {
  const spans = [h('2026-09-01', '12:05', '14:00'), h('2026-09-02', '12:07', '14:00'), h('2026-09-03', '12:10', '14:00')]
  const my = densityColumn(spans, { from: '2026-09-01', to: '2026-09-30', timeZone: 'Asia/Kuala_Lumpur' })
  assert.equal(my.slots[0].start, 11 * 60 + 7)
})

test('densityColumn: source 区分 history / shot / mixed', () => {
  const opts = { from: '2026-09-01', to: '2026-09-30', timeZone: TZ }
  assert.equal(densityColumn([h('2026-09-01', '12:00', '13:00'), s('2026-09-02', '12:00', '13:00')], opts).source, 'mixed')
  assert.equal(densityColumn([h('2026-09-01', '12:00', '13:00')], opts).source, 'history')
  assert.equal(densityColumn([s('2026-09-01', '12:00', '13:00')], opts).source, 'shot')
  // 区间外的来源不算：只剩一种来源就是那一种
  assert.equal(densityColumn([h('2026-08-01', '12:00', '13:00'), s('2026-09-02', '12:00', '13:00')], opts).source, 'shot')
})

test('densityColumn: 档内混了截图场次，下播不给（截图的下播只是下限）', () => {
  const col = densityColumn([
    h('2026-09-01', '12:05', '14:40'), h('2026-09-02', '12:07', '14:45'), s('2026-09-03', '12:10', '14:50'),
  ], { from: '2026-09-01', to: '2026-09-30', timeZone: TZ })
  assert.equal(col.source, 'mixed')
  assert.deepEqual(col.slots, [{ start: 12 * 60 + 7, end: null, count: 3 }])
})

test('densityColumn: 两档分别聚类、按开播升序；每档的下播中位只看本档（偶数个取偏小的）', () => {
  const col = densityColumn([
    h('2026-09-01', '13:00', '15:00'), h('2026-09-02', '13:10', '15:20'), h('2026-09-03', '13:20', '15:40'), h('2026-09-04', '13:30', '16:00'),
    h('2026-09-01', '19:00', '21:00'), h('2026-09-02', '19:05', '21:10'), h('2026-09-03', '19:10', '21:30'),
  ], { from: '2026-09-01', to: '2026-09-30', timeZone: TZ })
  assert.deepEqual(col.slots, [
    { start: 13 * 60 + 10, end: 15 * 60 + 20, count: 4 },
    { start: 19 * 60 + 5, end: 21 * 60 + 10, count: 3 },
  ])
})

test('densityColumn: 场次达 3 场时门槛是 max(3, ceil(n×15%))——零散小档不成档', () => {
  // 21 场：12 点档 18 场 + 19 点档 3 场；门槛 ceil(21×0.15)=4，19 点那档只有 3 场，被丢掉
  const big = Array.from({ length: 18 }, (_, i) => h(`2026-09-${String(i + 1).padStart(2, '0')}`, '12:00', '14:00'))
  const small = [h('2026-09-01', '19:00', '21:00'), h('2026-09-02', '19:00', '21:00'), h('2026-09-03', '19:00', '21:00')]
  const col = densityColumn([...big, ...small], { from: '2026-09-01', to: '2026-09-30', timeZone: TZ })
  assert.equal(col.sessions, 21)
  assert.deepEqual(col.slots.map((x) => [x.start, x.count]), [[12 * 60, 18]])
  // 20 场时门槛 ceil(20×0.15)=3，同样的 3 场小档就够了
  const col20 = densityColumn([...big.slice(0, 17), ...small], { from: '2026-09-01', to: '2026-09-30', timeZone: TZ })
  assert.equal(col20.sessions, 20)
  assert.deepEqual(col20.slots.map((x) => x.count), [17, 3])
})

test('densityColumn: 不足 3 场时门槛降到 2；单场或两场相距太远不成档', () => {
  const opts = { from: '2026-09-01', to: '2026-09-30', timeZone: TZ }
  assert.deepEqual(densityColumn([s('2026-09-01', '13:30', '14:00')], opts).slots, [])
  assert.deepEqual(densityColumn([s('2026-09-01', '13:30', '14:00'), s('2026-09-02', '19:30', '20:00')], opts).slots, [])
  assert.equal(densityColumn([s('2026-09-01', '13:30', '14:00')], opts).sessions, 1)
})

test('densityColumn: 凌晨开播的档落在轴上 1440 之后，下播按时长推', () => {
  const col = densityColumn([
    h('2026-09-01', '00:30', '02:30'), h('2026-09-02', '00:40', '02:40'), h('2026-09-03', '00:50', '02:50'),
  ], { from: '2026-09-01', to: '2026-09-30', timeZone: TZ })
  assert.deepEqual(col.slots, [{ start: 24 * 60 + 40, end: 26 * 60 + 40, count: 3 }])
})

test('densityColumn: 轴首缝上的绕回档仍落在轴内，下播同步平移', () => {
  // 05:50 / 05:55 在轴上是 1790 / 1795，06:10 是 370；clusterMinutes 绕过 24 点把三者并成一档，
  // 档内坐标 [350, 355, 370]，中位数 355 落到 06:00 之前，要整体 +1440 拉回轴内：start 1795，
  // 下播（档内坐标 420 / 480 / 480 的下中位 480）同步 +1440 = 1920（次日 08:00）。
  const col = densityColumn([
    h('2026-09-01', '05:50', '07:00'), h('2026-09-02', '05:55', '08:00'), h('2026-09-03', '06:10', '08:00'),
  ], { from: '2026-09-01', to: '2026-09-30', timeZone: TZ })
  assert.deepEqual(col.slots, [{ start: 1795, end: 1920, count: 3 }])
})

test('densityColumn: 绕缝档拉回轴尾后，仍按开播升序排在 12 点档之后', () => {
  const col = densityColumn([
    h('2026-09-01', '05:50', '07:00'), h('2026-09-02', '05:55', '08:00'), h('2026-09-03', '06:10', '08:00'),
    h('2026-09-01', '12:00', '14:00'), h('2026-09-02', '12:05', '14:00'), h('2026-09-03', '12:10', '14:00'),
  ], { from: '2026-09-01', to: '2026-09-30', timeZone: TZ })
  assert.deepEqual(col.slots.map((x) => x.start), [12 * 60 + 5, 1795])
})

test('densityColumn: 同一开播分钟出现在多天，每场都算进档内（不重复计下播）', () => {
  const col = densityColumn([
    h('2026-09-01', '12:00', '15:00'), h('2026-09-02', '12:00', '16:00'), h('2026-09-03', '12:00', '17:00'), h('2026-09-04', '12:10', '14:00'),
  ], { from: '2026-09-01', to: '2026-09-30', timeZone: TZ })
  // 下播 14:00 / 15:00 / 16:00 / 17:00 → 偏小的中位 15:00。
  // 若 12:00 这个开播分钟因出现三次被重复展开三遍，12:00 那三场的下播会被多算，中位会偏到 16:00。
  assert.deepEqual(col.slots, [{ start: 12 * 60, end: 15 * 60, count: 4 }])
})

test('peakBucket: 份额过门槛的列数最多的那一格', () => {
  const a = new Array(80).fill(0); const b = new Array(80).fill(0)
  a[24] = 0.5; b[24] = 0.4; b[52] = 0.9
  assert.deepEqual(peakBucket([a, b]), { index: 24, count: 2 })
  assert.equal(peakBucket([new Array(80).fill(0)]), null)
})

test('peakBucket: 门槛含等号、可调；并列取最早；没有列返回 null', () => {
  const a = new Array(80).fill(0); const b = new Array(80).fill(0)
  a[10] = 0.3; b[40] = 0.3
  assert.deepEqual(peakBucket([a, b]), { index: 10, count: 1 }, '恰好 0.3 算过门槛；并列取最早')
  const c = new Array(80).fill(0)
  c[10] = 0.29; c[40] = 0.29
  assert.equal(peakBucket([c]), null, '低于默认门槛 0.3')
  assert.deepEqual(peakBucket([c], 0.2), { index: 10, count: 1 }, '门槛可调')
  assert.equal(peakBucket([]), null)
  // 列长不一时按最长的算：短列在长列的位置上视为没有份额
  const short = new Array(10).fill(0); const long = new Array(80).fill(0)
  long[60] = 0.8
  assert.deepEqual(peakBucket([short, long]), { index: 60, count: 1 })
  // 份额算出来的 3/10 与字面量 0.3 是同一个 double，不会因为浮点误差漏掉
  const d = new Array(80).fill(0)
  d[5] = 3 / 10
  assert.deepEqual(peakBucket([d]), { index: 5, count: 1 })
})

// ---- 国家月历的整形 ----

const la = (handle: string, region: string | null, company: string | null, spans: LiveSpan[]): LiveAccount =>
  ({ id: handle, handle, name: handle, region, company, spans })
const one = [h('2026-08-03', '12:00', '14:00')]

test('spanSource: 导入 / 截图 / 两者都有 / 没有', () => {
  assert.equal(spanSource([h('2026-08-03', '12:00', '13:00')]), 'history')
  assert.equal(spanSource([s('2026-08-03', '12:00', '13:00')]), 'shot')
  assert.equal(spanSource([h('2026-08-03', '12:00', '13:00'), s('2026-08-04', '12:00', '13:00')]), 'mixed')
  assert.equal(spanSource([]), 'none')
})

test('liveCountries: 只数有场次的号；未填/脏值地区不进任何国家；号多在前，同数按清单顺序', () => {
  const accounts = [
    la('sample.a', 'JP', null, one),
    la('sample.b', 'jp ', null, one), // 大小写与空白容错
    la('sample.c', 'KR', null, one),
    la('sample.d', 'MY', null, one),
    la('sample.e', 'KR', null, []), // 没场次不算
    la('sample.f', null, null, one), // 地区未填
    la('sample.g', 'XX', null, one), // 清单外
  ]
  assert.deepEqual(liveCountries(accounts), [
    { code: 'JP', count: 2 },
    { code: 'KR', count: 1 },
    { code: 'MY', count: 1 },
  ])
  // 同数时按清单顺序（KR 在 MY 前），与入参顺序无关
  assert.deepEqual(liveCountries([la('x', 'MY', null, one), la('y', 'KR', null, one)]).map((o) => o.code), ['KR', 'MY'])
  assert.deepEqual(liveCountries([]), [])
})

test('pickCountry: URL 值在选项里就用；否则 JP；没有 JP 取第一个；没有选项为 null', () => {
  const opts = [{ code: 'KR' as const, count: 3 }, { code: 'JP' as const, count: 2 }]
  assert.equal(pickCountry(opts, 'KR'), 'KR')
  assert.equal(pickCountry(opts, 'kr'), 'KR', '大小写容错')
  assert.equal(pickCountry(opts, 'MY'), 'JP', '不在选项里回落到 JP')
  assert.equal(pickCountry(opts, null), 'JP')
  assert.equal(pickCountry([{ code: 'MY', count: 1 }, { code: 'KR', count: 1 }], null), 'MY', '没有 JP 取第一个')
  assert.equal(pickCountry([], 'JP'), null)
})

test('countryAccounts: 该国（规整后）有场次的号', () => {
  const accounts = [la('a', 'JP', null, one), la('b', ' jp', null, one), la('c', 'JP', null, []), la('d', 'KR', null, one)]
  assert.deepEqual(countryAccounts(accounts, 'JP').map((a) => a.handle), ['a', 'b'])
})

test('shiftMonth: 跨年进退位；格式不对原样返回', () => {
  assert.equal(shiftMonth('2026-08', 1), '2026-09')
  assert.equal(shiftMonth('2026-12', 1), '2027-01')
  assert.equal(shiftMonth('2026-01', -1), '2025-12')
  assert.equal(shiftMonth('2026-03', -15), '2024-12')
  assert.equal(shiftMonth('2026-8', 1), '2026-8')
})

test('monthBounds: 最早一场所在月（按账号地区时区）～ 今天所在月', () => {
  // 08-01 00:30 日本时间 = 07-31 23:30 吉隆坡时间：同一场，马来西亚的号落在 7 月
  const edge = [h('2026-08-01', '00:30', '02:00'), h('2026-09-10', '12:00', '13:00')]
  assert.deepEqual(monthBounds([la('jp', 'JP', null, edge)], '2026-10-10', TZ), { from: '2026-08', to: '2026-10' })
  assert.deepEqual(monthBounds([la('my', 'MY', null, edge)], '2026-10-10', TZ), { from: '2026-07', to: '2026-10' })
  // 取所有号里最早的；场次不必按时间排好
  const late = la('b', 'JP', null, [h('2026-09-01', '12:00', '13:00')])
  const early = la('a', 'JP', null, [h('2026-09-20', '12:00', '13:00'), h('2026-06-15', '12:00', '13:00')])
  assert.deepEqual(monthBounds([late, early], '2026-10-10', TZ), { from: '2026-06', to: '2026-10' })
  // 地区不在清单里用 fallbackZone
  assert.deepEqual(monthBounds([la('x', null, null, edge)], '2026-10-10', 'Asia/Kuala_Lumpur').from, '2026-07')
  // 没场次 / 最早一场比今天还晚：只有今天所在月
  assert.deepEqual(monthBounds([la('a', 'JP', null, [])], '2026-10-10', TZ), { from: '2026-10', to: '2026-10' })
  assert.deepEqual(monthBounds([la('a', 'JP', null, [h('2026-12-01', '12:00', '13:00')])], '2026-10-10', TZ), { from: '2026-10', to: '2026-10' })
})

test('clampMonth: 缺失/格式不对取上端，越界夹到两端', () => {
  const b = { from: '2026-07', to: '2026-10' }
  assert.equal(clampMonth(null, b), '2026-10')
  assert.equal(clampMonth('2026-13', b), '2026-10')
  assert.equal(clampMonth('2026-8', b), '2026-10')
  assert.equal(clampMonth('2026-05', b), '2026-07')
  assert.equal(clampMonth('2027-01', b), '2026-10')
  assert.equal(clampMonth('2026-08', b), '2026-08')
  assert.equal(clampMonth('2026-07', b), '2026-07', '下端含')
})

test('groupByCompany: 有名字的按号数降序、同数按名字；未归属放最后；组内按 handle', () => {
  const groups = groupByCompany([
    la('sample.z', 'JP', 'Beta', one),
    la('sample.y', 'JP', null, one),
    la('sample.x', 'JP', 'Alpha', one),
    la('sample.w', 'JP', 'Gamma', one),
    la('sample.v', 'JP', 'Gamma', one),
    la('sample.u', 'JP', '', one), // 空串当未归属
    la('sample.t', 'JP', null, one),
  ])
  assert.deepEqual(groups.map((g) => [g.company, g.accounts.map((a) => a.handle)]), [
    ['Gamma', ['sample.v', 'sample.w']],
    ['Alpha', ['sample.x']],
    ['Beta', ['sample.z']],
    [null, ['sample.t', 'sample.u', 'sample.y']],
  ])
  assert.deepEqual(groupByCompany([]), [])
})

test('countryMonthKpis: 有开播的号 / 列出的号、开播最多的一天（并列取最早）、有数据的天数', () => {
  const k = countryMonthKpis(
    [{ liveDays: 3 }, { liveDays: 0 }, { liveDays: 1 }],
    [{ live: 1, withData: 2 }, { live: 2, withData: 3 }, { live: 0, withData: 0 }, { live: 2, withData: 2 }],
  )
  assert.deepEqual(k, { active: 2, total: 3, busiest: { index: 1, live: 2 }, dataDays: 3 })
  // 整月没人开播：busiest 为 null（不报「0 个号」的一天）
  assert.equal(countryMonthKpis([{ liveDays: 0 }], [{ live: 0, withData: 1 }]).busiest, null)
  assert.deepEqual(countryMonthKpis([], []), { active: 0, total: 0, busiest: null, dataDays: 0 })
})

test('heatAlpha: 0.15 + 0.7 × live / maxLive；没人开播不上色', () => {
  assert.equal(heatAlpha(0, 5), null)
  assert.equal(heatAlpha(3, 0), null)
  assert.ok(Math.abs((heatAlpha(4, 4) ?? 0) - 0.85) < 1e-9)
  assert.ok(Math.abs((heatAlpha(2, 4) ?? 0) - 0.5) < 1e-9)
  assert.ok(Math.abs((heatAlpha(1, 4) ?? 0) - 0.325) < 1e-9)
})

test('barClock: 起止钟点；跨午夜标次日；凌晨开播的场次从它自己那天量起', () => {
  assert.deepEqual(barClock({ start: 720, end: 840, approx: false }), { start: '12:00', end: '14:00', nextDay: false })
  assert.deepEqual(barClock({ start: 1380, end: 1500, approx: false }), { start: '23:00', end: '01:00', nextDay: true })
  assert.deepEqual(barClock({ start: 1380, end: 1440, approx: false }), { start: '23:00', end: '00:00', nextDay: true }, '恰好 24 点算次日')
  assert.deepEqual(barClock({ start: 1500, end: 1620, approx: true }), { start: '01:00', end: '03:00', nextDay: false })
  assert.deepEqual(barClock({ start: 1500, end: 2900, approx: false }).nextDay, true)
})
