import assert from 'node:assert/strict'
import test from 'node:test'

import {
  RULER_HALF_BAND_MINUTES,
  RULER_MIN_SPAN_MINUTES,
  axisTicks,
  buildRegionRuler,
  tickStepHours,
} from './regionRuler.ts'
import type { RulerInput } from './regionRuler.ts'

const TZ = 'Asia/Tokyo'
const NOW = '2026-08-19T12:00:00Z'

/** JST 某天某时刻的 ISO（UTC 表示）。JST = UTC+9。 */
function jst(day: number, hh: number, mm: number): string {
  const utcHour = hh - 9
  const d = new Date(Date.UTC(2026, 7, day, 0, 0, 0))
  d.setUTCMinutes(utcHour * 60 + mm)
  return d.toISOString()
}

function acc(over: Partial<RulerInput> & { id: string; handle: string }): RulerInput {
  return { region: 'JP', shots: [], ...over }
}

function shots(...isos: string[]) {
  return isos.map((iso) => ({ stream_started_at: iso }))
}

test('只画指定地区的账号', () => {
  const r = buildRegionRuler({
    competitors: [
      acc({ id: 'jp', handle: 'jp1', shots: shots(jst(18, 13, 30)) }),
      acc({ id: 'kr', handle: 'kr1', region: 'KR', shots: shots(jst(18, 10, 0)) }),
    ],
    region: 'JP',
    timeZone: TZ,
    now: NOW,
  })
  assert.deepEqual(r.rows.map((x) => x.id), ['jp'])
  assert.equal(r.accounts, 1)
})

test('地区比对忽略大小写与空白', () => {
  const r = buildRegionRuler({
    competitors: [acc({ id: 'a', handle: 'a', region: ' jp ', shots: shots(jst(18, 13, 0)) })],
    region: 'JP',
    timeZone: TZ,
    now: NOW,
  })
  assert.equal(r.rows.length, 1)
})

test('子主播递归纳入', () => {
  const r = buildRegionRuler({
    competitors: [
      acc({
        id: 'parent',
        handle: 'p',
        shots: shots(jst(18, 13, 0)),
        related: [acc({ id: 'kid', handle: 'k', shots: shots(jst(18, 20, 0)) })],
      }),
    ],
    region: 'JP',
    timeZone: TZ,
    now: NOW,
  })
  assert.deepEqual(r.rows.map((x) => x.id), ['parent', 'kid'], '按首档时刻升序')
})

test('窗口外的场次不算，窗口内的算', () => {
  const r = buildRegionRuler({
    competitors: [
      acc({ id: 'old', handle: 'old', shots: shots('2026-07-20T04:00:00Z') }),
      acc({ id: 'fresh', handle: 'fresh', shots: shots(jst(18, 13, 0)) }),
    ],
    region: 'JP',
    timeZone: TZ,
    now: NOW,
  })
  assert.deepEqual(r.rows.map((x) => x.id), ['fresh'])
})

test('未来时刻不算（时钟错乱或数据脏）', () => {
  const r = buildRegionRuler({
    competitors: [acc({ id: 'a', handle: 'a', shots: shots('2026-09-01T04:00:00Z') })],
    region: 'JP',
    timeZone: TZ,
    now: NOW,
  })
  assert.equal(r.rows.length, 0)
})

test('段是中位数 ±30 分钟', () => {
  const r = buildRegionRuler({
    competitors: [acc({ id: 'a', handle: 'a', shots: shots(jst(18, 13, 30)) })],
    region: 'JP',
    timeZone: TZ,
    now: NOW,
  })
  const band = r.rows[0].bands[0]
  assert.equal(band.centerLabel, '13:30')
  assert.equal(band.startMinutes, 13 * 60 + 30 - RULER_HALF_BAND_MINUTES)
  assert.equal(band.endMinutes, 13 * 60 + 30 + RULER_HALF_BAND_MINUTES)
})

