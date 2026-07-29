// src/lib/competitors/assemble.ts
import type { Competitor, CompetitorSnapshot, CompetitorShot, CompetitorBoard, HistoryPoint } from './types.ts'
import { bucketFollowersByWeek } from './weekly.ts'

/** 从 URL / @handle / handle 中抽出不含 @ 的 handle；失败返回 null。 */
export function parseHandleFromUrl(input: string): string | null {
  const s = (input ?? '').trim()
  if (s === '') return null
  const at = s.match(/@([A-Za-z0-9_.]+)/)
  if (at) return at[1]
  const bare = s.match(/^[A-Za-z0-9_.]+$/)
  return bare ? s : null
}

/** 把竞品 + 快照 + 截图组装成看板。 */
export function assembleBoard(
  competitors: Competitor[],
  snapshots: CompetitorSnapshot[],
  shots: CompetitorShot[],
  canEdit: boolean,
): CompetitorBoard {
  const snapsBy = new Map<string, CompetitorSnapshot[]>()
  for (const s of snapshots) {
    const arr = snapsBy.get(s.competitor_id) ?? []
    arr.push(s)
    snapsBy.set(s.competitor_id, arr)
  }
  const shotsBy = new Map<string, CompetitorShot[]>()
  for (const s of shots) {
    const arr = shotsBy.get(s.competitor_id) ?? []
    arr.push(s)
    shotsBy.set(s.competitor_id, arr)
  }

  return {
    canEdit,
    competitors: competitors.map((c) => {
      const rows = (snapsBy.get(c.id) ?? [])
        .slice()
        .sort((a, b) => a.captured_on.localeCompare(b.captured_on))
      const history: HistoryPoint[] = rows.map((r) => ({
        captured_on: r.captured_on, followers: r.followers, likes: r.likes, videos: r.videos,
      }))
      const latest = rows.length ? rows[rows.length - 1] : null
      const weekly = bucketFollowersByWeek(rows.map((r) => ({ captured_on: r.captured_on, followers: r.followers })))
      const shotRows = (shotsBy.get(c.id) ?? []).slice().sort((a, b) => {
        if (a.shot_on == null && b.shot_on == null) return a.sort_order - b.sort_order
        if (a.shot_on == null) return 1
        if (b.shot_on == null) return -1
        const cmp = b.shot_on.localeCompare(a.shot_on)
        return cmp !== 0 ? cmp : a.sort_order - b.sort_order
      })
      return { ...c, latest, history, weekly, shots: shotRows }
    }),
  }
}
