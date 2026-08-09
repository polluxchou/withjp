'use client'

import type { Task } from '@/lib/types'
import { Clock, CheckCircle2, XCircle, Loader2, ChevronRight } from 'lucide-react'
import { Link } from '@/i18n/navigation'
import { useTranslations } from 'next-intl'
import Tag from '@/components/ui/Tag'
import { toneOf, type Tone } from '@/lib/ui/status-tone'

const STATUS_ICON = {
  pending: Clock,
  running: Loader2,
  done:    CheckCircle2,
  failed:  XCircle,
}

// Icon tint keyed off the canonical toneOf('task', …) tone (docs/design-
// system.md §1.3) rather than a bespoke status→color table — mirrors the
// small Tone→className lookup every Tag-adjacent component keeps locally
// (Tag.tsx's own TEXT record, RecordRow.tsx's DOT record), since Tag itself
// has no bare "tinted icon" variant.
const TONE_TEXT: Record<Tone, string> = {
  success: 'text-success-text', warning: 'text-warning-text', danger: 'text-danger-text',
  info:    'text-info-text',    neutral: 'text-muted-text',    violet: 'text-primary-hover',
}

// Still used by tasks/page.tsx and creators/[id]/page.tsx — this file is
// token-ized in place rather than replaced by RecordRow (that migration is
// scoped to the dashboard's "recent tasks" widget only).
interface TaskCardProps {
  task: Task
}

export default function TaskCard({ task }: TaskCardProps) {
  const Icon = STATUS_ICON[task.status]
  const tone = toneOf('task', task.status)
  const t = useTranslations('tasks')

  return (
    <div className="bg-surface border border-line rounded-card shadow-card p-4 flex items-start gap-3 hover:shadow-pop transition-shadow">
      <Icon className={`w-4 h-4 mt-0.5 flex-shrink-0 ${TONE_TEXT[tone]} ${task.status === 'running' ? 'animate-spin' : ''}`} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium text-ink-900 truncate">{task.title}</span>
          {/* Per-role rainbow pill retired — agent identity now renders as a
              plain Tag (rule: 状态展示一律 Tag，禁手写pill), same treatment
              as the dashboard's RecordRow agent tag. */}
          {task.agent?.name && <Tag size="sm" tone="violet" label={task.agent.name} />}
        </div>
        {task.creator && (
          <Link href={`/creators/${task.creator.id}`} className="text-xs text-ink-400 hover:text-primary transition-colors mt-0.5 block">
            {task.creator.name} · {task.creator.platform}
          </Link>
        )}
        {task.next_action && (
          <div className="mt-2 flex items-start gap-1 text-xs text-ink-500">
            <ChevronRight className="w-3 h-3 mt-0.5 flex-shrink-0 text-primary" />
            <span>{task.next_action}</span>
          </div>
        )}
      </div>
      <Tag size="sm" tone={tone} label={t(task.status)} />
    </div>
  )
}
