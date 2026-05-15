'use client'

import { MessageSquare, CheckCircle2, Plus } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useDiscussionCount } from './DiscussionContext'
import type { SubjectInput } from '@/lib/discussions/types'

interface Props {
  subject:   SubjectInput
  // Primary click target: opens the panel using its default routing
  // (0 thread→compose, 1→thread, ≥2→list).
  onClick?:  () => void
  // Optional secondary action revealed on row hover (or always visible
  // on touch). Wires the caller's "open panel in compose mode" handler.
  // Without it, the only way to create a new discussion on a row that
  // already has one is via the thread-list footer button.
  onCreate?: () => void
  // Compact variant for dense tables; default fits filter bars.
  compact?:  boolean
}

// Renders one of:
//   [讨论]       — no threads yet (call-to-action to start one)
//   [讨论 N]     — N open threads (resolved count hidden when any open)
//   [已结束 N]   — only resolved threads remain
// Mixed state intentionally favors the open count, so users notice
// active discussions first.
export function DiscussionBadge({ subject, onClick, onCreate, compact = false }: Props) {
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

  const chip = (
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

  if (!onCreate) return chip

  // Visibility: hidden by default, revealed when the parent .group element
  // is hovered or focused. Use the table row as the .group container so
  // the "+" follows row hover, not just badge hover.
  return (
    <span className="inline-flex items-center gap-1">
      {chip}
      <button
        type="button"
        onClick={onCreate}
        aria-label={t('createNew')}
        title={t('createNew')}
        className={[
          'inline-flex items-center justify-center rounded-md border border-dashed',
          'border-slate-300 text-slate-500 hover:bg-slate-50 hover:text-slate-700',
          'opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity',
          compact ? 'w-5 h-5' : 'w-6 h-6',
        ].join(' ')}
      >
        <Plus className={iconClass} aria-hidden="true" />
      </button>
    </span>
  )
}
