'use client'

import type { Task } from '@/lib/types'
import { Clock, CheckCircle2, XCircle, Loader2, ChevronRight } from 'lucide-react'
import { Link } from '@/i18n/navigation'
import { useTranslations } from 'next-intl'

const STATUS_ICON = {
  pending: Clock,
  running: Loader2,
  done:    CheckCircle2,
  failed:  XCircle,
}
const STATUS_COLOR = {
  pending: 'text-amber-500',
  running: 'text-blue-500',
  done:    'text-green-500',
  failed:  'text-red-500',
}
const ROLE_COLOR: Record<string, string> = {
  bd:      'bg-blue-100 text-blue-700',
  ops:     'bg-purple-100 text-purple-700',
  finance: 'bg-emerald-100 text-emerald-700',
  content: 'bg-primary-soft text-primary',
  growth:  'bg-amber-100 text-amber-700',
  legal:   'bg-zinc-100 text-zinc-700',
}

interface TaskCardProps {
  task: Task
}

export default function TaskCard({ task }: TaskCardProps) {
  const Icon  = STATUS_ICON[task.status]
  const color = STATUS_COLOR[task.status]
  const role  = task.agent?.role
  const t = useTranslations('tasks')

  return (
    <div className="bg-white border border-zinc-200 rounded-card shadow-card p-4 flex items-start gap-3 hover:shadow-sm transition-shadow">
      <Icon className={`w-4 h-4 mt-0.5 flex-shrink-0 ${color} ${task.status === 'running' ? 'animate-spin' : ''}`} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium text-zinc-900 truncate">{task.title}</span>
          {role && (
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${ROLE_COLOR[role]}`}>
              {task.agent?.name}
            </span>
          )}
        </div>
        {task.creator && (
          <Link href={`/creators/${task.creator.id}`} className="text-xs text-zinc-400 hover:text-primary transition-colors mt-0.5 block">
            {task.creator.name} · {task.creator.platform}
          </Link>
        )}
        {task.next_action && (
          <div className="mt-2 flex items-start gap-1 text-xs text-zinc-500">
            <ChevronRight className="w-3 h-3 mt-0.5 flex-shrink-0 text-violet-400" />
            <span>{task.next_action}</span>
          </div>
        )}
      </div>
      <span className="text-xs text-zinc-300 flex-shrink-0">{t(task.status)}</span>
    </div>
  )
}
