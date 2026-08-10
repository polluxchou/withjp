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

// tone → 底色/字色/描边完整映射（六 tone 穷举，参照 Tag.tsx 的 SOFT 映射
// 构造）。用 Record<Tone, string> 而非 2-branch 三元：三元只覆盖了
// info/success 两个分支，其余 4 个 Tone 成员（含 warning/danger/violet）会
// 静默落进兜底的空态样式——将来 thread 域加第三个状态（如 toneOf 返回
// warning）不会报错也不会明显出错，只是悄悄套用了错的配色。穷举后每个
// Tone 都有对应且正确的样式，编译期也不会漏登记（新增 Tone 成员会在别处
// 类型检查失败）。
const TONE_CLASS: Record<Tone, string> = {
  success: 'bg-success-soft text-success-text border-success-border',
  warning: 'bg-warning-soft text-warning-text border-warning-border',
  danger:  'bg-danger-soft text-danger-text border-danger-border',
  info:    'bg-info-soft text-info-text border-info-border',
  violet:  'bg-primary-soft text-primary-hover border-primary-border',
  neutral: 'bg-surface text-ink-500 border-line-strong',
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
  // 'empty' 态额外的虚线+hover 是本组件自己的一次性 CTA 装饰（提示"点我发起
  // 讨论"），不是 neutral tone 本身该有的通用样式，所以不并入 TONE_CLASS，
  // 单独拼在 toneClass 后面。
  let emptyCta = ''
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
    emptyCta = 'border-dashed hover:bg-line-soft'
  }

  const toneClass = `${TONE_CLASS[tone]} ${emptyCta}`.trim()

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
