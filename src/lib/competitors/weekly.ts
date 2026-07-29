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
  for (const [week_start, rows] of byWeek) {
    rows.sort((a, b) => a.captured_on.localeCompare(b.captured_on))
    const last = rows[rows.length - 1]
    if (last.followers == null) continue
    points.push({ week_start, followers: last.followers })
  }
  points.sort((a, b) => a.week_start.localeCompare(b.week_start))
  return points
}
