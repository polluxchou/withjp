import type { SupabaseClient } from '@supabase/supabase-js'
import type { Milestone } from '@/lib/types'

// Auto-generate tasks when a milestone has an owner agent and linked creators.
// Returns the IDs of created tasks.
export async function generateMilestoneTasks(
  db: SupabaseClient,
  milestone: Milestone
): Promise<string[]> {
  if (!milestone.owner_agent_id || milestone.linked_creator_ids.length === 0) {
    return []
  }

  const creatorIds = milestone.linked_creator_ids.slice(0, 5)

  const tasks = creatorIds.map((creatorId) => ({
    creator_id: creatorId,
    agent_id:   milestone.owner_agent_id!,
    title:      `[Milestone] ${milestone.title}`,
    status:     'pending' as const,
    input: {
      milestone_id:    milestone.id,
      milestone_title: milestone.title,
      milestone_type:  milestone.type,
      target_date:     milestone.target_date,
      description:     milestone.description ?? '',
      success_metric:  milestone.success_metric,
    },
  }))

  const { data, error } = await db.from('tasks').insert(tasks).select('id')
  if (error || !data) return []

  const taskIds = data.map((t: { id: string }) => t.id)

  await db
    .from('milestones')
    .update({ linked_task_ids: [...milestone.linked_task_ids, ...taskIds] })
    .eq('id', milestone.id)

  return taskIds
}
