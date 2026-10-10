// src/lib/competitors/liveHistory.ts
// 解析 TikTok 网页主页 LIVE「History」列表的复制原文 → 一场一条的开播记录。
//
// 原文长这样（英文界面；空行多少不定）：
//
//   History
//
//   Oct
//   9
//   Sample LIVE
//
//   Friday, 12:04 PM - 2:09 PM · 106.7K likes
//
// 一块 = 月份行 + 日期行 + 0..n 行标题 + 星期/时段/点赞行，新的在前。
// 原文**没有年份**，也**没有时区**：时刻是 TikTok 按浏览器本地时区渲染的，
// 所以调用方必须告诉我们「粘贴的那台电脑在哪个时区」和「那个时区的今天」。
//
// 解析与服务端校验共用本文件：客户端用 parseLiveHistory 出预览，服务端用
// validateLiveSessionRows 对每行再挡一遍边界；parseLiveHistory 产出的每一行也先
// 过同一个校验，保证预览里能导入的，提交上去就不会被服务端整批打回。
//
// 纯函数、不读时钟，可单测。相对路径 + .ts 后缀：node --test 不认 @/ 别名。
import { parseCount } from './metrics.ts'
import { zonedWallTimeToUtc } from '../time/zonedTime.ts'

/** 标题上限（按字符计，emoji 算一个）。TikTok 的直播标题远短于此，超了只可能是解析串行。 */
export const LIVE_TITLE_MAX = 200
/** 单次导入上限。一个团播号三个月约 80 场，1000 足够一次贴完一整年。 */
export const LIVE_SESSIONS_MAX_BATCH = 1000
/** 单场时长上限。原文只有「几点到几点」，跨午夜也最多算到次日，超过 24h 必是解析错了。 */
export const LIVE_SESSION_MAX_MS = 24 * 60 * 60 * 1000

const MINUTE_MS = 60_000

export type LiveHistoryIssueReason = 'unrecognized' | 'weekday_mismatch' | 'duplicate' | 'bad_time'

export interface LiveHistoryIssue {
  /** 原文行号（1 起）。整块出问题时指向该块的月份行。 */
  line: number
  text: string
  reason: LiveHistoryIssueReason
}

export interface ParsedLiveSession {
  started_at: string
  ended_at: string
  title: string
  likes: number | null
  /** 原文里的点赞写法（如 106.7K）。换算后的 likes 是近似值，预览里留着原样好对照。 */
  likes_text: string | null
  /** 开播日（解析时区），YYYY-MM-DD —— 就是原文那一块的月/日加上推出来的年。 */
  local_date: string
  /** 该块月份行的行号。 */
  line: number
}

export interface LiveHistoryParseResult {
  sessions: ParsedLiveSession[]
  issues: LiveHistoryIssue[]
}

// ---- 行级识别 ----

// 复制出来的文本里空白五花八门：en-US 的时间格式在 12:04 与 PM 之间插的是窄不换行空格
// U+202F，网页排版常见 NBSP，日文输入法会带全角空格。JS 的 \s 本身就覆盖这些 Unicode
// 空白，一律折成一个普通空格再匹配。\s 不覆盖的是零宽类字符：零宽空格、BOM、方向标记
// 直接去掉；零宽连接符 U+200D 不动 —— 它是组合 emoji 的一部分，标题里会有。
const INVISIBLES = /[\u200B\u200E\u200F\u2060\uFEFF]/g

function normalizeLine(raw: string): string {
  return raw.replace(INVISIBLES, '').replace(/\s+/g, ' ').trim()
}

const HEADER_RE = /^(?:live )?history$/i

