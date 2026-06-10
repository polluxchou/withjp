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
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
      <div className="text-4xl">{emoji}</div>
      <p className="text-sm font-medium text-zinc-700">{title ?? t('emptyTitle')}</p>
      <p className="text-xs text-zinc-400">{hint ?? t('emptyHint')}</p>
      {action}
    </div>
  )
}
