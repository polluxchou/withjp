// src/lib/competitors/weekly.ts
// 纯函数：把日快照按 ISO 周（周一起）聚合为粉丝点。
import type { WeeklyPoint } from './types.ts'

export interface WeekBucketInput {
  captured_on: string
  followers: number | null
}

/** 把 YYYY-MM-DD 归一化到本周周一（UTC）的 YYYY-MM-DD。 */
export function weekStartOf(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00Z')
  const day = d.getUTCDay() // 0=周日 .. 6=周六
  const diff = day === 0 ? -6 : 1 - day
  d.setUTCDate(d.getUTCDate() + diff)
  return d.toISOString().slice(0, 10)
}

/** 每周取该周最后一次快照的 followers；为空则跳过该周。输出按周升序。 */
export function bucketFollowersByWeek(history: WeekBucketInput[]): WeeklyPoint[] {
  const byWeek = new Map<string, WeekBucketInput[]>()
  for (const h of history) {
    if (!h || !h.captured_on) continue
    const wk = weekStartOf(h.captured_on)
    const arr = byWeek.get(wk) ?? []
    arr.push(h)
    byWeek.set(wk, arr)
  }
  const points: WeeklyPoint[] = []
  for (const [week_start, rows] of Array.from(byWeek.entries())) {
    rows.sort((a, b) => a.captured_on.localeCompare(b.captured_on))
    const last = rows[rows.length - 1]
    if (last.followers == null) continue
    points.push({ week_start, followers: last.followers })
  }
  points.sort((a, b) => a.week_start.localeCompare(b.week_start))
  return points
}

export interface WeekSlot {
  week_start: string
  followers: number | null
}

/** 把某个周一按周偏移，仍走 UTC——与 weekStartOf 同口径，避免本地时区推错一天。 */
function shiftWeeks(weekStart: string, deltaWeeks: number): string {
  const d = new Date(weekStart + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + deltaWeeks * 7)
  return d.toISOString().slice(0, 10)
}

/**
 * 把点集摊到「最近 count 个日历周」的槽位上：以**最新有数据的周**为右端往前数 count 个
 * 连续周，缺采的周 followers 置 null。
 *
 * 为什么不直接 slice(-count)：那取的是「最近 count 个**有数据**的周」，漏采一周后剩下的
 * 点仍会被等距铺满，图上看不出缺口，读者会把跨了两周的一段当成一周的变化。
 *
 * 右端锚在最新数据而非「今天」：这样右端永远是真点：「本周还没采」由页面顶部的待更新
 * 计数器负责提示，不占曲线的位置。
 *
 * 前导空槽裁掉：新建档账号只有 3 周历史时，不该在最左边显示一个幽灵空列。
 */
export function fillWeekSlots(points: WeeklyPoint[], count: number): WeekSlot[] {
  const rows = (Array.isArray(points) ? points : []).filter(
    (p) => p && typeof p.week_start === 'string' && Number.isFinite(p.followers),
  )
  if (rows.length === 0 || !Number.isFinite(count) || count < 1) return []

  const byWeek = new Map<string, number>()
  for (const r of rows) byWeek.set(r.week_start, r.followers)
  // 不依赖调用方保证升序
  const newest = Array.from(byWeek.keys()).sort()[byWeek.size - 1]

  const slots: WeekSlot[] = []
  for (let i = count - 1; i >= 0; i--) {
    const week_start = shiftWeeks(newest, -i)
    slots.push({ week_start, followers: byWeek.get(week_start) ?? null })
  }
  while (slots.length > 0 && slots[0].followers == null) slots.shift()
  return slots
}