const MONTH_RE =
  /^(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?$/i
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']
const DAY_RE = /^(?:0?[1-9]|[12]\d|3[01])$/

function parseMonth(s: string): number | null {
  const m = s.match(MONTH_RE)
  return m ? MONTHS.indexOf(m[1].slice(0, 3).toLowerCase()) + 1 : null
}

const WEEKDAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']
// Today / Yesterday：最近一两场有可能被渲染成相对日期，不认的话最新、最有价值的那场会被丢掉。
const WEEKDAY = '(sun(?:day)?|mon(?:day)?|tue(?:s(?:day)?)?|wed(?:nesday)?|thu(?:r(?:s(?:day)?)?)?|fri(?:day)?|sat(?:urday)?|today|yesterday)'
// 上下午可写成 PM / pm / p.m.；缺省时按 24 小时制读（浏览器区域设成 en-GB 之类会这样渲染）。
const CLOCK = '(\\d{1,2}):(\\d{2})(?:\\s*([ap])\\.?\\s*m\\.?)?'
const TIME_LINE_RE = new RegExp(
  `^${WEEKDAY}\\.?,?\\s+${CLOCK}\\s*[-\u2013\u2014\u2212~]\\s*${CLOCK}`
    + `(?:\\s*[\u00B7\u2022\u30FB\u2219\u22C5|]?\\s*([\\d.,]+\\s*[kmb]?)\\s*likes?)?$`,
  'i',
)

/** 时钟 → 一天里的第几分钟。上下午缺省按 24 小时制；越界返回 null。 */
function clockMinutes(hh: string, mm: string, period: string | undefined): number | null {
  let h = Number(hh)
  const m = Number(mm)
  if (m > 59) return null
  if (period) {
    if (h < 1 || h > 12) return null
    h = (h % 12) + (period.toLowerCase() === 'p' ? 12 : 0)
  } else if (h > 23) {
    return null
  }
  return h * 60 + m
}

// ---- 日期小工具（全部按 UTC 日历算，只当「日历上的那一天」用，不代表任何时刻） ----

interface Ymd { year: number; month: number; day: number }

function ymdString({ year, month, day }: Ymd): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function shiftYmd({ year, month, day }: Ymd, days: number): Ymd {
  const d = new Date(Date.UTC(year, month - 1, day + days))
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() }
}

function parseYmd(s: string): Ymd | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s)
  if (!m) return null
  const ymd = { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) }
  return isCalendarDate(ymd) ? ymd : null
}

/** Date.UTC 会把 2 月 30 日滚成 3 月 2 日，往返一次对不上就不是真日期。 */
function isCalendarDate({ year, month, day }: Ymd): boolean {
  const d = new Date(Date.UTC(year, month - 1, day))
  return d.getUTCFullYear() === year && d.getUTCMonth() === month - 1 && d.getUTCDate() === day
}

function truncateChars(s: string, max: number): string {
  // 按码点截，不按 UTF-16 单元截：后者会把 emoji 劈成半个代理对。
  const chars = Array.from(s)
  return chars.length > max ? chars.slice(0, max).join('') : s
}

// ---- 解析 ----

interface Line { line: number; raw: string; norm: string }

