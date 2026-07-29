export type CompetitorPlatform = 'tiktok'

export interface Competitor {
  id: string
  platform: CompetitorPlatform
  handle: string
  profile_url: string
  display_name: string | null
  note: string
  created_at: string
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
}

export interface CompetitorBoard {
  competitors: CompetitorWithHistory[]
  canEdit: boolean
}
