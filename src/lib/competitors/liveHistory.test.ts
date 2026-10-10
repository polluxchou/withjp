// 仓库是 public：夹具一律是合成数据（标题用 Sample LIVE 之类），不放任何真实竞品的名字或 handle。
import assert from 'node:assert/strict'
import test from 'node:test'

import {
  LIVE_SESSIONS_MAX_BATCH, LIVE_TITLE_MAX,
  diffAgainstExisting, parseLiveHistory, validateLiveSessionRow, validateLiveSessionRows,
} from './liveHistory.ts'

const JST = 'Asia/Tokyo'
const PT = 'America/Los_Angeles'
const NNBSP = '\u202F' // en-US 时间格式里 12:04 与 PM 之间那个窄不换行空格
const NBSP = '\u00A0'
// 零宽空格 / 零宽连接符：用 fromCharCode 写，免得源码里出现看不见的字符
const ZWSP = String.fromCharCode(0x200b)
const ZWJ = String.fromCharCode(0x200d)

const parse = (lines: string[], today: string, timeZone = JST) =>
  parseLiveHistory(lines.join('\n'), { timeZone, today })

// 与 TikTok 网页复制出来的形状一致：表头、空行位置不固定、新的在前。
const SAMPLE = [
  'History', //                                          1
  '', //                                                 2
  'Oct', //                                              3
  '9', //                                                4
  'Sample LIVE 🪭', //                                    5
  '', //                                                 6
  'Friday, 12:04 PM - 2:09 PM · 106.7K likes', //        7
  'Sep', //                                              8
  '29', //                                               9
  "Sample's LIVE", //                                    10
  '', //                                                 11
  'Tuesday, 7:19 PM - 12:24 AM · 1.6M likes', //         12
  'Sep', //                                              13
  '16', //                                               14
  "Sample's LIVE", //                                    15
  '', //                                                 16
  'Wednesday, 4:47 PM - 5:36 PM · 267 likes', //         17
]

test('parseLiveHistory: JST 原文 → UTC，三块全识别、表头与空行忽略', () => {
  const { sessions, issues } = parse(SAMPLE, '2026-10-10')
  assert.deepEqual(issues, [])
  assert.equal(sessions.length, 3)
  assert.deepEqual(sessions[0], {
    started_at: '2026-10-09T03:04:00.000Z',
    ended_at: '2026-10-09T05:09:00.000Z',
    title: 'Sample LIVE 🪭',
    likes: 106700,
    likes_text: '106.7K',
    local_date: '2026-10-09',
    line: 3,
  })
  assert.equal(sessions[2].started_at, '2026-09-16T07:47:00.000Z')
  assert.equal(sessions[2].ended_at, '2026-09-16T08:36:00.000Z')
  assert.equal(sessions[2].likes, 267)
  assert.equal(sessions[2].line, 13)
})

test('parseLiveHistory: 下播早于开播 → 算到次日', () => {
  const s = parse(SAMPLE, '2026-10-10').sessions[1]
  // 9/29 19:19 JST 开播，9/30 00:24 JST 下播
  assert.equal(s.started_at, '2026-09-29T10:19:00.000Z')
  assert.equal(s.ended_at, '2026-09-29T15:24:00.000Z')
  assert.equal(s.local_date, '2026-09-29', '开播日按开播那一刻算，不随下播跨日')
  assert.equal(s.likes, 1600000)
})

test('parseLiveHistory: 跨年 —— 1 月初往回推，月日变大就退一年', () => {
  const { sessions, issues } = parse([
    'Jan', '3', 'Sample LIVE', 'Sunday, 8:00 PM - 9:00 PM · 10 likes',
    'Dec', '30', 'Sample LIVE', 'Wednesday, 8:00 PM - 9:00 PM · 10 likes',
  ], '2027-01-05')
  assert.deepEqual(issues, [])
  assert.deepEqual(sessions.map((s) => s.local_date), ['2027-01-03', '2026-12-30'])
  assert.equal(sessions[1].started_at, '2026-12-30T11:00:00.000Z')
})

test('parseLiveHistory: 首条月日比今天还晚 → 去年', () => {
  const { sessions } = parse(['Dec', '31', 'Thursday, 8:00 PM - 9:00 PM'], '2027-01-05')
  assert.equal(sessions[0].local_date, '2026-12-31')
})

