import type { AgentRole, TaskItem } from '../types/index.ts'

// 岗位 key → 部门(agent_role)启发式映射,可后续调优。
export const POSITION_DEPARTMENT: Record<string, AgentRole> = {
  streamer:     'content',
  mc:           'content',
  agent:        'growth',
  group_ops:    'ops',
  makeup:       'content',
  dance_coach:  'content',
  video_editor: 'content',
  photographer: 'content',
  guild_leader: 'ops',
  finance_tax:  'finance',
}

// 任务的岗位集合 → 去重后的部门:恰好 1 个才返回,否则 null。
export function departmentForPositions(positionKeys: string[]): AgentRole | null {
  const depts = new Set<AgentRole>()
  for (const k of positionKeys) {
    const d = POSITION_DEPARTMENT[k]
    if (d) depts.add(d)
  }
  return depts.size === 1 ? [...depts][0] : null
}

export interface ItemPrefill {
  business_task_item_id:   string
  business_task_item_name: string
  title:                   string
  owner_user_id:           string | null
  department:              AgentRole | null
  ownerIsCreator:          boolean
}

// 从选中的事项 + 其所属任务的岗位 keys,算出工时任务表单的预填值。
export function prefillFromItem(item: TaskItem, taskPositionKeys: string[]): ItemPrefill {
  const ownerIsCreator = item.owner_member_type === 'creator'
  return {
    business_task_item_id:   item.id,
    business_task_item_name: item.name,
    title:                   item.name,
    owner_user_id:           item.owner_member_type === 'user' ? item.owner_user_id : null,
    department:              departmentForPositions(taskPositionKeys),
    ownerIsCreator,
  }
}

// 按名(去空白、大小写不敏感)唯一匹配事项;无匹配或重名歧义 → null。
export function matchItemByName(items: { id: string; name: string }[], name: string): string | null {
  const norm = name.trim().toLowerCase()
  if (!norm) return null
  const hits = items.filter((it) => it.name.trim().toLowerCase() === norm)
  return hits.length === 1 ? hits[0].id : null
}
