import type { Task } from '@/lib/types'
import { Clock, CheckCircle2, XCircle, Loader2, ChevronRight } from 'lucide-react'
import Link from 'next/link'

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
  content: 'bg-indigo-100 text-indigo-700',
  growth:  'bg-amber-100 text-amber-700',
  legal:   'bg-slate-100 text-slate-700',
}

interface TaskCardProps {
  task: Task
}

export default function TaskCard({ task }: TaskCardProps) {
  const Icon  = STATUS_ICON[task.status]
  const color = STATUS_COLOR[task.status]
  const role  = task.agent?.role

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4 flex items-start gap-3 hover:shadow-sm transition-shadow">
      <Icon className={`w-4 h-4 mt-0.5 flex-shrink-0 ${color} ${task.status === 'running' ? 'animate-spin' : ''}`} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium text-slate-900 truncate">{task.title}</span>
          {role && (
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${ROLE_COLOR[role]}`}>
              {task.agent?.name}
            </span>
          )}
        </div>
        {task.creator && (
          <Link href={`/creators/${task.creator.id}`} className="text-xs text-slate-400 hover:text-indigo-600 transition-colors mt-0.5 block">
            {task.creator.name} · {task.creator.platform}
          </Link>
        )}
        {task.next_action && (
          <div className="mt-2 flex items-start gap-1 text-xs text-slate-500">
            <ChevronRight className="w-3 h-3 mt-0.5 flex-shrink-0 text-indigo-400" />
            <span>{task.next_action}</span>
          </div>
        )}
      </div>
      <span className="text-xs text-slate-300 flex-shrink-0 capitalize">{task.status}</span>
    </div>
  )
}
