// src/lib/org/dragZones.ts — 四象限拖拽的几何判定：键盘跳区、触控原地松手、跟手卡片对准指针。
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

export interface Point {
  x: number
  y: number
}

/**
 * 起拖事件里指针的视口坐标：鼠标取 clientX/Y，触控取第一根手指；键盘事件没有坐标，返回 null。
 * 按字段判断而不是 instanceof：桌面 Safari 没有 TouchEvent 构造器。
 */
export function pointerOf(event: unknown): Point | null {
  if (!event || typeof event !== 'object') return null
  const e = event as {
    touches?: ArrayLike<{ clientX: number; clientY: number }>
    changedTouches?: ArrayLike<{ clientX: number; clientY: number }>
    clientX?: unknown
    clientY?: unknown
  }
  const touch = e.touches?.[0] ?? e.changedTouches?.[0]
  if (touch) return { x: touch.clientX, y: touch.clientY }
  if (typeof e.clientX === 'number' && typeof e.clientY === 'number') return { x: e.clientX, y: e.clientY }
  return null
}

/**
 * 把跟手覆盖层的中心对齐到指针（思路同 @dnd-kit/modifiers 的 snapCenterToCursor）。
 * 覆盖层起拖时摆在来源行的矩形 rect 上，之后随 transform 平移；pointer 是起拖那一刻的指针坐标，
 * 补上「指针相对矩形中心」的偏移，覆盖层中心就始终落在指针上。没有指针（键盘拖）时原样返回。
 */
export function centerOnPointer<T extends Point>(
  transform: T,
  pointer: Point | null,
  rect: { left: number; top: number; width: number; height: number } | null,
): T {
  if (!pointer || !rect) return transform
  return {
    ...transform,
    x: transform.x + pointer.x - (rect.left + rect.width / 2),
    y: transform.y + pointer.y - (rect.top + rect.height / 2),
  }
}
