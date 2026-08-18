export type CompetitorPlatform = 'tiktok'

export interface Competitor {
  id: string
  platform: CompetitorPlatform
  handle: string
  profile_url: string
  display_name: string | null
  note: string
  created_at: string
  // 044 父子层级:下探发现的关联主播 parent_id 指向父竞品;首页只列 parent_id 为 null 的主竞品
  parent_id: string | null
  // 043 团级档案字段
  avatar_url: string | null
  region: string
  member_count: number | null
  composition: string | null
  launch_city: string | null
  launched_on: string | null
  mc_note: string | null
  online_note: string | null
  latest_videos: { url: string; title?: string }[] | null
}

export interface CompetitorSnapshot {
  id: string
  competitor_id: string
  captured_on: string // YYYY-MM-DD
  followers: number | null
  likes: number | null
  videos: number | null
  following: number | null
  display_name: string | null
  bio: string | null
  region: string | null
  verified: boolean | null
  raw: Record<string, unknown> | null
  captured_at: string
}

export interface HistoryPoint {
  captured_on: string
  followers: number | null
  likes: number | null
  videos: number | null
}

export interface CompetitorShot {
  id: string
  competitor_id: string
  image_url: string
  shot_on: string | null
  tag: string | null
  caption: string
  sort_order: number
  created_at: string
  /** 截图那一刻直播间在线人数（自动采集才有；人工上传为 null）。 */
  viewer_count: number | null
  /** 本场直播开播时间（ISO）。配合 captured_at 得"截图时已播时长"。 */
  stream_started_at: string | null
  /** 截图捕获时刻（ISO）。用它而非 created_at 算时长，避免入库延迟误差。 */
  captured_at: string | null
}

/**
 * 把开播/截图时刻算成"已播 H:MM"。两者任一缺失或截图早于开播（异常）返回 null。
 * 纯函数，UI 与测试共用。
 */
export function shotUptimeLabel(startedAt: string | null, capturedAt: string | null): string | null {
  if (!startedAt || !capturedAt) return null
  const sec = Math.floor((new Date(capturedAt).getTime() - new Date(startedAt).getTime()) / 1000)
  if (!Number.isFinite(sec) || sec < 0) return null
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  return `${h}:${String(m).padStart(2, '0')}`
}

/** 按 ISO 周聚合的粉丝点（week_start = 周一 YYYY-MM-DD）。 */
export interface WeeklyPoint {
  week_start: string
  followers: number
}

export interface CompetitorWithHistory extends Competitor {
  latest: CompetitorSnapshot | null
  history: HistoryPoint[]
  shots: CompetitorShot[]
  weekly: WeeklyPoint[]
  /** 下探发现的关联主播（子账号），只在父卡片里下钻展示,不在首页平铺。 */
  related: CompetitorWithHistory[]
}

export interface CompetitorBoard {
  competitors: CompetitorWithHistory[]
  canEdit: boolean
}
