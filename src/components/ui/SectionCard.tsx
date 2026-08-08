import type { ReactNode } from 'react'
import type { Accent } from '@/lib/ui/accent'
import { ACCENT_CHIP } from '@/lib/ui/accent'

interface SectionCardProps {
  icon?: ReactNode
  title?: string
  actions?: ReactNode
  footer?: ReactNode
  padding?: 'default' | 'none'
  // 卡头图标 chip 底色，取自 §1.4 六色板，默认 violet。
  accent?: Accent
  children: ReactNode
}

export default function SectionCard({ icon, title, actions, footer, padding = 'default', accent = 'violet', children }: SectionCardProps) {
  return (
    <section className="bg-surface border border-line rounded-card shadow-card">
      {(title || actions || icon) && (
        <div className="flex items-center justify-between gap-3 px-5 py-3.5 border-b border-line-soft">
          {title ? (
            <h2 className="flex items-center gap-2.5 text-lg font-semibold text-ink-900 tracking-section min-w-0">
              {icon && <span aria-hidden className={`flex-none w-6 h-6 rounded-icon flex items-center justify-center [&>svg]:w-[13px] [&>svg]:h-[13px] ${ACCENT_CHIP[accent]}`}>{icon}</span>}
              <span className="truncate">{title}</span>
            </h2>
          ) : icon ? (
            <div className="flex items-center gap-2.5 min-w-0">
              <span aria-hidden className={`flex-none w-6 h-6 rounded-icon flex items-center justify-center [&>svg]:w-[13px] [&>svg]:h-[13px] ${ACCENT_CHIP[accent]}`}>{icon}</span>
            </div>
          ) : (
            <div />
          )}
          {actions && <div className="flex items-center gap-2 flex-none">{actions}</div>}
        </div>
      )}
      <div className={padding === 'default' ? 'p-5' : ''}>{children}</div>
      {footer && <div className="px-5 py-3 border-t border-line-soft text-xs text-ink-400">{footer}</div>}
    </section>
  )
}
