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
  /** 主页 rehydration JSON 的 user.language。地区的辅助参考，不权威。 */
  language: string | null
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
 * 把开播/截图时刻拆成已播的 { 小时, 分钟 }。两者任一缺失或截图早于开播（异常）返回 null。
 * 只返回数值部件，单位文案交给 i18n 按语言拼（避免 "1:20" 被误读成 1 分 20 秒）。
 * 纯函数，UI 与测试共用。
 */
export function shotUptimeParts(startedAt: string | null, capturedAt: string | null): { h: number; m: number } | null {
  if (!startedAt || !capturedAt) return null
  const sec = Math.floor((new Date(capturedAt).getTime() - new Date(startedAt).getTime()) / 1000)
  if (!Number.isFinite(sec) || sec < 0) return null
  return { h: Math.floor(sec / 3600), m: Math.floor((sec % 3600) / 60) }
}

/**
 * 直播间历史图片的风格总结。本地任务按需生成写入，管理员也可在浮层里手写补充。
 * 一个竞品可以有多条，界面按 generated_on 倒序列出（见 descriptions.ts）。
 */
export interface CompetitorDescription {
  id: string
  competitor_id: string
  body: string
  /**
   * 生成日期 YYYY-MM-DD，由写入方显式给出，不等于入库时间。
   * 补跑历史、回头重跑某个时间段的总结时，靠它落到正确的位置而不是全堆到今天。
   */
  generated_on: string
  /** 'auto' = 本地任务生成，'manual' = 人在界面里手写。决定浮层里那枚来源标签。 */
  source: 'auto' | 'manual'
  created_at: string
}

/** 按 ISO 周聚合的粉丝点（week_start = 周一 YYYY-MM-DD）。 */
export interface WeeklyPoint {
  week_start: string
  followers: number
  /**
   * 该周实际取用的那条快照的采集日（YYYY-MM-DD）。
   * 与 week_start 区分开：后者是归一化出来的周一，只是图上的等距刻度；采集实际
   * 发生在周中某天，提示框要报的是这一个，否则读者无从判断数据新鲜度。
   */
  captured_on: string
}

export interface CompetitorWithHistory extends Competitor {
  latest: CompetitorSnapshot | null
  history: HistoryPoint[]
  shots: CompetitorShot[]
  /** 风格描述，已按生成日期倒序。 */
  descriptions: CompetitorDescription[]
  weekly: WeeklyPoint[]
  /** 下探发现的关联主播（子账号），只在父卡片里下钻展示,不在首页平铺。 */
  related: CompetitorWithHistory[]
}

export interface CompetitorBoard {
  competitors: CompetitorWithHistory[]
  canEdit: boolean
}
