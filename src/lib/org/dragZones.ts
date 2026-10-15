// src/lib/org/dragZones.ts — 四象限拖拽的键盘跳区：按方向在可放区之间跳转。
//
// dnd-kit 默认键盘每次只移 25px，跨不过大格子（spec 3.5），所以自己按方向挑下一个区。
// 相对路径 + .ts 后缀：node --test 不认 tsconfig 的 @/ 别名。

export interface ZoneRect {
  id: string
  left: number
  top: number
  width: number
  height: number
}

export type Direction = 'up' | 'down' | 'left' | 'right'

/**
 * 从当前点出发，按方向选最近的可放区；没有就返回 null（停在原地）。
 * 只看中心点严格落在该方向半平面内的区；得分 = 主轴距离 + 2 × 副轴距离，取最小。
 * 零尺寸的区（被响应式 CSS 隐藏的桌面区或手机放置区）不参与。
 */
export function nextZone(zones: ZoneRect[], from: { x: number; y: number }, dir: Direction): ZoneRect | null {
  let best: ZoneRect | null = null
  let bestScore = Infinity
  for (const z of zones) {
    if (z.width <= 0 || z.height <= 0) continue
    const dx = z.left + z.width / 2 - from.x
    const dy = z.top + z.height / 2 - from.y
    const main = dir === 'right' ? dx : dir === 'left' ? -dx : dir === 'down' ? dy : -dy
    const cross = dir === 'right' || dir === 'left' ? Math.abs(dy) : Math.abs(dx)
    if (main <= 0) continue
    const score = main + 2 * cross
    if (score < bestScore) {
      bestScore = score
      best = z
    }
  }
  return best
}

/** 触控长按后手指几乎没动就松开：视为取消（放置区可能恰好出现在手指下方，原地松手不能算放下）。 */
export const STATIONARY_TOUCH_PX = 10

export function isStationaryTouchDrop(isTouch: boolean, delta: { x: number; y: number }): boolean {
  return isTouch && Math.hypot(delta.x, delta.y) < STATIONARY_TOUCH_PX
}
