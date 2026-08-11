import type { ReactNode } from 'react'
import { Link } from '@/i18n/navigation'
import { CornerMarks } from './BlueprintFrame'

type Variant = 'hot' | 'ghost' | 'ink'
type Size = 'sm' | 'md' | 'lg' | 'xl'

/**
 * 设计稿里按钮就是套了 `.blueprint` 的盒子，所以三个变体都带 1px 描边：
 * 默认 divider（前景 22%），ghost 提到 40%，红条上的反向按钮压成纯黑。
 */
const VARIANT: Record<Variant, string> = {
  // 主 CTA：TikTok 红实底
  hot: 'border border-site-fg/22 bg-site-hot text-site-on-hot hover:bg-site-hot-hover',
  // 次要：仅描边，hover 补一层极浅白底
  ghost: 'border border-site-line-strong hover:bg-site-fg/8',
  // 红色区块之上的反向按钮（黑底）。描边取设计稿写死的黑：深色主题下与底同色，
  // 浅色主题下按钮翻成浅灰、这道黑边才是它与红底之间的界线。
  ink: 'border border-black bg-site-canvas text-site-fg hover:bg-site-panel',
}

const SIZE: Record<Size, string> = {
  sm: 'px-5 py-2.5 text-[15px] tracking-[0.12em]',
  md: 'px-[26px] py-3.5 text-[16px] tracking-[0.14em]',
  lg: 'px-8 py-4 text-[18px] tracking-[0.12em]',
  // 只有首页红条那颗用得上：设计稿把它放得比 lg 明显大一档
  xl: 'px-11 py-5 text-[22px] tracking-[0.14em]',
}

/**
 * 官网按钮。零圆角 + 四角套准记号 + 压缩体大写字距 —— 三个特征缺一个就不像
 * 设计稿了。有 href 渲染成链接，没有就是 button（表单提交用）。
 */
export default function SiteButton({
  children,
  href,
  variant = 'hot',
  size = 'sm',
  weight = 'semibold',
  type,
  disabled,
  onClick,
  className = '',
}: {
  children: ReactNode
  href?: string
  variant?: Variant
  size?: Size
  /** 设计稿里绝大多数按钮是 600，只有 TECHNOLOGY 与红条那两颗画成了常规字重 */
  weight?: 'semibold' | 'normal'
  type?: 'button' | 'submit'
  disabled?: boolean
  onClick?: () => void
  className?: string
}) {
  const cls = `relative inline-block whitespace-nowrap text-center font-condensed ${weight === 'normal' ? 'font-normal' : 'font-semibold'} transition-colors ${VARIANT[variant]} ${SIZE[size]} ${className}`

  // mailto: / http(s): 不能走 next-intl 的 Link（它会加语言前缀）
  if (href && /^(mailto:|https?:)/.test(href)) {
    return (
      <a href={href} className={cls}>
        {children}
        <CornerMarks />
      </a>
    )
  }

  if (href) {
    return (
      <Link href={href} className={cls}>
        {children}
        <CornerMarks />
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
      <CornerMarks />
    </button>
  )
}
