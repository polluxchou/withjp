import { createServerClient } from '@/lib/supabase/server'
import type { ActorProfile } from '@/lib/auth/actor'
import {
  MAX_VIEWS_PER_USER,
  canDeleteView,
  canEditView,
  canTogglePublic,
  canViewView,
  httpStatusForViewError,
} from '@/lib/finance-forecast/views-permissions'

export {
  MAX_VIEWS_PER_USER,
  canDeleteView,
  canEditView,
  canTogglePublic,
  canViewView,
  httpStatusForViewError,
}

export interface ForecastView {
  id:         string
  owner_id:   string | null
  owner_name: string | null
  name:       string
  note:       string
  is_public:  boolean
  created_at: string
  updated_at: string
}

type ServiceErrorCode = 'invalid_input' | 'db_error' | 'forbidden' | 'not_found' | 'quota_exceeded'

interface ServiceError {
  code:    ServiceErrorCode
  message: string
}

type ServiceResult<T> =
  | { data: T;    error: null }
  | { data: null; error: ServiceError }

const ok  = <T,>(data: T): ServiceResult<T> => ({ data, error: null })
const err = <T = never,>(code: ServiceErrorCode, message: string): ServiceResult<T> =>
  ({ data: null, error: { code, message } })

// ── DB-backed helpers ─────────────────────────────────────────

type ViewRow = {
  id:         string
  owner_id:   string | null
  name:       string
  note:       string
  is_public:  boolean
  created_at: string
  updated_at: string
  owner:      { id: string; name: string } | { id: string; name: string }[] | null
}

function normalize(row: ViewRow): ForecastView {
  // Supabase types the foreign-key embed as object | array | null depending on
  // schema introspection; collapse to "{id, name} | null" here.
  const ownerRel = Array.isArray(row.owner) ? row.owner[0] ?? null : row.owner
  return {
    id:         row.id,
    owner_id:   row.owner_id,
    owner_name: ownerRel?.name ?? null,
    name:       row.name,
    note:       row.note,
    is_public:  row.is_public,
    created_at: row.created_at,
    updated_at: row.updated_at,
  }
}

export async function listVisibleViews(actor: ActorProfile): Promise<ServiceResult<ForecastView[]>> {
  const db = createServerClient()
  let query = db
    .from('finance_forecast_views')
    .select('id, owner_id, name, note, is_public, created_at, updated_at, owner:owner_id (id, name)')
    .order('created_at', { ascending: true })

  // Admins see everything; everyone else sees own + public.
  if (!actor.is_admin) {
    query = query.or(`owner_id.eq.${actor.id},is_public.eq.true`)
  }

  const { data, error } = await query
  if (error) return err('db_error', error.message)
  return ok(((data ?? []) as unknown as ViewRow[]).map(normalize))
}

export async function getViewById(id: string): Promise<ServiceResult<ForecastView>> {
  const db = createServerClient()
  const { data, error } = await db
    .from('finance_forecast_views')
    .select('id, owner_id, name, note, is_public, created_at, updated_at, owner:owner_id (id, name)')
    .eq('id', id)
    .maybeSingle()

  if (error) return err('db_error', error.message)
  if (!data) return err('not_found', 'View not found')
  return ok(normalize(data as unknown as ViewRow))
}

export async function createView(
  actor: ActorProfile,
  input: { name: string; note?: string },
): Promise<ServiceResult<ForecastView>> {
  const name = (input.name ?? '').trim()
  if (name.length === 0 || name.length > 60) {
    return err('invalid_input', 'Name must be 1–60 chars')
  }
  const note = (input.note ?? '').trim()

  const db = createServerClient()

  // Quota check — owner-only views count, public-by-admin doesn't bypass.
  const { count, error: countError } = await db
    .from('finance_forecast_views')
    .select('id', { count: 'exact', head: true })
    .eq('owner_id', actor.id)
  if (countError) return err('db_error', countError.message)
  if ((count ?? 0) >= MAX_VIEWS_PER_USER) {
    return err('quota_exceeded', `You already own ${MAX_VIEWS_PER_USER} views — delete one before creating another.`)
  }

  const { data, error } = await db
    .from('finance_forecast_views')
    .insert({ owner_id: actor.id, name, note, is_public: false })
    .select('id, owner_id, name, note, is_public, created_at, updated_at, owner:owner_id (id, name)')
    .single()
  if (error) return err('db_error', error.message)
  return ok(normalize(data as unknown as ViewRow))
}

export async function updateView(
  actor: ActorProfile,
  id: string,
  patch: { name?: string; note?: string; is_public?: boolean },
): Promise<ServiceResult<ForecastView>> {
  const existing = await getViewById(id)
  if (existing.error) return existing as ServiceResult<ForecastView>
  const view = existing.data

  // Editing name/note requires owner-or-admin; flipping is_public is admin-only.
  if (patch.name !== undefined || patch.note !== undefined) {
    if (!canEditView(actor, view)) return err('forbidden', 'Not allowed to edit this view')
  }
  if (patch.is_public !== undefined && patch.is_public !== view.is_public) {
    if (!canTogglePublic(actor)) return err('forbidden', 'Only admins can change public visibility')
  }

  const updates: Record<string, unknown> = {}
  if (patch.name !== undefined) {
    const name = patch.name.trim()
    if (name.length === 0 || name.length > 60) return err('invalid_input', 'Name must be 1–60 chars')
    updates.name = name
  }
  if (patch.note !== undefined) {
    updates.note = patch.note.trim()
  }
  if (patch.is_public !== undefined) {
    updates.is_public = patch.is_public
  }
  if (Object.keys(updates).length === 0) return ok(view)

  const db = createServerClient()
  const { data, error } = await db
    .from('finance_forecast_views')
    .update(updates)
    .eq('id', id)
    .select('id, owner_id, name, note, is_public, created_at, updated_at, owner:owner_id (id, name)')
    .single()
  if (error) return err('db_error', error.message)
  return ok(normalize(data as unknown as ViewRow))
}

export async function deleteView(actor: ActorProfile, id: string): Promise<ServiceResult<{ id: string }>> {
  const existing = await getViewById(id)
  if (existing.error) return existing as ServiceResult<{ id: string }>
  if (!canDeleteView(actor, existing.data)) return err('forbidden', 'Not allowed to delete this view')

  const db = createServerClient()
  const { error } = await db.from('finance_forecast_views').delete().eq('id', id)
  if (error) return err('db_error', error.message)
  return ok({ id })
}

// Used by the forecast GET/PUT routes to validate access before
// loading or writing data for a specific view.
export async function assertViewAccess(
  actor: ActorProfile,
  viewId: string,
  intent: 'read' | 'write',
): Promise<ServiceResult<ForecastView>> {
  const res = await getViewById(viewId)
  if (res.error) return res
  const view = res.data
  if (intent === 'read'  && !canViewView(actor, view))  return err('forbidden', 'Cannot view this forecast view')
  if (intent === 'write' && !canEditView(actor, view))  return err('forbidden', 'Cannot edit this forecast view')
  return ok(view)
}
