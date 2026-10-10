// src/lib/time/zonedTime.ts — 「某时区的墙上时间」与 UTC 时刻互转。
//
// localeZone.ts 管的是 UTC → 当地（展示）；这里补反方向：拿到一段只写着
// 「10 月 9 日 12:04 PM」的原文（TikTok LIVE History），要按它被渲染时所在的
// 时区还原成 UTC 时刻才能入库。
//
// 不能写死偏移：北美有夏令时，同一个 America/Los_Angeles 在 10 月是 UTC-7、
// 11 月是 UTC-8。偏移交给 Intl（IANA 库）按「那一刻」去查，查完再复核一次——
// 第一次查的是猜测时刻的偏移，若猜测与真实时刻恰好落在切换线两侧，偏移会差一小时。
//
// 纯函数、不读时钟，可单测。相对路径 + .ts 后缀的约定见 localeZone.ts。

const MINUTE_MS = 60_000

export interface WallTime {
  year: number
  /** 1–12 */
  month: number
  day: number
  hour: number
  minute: number
}

/** 读出某时刻在指定时区的日历/时钟各部件。hourCycle h23：午夜是 00 不是 24。 */
function zonedParts(ms: number, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(ms))
  const at = (type: string) => Number(parts.find((p) => p.type === type)?.value)
  return { year: at('year'), month: at('month'), day: at('day'), hour: at('hour'), minute: at('minute'), second: at('second') }
}

/** 某个 UTC 时刻在指定时区的偏移（分钟，东正西负）。JST 恒为 540。 */
export function zoneOffsetMinutes(ms: number, timeZone: string): number {
  // 秒以下截掉：formatToParts 只给到秒，带着毫秒算会多出一个零头。
  const whole = Math.floor(ms / 1000) * 1000
  const p = zonedParts(whole, timeZone)
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second)
  return Math.round((asUtc - whole) / MINUTE_MS)
}

/**
 * 指定时区的墙上时间 → UTC 时刻。时区名非法时 Intl 会抛 RangeError，调用方自己兜。
 *
 * 夏令时的两个边角：
 * - 回拨时重复出现的那一小时（如洛杉矶 11 月第一个周日的 01:30）取先出现的那次（夏令时）。
 * - 拨快时不存在的那一小时（如 3 月的 02:30）顺延到切换之后，与 JS Date 处理本地时间的做法一致。
 * TikTok 的原文是从真实时刻渲染出来的，不会出现后一种，这里只保证不崩、结果确定。
 */
export function zonedWallTimeToUtc(wall: WallTime, timeZone: string): Date {
  const guess = Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute)
  const first = guess - zoneOffsetMinutes(guess, timeZone) * MINUTE_MS
  const firstOffset = zoneOffsetMinutes(first, timeZone)
  const second = guess - firstOffset * MINUTE_MS
  if (second === first) return new Date(first)
  // 两次结果不同：猜测时刻与真实时刻跨了切换线。用复核后的偏移再算一次，
  // 若它自洽（该时刻的偏移正是算它用的偏移）就是答案；否则墙上时间落在拨快的空档里。
  if (zoneOffsetMinutes(second, timeZone) === firstOffset) return new Date(second)
  return new Date(Math.max(first, second))
}

/** UTC 时刻 → 指定时区的日期 YYYY-MM-DD。时刻非法返回 null。 */
export function zonedYmd(instant: Date | string | number, timeZone: string): string | null {
  const ms = new Date(instant).getTime()
  if (Number.isNaN(ms)) return null
  const p = zonedParts(ms, timeZone)
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`
}

/** UTC 时刻 → 指定时区的 HH:mm（24 小时制）。时刻非法返回 null。 */
export function zonedHm(instant: Date | string | number, timeZone: string): string | null {
  const ms = new Date(instant).getTime()
  if (Number.isNaN(ms)) return null
  const p = zonedParts(ms, timeZone)
  return `${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}`
}
