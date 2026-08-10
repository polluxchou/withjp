'use client'

import { MessageSquare, CheckCircle2 } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useDiscussionCount } from './DiscussionContext'
import type { SubjectInput } from '@/lib/discussions/types'
import { toneOf, type Tone } from '@/lib/ui/status-tone'
import { FOCUS_RING } from '@/lib/ui/recipes'

interface Props {
  subject:   SubjectInput
  // Opens the discussion panel. Creating a "new" thread when one
  // already exists is handled inside the panel (ThreadView header
  // "+ 新建" or ThreadList footer), not as a row-level affordance.
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
  // 'open'/'resolved' 复用 ThreadStatus 枚举→tone 映射（status-tone.ts §thread
  // 域，design-system.md §1.3「讨论」行）；'empty' 不是持久化状态，只是本组件
  // 自己的第三种展示态（还没有任何讨论串），不进状态枚举映射表。
  let tone:  Tone
  let ariaLabel: string
  if (hasOpen) {
    label = t('open',     { count: openCount })
    ariaLabel = t('ariaOpen', { count: openCount })
    tone  = toneOf('thread', 'open')
  } else if (hasResolved) {
    label = t('resolved',     { count: resolvedCount })
    ariaLabel = t('ariaResolved', { count: resolvedCount })
    Icon  = CheckCircle2
    tone  = toneOf('thread', 'resolved')
  } else {
    label = t('default')
    ariaLabel = t('ariaStart')
    tone  = 'neutral'
  }

  const toneClass =
    tone === 'info'
      ? 'bg-info-soft text-info-text border-info-border'
      : tone === 'success'
      ? 'bg-success-soft text-success-text border-success-border'
      : 'bg-surface text-ink-500 hover:bg-line-soft border-line-strong border-dashed'

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
        'inline-flex items-center rounded-field font-medium border transition-colors',
        FOCUS_RING,
        sizeClass,
        toneClass,
        loading ? 'opacity-60' : '',
      ].filter(Boolean).join(' ')}
    >
      <Icon className={iconClass} strokeWidth={1.5} aria-hidden="true" />
      <span>{label}</span>
    </button>
  )
}