test('≥3 场才算成档，1-2 场标为推测', () => {
  const r = buildRegionRuler({
    competitors: [
      // 真实数据形状：1mb.rizz 的 13:29/13:31/13:42 是一档，17:15 单独一档
      acc({
        id: 'rizz',
        handle: 'rizz',
        shots: shots(jst(17, 13, 29), jst(18, 13, 31), jst(19, 13, 42), jst(18, 17, 15)),
      }),
    ],
    region: 'JP',
    timeZone: TZ,
    now: NOW,
  })
  const [afternoon, evening] = r.rows[0].bands
  assert.equal(afternoon.sessions, 3)
  assert.equal(afternoon.established, true)
  assert.equal(afternoon.centerLabel, '13:31', '档内取中位数')
  assert.equal(evening.sessions, 1)
  assert.equal(evening.established, false, '只播过一次不能叫习惯')
  assert.equal(r.rows[0].sessions, 4)
})

test('当前账号被标出来', () => {
  const r = buildRegionRuler({
    competitors: [
      acc({ id: 'a', handle: 'a', shots: shots(jst(18, 12, 0)) }),
      acc({ id: 'b', handle: 'b', shots: shots(jst(18, 14, 0)) }),
    ],
    region: 'JP',
    timeZone: TZ,
    now: NOW,
    currentId: 'b',
  })
  assert.deepEqual(r.rows.map((x) => x.current), [false, true])
})

test('时区决定「一天里的第几分钟」：同一时刻在北京时区整体左移一小时', () => {
  const competitors = [acc({ id: 'a', handle: 'a', shots: shots(jst(18, 13, 30)) })]
  const tokyo = buildRegionRuler({ competitors, region: 'JP', timeZone: TZ, now: NOW })
  const beijing = buildRegionRuler({ competitors, region: 'JP', timeZone: 'Asia/Shanghai', now: NOW })
  assert.equal(tokyo.rows[0].bands[0].centerLabel, '13:30')
  assert.equal(beijing.rows[0].bands[0].centerLabel, '12:30')
})

test('显示名三级回退：快照名 → 竞品名 → handle', () => {
  const r = buildRegionRuler({
    competitors: [
      acc({ id: 'a', handle: 'ha', latest: { display_name: '快照名' }, display_name: '竞品名', shots: shots(jst(18, 9, 0)) }),
      acc({ id: 'b', handle: 'hb', display_name: '竞品名B', shots: shots(jst(18, 10, 0)) }),
      acc({ id: 'c', handle: 'hc', shots: shots(jst(18, 11, 0)) }),
    ],
    region: 'JP',
    timeZone: TZ,
    now: NOW,
  })
  assert.deepEqual(r.rows.map((x) => x.name), ['快照名', '竞品名B', 'hc'])
})

test('没有任何开播时刻时返回空图而不是崩', () => {
  const r = buildRegionRuler({
    competitors: [acc({ id: 'a', handle: 'a', shots: [{ stream_started_at: null }] })],
    region: 'JP',
    timeZone: TZ,
    now: NOW,
  })
  assert.equal(r.rows.length, 0)
  assert.equal(r.accounts, 0)
  assert.equal(r.sessions, 0)
})

test('地区为空或 now 非法时返回空图', () => {
  const competitors = [acc({ id: 'a', handle: 'a', shots: shots(jst(18, 13, 0)) })]
  assert.equal(buildRegionRuler({ competitors, region: null, timeZone: TZ, now: NOW }).rows.length, 0)
  assert.equal(buildRegionRuler({ competitors, region: '  ', timeZone: TZ, now: NOW }).rows.length, 0)
  assert.equal(buildRegionRuler({ competitors, region: 'JP', timeZone: TZ, now: 'x' }).rows.length, 0)
})

test('轴至少 8 小时宽，且始终落在一天之内', () => {
  const r = buildRegionRuler({
    competitors: [acc({ id: 'a', handle: 'a', shots: shots(jst(18, 13, 30)) })],
    region: 'JP',
    timeZone: TZ,
    now: NOW,
  })
  assert.ok(r.axisEnd - r.axisStart >= RULER_MIN_SPAN_MINUTES, `轴只有 ${r.axisEnd - r.axisStart} 分钟`)
  assert.ok(r.axisStart >= 0 && r.axisEnd <= 1440)
})

