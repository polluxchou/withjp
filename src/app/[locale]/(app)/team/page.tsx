export const dynamic = 'force-dynamic'

import { getTranslations } from 'next-intl/server'
import { createServerClient } from '@/lib/supabase/server'
import Header from '@/components/layout/Header'
import Badge from '@/components/ui/Badge'
import AgentModelEditor from '@/components/agents/AgentModelEditor'
import type { Agent } from '@/lib/types'

const ROLE_COLOR = {
  bd:      'blue',
  ops:     'teal',
  finance: 'green',
  content: 'indigo',
  growth:  'amber',
  legal:   'slate',
} as const

async function getAgents(): Promise<Agent[]> {
  const db = createServerClient()
  const { data } = await db.from('agents').select('*').order('role')
  return (data ?? []) as Agent[]
}

async function getAgentStats() {
  const db = createServerClient()
  const { data } = await db
    .from('tasks')
    .select('agent_id, status')
  const tasks = data ?? []

  const stats: Record<string, { pending: number; done: number; failed: number }> = {}
  for (const t of tasks) {
    if (!stats[t.agent_id]) stats[t.agent_id] = { pending: 0, done: 0, failed: 0 }
    if (t.status in stats[t.agent_id]) {
      stats[t.agent_id][t.status as 'pending' | 'done' | 'failed']++
    }
  }
  return stats
}

export default async function TeamPage() {
  const [agents, agentStats, t] = await Promise.all([
    getAgents(),
    getAgentStats(),
    getTranslations('team'),
  ])

  return (
    <div>
      <Header
        title={t('title')}
        subtitle={t('subtitle')}
      />

      <div className="grid grid-cols-3 gap-5">
        {agents.map((agent) => {
          const stats = agentStats[agent.id] ?? { pending: 0, done: 0, failed: 0 }
          return (
            <div key={agent.id} className="bg-white border border-zinc-200 rounded-xl p-5">
              {/* Header */}
              <div className="flex items-start justify-between mb-3">
                <div>
                  <div className="font-semibold text-zinc-900">{agent.name}</div>
                  <Badge label={t(`role.${agent.role}`)} color={ROLE_COLOR[agent.role]} size="sm" />
                </div>
                <span className={`w-2.5 h-2.5 rounded-full mt-1 ${agent.is_active ? 'bg-green-400' : 'bg-zinc-300'}`} />
              </div>

              <p className="text-xs text-zinc-500 mb-4 leading-relaxed">{agent.responsibility}</p>

              {/* Task stats */}
              <div className="grid grid-cols-3 gap-2 mb-4">
                {(['pending', 'done', 'failed'] as const).map((statKey) => {
                  const color =
                    statKey === 'pending' ? 'text-amber-600' :
                    statKey === 'done'    ? 'text-green-600' :
                                            'text-red-500'
                  return (
                    <div key={statKey} className="bg-zinc-50 rounded-lg p-2.5 text-center">
                      <div className={`text-lg font-bold ${color}`}>{stats[statKey]}</div>
                      <div className="text-xs text-zinc-400">{t(`stats.${statKey}`)}</div>
                    </div>
                  )
                })}
              </div>

              {/* I/O Schema */}
              <div className="space-y-2">
                <div>
                  <p className="text-xs font-medium text-zinc-500 mb-1">{t('inputSchema')}</p>
                  <pre className="text-xs bg-zinc-50 rounded-lg p-2 text-zinc-600 overflow-auto max-h-20">
                    {JSON.stringify(agent.input_schema, null, 2)}
                  </pre>
                </div>
                <div>
                  <p className="text-xs font-medium text-zinc-500 mb-1">{t('outputSchema')}</p>
                  <pre className="text-xs bg-zinc-50 rounded-lg p-2 text-zinc-600 overflow-auto max-h-20">
                    {JSON.stringify(agent.output_schema, null, 2)}
                  </pre>
                </div>
              </div>

              {/* Prompt preview */}
              <details className="mt-3">
                <summary className="text-xs text-zinc-400 cursor-pointer hover:text-zinc-600 font-medium">{t('viewPrompt')}</summary>
                <pre className="mt-2 text-xs bg-zinc-900 text-zinc-300 rounded-lg p-3 overflow-auto max-h-48 whitespace-pre-wrap">
                  {agent.prompt_template}
                </pre>
              </details>

              {/* Model configuration editor */}
              <AgentModelEditor
                agentId={agent.id}
                initialProvider={agent.model_provider}
                initialModel={agent.model_name}
              />
            </div>
          )
        })}
      </div>

      {/* Architecture note */}
      <div className="mt-6 bg-primary-soft border border-violet-100 rounded-xl p-4">
        <h3 className="text-sm font-semibold text-violet-900 mb-1">{t('architectureTitle')}</h3>
        <p className="text-xs text-violet-700 leading-relaxed">
          {t.rich('architectureBody', {
            strong: (chunks) => <strong>{chunks}</strong>,
          })}
        </p>
      </div>
    </div>
  )
}
