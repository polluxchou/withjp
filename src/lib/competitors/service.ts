// src/lib/competitors/service.ts
import { createServerClient } from '@/lib/supabase/server'
import { assembleBoard, parseHandleFromUrl } from './assemble'
import type { Competitor, CompetitorSnapshot, CompetitorShot, CompetitorBoard, CompetitorPlatform } from './types'

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

/** 团级可写字段（供 add/update 共用）。 */
export interface CompetitorFields {
  note?: string
  display_name?: string
  avatar_url?: string
  region?: string
  member_count?: number | null
  composition?: string
  launch_city?: string
  launched_on?: string | null
  mc_note?: string
  online_note?: string
  latest_videos?: { url: string; title?: string }[]
  parent_id?: string | null // 归属主账号;null=独立主账号
}

const FIELD_KEYS: (keyof CompetitorFields)[] = [
  'note', 'display_name', 'avatar_url', 'region', 'member_count',
  'composition', 'launch_city', 'launched_on', 'mc_note', 'online_note', 'latest_videos', 'parent_id',
]

function pickFields(input: CompetitorFields): Record<string, unknown> {
  const patch: Record<string, unknown> = {}
  for (const k of FIELD_KEYS) {
    if (input[k] !== undefined) patch[k] = input[k]
  }
  return patch
}

/** 校验父账号赋值:只允许两级层级(父必须是主账号),不能选自己,已有子账号者不能再变成子账号。 */
async function assertValidParent(
  db: ReturnType<typeof createServerClient>,
  selfId: string | null,
  parentId: string,
): Promise<ServiceError | null> {
  if (selfId && parentId === selfId) return { code: 'invalid_input', message: '不能把自己设为父账号' }
  const { data: parent, error } = await db
    .from('competitors').select('id, parent_id').eq('id', parentId).maybeSingle()
  if (error) return { code: 'db_error', message: error.message }
  if (!parent) return { code: 'invalid_input', message: '父账号不存在' }
  if ((parent as { parent_id: string | null }).parent_id) {
    return { code: 'invalid_input', message: '父账号必须是主账号(不能是子账号)' }
  }
  if (selfId) {
    const { data: kids, error: kidErr } = await db
      .from('competitors').select('id').eq('parent_id', selfId).limit(1)
    if (kidErr) return { code: 'db_error', message: kidErr.message }
    if (kids && kids.length) return { code: 'invalid_input', message: '该账号已有子账号,不能再成为子账号' }
  }
  return null
}

/** 加载看板：任意登录用户可读可写（canEdit 恒 true）。 */
export async function getCompetitorBoard(_userId: string): Promise<ServiceResult<CompetitorBoard>> {
  const db = createServerClient()
  const [compRes, snapRes, shotRes] = await Promise.all([
    db.from('competitors').select('*').order('created_at', { ascending: true }),
    db.from('competitor_snapshots').select('*'),
    db.from('competitor_shots').select('*'),
  ])
  if (compRes.error || snapRes.error || shotRes.error) {
    return err('db_error', compRes.error?.message ?? snapRes.error?.message ?? shotRes.error?.message ?? 'load failed')
  }
  return ok(assembleBoard(
    (compRes.data ?? []) as Competitor[],
    (snapRes.data ?? []) as CompetitorSnapshot[],
    (shotRes.data ?? []) as CompetitorShot[],
    true,
  ))
}

/** 加入清单：入参 url 或 handle 二选一；已存在则返回其 id（确保存在，不覆盖）。 */
export async function addCompetitor(
  _userId: string,
  input: { url?: string; handle?: string; platform?: CompetitorPlatform } & CompetitorFields,
): Promise<ServiceResult<{ id: string }>> {
  const platform: CompetitorPlatform = input.platform ?? 'tiktok'
  if (platform !== 'tiktok') return err('invalid_input', 'unsupported platform')
  const raw = (input.url ?? input.handle ?? '').trim()
  const handle = parseHandleFromUrl(raw)
  if (!handle) return err('invalid_input', 'valid url or @handle required')
  const profile_url = /^https?:\/\//i.test(raw) ? raw : `https://www.tiktok.com/@${handle}`

  const db = createServerClient()
  const { data: existing, error: findErr } = await db
    .from('competitors').select('id').eq('platform', platform).eq('handle', handle).maybeSingle()
  if (findErr) return err('db_error', findErr.message)
  if (existing) return ok({ id: (existing as { id: string }).id })

  if (input.parent_id) {
    const bad = await assertValidParent(db, null, input.parent_id)
    if (bad) return { data: null, error: bad }
  }

  const { data, error } = await db
    .from('competitors')
    .insert({ platform, handle, profile_url, note: input.note ?? '', ...pickFields({ ...input, note: undefined }) })
    .select('id').single()
  if (error) return err('db_error', error.message)
  return ok({ id: (data as { id: string }).id })
}

export async function updateCompetitor(
  _userId: string,
  id: string,
  fields: CompetitorFields,
): Promise<ServiceResult<{ id: string }>> {
  const patch = pickFields(fields)
  if (Object.keys(patch).length === 0) return err('invalid_input', 'nothing to update')
  const db = createServerClient()
  if (fields.parent_id !== undefined && fields.parent_id !== null) {
    const bad = await assertValidParent(db, id, fields.parent_id)
    if (bad) return { data: null, error: bad }
  }
  const { error } = await db.from('competitors').update(patch).eq('id', id)
  if (error) return err('db_error', error.message)
  return ok({ id })
}

export async function deleteCompetitor(_userId: string, id: string): Promise<ServiceResult<{ id: string }>> {
  const db = createServerClient()
  const { error } = await db.from('competitors').delete().eq('id', id)
  if (error) return err('db_error', error.message)
  return ok({ id })
}

// ---- 截图 CRUD ----

export interface ShotInput {
  image_url: string
  shot_on?: string | null
  tag?: string | null
  caption?: string
  sort_order?: number
}

export async function addShot(competitorId: string, input: ShotInput): Promise<ServiceResult<CompetitorShot>> {
  if (!input?.image_url) return err('invalid_input', 'image_url required')
  const db = createServerClient()
  const { data, error } = await db
    .from('competitor_shots')
    .insert({
      competitor_id: competitorId,
      image_url: input.image_url,
      shot_on: input.shot_on ?? null,
      tag: input.tag ?? null,
      caption: input.caption ?? '',
      sort_order: input.sort_order ?? 0,
    })
    .select('*').single()
  if (error) return err('db_error', error.message)
  return ok(data as CompetitorShot)
}

export async function updateShot(
  shotId: string,
  fields: { shot_on?: string | null; tag?: string | null; caption?: string; sort_order?: number },
): Promise<ServiceResult<{ id: string }>> {
  const patch: Record<string, unknown> = {}
  for (const k of ['shot_on', 'tag', 'caption', 'sort_order'] as const) {
    if (fields[k] !== undefined) patch[k] = fields[k]
  }
  if (Object.keys(patch).length === 0) return err('invalid_input', 'nothing to update')
  const db = createServerClient()
  const { error } = await db.from('competitor_shots').update(patch).eq('id', shotId)
  if (error) return err('db_error', error.message)
  return ok({ id: shotId })
}

export async function deleteShot(shotId: string): Promise<ServiceResult<{ id: string }>> {
  const db = createServerClient()
  const { error } = await db.from('competitor_shots').delete().eq('id', shotId)
  if (error) return err('db_error', error.message)
  return ok({ id: shotId })
}
