import { createServerClient } from '@/lib/supabase/server'

export interface CreateNotificationInput {
  user_id:      string
  type:         string
  title:        string
  body?:        string
  entity_type?: string
  entity_id?:   string
  action_url?:  string
}

export async function createNotification(input: CreateNotificationInput): Promise<void> {
  try {
    const db = createServerClient()
    const { error } = await db.from('notifications').insert(input)
    if (error) console.warn('[notifications] create failed:', error.message)
  } catch (err) {
    console.warn('[notifications] create failed:', err)
  }
}
