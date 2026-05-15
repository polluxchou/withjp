'use client'

import { MessageSquare, CheckCircle2 } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useDiscussionCount } from './DiscussionContext'
import type { SubjectInput } from '@/lib/discussions/types'

interface Props {
  subject:   SubjectInput
  onClick?:  () => void
  // Compact variant for dense tables; default fits filter bars.
  compact?:  boolean
}

// Renders one of:
//   [讨论]       — no threads yet (call-to-action to start one)
//   [讨论 N]     — N open threads (resolved count hidden when any open)
//   [已结束 N]   — only resolved threads remain
// Mixed state intentionally favors the open count, so users notice
// active discussions first.
export function DiscussionBadge({ subject, onClick, compact = false }: Props) {
  const t = useTranslations('discussions.badge')
  const { openCount, resolvedCount, loading } = useDiscussionCount(subject)

  const hasOpen     = openCount > 0
  const hasResolved = resolvedCount > 0

  let label: string
  let Icon  = MessageSquare
  let tone:  'open' | 'resolved' | 'empty'
  let ariaLabel: string
  if (hasOpen) {
    label = t('open',     { count: openCount })
    ariaLabel = t('ariaOpen', { count: openCount })
    tone  = 'open'
  } else if (hasResolved) {
    label = t('resolved',     { count: resolvedCount })
    ariaLabel = t('ariaResolved', { count: resolvedCount })
    Icon  = CheckCircle2
    tone  = 'resolved'
  } else {
    label = t('default')
    ariaLabel = t('ariaStart')
    tone  = 'empty'
  }

  const toneClass =
    tone === 'open'
      ? 'bg-blue-50 text-blue-700 hover:bg-blue-100 border-blue-200'
      : tone === 'resolved'
      ? 'bg-slate-50 text-slate-500 hover:bg-slate-100 border-slate-200'
      : 'bg-white text-slate-500 hover:bg-slate-50 border-slate-200 border-dashed'

  const sizeClass = compact
    ? 'px-1.5 py-0.5 text-[11px] gap-1'
    : 'px-2 py-1 text-xs gap-1.5'

  const iconClass = compact ? 'w-3 h-3' : 'w-3.5 h-3.5'

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      className={[
        'inline-flex items-center rounded-md font-medium border transition-colors',
        sizeClass,
        toneClass,
        loading ? 'opacity-60' : '',
      ].filter(Boolean).join(' ')}
    >
      <Icon className={iconClass} aria-hidden="true" />
      <span>{label}</span>
    </button>
  )
}