export function parseLiveHistory(
  text: string,
  opts: { timeZone: string; today: string },
): LiveHistoryParseResult {
  const today = parseYmd(opts.today)
  if (!today) throw new Error(`parseLiveHistory: today must be YYYY-MM-DD, got ${opts.today}`)
  // 时区名非法时让它在这里就抛，而不是解析到一半才在某一行炸。
  new Intl.DateTimeFormat('en-US', { timeZone: opts.timeZone })

  const lines: Line[] = text
    .split(/\r\n|[\n\r\u2028\u2029]/)
    .map((raw, i) => ({ line: i + 1, raw: raw.trim(), norm: normalizeLine(raw) }))
    .filter((l) => l.norm !== '')

  const sessions: ParsedLiveSession[] = []
  const issues: LiveHistoryIssue[] = []
  const seen = new Set<string>()
  // 上一块的月日与推出的年。年份链按原文顺序走，被丢弃的块也参与：它在列表里的位置照样成立。
  let prev: { year: number; md: number } | null = null

  const isBlockStart = (j: number) =>
    j + 1 < lines.length && parseMonth(lines[j].norm) != null && DAY_RE.test(lines[j + 1].norm)

  let k = 0
  while (k < lines.length) {
    if (HEADER_RE.test(lines[k].norm)) { k += 1; continue }
    if (!isBlockStart(k)) {
      issues.push({ line: lines[k].line, text: lines[k].raw, reason: 'unrecognized' })
      k += 1
      continue
    }

    const monthLine = lines[k]
    const month = parseMonth(monthLine.norm)!
    const day = Number(lines[k + 1].norm)
    const titleParts: string[] = []
    let j = k + 2
    let match: RegExpMatchArray | null = null
    while (j < lines.length) {
      match = lines[j].norm.match(TIME_LINE_RE)
      if (match) break
      // 没等到时段行就撞上了下一块的月/日：这一块残缺，别把下一块吞进标题里。
      if (isBlockStart(j)) break
      titleParts.push(lines[j].norm)
      j += 1
    }
    if (!match) {
      for (let x = k; x < j; x += 1) issues.push({ line: lines[x].line, text: lines[x].raw, reason: 'unrecognized' })
      k = j
      continue
    }
    const timeLine = lines[j]
    k = j + 1

    // 整块出问题时报一行摘要（月 日 · 时段行），比只报月份那行好认。
    const summary = `${monthLine.norm} ${day} · ${timeLine.raw}`
    const issue = (reason: LiveHistoryIssueReason) => issues.push({ line: monthLine.line, text: summary, reason })

    // 年份：首条取今天的年（月日比今天还晚就是去年）；之后每条沿用上一条的年，
    // 月日比上一条大说明跨过了年初，退一年。列表是新→旧排的。
    const md = month * 100 + day
    const year: number = prev == null
      ? (md > today.month * 100 + today.day ? today.year - 1 : today.year)
      : (md > prev.md ? prev.year - 1 : prev.year)
    prev = { year, md }

    // 推出来的年份用原文的星期几复核。2 月 29 日落在平年这种「日期本身不存在」的，
    // 同样说明年份推错了，归到同一类。
    const date: Ymd = { year, month, day }
    const weekday = match[1].toLowerCase()
    const weekdayOk = isCalendarDate(date) && (
      weekday === 'today' ? ymdString(date) === opts.today
        : weekday === 'yesterday' ? ymdString(date) === ymdString(shiftYmd(today, -1))
          : WEEKDAYS.indexOf(weekday.slice(0, 3)) === new Date(Date.UTC(year, month - 1, day)).getUTCDay()
    )
    if (!weekdayOk) { issue('weekday_mismatch'); continue }

    // 只有一端标了上下午时（如 Intl 区间格式的 "12:04 – 2:09 PM"），另一端沿用它。
    const startMin = clockMinutes(match[2], match[3], match[4] ?? match[7])
    const endMin = clockMinutes(match[5], match[6], match[7] ?? match[4])
    if (startMin == null || endMin == null) { issue('bad_time'); continue }

    const startedAt = zonedWallTimeToUtc(
      { ...date, hour: Math.floor(startMin / 60), minute: startMin % 60 }, opts.timeZone,
    )
    // 下播时刻早于开播时刻 = 跨了午夜。按次日的墙上时间单独换算，而不是开播时刻加时长：
    // 中间若夹着夏令时切换，两种算法会差一小时。
    const endDate = endMin < startMin ? shiftYmd(date, 1) : date
    const endedAt = zonedWallTimeToUtc(
      { ...endDate, hour: Math.floor(endMin / 60), minute: endMin % 60 }, opts.timeZone,
    )

    const likesText = match[8] ? match[8].replace(/\s+/g, '') : null
    const likesRaw = likesText ? parseCount(likesText) : null
    const likes = likesRaw != null && likesRaw >= 0 ? Math.round(likesRaw) : null
    const title = truncateChars(titleParts.join(' ').trim(), LIVE_TITLE_MAX)

    const checked = validateLiveSessionRow({
      started_at: startedAt.toISOString(), ended_at: endedAt.toISOString(), title, likes,
    })
    if (!checked.ok) { issue('bad_time'); continue }
    if (seen.has(checked.row.started_at)) { issue('duplicate'); continue }
    seen.add(checked.row.started_at)

    sessions.push({ ...checked.row, likes_text: likesText, local_date: ymdString(date), line: monthLine.line })
  }

  return { sessions, issues }
}

/**
 * 预览里的「新增 X · 更新 Y」。按时刻比，不按字符串比：库里读回来的是
 * `2026-10-09T03:04:00+00:00`，解析出来的是 `2026-10-09T03:04:00.000Z`，同一刻写法不同。
 */
