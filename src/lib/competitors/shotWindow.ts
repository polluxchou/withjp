// src/lib/competitors/shotWindow.ts
// 纯函数：竞品相册「按日期窗口加载」的全部判据——全量索引、加载起点、补取时机、合并。
// 零 IO、零时钟，可单测。设计见
// docs/superpowers/specs/2026-10-10-competitor-shot-album-windowing-design.md
import { UNDATED_KEY } from './shotGrid.ts'
import type { CompetitorShot } from './types.ts'

/** 全量瘦查询的一行：只要归属、日期、开播时刻三列。 */
export type ShotIndexRow = Pick<CompetitorShot, 'competitor_id' | 'shot_on' | 'stream_started_at'>

export interface ShotIndex {
  /** 完整日期轴：有图日期升序去重；存在无日期截图时末尾追加 UNDATED_KEY。 */
  shotAxis: string[]
  /** 账号 id → 全部历史里去重后的开播时刻（升序）。从没采到开播时刻的账号不在里面。 */
  sessionStartsBy: Map<string, string[]>
}

export function buildShotIndex(rows: ShotIndexRow[]): ShotIndex {
  const dated = new Set<string>()
  let hasUndated = false
  const starts = new Map<string, Set<string>>()
  for (const r of rows ?? []) {
    if (r.shot_on) dated.add(r.shot_on)
    else hasUndated = true
    if (r.stream_started_at) {
      // 同一场直播的多张截图报同一个开播时刻；身份是 (账号, 时刻)，跨账号不去重。
      const set = starts.get(r.competitor_id) ?? new Set<string>()
      set.add(r.stream_started_at)
      starts.set(r.competitor_id, set)
    }
  }
  // Array.from 而非展开：避免 Set 展开在当前 tsconfig 下触发 TS2802
  const shotAxis = Array.from(dated).sort((a, b) => a.localeCompare(b))
  if (hasUndated) shotAxis.push(UNDATED_KEY)
  const sessionStartsBy = new Map<string, string[]>()
  starts.forEach((set, id) => {
    sessionStartsBy.set(id, Array.from(set).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)))
  })
  return { shotAxis, sessionStartsBy }
}
