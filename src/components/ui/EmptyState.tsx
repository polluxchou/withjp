import { ReactNode } from 'react'
import { useTranslations } from 'next-intl'

interface Props {
  emoji?: string
  title?: string
  hint?: string
  action?: ReactNode
}

export default function EmptyState({ emoji = '🗂️', title, hint, action }: Props) {
  const t = useTranslations('common')
  // A custom title already carries its own guidance — only fall back to the
  // generic hint when the title is also the generic default.
  const resolvedHint = hint ?? (title === undefined ? t('emptyHint') : undefined)
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
      <div className="text-4xl" aria-hidden="true">{emoji}</div>
      <p className="text-sm font-medium text-zinc-700">{title ?? t('emptyTitle')}</p>
      {resolvedHint && <p className="text-xs text-zinc-400">{resolvedHint}</p>}
      {action}
    </div>
  )
}