test('parseLiveHistory: 星期对不上的整块丢弃并报出，后面的块照常解析、年份链不断', () => {
  const { sessions, issues } = parse([
    'Oct', '9', 'Sample LIVE', 'Friday, 12:04 PM - 2:09 PM',
    'Oct', '8', 'Sample LIVE', 'Friday, 12:04 PM - 2:09 PM', // 2026-10-08 是周四
    'Oct', '7', 'Sample LIVE', 'Wednesday, 12:04 PM - 2:09 PM',
  ], '2026-10-10')
  assert.deepEqual(sessions.map((s) => s.local_date), ['2026-10-09', '2026-10-07'])
  assert.deepEqual(issues, [
    { line: 5, text: 'Oct 8 · Friday, 12:04 PM - 2:09 PM', reason: 'weekday_mismatch' },
  ])
})

test('parseLiveHistory: 点赞 K / M / B / 小写 / 千分位 / 单数 / 缺失', () => {
  const block = (day: string, weekday: string, likes: string) => ['Oct', day, `${weekday}, 1:00 PM - 2:00 PM${likes}`]
  const { sessions, issues } = parse([
    ...block('9', 'Friday', ' · 106.7K likes'),
    ...block('8', 'Thursday', ' · 2.5k likes'),
    ...block('7', 'Wednesday', ' · 1,234 likes'),
    ...block('6', 'Tuesday', ' · 1 like'),
    ...block('5', 'Monday', ''),
    ...block('4', 'Sunday', ' · 1.2B likes'),
    ...block('3', 'Saturday', ' · 0 likes'),
  ], '2026-10-10')
  assert.deepEqual(issues, [])
  assert.deepEqual(sessions.map((s) => s.likes), [106700, 2500, 1234, 1, null, 1200000000, 0])
  assert.deepEqual(sessions.map((s) => s.likes_text), ['106.7K', '2.5k', '1,234', '1', null, '1.2B', '0'])
})

test('parseLiveHistory: en dash / em dash、窄 NBSP、NBSP、• 分隔、小写 am/pm 都认', () => {
  const { sessions, issues } = parse([
    'Oct', '9', 'Sample LIVE',
    `Friday,${NBSP}12:04${NNBSP}pm – 2:09${NNBSP}pm • 106.7K${NBSP}likes`,
    `${ZWSP}Oct${NBSP}`, ' 8 ', `Sample${ZWJ}LIVE`,
    'Thursday, 11:30 a.m. — 1:00 p.m.',
  ], '2026-10-10')
  assert.deepEqual(issues, [])
  assert.equal(sessions[0].started_at, '2026-10-09T03:04:00.000Z')
  assert.equal(sessions[0].ended_at, '2026-10-09T05:09:00.000Z')
  assert.equal(sessions[0].likes, 106700)
  assert.equal(sessions[1].started_at, '2026-10-08T02:30:00.000Z')
  assert.equal(sessions[1].ended_at, '2026-10-08T04:00:00.000Z')
  assert.equal(sessions[1].title, `Sample${ZWJ}LIVE`, '零宽连接符是组合 emoji 的一部分，不能剥掉')
})

test('parseLiveHistory: 只有一端标上下午时另一端沿用；都不标按 24 小时制', () => {
  const { sessions, issues } = parse([
    'Oct', '9', 'Friday, 7:19 - 9:00 PM',
    'Oct', '8', 'Thursday, 12:04 - 14:09',
  ], '2026-10-10')
  assert.deepEqual(issues, [])
  assert.equal(sessions[0].started_at, '2026-10-09T10:19:00.000Z', '7:19 沿用 PM = 19:19，不是早上 7 点')
  assert.equal(sessions[0].ended_at, '2026-10-09T12:00:00.000Z')
  assert.equal(sessions[1].started_at, '2026-10-08T03:04:00.000Z')
  assert.equal(sessions[1].ended_at, '2026-10-08T05:09:00.000Z')
})

test('parseLiveHistory: 空标题与多行标题', () => {
  const { sessions, issues } = parse([
    'Oct', '9', 'Friday, 12:04 PM - 2:09 PM · 5 likes',
    'Oct', '8', 'Sample', 'LIVE  night', 'Thursday, 12:04 PM - 2:09 PM',
  ], '2026-10-10')
  assert.deepEqual(issues, [])
  assert.equal(sessions[0].title, '')
  assert.equal(sessions[1].title, 'Sample LIVE night', '多行标题用空格拼，连续空白折成一个')
})

