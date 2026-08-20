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
