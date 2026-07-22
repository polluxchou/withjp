import type { createServerClient } from '@/lib/supabase/server'

type DB = ReturnType<typeof createServerClient>

// 按事项 id 取当前事项名;查不到返回 null。用于写工时任务的事项名快照。
export async function fetchTaskItemName(db: DB, itemId: string): Promise<string | null> {
  const { data } = await db.from('task_items').select('name').eq('id', itemId).maybeSingle()
  return (data as { name: string } | null)?.name ?? null
}
