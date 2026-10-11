// src/lib/competitors/assemble.ts
import type {
  BoardShot, Competitor, CompetitorSnapshot, CompetitorShot, CompetitorDescription, CompetitorLiveSession,
  CompetitorBoard, CompetitorWithHistory, HistoryPoint,
} from './types.ts'
import { sortDescriptions } from './descriptions.ts'
import { compareShotsForBoard } from './shotGrid.ts'
import { buildShotIndex } from './shotWindow.ts'
import type { ShotIndex } from './shotWindow.ts'
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

/**
 * 截图的全量索引 + 已加载范围（字段含义见 CompetitorBoard 的注释）。
 * getCompetitorBoard 用瘦查询单独算好传进来；不传时视为「传进来的 shots 就是全部截图」。
 */
export type ShotMeta = ShotIndex & { shotsLoadedFrom: string | null }

/** 把竞品 + 快照 + 截图 + 风格描述 + 开播记录组装成看板；下探发现的子账号（parent_id）挂到父的 related,首页只列顶层。 */
export function assembleBoard<S extends BoardShot = CompetitorShot>(
  competitors: Competitor[],
  snapshots: CompetitorSnapshot[],
  shots: S[],
  canEdit: boolean,
  descriptions: CompetitorDescription[] = [],
  liveSessions: CompetitorLiveSession[] = [],
  meta?: ShotMeta,
): CompetitorBoard<S> {
  const shotMeta: ShotMeta = meta ?? { ...buildShotIndex(shots), shotsLoadedFrom: null }
  const snapsBy = new Map<string, CompetitorSnapshot[]>()
  for (const s of snapshots) {
    const arr = snapsBy.get(s.competitor_id) ?? []
    arr.push(s)
    snapsBy.set(s.competitor_id, arr)
  }
  const shotsBy = new Map<string, S[]>()
  for (const s of shots) {
    const arr = shotsBy.get(s.competitor_id) ?? []
    arr.push(s)
    shotsBy.set(s.competitor_id, arr)
  }
  const descsBy = new Map<string, CompetitorDescription[]>()
  for (const d of descriptions) {
    const arr = descsBy.get(d.competitor_id) ?? []
    arr.push(d)
    descsBy.set(d.competitor_id, arr)
  }
  const liveBy = new Map<string, CompetitorLiveSession[]>()
  for (const s of liveSessions) {
    const arr = liveBy.get(s.competitor_id) ?? []
    arr.push(s)
    liveBy.set(s.competitor_id, arr)
  }

  const build = (c: Competitor): CompetitorWithHistory<S> => {
    const rows = (snapsBy.get(c.id) ?? [])
      .slice()
      .sort((a, b) => a.captured_on.localeCompare(b.captured_on))
    const history: HistoryPoint[] = rows.map((r) => ({
      captured_on: r.captured_on, followers: r.followers, likes: r.likes, videos: r.videos,
    }))
    const latest = rows.length ? rows[rows.length - 1] : null
    const weekly = bucketFollowersByWeek(rows.map((r) => ({ captured_on: r.captured_on, followers: r.followers })))
    const shotRows = (shotsBy.get(c.id) ?? []).slice().sort(compareShotsForBoard)
    return {
      ...c, latest, history, weekly, shots: shotRows, related: [],
      sessionShots: shotMeta.sessionShotsBy.get(c.id) ?? [],
      descriptions: sortDescriptions(descsBy.get(c.id) ?? []),
      // 按时刻比而不是按字符串比：timestamptz 读回来的写法（+00:00 / 带不带毫秒）不保证定长。
      live_sessions: (liveBy.get(c.id) ?? []).slice()
        .sort((a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime()),
    }
  }

  const built = new Map<string, CompetitorWithHistory<S>>()
  for (const c of competitors) built.set(c.id, build(c))

  const topLevel: CompetitorWithHistory<S>[] = []
  for (const c of competitors) {
    const node = built.get(c.id)!
    const parent = c.parent_id ? built.get(c.parent_id) : undefined
    if (parent) parent.related.push(node) // 子账号挂到父的 related
    else topLevel.push(node)               // parent_id 为空或悬空 → 顶层
  }

  return { canEdit, competitors: topLevel, shotAxis: shotMeta.shotAxis, shotsLoadedFrom: shotMeta.shotsLoadedFrom }
}