test('轴包住所有段', () => {
  const r = buildRegionRuler({
    competitors: [
      acc({ id: 'early', handle: 'e', shots: shots(jst(18, 8, 25)) }),
      acc({ id: 'late', handle: 'l', shots: shots(jst(18, 22, 5)) }),
    ],
    region: 'JP',
    timeZone: TZ,
    now: NOW,
  })
  for (const row of r.rows) {
    for (const b of row.bands) {
      assert.ok(b.startMinutes >= r.axisStart, `${row.handle} 的段左边界越出轴`)
      assert.ok(b.endMinutes <= r.axisEnd, `${row.handle} 的段右边界越出轴`)
    }
  }
})

test('tickStepHours: 跨度越大刻度越稀', () => {
  assert.equal(tickStepHours(300), 1)
  assert.equal(tickStepHours(600), 2)
  assert.equal(tickStepHours(900), 3)
})

test('axisTicks: 落在轴内且按步长对齐', () => {
  const ticks = axisTicks(8 * 60, 16 * 60)
  assert.deepEqual(ticks, [8, 10, 12, 14, 16].map((h) => h * 60))
})

test('标尺把导入的场次也算进去，同一场的截图不重复计', () => {
  // 之前标尺只吃截图的 stream_started_at，导入的开播记录（LIVE History）完全不进轴；
  // 现在两个来源先合并：导入 10-09 03:06 开播的那一场，截图 03:06:30 自报的是同一场，只计一次。
  const now = '2026-10-10T00:00:00Z'
  const ruler = buildRegionRuler({
    competitors: [{
      id: 'a', handle: 'sample.a', region: 'JP',
      live_sessions: [
        { started_at: '2026-10-08T03:04:00+00:00', ended_at: '2026-10-08T05:09:00+00:00', likes: 1, title: '' },
        { started_at: '2026-10-09T03:06:00+00:00', ended_at: '2026-10-09T05:00:00+00:00', likes: 1, title: '' },
      ],
      shots: [{ stream_started_at: '2026-10-09T03:06:30+00:00', captured_at: '2026-10-09T04:00:00+00:00' }],
    }],
    region: 'JP', timeZone: 'Asia/Tokyo', now,
  })
  assert.equal(ruler.sessions, 2)
  assert.equal(ruler.rows[0].sessions, 2)
})

test('只有导入记录（没有截图）的账号也上轴；窗口外与未来的导入场次不算', () => {
  const now = '2026-10-10T00:00:00Z'
  const session = (started_at: string) => ({ started_at, ended_at: started_at, likes: null, title: '' })
  const ruler = buildRegionRuler({
    competitors: [{
      id: 'a', handle: 'sample.a', region: 'JP',
      live_sessions: [
        session('2026-10-09T03:00:00Z'),
        session('2026-09-01T03:00:00Z'), // 早于 14 天窗口
        session('2026-10-11T03:00:00Z'), // 晚于 now（脏数据）
      ],
    }],
    region: 'JP', timeZone: 'Asia/Tokyo', now,
  })
  assert.equal(ruler.accounts, 1)
  assert.equal(ruler.sessions, 1)
  assert.equal(ruler.rows[0].bands[0].centerLabel, '12:00')
})

// 零散开播的账号：8 场分在 8 个不同时段，两两相隔 ≥ 45 分钟 → 每个 45 分钟簇只有 1 场；
// 而总场次 8 场时占比门槛 ceil(8 × 0.15) = 2，没有一簇过得了，summarizeLiveHabit 返回空 slots。
// 以前这种账号被整个跳过（从标尺上消失）；现在要留一条推测段。
// 最近一场（8-18 16:00）刻意放在中间时段：并列时要取「含最近一场」的那簇，而不是最早或最晚的。
function scatteredAccount(id: string) {
  const hours = [10, 12, 13, 14, 16, 18, 20, 22]
  // 8-18 往前每天一场；hours 顺序与日期对应，16 点落在最近一天。
  const dayOf = (h: number) => 18 - ((hours.indexOf(16) - hours.indexOf(h) + 8) % 8)
  return acc({ id, handle: `sample.${id}`, shots: shots(...hours.map((h) => jst(dayOf(h), h, 0))) })
}

