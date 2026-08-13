import type { ReactNode } from 'react'
import { useTranslations } from 'next-intl'
import { Inbox } from 'lucide-react'

interface EmptyStateProps {
  icon?: ReactNode
  title?: string
  hint?: string
  action?: ReactNode
}

export default function EmptyState({ icon, title, hint, action }: EmptyStateProps) {
  const t = useTranslations('common')
  // A custom title already carries its own guidance — only fall back to the
  // generic hint when the title is also the generic default.
  const resolvedHint = hint ?? (title === undefined ? t('emptyHint') : undefined)
  return (
    <div className="flex flex-col items-center justify-center gap-2.5 py-12 text-center">
      <div aria-hidden className="w-11 h-11 rounded-full bg-primary-soft text-primary flex items-center justify-center [&>svg]:w-[15px] [&>svg]:h-[15px]">
        {icon ?? <Inbox strokeWidth={1.5} />}
      </div>
      <p className="text-sm font-medium text-ink-700">{title ?? t('emptyTitle')}</p>
      {resolvedHint && <p className="text-xs text-ink-400 max-w-64">{resolvedHint}</p>}
      {action && <div className="mt-1">{action}</div>}
    </div>
  )
}
