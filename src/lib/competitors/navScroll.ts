// src/lib/competitors/navScroll.ts
// 纯函数：算出让选中芯片居中的横向滚动位置。
//
// 语义刻意与日期轴的 windowOf 对齐（锚点居中、两端夹住）：两条并排吸顶的
// 行为如果不一致，用户点了边缘的账号名会以为列表卡住了——日期轴点边缘会
// 把窗口挪过去，账号行也该挪。居中而不是"只推进最小距离"，是为了两侧都
// 露出邻居，不滚动也能多看到几个号。

export interface CenterArgs {
  /** 芯片左沿相对滚动内容起点的距离（px），即 scrollLeft 为 0 时的左沿。 */
  chipStart: number
  chipWidth: number
  /** 容器可视宽度（clientWidth）。 */
  viewWidth: number
  /** 内容总宽（scrollWidth）。 */
  contentWidth: number
}

/** 返回夹在 [0, contentWidth - viewWidth] 内的目标 scrollLeft。 */
export function centeredScrollLeft({ chipStart, chipWidth, viewWidth, contentWidth }: CenterArgs): number {
  // 内容装得下就没有可滚区间,任何目标都得归零(负的 max 会让夹取反向)。
  const max = Math.max(0, contentWidth - viewWidth)
  if (max === 0) return 0
  const target = chipStart + chipWidth / 2 - viewWidth / 2
  return Math.round(Math.min(Math.max(target, 0), max))
}

/**
 * 居中滑动的时长（毫秒）。取 design-system §4 登记的位移档「200ms ease-out」,
 * 不另立一个数——抽屉/侧栏位移用的就是这一档,账号行居中同属位移家族。
 */
export const RECENTER_MS = 200

/** ease-out cubic:起步快、收尾缓,滑到位时不会"撞停"。 */
export function easeOutCubic(t: number): number {
  const c = Math.min(Math.max(t, 0), 1)
  return 1 - (1 - c) ** 3
}

/**
 * 动画进行到第 elapsed 毫秒时应该落在的 scrollLeft。
 * 抽成纯函数是为了把缓动曲线和夹取行为钉在单测里——rAF 循环本身没法单测。
 */
export function scrollLeftAt(from: number, to: number, elapsed: number, duration: number): number {
  if (duration <= 0) return to
  return Math.round(from + (to - from) * easeOutCubic(elapsed / duration))
}