export function diffAgainstExisting(
  parsed: { started_at: string }[],
  existing: { started_at: string }[],
): { added: number; updated: number } {
  const have = new Set(existing.map((e) => new Date(e.started_at).getTime()))
  let updated = 0
  for (const p of parsed) if (have.has(new Date(p.started_at).getTime())) updated += 1
  return { added: parsed.length - updated, updated }
}

// ---- 入库前的逐行校验（服务端与解析器共用） ----

export interface LiveSessionRow {
  started_at: string
  ended_at: string
  title: string
  likes: number | null
}

type Check<T> = { ok: true } & T | { ok: false; message: string }

// 必须带时区（Z 或 ±HH:MM）：不带时区的写法会被服务器按它自己的本地时区解释。
const ISO_INSTANT_RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,6})?)?(?:Z|[+-]\d{2}:\d{2})$/

function isoInstantMs(v: unknown): number | null {
  if (typeof v !== 'string') return null
  const m = ISO_INSTANT_RE.exec(v)
  if (!m) return null
  // V8 会把 02-30 滚成 03-02、把 24:00 滚成次日 00:00，这里先挡掉。
  if (!isCalendarDate({ year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) })) return null
  if (Number(m[4]) > 23 || Number(m[5]) > 59 || Number(m[6] ?? 0) > 59) return null
  const ms = new Date(v).getTime()
  return Number.isNaN(ms) ? null : ms
}

export function validateLiveSessionRow(input: unknown): Check<{ row: LiveSessionRow }> {
  const fail = (message: string) => ({ ok: false as const, message })
  if (!input || typeof input !== 'object' || Array.isArray(input)) return fail('must be an object')
  const r = input as Record<string, unknown>

  const start = isoInstantMs(r.started_at)
  if (start == null) return fail('started_at must be an ISO 8601 timestamp with timezone')
  // 去重键是 (competitor_id, started_at)、分钟精度：带秒的值会和同一场的分钟值各占一行。
  if (start % MINUTE_MS !== 0) return fail('started_at must be minute precision')
  const end = isoInstantMs(r.ended_at)
  if (end == null) return fail('ended_at must be an ISO 8601 timestamp with timezone')
  if (end < start) return fail('ended_at must not be earlier than started_at')
  if (end - start > LIVE_SESSION_MAX_MS) return fail('session must not be longer than 24h')

  let likes: number | null = null
  if (r.likes != null) {
    if (typeof r.likes !== 'number' || !Number.isSafeInteger(r.likes) || r.likes < 0) {
      return fail('likes must be null or a non-negative integer')
    }
    likes = r.likes
  }

  if (r.title != null && typeof r.title !== 'string') return fail('title must be a string')
  const title = typeof r.title === 'string' ? r.title.trim() : ''
  if (Array.from(title).length > LIVE_TITLE_MAX) return fail(`title must be at most ${LIVE_TITLE_MAX} characters`)

  return {
    ok: true,
    row: { started_at: new Date(start).toISOString(), ended_at: new Date(end).toISOString(), title, likes },
  }
}

/** 整批校验：1..1000 行、逐行合法、批内开播时刻不重复。 */
export function validateLiveSessionRows(input: unknown): Check<{ rows: LiveSessionRow[] }> {
  const fail = (message: string) => ({ ok: false as const, message })
  if (!Array.isArray(input)) return fail('sessions must be an array')
  if (input.length === 0) return fail('sessions must not be empty')
  if (input.length > LIVE_SESSIONS_MAX_BATCH) return fail(`at most ${LIVE_SESSIONS_MAX_BATCH} sessions per import`)
  const rows: LiveSessionRow[] = []
  const seen = new Set<string>()
  for (let i = 0; i < input.length; i += 1) {
    const checked = validateLiveSessionRow(input[i])
    if (!checked.ok) return fail(`sessions[${i}]: ${checked.message}`)
    // 同一条 upsert 语句里同一个冲突键出现两次，Postgres 会直接报错（cannot affect row a second time）。
    if (seen.has(checked.row.started_at)) return fail(`sessions[${i}]: duplicate started_at`)
    seen.add(checked.row.started_at)
    rows.push(checked.row)
  }
  return { ok: true, rows }
}
