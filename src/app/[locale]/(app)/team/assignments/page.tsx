export const dynamic = 'force-dynamic'

import { getTranslations } from 'next-intl/server'
import { createServerClient } from '@/lib/supabase/server'
import Header from '@/components/layout/Header'
import SectionCard from '@/components/ui/SectionCard'
import { Stat, StatBand } from '@/components/ui/Stat'
import Tag from '@/components/ui/Tag'
import EmptyState from '@/components/ui/EmptyState'
import { toneOf } from '@/lib/ui/status-tone'
import { Bot } from 'lucide-react'
import type { Agent, TaskStatus } from '@/lib/types'

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

  return (
    <div>
      <Header title={t('assignments.title')} subtitle={t('assignments.subtitle')} />

      <div className="mb-6">
        <StatBand>
          <Stat label={t('assignments.totalLabel')} value={tasks.length} />
          <Stat label={t('assignments.agentsLabel')} value={agents.length} />
          <Stat label={t('assignments.activeLabel')} value={activeCount} />
        </StatBand>
      </div>

      {tasks.length === 0 ? (
        <EmptyState title={t('assignments.noTasksAll')} />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {agents.map((agent) => (
            <AgentColumn
              key={agent.id}
              name={agent.name}
              roleLabel={t(`role.${agent.role}`)}
              isActive={agent.is_active}
              activeLabel={t('agentActive')}
              offlineLabel={t('agentOffline')}
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
  isActive,
  activeLabel,
  offlineLabel,
  tasks,
  statusLabel,
  emptyLabel,
  noCreatorLabel,
}: {
  name: string
  roleLabel?: string
  isActive?: boolean
  activeLabel?: string
  offlineLabel?: string
  tasks: TaskRow[]
  statusLabel: (status: TaskStatus) => string
  emptyLabel: string
  noCreatorLabel: string
}) {
  const counts = STATUS_ORDER.map(
    (status) => tasks.filter((task) => task.status === status).length,
  )

  return (
    <SectionCard
      icon={<Bot />}
      title={name}
      actions={
        <div className="flex items-center gap-1.5">
          {roleLabel && <Tag size="sm" tone="neutral" label={roleLabel} />}
          <span className="text-sm font-semibold text-ink-900 tabular-nums">{tasks.length}</span>
          {isActive !== undefined && (
            <Tag
              size="sm"
              variant="dot"
              tone={isActive ? 'success' : 'neutral'}
              label={isActive ? (activeLabel ?? '') : (offlineLabel ?? '')}
            />
          )}
        </div>
      }
    >
      <div className="flex flex-col">
        {/* Per-status counts */}
        <div className="flex flex-wrap gap-1.5 mb-4">
          {STATUS_ORDER.map((status, i) => (
            <Tag key={status} size="sm" tone={toneOf('task', status)} label={`${statusLabel(status)} ${counts[i]}`} />
          ))}
        </div>

        {/* Task list */}
        {tasks.length === 0 ? (
          <p className="text-xs text-ink-400 py-2">{emptyLabel}</p>
        ) : (
          <ul className="space-y-1.5 max-h-72 overflow-y-auto scrollbar-thin -mr-1 pr-1">
            {tasks.map((task) => (
              <li
                key={task.id}
                className="flex items-center gap-2 rounded-field border border-line-soft px-2.5 py-2"
              >
                <div className="min-w-0 flex-1">
                  <div className="text-sm text-ink-900 truncate">{task.title}</div>
                  <div className="text-micro text-ink-400 truncate">
                    {task.creator?.name ?? noCreatorLabel} · {task.created_at.slice(0, 10)}
                  </div>
                </div>
                <div className="flex-none">
                  <Tag size="sm" tone={toneOf('task', task.status)} label={statusLabel(task.status)} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </SectionCard>
  )
}
