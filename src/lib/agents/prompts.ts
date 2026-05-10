import type { Creator, Agent, Task, Knowledge, Config } from '@/lib/types'

function creatorSummary(creator: Creator): string {
  return `Name: ${creator.name}
Platform: ${creator.platform}
Status: ${creator.status}
Niche: ${creator.profile.niche ?? 'Unknown'}
Followers: ${creator.profile.followers?.toLocaleString() ?? 'Unknown'}
Avg Views: ${creator.profile.avg_views?.toLocaleString() ?? 'Unknown'}
Location: ${creator.profile.location ?? 'Unknown'}
Notes: ${creator.notes ?? 'None'}`
}

function knowledgeSummary(items: Knowledge[]): string {
  if (!items.length) return 'No relevant knowledge found.'
  return items
    .map((k) => `[${k.category.toUpperCase()}] ${k.title}\n${k.content}`)
    .join('\n\n---\n\n')
}

function configSummary(configs: Config[]): string {
  return configs
    .map((c) => `${c.key}: ${JSON.stringify(c.value)}`)
    .join('\n')
}

export function buildPrompt(
  agent: Agent,
  creator: Creator,
  task: Task,
  knowledge: Knowledge[],
  configs: Config[],
  previousOutput?: Record<string, unknown> | null
): string {
  return agent.prompt_template
    .replace('{{creator_info}}',     creatorSummary(creator))
    .replace('{{task_context}}',     task.title)
    .replace('{{knowledge}}',        knowledgeSummary(knowledge))
    .replace('{{config}}',           configSummary(configs))
    .replace('{{previous_output}}',  previousOutput ? JSON.stringify(previousOutput, null, 2) : 'None')
    .replace('{{finance_data}}',     JSON.stringify(task.input, null, 2))
}
