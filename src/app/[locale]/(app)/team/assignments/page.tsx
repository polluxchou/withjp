export const dynamic = 'force-dynamic'

import { getTranslations } from 'next-intl/server'
import { createServerClient } from '@/lib/supabase/server'
import Header from '@/components/layout/Header'
import Badge from '@/components/ui/Badge'
import type { Agent, AgentRole, TaskStatus } from '@/lib/types'

const ROLE_COLOR = {
  bd:      'blue',
  ops:     'teal',
  finance: 'green',
  content: 'indigo',
  growth:  'amber',
  legal:   'slate',
} as const

const STATUS_COLOR: Record<TaskStatus, 'amber' | 'blue' | 'green' | 'red'> = {
  pending: 'amber',
  running: 'blue',
  done:    'green',
  failed:  'red',
}

const STATUS_ORDER: TaskStatus[] = ['pending', 'running', 'done', 'failed']

// Only the columns the read-only board needs, plus the joined creator name.
type TaskRow = {
  id: string
  agent_id: string
  title: string
  status: TaskStatus
  created_at: string
  creator?: { name: string } | null
}

async function getData(): Promise<{ agents: Agent[]; tasks: TaskRow[] }> {
  const db = createServerClient()
  const [agentsRes, tasksRes] = await Promise.all([
    db.from('agents').select('*').order('role'),
    db
      .from('tasks')
      .select('id, agent_id, title, status, created_at, creator:creators(name)')
      .order('created_at', { ascending: false }),
  ])
  return {
    agents: (agentsRes.data ?? []) as Agent[],
    // Supabase types the to-one `creator` join as an array, but at runtime the
    // FK resolves to a single object (see the tasks page usage). Cast through
    // unknown to keep the ergonomic object shape.
    tasks:  (tasksRes.data ?? []) as unknown as TaskRow[],
  }
}

export default async function TaskAssignmentPage() {
  const [{ agents, tasks }, t] = await Promise.all([
    getData(),
    getTranslations('team'),
  ])

  // Group tasks by their assigned agent.
  const byAgent = new Map<string, TaskRow[]>()
  for (const task of tasks) {
    const list = byAgent.get(task.agent_id) ?? []
    list.push(task)
    byAgent.set(task.agent_id, list)
  }

  const knownAgentIds = new Set(agents.map((a) => a.id))
  const orphanTasks = tasks.filter((task) => !knownAgentIds.has(task.agent_id))

  const activeCount = agents.filter((a) => a.is_active).length

  const summary: { label: string; value: number }[] = [
    { label: t('assignments.totalLabel'), value: tasks.length },
    { label: t('assignments.agentsLabel'), value: agents.length },
    { label: t('assignments.activeLabel'), value: activeCount },
  ]

  return (
    <div>
      <Header title={t('assignments.title')} subtitle={t('assignments.subtitle')} />

      <div className="grid grid-cols-3 gap-3 sm:gap-4 mb-6">
        {summary.map((card) => (
          <div key={card.label} className="bg-white border border-zinc-200 rounded-xl p-4">
            <p className="text-xs font-medium text-zinc-500 mb-1">{card.label}</p>
            <p className="text-lg sm:text-2xl font-bold text-zinc-900">{card.value}</p>
          </div>
        ))}
      </div>

      {tasks.length === 0 ? (
        <div className="bg-white border border-dashed border-zinc-200 rounded-xl p-10 text-center text-sm text-zinc-400">
          {t('assignments.noTasksAll')}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {agents.map((agent) => (
            <AgentColumn
              key={agent.id}
              name={agent.name}
              roleLabel={t(`role.${agent.role}`)}
              roleColor={ROLE_COLOR[agent.role]}
              isActive={agent.is_active}
              tasks={byAgent.get(agent.id) ?? []}
              statusLabel={(s) => t(`assignments.status.${s}`)}
              emptyLabel={t('assignments.noTasks')}
              noCreatorLabel={t('assignments.noCreator')}
            />
          ))}

          {orphanTasks.length > 0 && (
            <AgentColumn
              name={t('assignments.unknownAgent')}
              tasks={orphanTasks}
              statusLabel={(s) => t(`assignments.status.${s}`)}
              emptyLabel={t('assignments.noTasks')}
              noCreatorLabel={t('assignments.noCreator')}
            />
          )}
        </div>
      )}
    </div>
  )
}

function AgentColumn({
  name,
  roleLabel,
  roleColor,
  isActive,
  tasks,
  statusLabel,
  emptyLabel,
  noCreatorLabel,
}: {
  name: string
  roleLabel?: string
  roleColor?: (typeof ROLE_COLOR)[AgentRole]
  isActive?: boolean
  tasks: TaskRow[]
  statusLabel: (status: TaskStatus) => string
  emptyLabel: string
  noCreatorLabel: string
}) {
  const counts = STATUS_ORDER.map(
    (status) => tasks.filter((task) => task.status === status).length,
  )

  return (
    <div className="bg-white border border-zinc-200 rounded-xl p-5 flex flex-col">
      <div className="flex items-start justify-between mb-3">
        <div className="min-w-0">
          <div className="font-semibold text-zinc-900 truncate">{name}</div>
          {roleLabel && roleColor && (
            <Badge label={roleLabel} color={roleColor} size="sm" />
          )}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0 pl-2">
          <span className="text-sm font-semibold text-zinc-900">{tasks.length}</span>
          {isActive !== undefined && (
            <span className={`w-2.5 h-2.5 rounded-full ${isActive ? 'bg-green-400' : 'bg-zinc-300'}`} />
          )}
        </div>
      </div>

      {/* Per-status counts */}
      <div className="grid grid-cols-4 gap-1.5 mb-4">
        {STATUS_ORDER.map((status, i) => (
          <div key={status} className="bg-zinc-50 rounded-lg px-1 py-1.5 text-center">
            <div className="text-sm font-bold text-zinc-900">{counts[i]}</div>
            <div className="text-[10px] text-zinc-400 truncate">{statusLabel(status)}</div>
          </div>
        ))}
      </div>

      {/* Task list */}
      {tasks.length === 0 ? (
        <p className="text-xs text-zinc-400 py-2">{emptyLabel}</p>
      ) : (
        <ul className="space-y-1.5 max-h-72 overflow-y-auto scrollbar-thin -mr-1 pr-1">
          {tasks.map((task) => (
            <li
              key={task.id}
              className="flex items-center gap-2 rounded-lg border border-zinc-100 px-2.5 py-2"
            >
              <div className="min-w-0 flex-1">
                <div className="text-sm text-zinc-800 truncate">{task.title}</div>
                <div className="text-[11px] text-zinc-400 truncate">
                  {task.creator?.name ?? noCreatorLabel} · {task.created_at.slice(0, 10)}
                </div>
              </div>
              <Badge label={statusLabel(task.status)} color={STATUS_COLOR[task.status]} size="sm" />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
