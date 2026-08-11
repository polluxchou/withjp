import type { ReactNode } from 'react'
import { Link } from '@/i18n/navigation'
import { Ticks } from './BlueprintFrame'

type Variant = 'hot' | 'ghost' | 'ink'
type Size = 'sm' | 'md' | 'lg'

const VARIANT: Record<Variant, string> = {
  // 主 CTA：TikTok 红实底
  hot: 'bg-site-hot text-site-on-hot hover:bg-site-hot-hover',
  // 次要：仅描边，hover 补一层极浅白底
  ghost: 'border border-site-line-strong hover:bg-site-fg/8',
  // 红色区块之上的反向按钮（黑底）
  ink: 'bg-site-canvas text-site-fg hover:bg-site-panel',
}

const SIZE: Record<Size, string> = {
  sm: 'px-5 py-2.5 text-[15px] tracking-[0.12em]',
  md: 'px-[26px] py-3.5 text-[16px] tracking-[0.14em]',
  lg: 'px-8 py-4 text-[18px] tracking-[0.12em]',
}

/**
 * 官网按钮。零圆角 + 四角 ticks + 压缩体大写字距 —— 三个特征缺一个就不像
 * 设计稿了。有 href 渲染成链接，没有就是 button（表单提交用）。
 */
export default function SiteButton({
  children,
  href,
  variant = 'hot',
  size = 'sm',
  type,
  disabled,
  onClick,
  className = '',
}: {
  children: ReactNode
  href?: string
  variant?: Variant
  size?: Size
  type?: 'button' | 'submit'
  disabled?: boolean
  onClick?: () => void
  className?: string
}) {
  const cls = `relative inline-block whitespace-nowrap text-center font-condensed font-semibold transition-colors ${VARIANT[variant]} ${SIZE[size]} ${className}`

  // mailto: / http(s): 不能走 next-intl 的 Link（它会加语言前缀）
  if (href && /^(mailto:|https?:)/.test(href)) {
    return (
      <a href={href} className={cls}>
        {children}
        <Ticks tone={variant === 'ghost' ? 'strong' : 'soft'} />
      </a>
    )
  }

  if (href) {
    return (
      <Link href={href} className={cls}>
        {children}
        <Ticks tone={variant === 'ghost' ? 'strong' : 'soft'} />
      </Link>
    )
  }

  return (
    <button
      type={type ?? 'button'}
      disabled={disabled}
      onClick={onClick}
      className={`${cls} disabled:cursor-not-allowed disabled:opacity-60`}
    >
      {children}
      <Ticks tone={variant === 'ghost' ? 'strong' : 'soft'} />
    </button>
  )
}
