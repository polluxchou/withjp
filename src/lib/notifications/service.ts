import { createServerClient } from '../supabase/server.ts'

export interface Notification {
  id:          string
  type:        string
  title:       string
  body:        string | null
  entity_type: string | null
  entity_id:   string | null
  action_url:  string | null
  read_at:     string | null
  created_at:  string
}

export type NotificationServiceErrorCode = 'db_error' | 'not_found'

export interface NotificationServiceError {
  code:    NotificationServiceErrorCode
  message: string
}

export type NotificationServiceResult<T> =
  | { data: T;    error: null }
  | { data: null; error: NotificationServiceError }

interface NotificationDb {
  from(table: string): any
}
type NowFn = () => string

const NOTIFICATION_SELECT =
  'id,type,title,body,entity_type,entity_id,action_url,read_at,created_at'

const ok = <T,>(data: T): NotificationServiceResult<T> => ({ data, error: null })
const err = <T = never,>(
  code: NotificationServiceErrorCode,
  message: string,
): NotificationServiceResult<T> => ({ data: null, error: { code, message } })

export function httpStatusForNotificationError(code: NotificationServiceErrorCode): number {
  if (code === 'not_found') return 404
  return 500
}

function nowIso(): string {
  return new Date().toISOString()
}

export async function listNotificationsForUser(
  userId: string,
  db: NotificationDb = createServerClient(),
): Promise<NotificationServiceResult<{ notifications: Notification[]; unread_count: number }>> {
  const { data, error } = await db
    .from('notifications')
    .select(NOTIFICATION_SELECT)
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(50)

  if (error) return err('db_error', error.message)

  const { count, error: countError } = await db
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .is('read_at', null)

  if (countError) return err('db_error', countError.message)

  return ok({
    notifications: (data ?? []) as Notification[],
    unread_count: count ?? 0,
  })
}

export async function markNotificationRead(
  id: string,
  userId: string,
  db: NotificationDb = createServerClient(),
  getNow: NowFn = nowIso,
): Promise<NotificationServiceResult<{ id: string; read_at: string }>> {
  const { data: existing, error: lookupError } = await db
    .from('notifications')
    .select('id,read_at')
    .eq('id', id)
    .eq('user_id', userId)
    .maybeSingle()

  if (lookupError) return err('db_error', lookupError.message)
  if (!existing) return err('not_found', 'Notification not found')

  const readAt = (existing as { id: string; read_at: string | null }).read_at
  if (readAt) return ok({ id, read_at: readAt })

  const { data, error } = await db
    .from('notifications')
    .update({ read_at: getNow() })
    .eq('id', id)
    .eq('user_id', userId)
    .select('id,read_at')
    .single()

  if (error) return err('db_error', error.message)
  return ok(data as { id: string; read_at: string })
}

export async function markAllNotificationsRead(
  userId: string,
  db: NotificationDb = createServerClient(),
  getNow: NowFn = nowIso,
): Promise<NotificationServiceResult<{ updated_count: number }>> {
  const { data, error } = await db
    .from('notifications')
    .update({ read_at: getNow() })
    .eq('user_id', userId)
    .is('read_at', null)
    .select('id')

  if (error) return err('db_error', error.message)
  return ok({ updated_count: data?.length ?? 0 })
}