test('零散开播的账号不会从标尺上消失：留一条推测段，按它的总场次计数', () => {
  const r = buildRegionRuler({
    competitors: [scatteredAccount('s')],
    region: 'JP',
    timeZone: TZ,
    now: NOW,
  })
  assert.equal(r.rows.length, 1, '有开播时刻的账号必须有一行')
  const [row] = r.rows
  assert.equal(row.sessions, 8)
  assert.equal(row.bands.length, 1, '只留一条推测段，不把 8 个零散时刻全摊上去')
  assert.equal(row.bands[0].established, false)
  assert.equal(row.bands[0].centerLabel, '16:00', '并列时取含最近一场的那簇')
  assert.equal(row.bands[0].startMinutes, 16 * 60 - RULER_HALF_BAND_MINUTES)
  assert.equal(row.bands[0].endMinutes, 16 * 60 + RULER_HALF_BAND_MINUTES)
  assert.equal(r.accounts, 1)
  assert.equal(r.sessions, 8)
})

test('零散账号与成档账号并存：两者都上轴，场次各算各的', () => {
  const r = buildRegionRuler({
    competitors: [
      scatteredAccount('s'),
      acc({ id: 'ok', handle: 'ok', shots: shots(jst(16, 20, 0), jst(17, 20, 5), jst(18, 19, 55)) }),
    ],
    region: 'JP',
    timeZone: TZ,
    now: NOW,
  })
  assert.deepEqual(r.rows.map((x) => x.id), ['s', 'ok'], '按首档时刻升序：16:00 在 20:00 之前')
  assert.equal(r.rows[1].bands[0].established, true, '成档账号的画法不受影响')
  assert.equal(r.accounts, 2)
  assert.equal(r.sessions, 8 + 3)
})

test('当前账号只要窗口内有任何开播时刻就一定有一行（浮层顶部的「本账号」依赖它）', () => {
  const r = buildRegionRuler({
    competitors: [
      scatteredAccount('s'),
      acc({ id: 'ok', handle: 'ok', shots: shots(jst(16, 20, 0), jst(17, 20, 5), jst(18, 19, 55)) }),
    ],
    region: 'JP',
    timeZone: TZ,
    now: NOW,
    currentId: 's',
  })
  const current = r.rows.filter((x) => x.current)
  assert.equal(current.length, 1)
  assert.equal(current[0].id, 's')
})

test('地区里只有零散账号时标尺也不是空的（rulerEmpty 说「没采到」是假话）', () => {
  const r = buildRegionRuler({
    competitors: [scatteredAccount('s1'), scatteredAccount('s2')],
    region: 'JP',
    timeZone: TZ,
    now: NOW,
    currentId: 's2',
  })
  assert.equal(r.rows.length, 2)
  assert.equal(r.accounts, 2)
  assert.equal(r.sessions, 16)
  assert.ok(r.axisEnd > r.axisStart)
})

test('零散账号里最大的那簇优先：多场簇胜过只有一场的簇，哪怕后者是最近一场', () => {
  // 11:50 / 12:10 相差 20 分钟，是一簇 2 场；另有 19 个互相隔开的单场，最近一场（8-18 01:00）也是单场。
  // 共 21 场 → 占比门槛 ceil(21 × 0.15) = 4，2 场的簇也成不了档，走兜底。
  // 兜底要选的是最大簇（2 场），最近一场只用来在并列时分胜负。
  const starts = [jst(18, 1, 0), jst(18, 12, 10), jst(17, 11, 50)]
  const singles = [6, 7, 8, 9, 10, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 3, 4, 5]
  singles.forEach((h, i) => starts.push(jst(6 + (i % 12), h, 0))) // 日期取 8-06 到 8-17，都在 14 天窗口内
  const r = buildRegionRuler({
    competitors: [acc({ id: 'dense', handle: 'dense', shots: shots(...starts) })],
    region: 'JP',
    timeZone: TZ,
    now: NOW,
  })
  assert.equal(r.rows.length, 1)
  assert.equal(r.rows[0].sessions, 21)
  const [band] = r.rows[0].bands
  assert.equal(band.established, false)
  assert.equal(band.centerLabel, '11:50', '2 场的 11:50/12:10 簇取偏早的中位数')
})
