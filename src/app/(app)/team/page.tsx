export const dynamic = 'force-dynamic'

import { createServerClient } from '@/lib/supabase/server'
import Header from '@/components/layout/Header'
import Badge from '@/components/ui/Badge'
import AgentModelEditor from '@/components/agents/AgentModelEditor'
import type { Agent } from '@/lib/types'

const ROLE_COLOR = {
  bd:      'blue',
  ops:     'purple',
  finance: 'green',
  content: 'indigo',
  growth:  'amber',
  legal:   'slate',
} as const

const ROLE_LABEL = {
  bd:      'Business Development',
  ops:     'Operations',
  finance: 'Finance',
  content: 'Content Strategy',
  growth:  'Growth & Marketing',
  legal:   'Legal & Compliance',
}

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
  const [agents, agentStats] = await Promise.all([getAgents(), getAgentStats()])

  return (
    <div>
      <Header
        title="Team (Agents)"
        subtitle="AI agents driving the creator workflow"
      />

      <div className="grid grid-cols-3 gap-5">
        {agents.map((agent) => {
          const stats = agentStats[agent.id] ?? { pending: 0, done: 0, failed: 0 }
          return (
            <div key={agent.id} className="bg-white border border-slate-200 rounded-xl p-5">
              {/* Header */}
              <div className="flex items-start justify-between mb-3">
                <div>
                  <div className="font-semibold text-slate-900">{agent.name}</div>
                  <Badge label={ROLE_LABEL[agent.role]} color={ROLE_COLOR[agent.role]} size="sm" />
                </div>
                <span className={`w-2.5 h-2.5 rounded-full mt-1 ${agent.is_active ? 'bg-green-400' : 'bg-slate-300'}`} />
              </div>

              <p className="text-xs text-slate-500 mb-4 leading-relaxed">{agent.responsibility}</p>

              {/* Task stats */}
              <div className="grid grid-cols-3 gap-2 mb-4">
                {[
                  { label: 'Pending', value: stats.pending, color: 'text-amber-600' },
                  { label: 'Done',    value: stats.done,    color: 'text-green-600' },
                  { label: 'Failed',  value: stats.failed,  color: 'text-red-500' },
                ].map(({ label, value, color }) => (
                  <div key={label} className="bg-slate-50 rounded-lg p-2.5 text-center">
                    <div className={`text-lg font-bold ${color}`}>{value}</div>
                    <div className="text-xs text-slate-400">{label}</div>
                  </div>
                ))}
              </div>

              {/* I/O Schema */}
              <div className="space-y-2">
                <div>
                  <p className="text-xs font-medium text-slate-500 mb-1">Input Schema</p>
                  <pre className="text-xs bg-slate-50 rounded-lg p-2 text-slate-600 overflow-auto max-h-20">
                    {JSON.stringify(agent.input_schema, null, 2)}
                  </pre>
                </div>
                <div>
                  <p className="text-xs font-medium text-slate-500 mb-1">Output Schema</p>
                  <pre className="text-xs bg-slate-50 rounded-lg p-2 text-slate-600 overflow-auto max-h-20">
                    {JSON.stringify(agent.output_schema, null, 2)}
                  </pre>
                </div>
              </div>

              {/* Prompt preview */}
              <details className="mt-3">
                <summary className="text-xs text-slate-400 cursor-pointer hover:text-slate-600 font-medium">View prompt template</summary>
                <pre className="mt-2 text-xs bg-slate-900 text-slate-300 rounded-lg p-3 overflow-auto max-h-48 whitespace-pre-wrap">
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
      <div className="mt-6 bg-indigo-50 border border-indigo-100 rounded-xl p-4">
        <h3 className="text-sm font-semibold text-indigo-900 mb-1">Agent Architecture</h3>
        <p className="text-xs text-indigo-700 leading-relaxed">
          Agents are <strong>data-driven</strong> — all behavior is defined by the prompt template stored in the database.
          The executor is a single generic function: it loads the task + creator, fetches relevant knowledge by creator status,
          applies config rules, renders the prompt template, calls the configured model, and parses the structured JSON output.
          Each agent can independently use <strong>Anthropic</strong>, <strong>OpenAI</strong>, or <strong>Gemini</strong> — configure via the dropdowns above.
          Adding a new agent requires only inserting a new row — no code changes.
        </p>
      </div>
    </div>
  )
}
