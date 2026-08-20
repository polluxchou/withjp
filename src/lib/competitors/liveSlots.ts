// src/lib/competitors/liveSlots.ts
// 把一串开播时刻聚成「档」——即对方每天固定的那几个开播时间点。
//
// 为什么不能直接取中位数：日区团播普遍一天两档（我们自己的排期就是
// 14:30–17:30 / 18:30–21:30）。两档取中位数会落在 16:30 前后，
// 那恰好是它们**不**开播的时刻——一个看着精确、实际错误的数。
// 所以先按间隔聚类，再在每档内部取中位数。
//
// 时区由调用方注入（界面语言 → 时区，见 src/lib/time/localeZone.ts）：
// 「一天里的第几分钟」这个概念本身依赖时区，没有时区无法聚类。
// 纯函数、不读时钟，可单测。

/** 相邻场次差到这个分钟数就算另一档。3h 足够分开日区的午后档与晚间档。 */
export const SLOT_GAP_MINUTES = 180

/** 一档至少要有这么多场才敢叫「常见」。低于此只报最近一场，不把单次说成规律。 */
export const SLOT_MIN_SESSIONS = 3

const DAY_MINUTES = 1440

export interface LiveSlot {
  /** 该档的代表时刻：档内中位数，一天里的第几分钟。 */
  startMinutes: number
  /** HH:mm，直接可显示。 */
  label: string
  /** 该档场次数。 */
  count: number
}

export interface LiveHabit {
  /** 达到 SLOT_MIN_SESSIONS 的档，按时刻升序。 */
  slots: LiveSlot[]
  /** 去重后的总场次（同一场的多张截图只算一次）。 */
  sessions: number
  /** 最近一场的开播时刻（ISO）。场次不足成档时用它兜底。 */
  latestStartedAt: string | null
}

/** 一天里的第几分钟（指定时区）。时刻非法返回 null。 */
function minutesOfDayIn(iso: string, timeZone: string): number | null {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(d)
  const hour = parts.find((p) => p.type === 'hour')?.value
  const minute = parts.find((p) => p.type === 'minute')?.value
  if (hour == null || minute == null) return null
  return Number(hour) * 60 + Number(minute)
}

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

/** 分钟数 → HH:mm。入参允许越界（跨午夜合并会算出负数或 >1440），先归一。 */
export function minutesToLabel(minutes: number): string {
  const m = ((minutes % DAY_MINUTES) + DAY_MINUTES) % DAY_MINUTES
  return `${pad2(Math.floor(m / 60))}:${pad2(m % 60)}`
}

/** 档内取中位数而不是平均：偶发的早开/晚开不该把整档拖偏。偶数个取偏早那个。 */
function median(sorted: number[]): number {
  const mid = Math.floor((sorted.length - 1) / 2)
  return sorted[mid]
}

/**
 * 去重后按时刻降序的最近 limit 场开播时刻（ISO）。
 * 展开档案里列证据用：让"这档是几天前的老习惯还是本周的"一眼可见，
 * 所以聚合值旁边必须能看到原始场次。
 */
export function recentSessionStarts(
  startedAts: (string | null | undefined)[],
  limit: number,
): string[] {
  const distinct = Array.from(new Set(startedAts.filter((s): s is string => !!s)))
    .filter((iso) => !Number.isNaN(new Date(iso).getTime()))
  // ISO 8601 定长同格式，字符串降序即时刻降序。
  return distinct.sort((a, b) => (a < b ? 1 : a > b ? -1 : 0)).slice(0, limit)
}

export function summarizeLiveHabit(
  startedAts: (string | null | undefined)[],
  timeZone: string,
  /**
   * 一档至少几场才收进 slots。默认 SLOT_MIN_SESSIONS（卡片上「常见开播时段」
   * 的门槛：不把单次开播说成规律）。地区标尺传 1 —— 它要把只播过一次的账号
   * 也摆上轴、另用浅色标成推测，否则图上几乎是空的、看不出分布。
   */
  minSessions: number = SLOT_MIN_SESSIONS,
): LiveHabit {
  // 同一场的多张截图报同一个 stream_started_at，去重后才是「场次」。
  const distinct = Array.from(new Set(startedAts.filter((s): s is string => !!s)))
  const withMinutes = distinct
    .map((iso) => ({ iso, minutes: minutesOfDayIn(iso, timeZone) }))
    .filter((x): x is { iso: string; minutes: number } => x.minutes != null)

  if (withMinutes.length === 0) return { slots: [], sessions: 0, latestStartedAt: null }

  // ISO 8601 同格式定长，字符串比较即时刻比较（库里都是 timestamptz 序列化的 UTC）。
  const latestStartedAt = withMinutes.reduce((a, b) => (b.iso > a.iso ? b : a)).iso

  const minutes = withMinutes.map((x) => x.minutes).sort((a, b) => a - b)
  const groups: number[][] = [[minutes[0]]]
  for (let i = 1; i < minutes.length; i += 1) {
    if (minutes[i] - minutes[i - 1] < SLOT_GAP_MINUTES) groups[groups.length - 1].push(minutes[i])
    else groups.push([minutes[i]])
  }
  // 跨午夜：23:50 与 00:10 在数轴两端，按差值算是 23 小时"远"，其实是同一档。
  // 首尾两组绕过 24 点仍在间隔内就合并，末组减去一天再参与中位数计算。
  if (
    groups.length > 1 &&
    minutes[0] + DAY_MINUTES - minutes[minutes.length - 1] < SLOT_GAP_MINUTES
  ) {
    const last = groups.pop()!
    groups[0] = [...last.map((m) => m - DAY_MINUTES), ...groups[0]].sort((a, b) => a - b)
  }

  const slots = groups
    .filter((g) => g.length >= minSessions)
    .map((g) => ({ startMinutes: median(g), label: minutesToLabel(median(g)), count: g.length }))
    // 跨午夜合并出的负数中位数要归一到 0-1439 之后再排序，否则它会排到最前面。
    .sort((a, b) => (((a.startMinutes % DAY_MINUTES) + DAY_MINUTES) % DAY_MINUTES)
      - (((b.startMinutes % DAY_MINUTES) + DAY_MINUTES) % DAY_MINUTES))

  return { slots, sessions: withMinutes.length, latestStartedAt }
}
