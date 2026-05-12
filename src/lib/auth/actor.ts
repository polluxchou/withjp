import { createServerClient } from '@/lib/supabase/server'

export interface ActorProfile {
  id: string
  is_admin: boolean
}

export async function getActorProfile(userId: string): Promise<ActorProfile | null> {
  const db = createServerClient()
  const { data } = await db
    .from('users')
    .select('id, is_admin')
    .eq('id', userId)
    .single()
  if (!data) return null
  return { id: data.id, is_admin: data.is_admin ?? false }
}

/**
 * Returns true when the actor may write to a record.
 * Admins can always write. Non-admins can only write their own records.
 * Records with a null owner (historical) are admin-only.
 */
export function canModify(
  actor: ActorProfile | null,
  recordOwnerId: string | null,
): boolean {
  if (!actor) return false
  if (actor.is_admin) return true
  if (!recordOwnerId) return false
  return actor.id === recordOwnerId
}
