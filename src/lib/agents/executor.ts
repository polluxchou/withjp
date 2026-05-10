import { createServerClient } from '@/lib/supabase/server'
import { buildPrompt } from './prompts'
import { resolveAgentModel } from './model-config'
import { generateStructuredOutput } from './providers'
import { STATUS_KNOWLEDGE } from '@/lib/state-machine/creator-lifecycle'
import type { Agent, Creator, Task, Knowledge, Config } from '@/lib/types'

export interface ExecutionResult {
  output: Record<string, unknown>
  next_action: string
}

export async function executeAgent(taskId: string): Promise<ExecutionResult> {
  const db = createServerClient()

  // ── 1. Load task with creator and agent ─────────────────────
  const { data: task, error: taskErr } = await db
    .from('tasks')
    .select('*, creator:creators(*), agent:agents(*)')
    .eq('id', taskId)
    .single()

  if (taskErr || !task) throw new Error(`Task not found: ${taskId}`)

  const creator = task.creator as Creator
  const agent   = task.agent   as Agent

  // ── 2. Mark task as running ──────────────────────────────────
  await db.from('tasks').update({ status: 'running' }).eq('id', taskId)

  // ── 3. Fetch relevant knowledge ──────────────────────────────
  const relevantCategories = STATUS_KNOWLEDGE[creator.status] ?? []
  let knowledge: Knowledge[] = []
  if (relevantCategories.length) {
    const { data } = await db
      .from('knowledge')
      .select('*')
      .in('category', relevantCategories)
      .limit(4)
    knowledge = (data ?? []) as Knowledge[]
  }

  // ── 4. Fetch config ──────────────────────────────────────────
  const { data: configData } = await db.from('config').select('*')
  const configs = (configData ?? []) as Config[]

  // ── 5. Fetch parent task output (for chaining) ───────────────
  let previousOutput: Record<string, unknown> | null = null
  if (task.parent_task_id) {
    const { data: parentTask } = await db
      .from('tasks')
      .select('output')
      .eq('id', task.parent_task_id)
      .single()
    previousOutput = (parentTask?.output as Record<string, unknown>) ?? null
  }

  // ── 6. Build prompt ──────────────────────────────────────────
  const prompt = buildPrompt(
    agent,
    creator,
    task as unknown as Task,
    knowledge,
    configs,
    previousOutput
  )

  // ── 7. Resolve model and call provider ───────────────────────
  const modelConfig = resolveAgentModel(agent)
  const rawContent  = await generateStructuredOutput(modelConfig, prompt)

  // ── 8. Parse JSON output ─────────────────────────────────────
  let output: Record<string, unknown>
  try {
    const cleaned = rawContent.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim()
    output = JSON.parse(cleaned)
  } catch {
    output = { raw_response: rawContent, parse_error: true }
  }

  const next_action: string =
    typeof output.next_action === 'string'
      ? output.next_action
      : 'Review agent output and decide next step.'

  // ── 9. Save output and mark done ─────────────────────────────
  await db
    .from('tasks')
    .update({ status: 'done', output, next_action })
    .eq('id', taskId)

  return { output, next_action }
}
