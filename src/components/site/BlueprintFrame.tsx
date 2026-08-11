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
