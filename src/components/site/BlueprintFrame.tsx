import type { ReactNode } from 'react'

/**
 * 蓝图框：1px 描边 + 四角加粗的 L 形短线（corner ticks）。
 * 设计稿里图片位、强调卡、次要按钮都套这个框，是官网除发丝线网格之外的
 * 第二个结构母题。
 */
export default function BlueprintFrame({
  children,
  className = '',
  tone = 'strong',
}: {
  children?: ReactNode
  className?: string
  /** strong = 40% 白描边（图片位/按钮）；soft = 18% 发丝线（卡片） */
  tone?: 'strong' | 'soft'
}) {
  const border = tone === 'strong' ? 'border-site-line-strong' : 'border-site-line'
  return (
    <div className={`relative border ${border} ${className}`}>
      {children}
      <Ticks tone={tone} />
    </div>
  )
}

/**
 * 四角短线。offset -1px 让它盖在描边上，视觉上是「角被加固」而不是
 * 「框里又画了四个小角」。
 */
/** 套准记号的四角定位。十字中心正落在角点上：外偏 6px + 内部第 5px 处画线。 */
const MARK_POS = ['-left-1.5 -top-1.5', '-right-1.5 -top-1.5', '-bottom-1.5 -left-1.5', '-bottom-1.5 -right-1.5']

/**
 * 制版套准记号（registration mark）——设计稿 `.corner` 的原样移植：11px 见方的
 * 细十字，画在框**外面**，中心压在四个角点上。它跟下面的 Ticks 是两种画法，
 * 设计稿全站只有这一种；按钮已经换过来，图片位/卡片的框还在用 Ticks。
 *
 * 注意：记号在盒子外面，套在 overflow-hidden 的容器上会被整个裁掉。
 */
export function CornerMarks() {
  return (
    <>
      {MARK_POS.map((pos) => (
        <span
          key={pos}
          aria-hidden
          className={`pointer-events-none absolute h-[11px] w-[11px] text-site-fg/55 ${pos}`}
        >
          <span className="absolute left-[5px] top-0 h-full w-px bg-current" />
          <span className="absolute left-0 top-[5px] h-px w-full bg-current" />
        </span>
      ))}
    </>
  )
}

export function Ticks({ tone = 'strong' }: { tone?: 'strong' | 'soft' }) {
  const color = tone === 'strong' ? 'border-site-line-strong' : 'border-site-line'
  const base = `pointer-events-none absolute h-2.5 w-2.5 ${color}`
  return (
    <>
      <span aria-hidden className={`${base} -left-px -top-px border-l-2 border-t-2`} />
      <span aria-hidden className={`${base} -right-px -top-px border-r-2 border-t-2`} />
      <span aria-hidden className={`${base} -bottom-px -left-px border-b-2 border-l-2`} />
      <span aria-hidden className={`${base} -bottom-px -right-px border-b-2 border-r-2`} />
    </>
  )
}
