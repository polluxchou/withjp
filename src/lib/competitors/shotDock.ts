// src/lib/competitors/shotDock.ts
// 灯箱底部条渲染哪几段。
//
// 抽出来当纯函数而不是写在 JSX 里，是因为「有识别内容 / 无识别内容」这两态
// 决定的不只是显示什么，还决定底板要不要整条消失 —— 而三段各自的条件散在
// 组件里时，很容易出现「三段都空、底板却留了一条 16px 黑边」这种没人能解释
// 的残留。判据集中在这里，配一组测试钉死。
import type { CompetitorShot } from './types.ts'

/** 底板各段的渲染开关。 */
export interface ShotDockSections {
  /** 人眼核实截图时写的一句话概括；人工上传的图这个字段是空串。 */
  caption: boolean
  /** 直播态 chips：在线人数 / 开播时刻 / 已播时长。 */
  meta: boolean
  /** 改日期 + 删除的编辑入口。 */
  edit: boolean
  /** 三段全空 —— 底板整条不渲染（只读 + 人工上传是最干净的一态：只有图）。 */
  any: boolean
}

/** 底板判据只看这几个字段，传整个 shot 也行。 */
type DockInput = Pick<CompetitorShot, 'caption' | 'viewer_count' | 'stream_started_at'>

export function shotDockSections(
  shot: DockInput | null | undefined,
  canEdit: boolean,
): ShotDockSections {
  // 渲染期夹逼兜底那一帧可能没有选中项。此时连编辑入口都不给：
  // 编辑区的作用对象就是选中项，没有对象的"删除"按钮点下去是什么都不做
  const caption = Boolean(shot?.caption?.trim())
  // viewer_count 用 != null 而不是真值判断：冷场那一场是 0 人在线，
  // 那是采到的真实读数，吞掉它会让人以为那张图没记录直播态。
  // 已播时长由 stream_started_at 派生，所以它也算这一段的触发条件之一。
  const meta = Boolean(shot) && (shot!.viewer_count != null || shot!.stream_started_at != null)
  const edit = Boolean(shot) && canEdit
  return { caption, meta, edit, any: caption || meta || edit }
}
