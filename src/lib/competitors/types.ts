import type { LiveSessionPack } from './liveSessionPack.ts'

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
  // 两位地区代码（见 regions.ts）；null = 还没登记，脚本建档的号会是这样，页面提示补。
  region: string | null
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
  /** 上传者；自动巡检写的为 null。受限帐号只能删自己上传的（见 access-scope.ts）。 */
  created_by?: string | null
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

/**
 * 一场开播记录，来自 TikTok 主页 LIVE History 的粘贴导入（解析见 liveHistory.ts）。
 * 与截图上的 stream_started_at 不同：那只覆盖截到的寥寥几场，这里是对方列表里的每一场。
 */
export interface CompetitorLiveSession {
  id: string
  competitor_id: string
  /** 开播时刻（ISO，UTC）。与 competitor_id 一起是去重键，重复粘贴按它覆盖。 */
  started_at: string
  /** 下播时刻（ISO，UTC）。跨午夜的已在解析时算到次日，恒 ≥ started_at。 */
  ended_at: string
  title: string
  /** 原文是 106.7K 这类缩写，换算后的近似值；原文缺失为 null。 */
  likes: number | null
  source: 'tiktok_history'
  created_at: string
  updated_at: string
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

/**
 * 截图推断的一场直播（每场一行，由 shotWindow.ts 的 buildShotIndex 从全量截图聚合）。
 * 形状就是 liveSpansOf 的 shots 入参：同一场的多张截图报同一个开播时刻，下播取最晚那张的截图时刻。
 */
export type SessionShot = {
  /** 本场开播时刻：该组第一张截图的原始写法。 */
  stream_started_at: string
  /** 该场最晚的截图时刻（toISOString 写法）；截图时刻缺失或读不出的那几张按开播时刻算。 */
  captured_at: string | null
}

export interface CompetitorWithHistory<S = CompetitorShot> extends Competitor {
  latest: CompetitorSnapshot | null
  history: HistoryPoint[]
  /**
   * **已加载范围内**的截图（见 CompetitorBoard.shotsLoadedFrom），不一定是全部历史。
   * 要全量口径的统计别用它：场次用 sessionShots，日期轴用 board.shotAxis。
   */
  shots: S[]
  /**
   * 截图推断的场次：全部历史、每场一行——开播时刻 + 该场最晚的截图时刻，按开播时刻升序。
   * 与相册加载到哪一天无关。直接喂 liveSpansOf 的 shots 入参（与导入的开播记录合并去重）；
   * 卡片的常见开播与近 30 天、开播记录弹窗、地区标尺、问答都读它——统计数字不能跟着相册翻页变。
   */
  sessionShots: SessionShot[]
  /** 风格描述，已按生成日期倒序。 */
  descriptions: CompetitorDescription[]
  /**
   * 开播记录（LIVE History 导入），列式紧凑格式，已按开播时刻倒序（最新在前）。
   * 读取只经 liveSessionRows(c)（见 liveSessionPack.ts），别直接读里面的数组。
   */
  liveSessionPack: LiveSessionPack
  weekly: WeeklyPoint[]
  /** 下探发现的关联主播（子账号），只在父卡片里下钻展示,不在首页平铺。 */
  related: CompetitorWithHistory<S>[]
}

export interface CompetitorBoard<S = CompetitorShot> {
  competitors: CompetitorWithHistory<S>[]
  canEdit: boolean
  /** 完整日期轴：全部有图日期升序去重；存在无日期截图时末尾追加 UNDATED_KEY。 */
  shotAxis: string[]
  /**
   * 已加载 = 所有 shot_on >= shotsLoadedFrom 的截图 + 全部无日期截图；null = 全部已加载。
   * 已加载范围总包含最新一天（统计条的「最近采集日」依赖这一点，见 summary.ts）。
   */
  shotsLoadedFrom: string | null
}

/** 看板装配对截图只依赖这几列：归属、排序、日期轴，以及聚合场次用的开播与截图时刻。 */
export type BoardShot = Pick<CompetitorShot, 'competitor_id' | 'shot_on' | 'sort_order' | 'stream_started_at' | 'captured_at'>

/**
 * 看板与问答查开播记录只查这几列（service.ts 的 LIVE_SESSION_COLUMNS）。
 * id / source / created_at / updated_at 没有消费方读，不查不下发。新读一个字段时两边同时加
 * ——shot-window-wiring.test.ts 钉着两边一致。
 */
export type BoardLiveSession = Pick<CompetitorLiveSession, 'competitor_id' | 'started_at' | 'ended_at' | 'title' | 'likes'>

/**
 * 竞品问答需要的截图列（getAskBoard 只查这几列）。ask-context.ts 新读一个截图字段时，
 * 要同时加到这里和 service.ts 的 ASK_SHOT_COLUMNS，否则那一列在问答里恒为 undefined。
 */
export type AskShot = Pick<
  CompetitorShot,
  'competitor_id' | 'shot_on' | 'sort_order' | 'stream_started_at' | 'viewer_count' | 'captured_at'
>
