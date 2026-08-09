import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { Loader2 } from 'lucide-react'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  size?: 'sm' | 'md' | 'lg'
  loading?: boolean
  children: ReactNode
}

// danger 用 danger-strong（对比度 4.83:1）而不是 danger-dot（对比度仅
// 3.77:1）：白字大面积填充按钮需过 WCAG AA 4.5:1，dot 只该用于状态点等小
// 面积场景，两个 token 的具体色值见 globals.css --danger-strong 注释。
const VARIANTS = {
  primary:   'bg-primary-gradient text-white shadow-[0_2px_6px_rgba(124,58,237,0.35),inset_0_1px_0_rgba(255,255,255,0.2)] hover:opacity-95',
  secondary: 'bg-primary-soft hover:bg-primary-soft-hover text-primary-hover',
  ghost:     'bg-transparent hover:bg-line-soft text-ink-700',
  danger:    'bg-danger-strong hover:opacity-90 text-white',
}
const SIZES = { sm: 'h-7 px-3 text-xs', md: 'h-8 px-4 text-sm', lg: 'h-[38px] px-5 text-sm' }

export default function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  children,
  disabled,
  className = '',
  ...props
}: ButtonProps) {
  return (
    <button
      disabled={disabled || loading}
      className={`inline-flex items-center gap-1.5 rounded-btn font-medium transition-[color,background-color,opacity]
        focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-ring focus-visible:ring-offset-1
        disabled:opacity-50 disabled:cursor-not-allowed
        ${VARIANTS[variant]} ${SIZES[size]} ${className}`}
      {...props}
    >
      {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
      {children}
    </button>
  )
}