test('parseLiveHistory: 洛杉矶跨夏令时切换 —— 两侧各按当时的偏移，跨切换的那场按墙上时间算', () => {
  // 2026-11-01 02:00 PDT 回拨到 01:00 PST
  const { sessions, issues } = parse([
    'Nov', '3', 'Sample LIVE', 'Tuesday, 7:00 PM - 9:00 PM',
    'Oct', '31', 'Sample LIVE', 'Saturday, 11:00 PM - 2:30 AM',
    'Oct', '30', 'Sample LIVE', 'Friday, 7:00 PM - 9:00 PM',
  ], '2026-11-05', PT)
  assert.deepEqual(issues, [])
  assert.equal(sessions[0].started_at, '2026-11-04T03:00:00.000Z', 'PST = UTC-8')
  assert.equal(sessions[2].started_at, '2026-10-31T02:00:00.000Z', 'PDT = UTC-7')
  assert.equal(sessions[1].started_at, '2026-11-01T06:00:00.000Z', '23:00 PDT')
  assert.equal(sessions[1].ended_at, '2026-11-01T10:30:00.000Z', '次日 02:30 PST，中间多出回拨的一小时')
})

test('parseLiveHistory: 同一场贴了两遍 → 留第一条、第二条报重复', () => {
  const block = ['Oct', '9', 'Sample LIVE', 'Friday, 12:04 PM - 2:09 PM · 1K likes']
  const { sessions, issues } = parse([...block, ...block], '2026-10-10')
  assert.equal(sessions.length, 1)
  assert.equal(sessions[0].likes, 1000)
  assert.deepEqual(issues, [{ line: 5, text: 'Oct 9 · Friday, 12:04 PM - 2:09 PM · 1K likes', reason: 'duplicate' }])
})

test('parseLiveHistory: 认不出的行逐行报出，不影响前后的块', () => {
  const { sessions, issues } = parse([
    'Load more', //                                   1
    'Oct', '9', 'Sample LIVE', 'Friday, 12:04 PM - 2:09 PM', // 2-5
    'Replay', //                                      6
    'Friday, 12:04 PM - 2:09 PM', //                  7 孤零零的时段行
    'Oct', '8', 'Sample LIVE', //                     8-10 没有时段行的残块
    'Oct', '7', 'Sample LIVE', 'Wednesday, 12:04 PM - 2:09 PM', // 11-14
  ], '2026-10-10')
  assert.deepEqual(sessions.map((s) => s.local_date), ['2026-10-09', '2026-10-07'])
  assert.deepEqual(issues.map((i) => [i.line, i.text, i.reason]), [
    [1, 'Load more', 'unrecognized'],
    [6, 'Replay', 'unrecognized'],
    [7, 'Friday, 12:04 PM - 2:09 PM', 'unrecognized'],
    [8, 'Oct', 'unrecognized'],
    [9, '8', 'unrecognized'],
    [10, 'Sample LIVE', 'unrecognized'],
  ])
})

test('parseLiveHistory: 时刻越界报 bad_time', () => {
  const { sessions, issues } = parse([
    'Oct', '9', 'Friday, 13:04 PM - 2:09 PM',
    'Oct', '8', 'Thursday, 12:75 PM - 2:09 PM',
  ], '2026-10-10')
  assert.equal(sessions.length, 0)
  assert.deepEqual(issues.map((i) => [i.line, i.reason]), [[1, 'bad_time'], [4, 'bad_time']])
})

test('parseLiveHistory: Today / Yesterday 按今天校验', () => {
  const { sessions, issues } = parse([
    'Oct', '10', 'Today, 12:00 PM - 1:00 PM',
    'Oct', '9', 'Yesterday, 12:00 PM - 1:00 PM',
    'Oct', '7', 'Yesterday, 12:00 PM - 1:00 PM',
  ], '2026-10-10')
  assert.deepEqual(sessions.map((s) => s.local_date), ['2026-10-10', '2026-10-09'])
  assert.deepEqual(issues.map((i) => i.reason), ['weekday_mismatch'])
})

test('parseLiveHistory: 空文本、只有表头 → 空结果', () => {
  assert.deepEqual(parseLiveHistory('', { timeZone: JST, today: '2026-10-10' }), { sessions: [], issues: [] })
  assert.deepEqual(parseLiveHistory('History\n\n', { timeZone: JST, today: '2026-10-10' }), { sessions: [], issues: [] })
})

test('parseLiveHistory: today 或时区非法直接抛错（调用方的 bug，不当成原文问题）', () => {
  assert.throws(() => parseLiveHistory('', { timeZone: JST, today: '2026-02-30' }))
  assert.throws(() => parseLiveHistory('', { timeZone: 'Not/A_Zone', today: '2026-10-10' }))
})

