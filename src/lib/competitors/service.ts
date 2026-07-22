import { createServerClient } from '@/lib/supabase/server'
import { getActorProfile } from '@/lib/auth/actor'
import { assembleBoard, parseHandleFromUrl } from './assemble'
import type { Competitor, CompetitorSnapshot, CompetitorBoard, CompetitorPlatform } from './types'

export type ServiceErrorCode = 'invalid_input' | 'forbidden' | 'not_found' | 'db_error'
export interface ServiceError { code: ServiceErrorCode; message: string }
export type ServiceResult<T> = { data: T; error: null } | { data: null; error: ServiceError }

const ok = <T,>(data: T): ServiceResult<T> => ({ data, error: null })
const err = <T = never,>(code: ServiceErrorCode, message: string): ServiceResult<T> => ({
  data: null,
  error: { code, message },
})

export function httpStatusForError(code: ServiceErrorCode): number {
  switch (code) {
    case 'invalid_input': return 400
    case 'forbidden':     return 403
    case 'not_found':     return 404
    case 'db_error':      return 500
  }
}

async function requireAdmin(userId: string): Promise<ServiceError | null> {
  const actor = await getActorProfile(userId)
  return actor?.is_admin ? null : { code: 'forbidden', message: 'admin only' }
}

/** 加载看板：任意登录用户可读；canEdit 取决于 is_admin。 */
export async function getCompetitorBoard(userId: string): Promise<ServiceResult<CompetitorBoard>> {
  const db = createServerClient()
  const [compRes, snapRes] = await Promise.all([
    db.from('competitors').select('*').order('created_at', { ascending: true }),
    db.from('competitor_snapshots').select('*'),
  ])
  if (compRes.error || snapRes.error) {
    return err('db_error', compRes.error?.message ?? snapRes.error?.message ?? 'load failed')
  }
  const actor = await getActorProfile(userId)
  return ok(assembleBoard(
    (compRes.data ?? []) as Competitor[],
    (snapRes.data ?? []) as CompetitorSnapshot[],
    Boolean(actor?.is_admin),
  ))
}

/** 加入清单：入参 url 或 handle 二选一；解析出 handle 后按 (platform, handle) upsert。 */
export async function addCompetitor(
  userId: string,
  input: { url?: string; handle?: string; platform?: CompetitorPlatform; note?: string },
): Promise<ServiceResult<{ id: string }>> {
  const forbidden = await requireAdmin(userId)
  if (forbidden) return { data: null, error: forbidden }

  const platform: CompetitorPlatform = input.platform ?? 'tiktok'
  const raw = (input.url ?? input.handle ?? '').trim()
  const handle = parseHandleFromUrl(raw)
  if (!handle) return err('invalid_input', 'valid url or @handle required')
  const profile_url = /^https?:\/\//i.test(raw) ? raw : `https://www.tiktok.com/@${handle}`

  const db = createServerClient()
  const { data, error } = await db
    .from('competitors')
    .upsert(
      { platform, handle, profile_url, note: input.note ?? '' },
      { onConflict: 'platform,handle' },
    )
    .select('id')
    .single()
  if (error) return err('db_error', error.message)
  return ok({ id: (data as { id: string }).id })
}

export async function updateCompetitor(
  userId: string,
  id: string,
  fields: { note?: string; display_name?: string },
): Promise<ServiceResult<{ id: string }>> {
  const forbidden = await requireAdmin(userId)
  if (forbidden) return { data: null, error: forbidden }

  const patch: Record<string, unknown> = {}
  if (fields.note !== undefined) patch.note = fields.note
  if (fields.display_name !== undefined) patch.display_name = fields.display_name
  if (Object.keys(patch).length === 0) return err('invalid_input', 'nothing to update')

  const db = createServerClient()
  const { error } = await db.from('competitors').update(patch).eq('id', id)
  if (error) return err('db_error', error.message)
  return ok({ id })
}

export async function deleteCompetitor(userId: string, id: string): Promise<ServiceResult<{ id: string }>> {
  const forbidden = await requireAdmin(userId)
  if (forbidden) return { data: null, error: forbidden }

  const db = createServerClient()
  const { error } = await db.from('competitors').delete().eq('id', id)
  if (error) return err('db_error', error.message)
  return ok({ id })
}

/** 快照 upsert —— 只给 service-role 脚本用（无 admin 检查，脚本本身持 service-role）。 */
export interface SnapshotInput {
  competitor_id: string
  captured_on: string
  followers?: number | null
  likes?: number | null
  videos?: number | null
  following?: number | null
  display_name?: string | null
  bio?: string | null
  region?: string | null
  verified?: boolean | null
  raw?: Record<string, unknown> | null
}

export async function upsertSnapshot(input: SnapshotInput): Promise<ServiceResult<{ competitor_id: string; captured_on: string }>> {
  const db = createServerClient()
  const { error } = await db
    .from('competitor_snapshots')
    .upsert(input, { onConflict: 'competitor_id,captured_on' })
  if (error) return err('db_error', error.message)
  return ok({ competitor_id: input.competitor_id, captured_on: input.captured_on })
}
