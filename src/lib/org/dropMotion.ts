// src/lib/org/dropMotion.ts — 四象限拖放的落地动效：放下时跟手卡片怎么收场、落地高亮多久、手机列表里被拖走的卡片怎么离开。
//
// 乐观更新让事项在放下的同一帧就出现在新格里；dnd-kit 默认的放下动画会把跟手卡片飞回「被拖元素」的位置，
// 写入成功时看起来像飞回原处再闪现到新格。所以写入了就原地淡出、由新格里的卡片高亮接上；没写入才飞回原位。
// 相对路径 + .ts 后缀：node --test 不认 tsconfig 的 @/ 别名。

/** 落地高亮（底色 + 描边淡出）的时长，与 globals.css 的 org-landed 动画一致。 */
export const LANDED_MS = 900
/** 手机列表层被拖走的卡片收起并淡出的时长，与 globals.css 的 org-leave 动画一致。 */
export const LEAVE_MS = 220
/** 写入成功时跟手卡片原地淡出的时长。 */
export const SETTLE_MS = 160

/** commit = 已写入（含询问框确认前不算）；ask = 弹询问框、事项暂留原格；cancel = 没放进任何区 / 原地 / 取消。 */
export type DropOutcome = 'commit' | 'ask' | 'cancel'

/** planDrop 的结果 → 收场分类；没放进任何区（plan 为 null）算取消。 */
export function dropOutcomeOf(planKind: 'patch' | 'askDate' | 'noop' | null): DropOutcome {
  return planKind === 'patch' ? 'commit' : planKind === 'askDate' ? 'ask' : 'cancel'
}

/** settle = 原地淡出；back = 飞回原位（dnd-kit 默认）；none = 直接消失。 */
export type DropAnimationKind = 'settle' | 'back' | 'none'

/** 放下时跟手卡片的收场。减少动效偏好下一律直接消失（不位移，落地高亮照常）。 */
export function dropAnimationKind(outcome: DropOutcome, reducedMotion: boolean): DropAnimationKind {
  if (reducedMotion) return 'none'
  return outcome === 'commit' ? 'settle' : 'back'
}

export interface OverlayTransform {
  x: number
  y: number
  scaleX: number
  scaleY: number
}

const transformCss = (t: OverlayTransform) => `translate3d(${t.x}px, ${t.y}px, 0) scaleX(${t.scaleX}) scaleY(${t.scaleY})`

/** 原地淡出的关键帧：停在放下的位置，略缩一点并淡出（写法与 dnd-kit 的 CSS.Transform 一致）。 */
export function settleKeyframes(initial: OverlayTransform): { transform: string; opacity: number }[] {
  return [
    { transform: transformCss(initial), opacity: 1 },
    { transform: transformCss({ ...initial, scaleX: initial.scaleX * 0.96, scaleY: initial.scaleY * 0.96 }), opacity: 0 },
  ]
}

/**
 * 手机列表层：把刚被拖走的卡片按原位置插回去，标成 leaving，播完收起动画再由调用方移除。
 * 列表里已经有它（例如马上撤销、它又回来了）就不再插，免得出现两张。
 */
export function withLeaving<T extends { id: string }>(
  list: T[],
  leaving: { row: T; index: number } | null,
): { row: T; leaving: boolean }[] {
  const out = list.map((row) => ({ row, leaving: false }))
  if (!leaving || list.some((r) => r.id === leaving.row.id)) return out
  const at = Math.max(0, Math.min(leaving.index, out.length))
  out.splice(at, 0, { row: leaving.row, leaving: true })
  return out
}