test('diffAgainstExisting: 按时刻比，写法不同的同一刻算更新', () => {
  const parsed = parse(SAMPLE, '2026-10-10').sessions
  const diff = diffAgainstExisting(parsed, [
    { started_at: '2026-10-09T03:04:00+00:00' }, //  库里读回来的写法
    { started_at: '2026-09-29T19:19:00+09:00' }, //  同一刻的 JST 写法
    { started_at: '2026-09-01T00:00:00+00:00' }, //  这次没贴到的旧场次不计入
  ])
  assert.deepEqual(diff, { added: 1, updated: 2 })
  assert.deepEqual(diffAgainstExisting(parsed, []), { added: 3, updated: 0 })
})

// ---- 入库校验 ----

const row = (over: Record<string, unknown> = {}) => ({
  started_at: '2026-10-09T03:04:00.000Z', ended_at: '2026-10-09T05:09:00.000Z', title: 'Sample LIVE', likes: 10, ...over,
})

test('validateLiveSessionRow: 合法行归一成 toISOString + 去首尾空白的标题', () => {
  const r = validateLiveSessionRow(row({ started_at: '2026-10-09T12:04:00+09:00', title: '  Sample LIVE  ' }))
  assert.deepEqual(r, {
    ok: true,
    row: { started_at: '2026-10-09T03:04:00.000Z', ended_at: '2026-10-09T05:09:00.000Z', title: 'Sample LIVE', likes: 10 },
  })
  const bare = validateLiveSessionRow({ started_at: '2026-10-09T03:04Z', ended_at: '2026-10-09T03:04Z' })
  assert.deepEqual(bare, {
    ok: true,
    row: { started_at: '2026-10-09T03:04:00.000Z', ended_at: '2026-10-09T03:04:00.000Z', title: '', likes: null },
  }, '标题、点赞缺省 → 空串 / null；零时长允许')
})

test('validateLiveSessionRow: 逐项边界', () => {
  const bad: [string, Record<string, unknown> | unknown][] = [
    ['非对象', 'x'],
    ['数组', []],
    ['开播缺时区', row({ started_at: '2026-10-09T03:04:00' })],
    ['开播不是日期', row({ started_at: 'Oct 9' })],
    ['2 月 30 日', row({ started_at: '2026-02-30T03:04:00Z', ended_at: '2026-03-02T05:00:00Z' })],
    ['24 点', row({ started_at: '2026-10-09T24:00:00Z', ended_at: '2026-10-10T01:00:00Z' })],
    ['开播带秒', row({ started_at: '2026-10-09T03:04:30Z' })],
    ['下播早于开播', row({ ended_at: '2026-10-09T03:03:00Z' })],
    ['超过 24h', row({ ended_at: '2026-10-10T03:05:00Z' })],
    ['点赞负数', row({ likes: -1 })],
    ['点赞小数', row({ likes: 1.5 })],
    ['点赞字符串', row({ likes: '10' })],
    ['点赞超出安全整数', row({ likes: Number.MAX_SAFE_INTEGER + 1 })],
    ['标题不是字符串', row({ title: 5 })],
    ['标题超长', row({ title: 'a'.repeat(LIVE_TITLE_MAX + 1) })],
  ]
  for (const [label, input] of bad) {
    assert.equal(validateLiveSessionRow(input).ok, false, label)
  }
  assert.equal(validateLiveSessionRow(row({ ended_at: '2026-10-10T03:04:00Z' })).ok, true, '恰好 24h 允许')
  assert.equal(validateLiveSessionRow(row({ title: '🪭'.repeat(LIVE_TITLE_MAX) })).ok, true, '按字符计，emoji 算一个')
})

test('validateLiveSessionRows: 批量 1..1000、批内开播时刻不得重复（写法不同也算）', () => {
  assert.equal(validateLiveSessionRows('x').ok, false)
  assert.equal(validateLiveSessionRows([]).ok, false)
  const many = Array.from({ length: LIVE_SESSIONS_MAX_BATCH + 1 }, (_, i) => row({
    started_at: new Date(Date.UTC(2026, 0, 1) + i * 86_400_000).toISOString(),
    ended_at: new Date(Date.UTC(2026, 0, 1) + i * 86_400_000 + 3_600_000).toISOString(),
  }))
  assert.equal(validateLiveSessionRows(many).ok, false)
  assert.equal(validateLiveSessionRows(many.slice(0, LIVE_SESSIONS_MAX_BATCH)).ok, true)

  const dup = validateLiveSessionRows([row(), row({ started_at: '2026-10-09T12:04:00+09:00' })])
  assert.deepEqual(dup, { ok: false, message: 'sessions[1]: duplicate started_at' })
  const badRow = validateLiveSessionRows([row(), row({ likes: -1 })])
  assert.equal(badRow.ok, false)
  assert.match((badRow as { message: string }).message, /^sessions\[1\]: likes/)
})
