// 截图放大页「同期在播」的判定：把一张截图关联的读数行变成排好序、算好名次的名单。
// 纯函数、不读时钟、不碰 DOM。设计稿：docs/superpowers/specs/2026-10-12-shot-colive-readings-design.md
//
// 口径（已定，改之前先改设计稿）：
// - 横向比较只用 source='sidebar'（Following 侧栏同一秒横截面）。
// - 本号若也在 Following 里就用它的 sidebar 行；没有才退回 current 行（房间内读数）并标 selfFromCurrent。
//   别家的 current 行一律不看——那是别人截别的房间时的口径。
// - 竞赛名次：并列同名次，下一名次跳过。解析失败（viewerCount 为 null）排末尾、不计名次。
// - 同人数（或同为解析失败）的行按界面显示的 label（displayName，空则 handle）localeCompare 定序，名次不受影响。
// - 名单为空或只有本号一行返回 null：没有可比对象，不画名单。
// - 但侧栏确实读到了、只是在库账号里只有本号在播（coLiveSeenAlone），放大页要说一句
//   「同时段未见其他在播直播间」，免得被当成没采到。没有任何 sidebar 行时分不清是侧栏没读到
//   还是真没人播（老图、自动巡检、侧栏只剩推荐区都长这样），照旧整段不画。

export interface CoLiveReading {
  competitorId: string
  handle: string
  displayName: string | null
  source: 'current' | 'sidebar'
  viewerCount: number | null
  viewerText: string | null
}

export interface CoLiveRow {
  competitorId: string
  /** displayName，空则 handle。 */
  label: string
  viewerCount: number | null
  /** 页面原文（如 1.2K）；viewerCount 为 null 时界面显示它。 */
  viewerText: string | null
  /** 竞赛名次；解析失败为 null。 */
  rank: number | null
  isSelf: boolean
  /** viewerCount / 本批最大值，0..1；解析失败或最大值为 0 时为 0。 */
  barRatio: number
}

export interface CoLiveView {
  /** 已排序：人数降序，解析失败的在末尾。 */
  rows: CoLiveRow[]
  /** 名单行数（含本号）。 */
  total: number
  /** 本号名次；本号没有可用读数或解析失败时为 null。 */
  selfRank: number | null
  /** 本号的数来自 current 行（本号不在 Following 里）。 */
  selfFromCurrent: boolean
}

export function buildCoLiveView(readings: CoLiveReading[], selfCompetitorId: string): CoLiveView | null {
  const sidebar = readings.filter((x) => x.source === 'sidebar')
  let selfFromCurrent = false
  let pool = sidebar
  if (!sidebar.some((x) => x.competitorId === selfCompetitorId)) {
    const current = readings.find((x) => x.source === 'current' && x.competitorId === selfCompetitorId)
    if (current) {
      pool = [...sidebar, current]
      selfFromCurrent = true
    }
  }
  if (pool.length < 2) return null

  // 同人数（或同为解析失败）时按界面 label 定序，与输入顺序无关；名次不受影响。
  const labelOf = (x: CoLiveReading) => (x.displayName?.trim() ? x.displayName : x.handle)
  const byLabel = (p: CoLiveReading, q: CoLiveReading) => labelOf(p).localeCompare(labelOf(q))
  const sorted = [...pool].sort((p, q) => {
    if (p.viewerCount == null && q.viewerCount == null) return byLabel(p, q)
    if (p.viewerCount == null) return 1
    if (q.viewerCount == null) return -1
    return q.viewerCount - p.viewerCount || byLabel(p, q)
  })
  const counts = sorted.map((x) => x.viewerCount).filter((n): n is number => n != null)
  const max = counts.length ? Math.max(...counts) : 0

  const rows: CoLiveRow[] = []
  let rank = 0
  let prev: number | null = null
  sorted.forEach((x, i) => {
    let myRank: number | null = null
    if (x.viewerCount != null) {
      // 竞赛名次：与前一行同值就沿用前一行的名次，否则名次 = 当前位置（从 1 起）
      if (prev === null || x.viewerCount !== prev) rank = i + 1
      prev = x.viewerCount
      myRank = rank
    }
    rows.push({
      competitorId: x.competitorId,
      label: labelOf(x),
      viewerCount: x.viewerCount,
      viewerText: x.viewerText,
      rank: myRank,
      isSelf: x.competitorId === selfCompetitorId,
      barRatio: x.viewerCount != null && max > 0 ? x.viewerCount / max : 0,
    })
  })
  const self = rows.find((x) => x.isSelf)
  return { rows, total: rows.length, selfRank: self?.rank ?? null, selfFromCurrent }
}

/** 侧栏读到了本号、却没有任何别家在播：同期名单为空不是因为没采到。 */
export function coLiveSeenAlone(readings: CoLiveReading[], selfCompetitorId: string): boolean {
  const sidebar = readings.filter((x) => x.source === 'sidebar')
  return sidebar.length > 0 && sidebar.every((x) => x.competitorId === selfCompetitorId)
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

/** 路由参数里的 shotId：是 uuid 就小写返回，否则 null（400，不打到数据库）。 */
export function parseShotId(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const s = raw.trim().toLowerCase()
  return UUID_RE.test(s) ? s : null
}
