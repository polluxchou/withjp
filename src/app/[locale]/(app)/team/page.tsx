export const dynamic = 'force-dynamic'

import { getTranslations } from 'next-intl/server'
import { createServerClient } from '@/lib/supabase/server'
import Header from '@/components/layout/Header'
import SectionCard from '@/components/ui/SectionCard'
import Tag from '@/components/ui/Tag'
import EmptyState from '@/components/ui/EmptyState'
import AgentModelEditor from '@/components/agents/AgentModelEditor'
import { toneOf } from '@/lib/ui/status-tone'
import { Bot } from 'lucide-react'
import type { Agent } from '@/lib/types'

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

// Detail/summary focus ring shares the site's one focus recipe (design-system
// §4) — native <details><summary> doesn't get it for free like <button>/
// <a> styled through Button/Field, so it's spelled out on every summary here.
const SUMMARY_CLASS = 'text-xs text-ink-400 cursor-pointer hover:text-ink-700 font-medium rounded-field focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-ring focus-visible:ring-offset-1'
const PRE_CLASS = 'mt-2 text-xs font-mono bg-canvas border border-line rounded-field p-2 overflow-auto max-h-20 text-ink-700'

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

      {agents.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {agents.map((agent) => {
            const stats = agentStats[agent.id] ?? { pending: 0, done: 0, failed: 0 }
            return (
              <SectionCard
                key={agent.id}
                icon={<Bot />}
                title={agent.name}
                actions={
                  <div className="flex items-center gap-1.5">
                    <Tag size="sm" tone="neutral" label={t(`role.${agent.role}`)} />
                    <Tag
                      size="sm"
                      variant="dot"
                      tone={agent.is_active ? 'success' : 'neutral'}
                      label={agent.is_active ? t('agentActive') : t('agentOffline')}
                    />
                  </div>
                }
              >
                <div className="space-y-3">
                  <p className="text-xs text-ink-500 leading-relaxed">{agent.responsibility}</p>

                  {/* Task stats — three small soft Tags rather than a KPI-weight
                      Stat trio: these are per-card counters nested inside a
                      3-column card grid, not page-level metrics (design-system
                      §6.1 reserves Stat for that heavier register). */}
                  <div className="flex flex-wrap gap-1.5">
                    {(['pending', 'done', 'failed'] as const).map((statKey) => (
                      <Tag
                        key={statKey}
                        size="sm"
                        tone={toneOf('task', statKey)}
                        label={`${t(`stats.${statKey}`)} ${stats[statKey]}`}
                      />
                    ))}
                  </div>

                  {/* I/O Schema — collapsed by default, only expanded on demand */}
                  <div className="space-y-1.5">
                    <details>
                      <summary className={SUMMARY_CLASS}>{t('inputSchema')}</summary>
                      <pre className={PRE_CLASS}>
                        {JSON.stringify(agent.input_schema, null, 2)}
                      </pre>
                    </details>
                    <details>
                      <summary className={SUMMARY_CLASS}>{t('outputSchema')}</summary>
                      <pre className={PRE_CLASS}>
                        {JSON.stringify(agent.output_schema, null, 2)}
                      </pre>
                    </details>
                  </div>

                  {/* Prompt preview */}
                  <details>
                    <summary className={SUMMARY_CLASS}>{t('viewPrompt')}</summary>
                    <pre className={`${PRE_CLASS} max-h-48 whitespace-pre-wrap`}>
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
              </SectionCard>
            )
          })}
        </div>
      )}

      {/* Architecture note */}
      <div className="mt-6 bg-primary-soft border border-primary-border rounded-card p-4">
        <h3 className="text-sm font-semibold text-primary-hover mb-1">{t('architectureTitle')}</h3>
        <p className="text-xs text-primary-hover leading-relaxed">
          {t.rich('architectureBody', {
            strong: (chunks) => <strong>{chunks}</strong>,
          })}
        </p>
      </div>
    </div>
  )
}
