import type { ReactNode } from 'react'

/**
 * 发丝线网格：`gap-px` + 底色 = 分隔线，每个格子自己填底色。设计稿全站用的
 * 就是这一招 —— 不给每张卡描边，缝隙本身就是线。
 *
 * 降列规则集中在这里（spec §9）：桌面照设计稿，平板降到 2–3 栏，手机单栏或
 * 2 栏。`gap-px` 的手法在任意列数下天然成立，降列不需要额外处理。
 */
// 降列时列数必须能整除项目数，否则空出来的格子会露出容器底色（发丝线的
// 18% 白），在黑底上就是一块灰方块。3 栏的两处用例都正好 3 项，所以直接
// 1 → 3，不走 2 栏中间态；4 栏 4 项、6 栏 12 项都能被 2/3 整除。
const COLS: Record<number, string> = {
  2: 'lg:grid-cols-2',
  3: 'sm:grid-cols-3',
  4: 'sm:grid-cols-2 lg:grid-cols-4',
  6: 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-6',
}

export default function HairlineGrid({
  cols,
  children,
  className = '',
}: {
  cols: 2 | 3 | 4 | 6
  children: ReactNode
  className?: string
}) {
  return (
    <div className={`grid gap-px border border-site-line bg-site-line ${COLS[cols]} ${className}`}>
      {children}
    </div>
  )
}

/** 网格格子。tone 决定底色：canvas 是常规区块，panel 是分层区块内部。 */
export function GridCell({
  children,
  tone = 'canvas',
  hover = false,
  className = '',
}: {
  children: ReactNode
  tone?: 'canvas' | 'panel'
  hover?: boolean
  className?: string
}) {
  const bg = tone === 'canvas' ? 'bg-site-canvas' : 'bg-site-panel'
  const hoverCls = hover
    ? tone === 'canvas'
      ? 'transition-colors hover:bg-site-panel'
      : 'transition-colors hover:bg-site-canvas'
    : ''
  return <div className={`${bg} ${hoverCls} ${className}`}>{children}</div>
}
