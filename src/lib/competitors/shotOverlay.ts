// src/lib/competitors/shotOverlay.ts
// 主图底部那层渐变里渲染哪几段。
//
// 抽成纯函数而不是写在 JSX 里，是因为这几段的组合决定了「渐变层要不要整个不画」，
// 而条件散在组件里时很容易出现「四段都空、图上却压着一条没人能解释的黑边」。
// 判据集中在这里，配一组测试钉死。
//
// 前身是 shotDock.ts（底部独立条）。改成叠加层之后多了一段胶片条，
// 且胶片条的存在条件是"当天不止一张"而不是任何字段。
import type { CompetitorShot } from './types.ts'

/** 渐变层各段的渲染开关。 */
export interface ShotOverlaySections {
  /** 直播态 chips：在线人数 / 开播时刻 / 已播时长。 */
  live: boolean
  /** 人眼核实截图时写的一句话概括；人工上传的图这个字段是空串。 */
  caption: boolean
  /** 胶片条：当天不止一张时才有，承担"共几张 / 现在第几张 / 跳转"。 */
  strip: boolean
  /** 改日期 + 删除的入口。 */
  edit: boolean
  /** 四段全空 —— 渐变层整个不画，图上只剩左上角那两颗胶囊。 */
  footer: boolean
}

/** 判据只看这几个字段，传整个 shot 也行。 */
type OverlayInput = Pick<CompetitorShot, 'caption' | 'viewer_count' | 'stream_started_at'>

export function shotOverlaySections(
  shot: OverlayInput | null | undefined,
  canEdit: boolean,
  total: number,
): ShotOverlaySections {
  // 渲染期夹逼兜底那一帧可能没有选中项。此时连编辑入口都不给：
  // 编辑区的作用对象就是选中项，没有对象的"删除"按钮点下去什么都不做。
  const has = Boolean(shot)
  // viewer_count 用 != null 而不是真值判断：冷场那一场是 0 人在线，
  // 那是采到的真实读数，吞掉它会让人以为那张图没记录直播态。
  // 已播时长由 stream_started_at 派生，所以它也算这一段的触发条件之一。
  const live = has && (shot!.viewer_count != null || shot!.stream_started_at != null)
  const caption = Boolean(shot?.caption?.trim())
  // 胶片条只跟"当天有几张"有关，跟这张图本身的字段无关 —— 只读 + 人工上传的多张
  // 仍然要留着它，否则画面上没有任何翻页手段。
  const strip = has && total > 1
  const edit = has && canEdit
  return { live, caption, strip, edit, footer: live || caption || strip || edit }
}
