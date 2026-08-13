import type { ReactNode } from 'react'

/**
 * 区块容器：1360 内容宽 + 32px 左右留白 + 区块间的发丝线分隔。
 * 设计稿里这套尺度出现在每一个区块上，抽出来省掉二十来处重复，也保证
 * 以后调内容宽只用改一处。
 */
export default function SiteSection({
  children,
  tone = 'canvas',
  divider = true,
  className = '',
}: {
  children: ReactNode
  /** panel 是分层区块（设计稿里纵向 padding 更大一档） */
  tone?: 'canvas' | 'panel'
  /** 底部发丝线。区块之间靠线分隔而不是留白 */
  divider?: boolean
  className?: string
}) {
  const outer = [
    tone === 'panel' ? 'bg-site-panel' : '',
    divider ? 'border-b border-site-line' : '',
  ]
    .filter(Boolean)
    .join(' ')
  const pad = tone === 'panel' ? 'py-16 lg:py-20' : 'py-14 lg:py-[72px]'

  return (
    <section className={outer}>
      <div className={`mx-auto max-w-[1360px] px-6 md:px-8 ${pad} ${className}`}>{children}</div>
    </section>
  )
}
