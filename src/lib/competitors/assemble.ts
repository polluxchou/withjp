import type { Competitor, CompetitorSnapshot, CompetitorBoard, HistoryPoint } from './types.ts'

/** 从 URL / @handle / handle 中抽出不含 @ 的 handle；失败返回 null。 */
export function parseHandleFromUrl(input: string): string | null {
  const s = (input ?? '').trim()
  if (s === '') return null
  const at = s.match(/@([A-Za-z0-9_.]+)/)
  if (at) return at[1]
  const bare = s.match(/^[A-Za-z0-9_.]+$/)
  return bare ? s : null
}

/** 把竞品 + 全部快照组装成看板：每个竞品挑最新快照，历史按 captured_on 升序。 */
export function assembleBoard(
  competitors: Competitor[],
  snapshots: CompetitorSnapshot[],
  canEdit: boolean,
): CompetitorBoard {
  const byCompetitor = new Map<string, CompetitorSnapshot[]>()
  for (const s of snapshots) {
    const arr = byCompetitor.get(s.competitor_id) ?? []
    arr.push(s)
    byCompetitor.set(s.competitor_id, arr)
  }
  return {
    canEdit,
    competitors: competitors.map((c) => {
      const rows = (byCompetitor.get(c.id) ?? [])
        .slice()
        .sort((a, b) => a.captured_on.localeCompare(b.captured_on))
      const history: HistoryPoint[] = rows.map((r) => ({
        captured_on: r.captured_on,
        followers: r.followers,
        likes: r.likes,
        videos: r.videos,
      }))
      const latest = rows.length ? rows[rows.length - 1] : null
      return { ...c, latest, history }
    }),
  }
}
