import { ReactNode } from 'react'

interface Props { icon?: ReactNode; title?: string; actions?: ReactNode; footer?: ReactNode; padding?: 'default' | 'none'; children: ReactNode }

export default function SectionCard({ icon, title, actions, footer, padding = 'default', children }: Props) {
  return (
    <section className="bg-surface border border-line rounded-card shadow-card">
      {(title || actions) && (
        <div className="flex items-center justify-between gap-3 px-5 py-3.5 border-b border-line-soft">
          <h2 className="flex items-center gap-2.5 text-lg font-semibold text-ink-900 tracking-tight min-w-0 truncate">
            {icon && <span aria-hidden className="w-6 h-6 rounded-icon bg-primary-soft text-primary flex items-center justify-center [&>svg]:w-3.5 [&>svg]:h-3.5">{icon}</span>}
            {title}
          </h2>
          {actions && <div className="flex items-center gap-2 flex-none">{actions}</div>}
        </div>
      )}
      <div className={padding === 'default' ? 'p-5' : ''}>{children}</div>
      {footer && <div className="px-5 py-3 border-t border-line-soft text-xs text-ink-400">{footer}</div>}
    </section>
  )
}
