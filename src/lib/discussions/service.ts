// Service layer for the discussions system.
//
// Follows the same conventions as src/lib/finance-forecast/views.ts:
// returns ServiceResult<T>, talks to Supabase via createServerClient,
// and delegates permission decisions to the pure helpers in
// ./permissions.ts. Subject normalization is delegated to ./subject.ts.

import { createServerClient } from '@/lib/supabase/server'
import type { ActorProfile } from '@/lib/auth/actor'
import {
  canReadThread,
  canResolveThread,
  type Actor,
  type SavedViewLike,
} from './permissions.ts'
import { normalizeSubject } from './subject.ts'
import type {
  Message,
  ServiceKey,
  SubjectInput,
  Thread,
} from './types.ts'

export {
  canReadThread,
  canResolveThread,
}

// ── ServiceResult plumbing (matches finance-forecast/views.ts) ──

export type ServiceErrorCode =
  | 'invalid_input'
  | 'db_error'
  | 'forbidden'
  | 'not_found'
  | 'conflict'

export interface ServiceError {
  code:    ServiceErrorCode
  message: string
}

export type ServiceResult<T> =
  | { data: T;    error: null }
  | { data: null; error: ServiceError }

const ok  = <T,>(data: T): ServiceResult<T> => ({ data, error: null })
const err = <T = never,>(code: ServiceErrorCode, message: string): ServiceResult<T> =>
  ({ data: null, error: { code, message } })

export function httpStatusForDiscussionError(code: ServiceErrorCode): number {
  switch (code) {
    case 'invalid_input': return 400
    case 'forbidden':     return 403
    case 'not_found':     return 404
    case 'conflict':      return 409
    default:              return 500
  }
}

// ── Row → camelCase normalization ───────────────────────────────

type ThreadRow = {
  id:                  string
  topic_code:          string
  service_key:         string
  assigned_agent_id:   string
  subject_type:        'record' | 'filter' | 'saved_view'
  entity_type:         string
  entity_id:           string | null
  subject_hash:        string | null
  subject_payload:     Record<string, unknown>
  title:               string
  status:              'open' | 'resolved'
  created_by_user_id:  string
  resolved_by_user_id: string | null
  resolved_at:         string | null
  created_at:          string
  updated_at:          string
}

type MessageRow = {
  id:                string
  thread_id:         string
  parent_id:         string | null
  sender_type:       'user' | 'agent' | 'external'
  sender_user_id:    string | null
  sender_agent_id:   string | null
  channel:           'web' | 'email' | 'im'
  body:              string
  metadata:          Record<string, unknown>
  created_at:        string
  updated_at:        string
  deleted_at:        string | null
}

function normalizeThread(row: ThreadRow): Thread {
  return {
    id:               row.id,
    topicCode:        row.topic_code,
    serviceKey:       row.service_key as ServiceKey,
    assignedAgentId:  row.assigned_agent_id,
    subjectType:      row.subject_type,
    entityType:       row.entity_type,
    entityId:         row.entity_id,
    subjectHash:      row.subject_hash,
    subjectPayload:   row.subject_payload,
    title:            row.title,
    status:           row.status,
    createdByUserId:  row.created_by_user_id,
    resolvedByUserId: row.resolved_by_user_id,
    resolvedAt:       row.resolved_at,
    createdAt:        row.created_at,
    updatedAt:        row.updated_at,
  }
}

function normalizeMessage(row: MessageRow): Message {
  return {
    id:             row.id,
    threadId:       row.thread_id,
    parentId:       row.parent_id,
    senderType:     row.sender_type,
    senderUserId:   row.sender_user_id,
    senderAgentId:  row.sender_agent_id,
    channel:        row.channel,
    body:           row.body,
    metadata:       row.metadata,
    createdAt:      row.created_at,
    updatedAt:      row.updated_at,
    deletedAt:      row.deleted_at,
  }
}

const THREAD_COLUMNS =
  'id, topic_code, service_key, assigned_agent_id, subject_type, entity_type, ' +
  'entity_id, subject_hash, subject_payload, title, status, created_by_user_id, ' +
  'resolved_by_user_id, resolved_at, created_at, updated_at'

const MESSAGE_COLUMNS =
  'id, thread_id, parent_id, sender_type, sender_user_id, sender_agent_id, ' +
  'channel, body, metadata, created_at, updated_at, deleted_at'

function toActor(profile: ActorProfile): Actor {
  return { id: profile.id, is_admin: profile.is_admin }
}

// ── Saved-view loaders (used by canReadThread for saved_view subjects) ──

async function loadSavedView(
  db: ReturnType<typeof createServerClient>,
  entityType: string,
  entityId: string,
): Promise<SavedViewLike | null> {
  if (entityType === 'expense_saved_view') {
    const { data } = await db
      .from('expense_saved_views')
      .select('user_id')
      .eq('id', entityId)
      .maybeSingle()
    if (!data) return null
    return { ownerId: (data as { user_id: string | null }).user_id, isPublic: false }
  }
  if (entityType === 'finance_forecast_view') {
    const { data } = await db
      .from('finance_forecast_views')
      .select('owner_id, is_public')
      .eq('id', entityId)
      .maybeSingle()
    if (!data) return null
    const row = data as { owner_id: string | null; is_public: boolean }
    return { ownerId: row.owner_id, isPublic: row.is_public }
  }
  return null
}

async function gateReadThread(
  db: ReturnType<typeof createServerClient>,
  actor: ActorProfile,
  thread: Thread,
): Promise<boolean> {
  if (thread.subjectType !== 'saved_view') {
    return canReadThread(toActor(actor), thread)
  }
  if (!thread.entityId) return false
  const sv = await loadSavedView(db, thread.entityType, thread.entityId)
  if (!sv) return false
  return canReadThread(toActor(actor), thread, { savedView: sv })
}

// Batch variant for listThreads / resolveCounts.
// Loads each unique (entityType, entityId) pair once.
async function filterReadableThreads(
  db: ReturnType<typeof createServerClient>,
  actor: ActorProfile,
  threads: Thread[],
): Promise<Thread[]> {
  // Fast path: no saved_view subjects → no DB calls.
  const savedViewThreads = threads.filter(t => t.subjectType === 'saved_view' && t.entityId)
  if (savedViewThreads.length === 0) {
    return threads.filter(t => canReadThread(toActor(actor), t))
  }

  const cache = new Map<string, SavedViewLike | null>()
  const cacheKey = (entityType: string, entityId: string) => `${entityType}:${entityId}`

  // Group by entity_type so each table is hit at most once.
  const byType = new Map<string, Set<string>>()
  for (const t of savedViewThreads) {
    if (!t.entityId) continue
    const set = byType.get(t.entityType) ?? new Set<string>()
    set.add(t.entityId)
    byType.set(t.entityType, set)
  }

  for (const [entityType, ids] of Array.from(byType.entries())) {
    const idList = Array.from(ids)
    if (entityType === 'expense_saved_view') {
      const { data } = await db
        .from('expense_saved_views')
        .select('id, user_id')
        .in('id', idList)
      const rows = (data ?? []) as Array<{ id: string; user_id: string | null }>
      for (const r of rows) {
        cache.set(cacheKey(entityType, r.id), { ownerId: r.user_id, isPublic: false })
      }
    } else if (entityType === 'finance_forecast_view') {
      const { data } = await db
        .from('finance_forecast_views')
        .select('id, owner_id, is_public')
        .in('id', idList)
      const rows = (data ?? []) as Array<{ id: string; owner_id: string | null; is_public: boolean }>
      for (const r of rows) {
        cache.set(cacheKey(entityType, r.id), { ownerId: r.owner_id, isPublic: r.is_public })
      }
    }
    // Unknown entity types stay absent from the cache → fail closed below.
  }

  return threads.filter(t => {
    if (t.subjectType !== 'saved_view') return canReadThread(toActor(actor), t)
    if (!t.entityId) return false
    const sv = cache.get(cacheKey(t.entityType, t.entityId))
    if (sv === undefined || sv === null) return false
    return canReadThread(toActor(actor), t, { savedView: sv })
  })
}

// ── Public API ─────────────────────────────────────────────────

export interface CreateThreadInput {
  subject:      SubjectInput
  title:        string
  firstMessage: string
}

export async function createThread(
  actor: ActorProfile,
  input: CreateThreadInput,
): Promise<ServiceResult<{ thread: Thread; firstMessage: Message }>> {
  const title = (input.title ?? '').trim()
  const body  = (input.firstMessage ?? '').trim()
  if (title.length === 0 || title.length > 200) {
    return err('invalid_input', 'Title must be 1–200 chars')
  }
  if (body.length === 0 || body.length > 10000) {
    return err('invalid_input', 'First message must be 1–10000 chars')
  }

  const normalized = normalizeSubject(input.subject)
  const db = createServerClient()

  // Look up agent assignment for this service.
  const { data: agentRow, error: agentErr } = await db
    .from('service_agents')
    .select('agent_id, is_active')
    .eq('service_key', normalized.serviceKey)
    .maybeSingle()
  if (agentErr) return err('db_error', agentErr.message)
  if (!agentRow) return err('invalid_input', `Unknown service: ${normalized.serviceKey}`)
  const svc = agentRow as { agent_id: string; is_active: boolean }
  if (!svc.is_active) return err('invalid_input', `Service is inactive: ${normalized.serviceKey}`)

  // Allocate topic_code via the DB function (concurrency-safe).
  const { data: codeData, error: codeErr } =
    await db.rpc('next_discussion_topic_code', { p_service_key: normalized.serviceKey })
  if (codeErr) return err('db_error', codeErr.message)
  const topicCode = codeData as unknown as string
  if (!topicCode) return err('db_error', 'topic_code generator returned empty')

  // Insert thread.
  const { data: threadData, error: threadErr } = await db
    .from('discussion_threads')
    .insert({
      topic_code:         topicCode,
      service_key:        normalized.serviceKey,
      assigned_agent_id:  svc.agent_id,
      subject_type:       normalized.subjectType,
      entity_type:        normalized.entityType,
      entity_id:          normalized.entityId,
      subject_hash:       normalized.subjectHash,
      subject_payload:    normalized.subjectPayload,
      title,
      created_by_user_id: actor.id,
    })
    .select(THREAD_COLUMNS)
    .single()
  if (threadErr) return err('db_error', threadErr.message)
  const thread = normalizeThread(threadData as unknown as ThreadRow)

  // Insert first message. If this fails we leave the thread row in place;
  // a future cleanup can sweep threads with zero messages. The user-facing
  // remediation is to retry by posting a message into the thread.
  const { data: msgData, error: msgErr } = await db
    .from('discussion_messages')
    .insert({
      thread_id:      thread.id,
      sender_type:    'user',
      sender_user_id: actor.id,
      channel:        'web',
      body,
    })
    .select(MESSAGE_COLUMNS)
    .single()
  if (msgErr) return err('db_error', `Thread created but first message failed: ${msgErr.message}`)

  return ok({ thread, firstMessage: normalizeMessage(msgData as unknown as MessageRow) })
}

export async function getThread(
  actor: ActorProfile,
  id: string,
): Promise<ServiceResult<Thread>> {
  const db = createServerClient()
  const { data, error } = await db
    .from('discussion_threads')
    .select(THREAD_COLUMNS)
    .eq('id', id)
    .maybeSingle()
  if (error) return err('db_error', error.message)
  if (!data) return err('not_found', 'Thread not found')

  const thread = normalizeThread(data as unknown as ThreadRow)
  if (!(await gateReadThread(db, actor, thread))) {
    return err('forbidden', 'Not allowed to view this discussion')
  }
  return ok(thread)
}

export interface ListThreadsQuery {
  serviceKey:    ServiceKey
  entityType:    string
  // Provide one of: entityId (record/saved_view) or filters (filter subject).
  entityId?:     string
  filters?:      Record<string, unknown>
  // Subject payload bits needed to derive a stable hash for filter subjects.
  // For record/saved_view they're ignored.
  label?:        string
  route?:        string
  status?:       'open' | 'resolved'
}

export async function listThreads(
  actor: ActorProfile,
  q: ListThreadsQuery,
): Promise<ServiceResult<Thread[]>> {
  const db = createServerClient()
  let query = db
    .from('discussion_threads')
    .select(THREAD_COLUMNS)
    .eq('service_key', q.serviceKey)
    .eq('entity_type', q.entityType)

  if (q.entityId !== undefined) {
    query = query.eq('entity_id', q.entityId)
  } else if (q.filters !== undefined) {
    const normalized = normalizeSubject({
      subjectType: 'filter',
      serviceKey:  q.serviceKey,
      entityType:  q.entityType,
      filters:     q.filters,
      label:       q.label ?? '',
      route:       q.route ?? '',
    })
    if (!normalized.subjectHash) return err('invalid_input', 'Could not derive subject hash')
    query = query.eq('subject_hash', normalized.subjectHash)
  } else {
    return err('invalid_input', 'Either entityId or filters must be provided')
  }

  if (q.status) query = query.eq('status', q.status)
  query = query.order('created_at', { ascending: false })

  const { data, error } = await query
  if (error) return err('db_error', error.message)
  const threads = ((data ?? []) as unknown as ThreadRow[]).map(normalizeThread)

  const readable = await filterReadableThreads(db, actor, threads)
  return ok(readable)
}

export async function listMessages(
  actor: ActorProfile,
  threadId: string,
): Promise<ServiceResult<Message[]>> {
  const access = await getThread(actor, threadId)
  if (access.error) return access as ServiceResult<Message[]>

  const db = createServerClient()
  const { data, error } = await db
    .from('discussion_messages')
    .select(MESSAGE_COLUMNS)
    .eq('thread_id', threadId)
    .is('deleted_at', null)
    .order('created_at', { ascending: true })
  if (error) return err('db_error', error.message)
  return ok(((data ?? []) as unknown as MessageRow[]).map(normalizeMessage))
}

export interface CreateMessageInput {
  body:     string
  parentId?: string
}

export async function createMessage(
  actor: ActorProfile,
  threadId: string,
  input: CreateMessageInput,
): Promise<ServiceResult<Message>> {
  const body = (input.body ?? '').trim()
  if (body.length === 0 || body.length > 10000) {
    return err('invalid_input', 'Message must be 1–10000 chars')
  }

  const access = await getThread(actor, threadId)
  if (access.error) return access as ServiceResult<Message>
  if (access.data.status === 'resolved') {
    return err('conflict', 'Thread is resolved; cannot post new messages')
  }

  const db = createServerClient()
  const { data, error } = await db
    .from('discussion_messages')
    .insert({
      thread_id:      threadId,
      parent_id:      input.parentId ?? null,
      sender_type:    'user',
      sender_user_id: actor.id,
      channel:        'web',
      body,
    })
    .select(MESSAGE_COLUMNS)
    .single()
  if (error) return err('db_error', error.message)
  return ok(normalizeMessage(data as unknown as MessageRow))
}

export async function resolveThread(
  actor: ActorProfile,
  threadId: string,
): Promise<ServiceResult<Thread>> {
  const access = await getThread(actor, threadId)
  if (access.error) return access
  const thread = access.data

  if (!canResolveThread(toActor(actor), thread)) {
    return err('forbidden', 'Only the thread creator or an admin can resolve')
  }
  if (thread.status === 'resolved') return ok(thread) // idempotent

  const db = createServerClient()
  const { data, error } = await db
    .from('discussion_threads')
    .update({
      status:              'resolved',
      resolved_by_user_id: actor.id,
      resolved_at:         new Date().toISOString(),
    })
    .eq('id', threadId)
    .select(THREAD_COLUMNS)
    .single()
  if (error) return err('db_error', error.message)
  return ok(normalizeThread(data as unknown as ThreadRow))
}

// ── Batch counts for badge rendering ────────────────────────────

export interface CountSubject {
  // Stable client key so the UI can map results back without hashing.
  key:     string
  subject: SubjectInput
}

export interface CountResult {
  key:           string
  openCount:     number
  resolvedCount: number
}

export async function resolveCounts(
  actor: ActorProfile,
  subjects: CountSubject[],
): Promise<ServiceResult<CountResult[]>> {
  if (subjects.length === 0) return ok([])
  if (subjects.length > 500) return err('invalid_input', 'Too many subjects (max 500)')

  const db = createServerClient()

  // Build OR-of-AND filters per subject — but Supabase's PostgREST does
  // not let us express that cleanly across multiple tuples. Instead we
  // partition by (service_key, entity_type, subject_type) and run one
  // grouped query per partition, then filter client-side. For PR1's
  // workloads (expense list, ≤ 200 rows) the partition count is tiny.

  type BucketItem = { key: string; matchValue: string }
  type Bucket = {
    serviceKey:  ServiceKey
    entityType:  string
    subjectType: 'record' | 'filter' | 'saved_view'
    items:       BucketItem[]  // matchValue = entity_id or subject_hash
  }
  const buckets = new Map<string, Bucket>()

  for (const cs of subjects) {
    const n = normalizeSubject(cs.subject)
    const matchValue =
      n.subjectType === 'filter' ? (n.subjectHash ?? '') : (n.entityId ?? '')
    if (!matchValue) continue
    const bkey = `${n.serviceKey}|${n.entityType}|${n.subjectType}`
    const bucket: Bucket = buckets.get(bkey) ?? {
      serviceKey:  n.serviceKey,
      entityType:  n.entityType,
      subjectType: n.subjectType,
      items:       [],
    }
    bucket.items.push({ key: cs.key, matchValue })
    buckets.set(bkey, bucket)
  }

  type Accumulator = Map<string, { openCount: number; resolvedCount: number; thread?: Thread }>
  const acc: Accumulator = new Map()
  for (const cs of subjects) acc.set(cs.key, { openCount: 0, resolvedCount: 0 })

  for (const bucket of Array.from(buckets.values())) {
    const matchCol = bucket.subjectType === 'filter' ? 'subject_hash' : 'entity_id'
    const values   = bucket.items.map((i: BucketItem) => i.matchValue)
    const byValue  = new Map<string, string>(
      bucket.items.map((i: BucketItem) => [i.matchValue, i.key]),
    )

    const { data, error } = await db
      .from('discussion_threads')
      .select(THREAD_COLUMNS)
      .eq('service_key', bucket.serviceKey)
      .eq('entity_type', bucket.entityType)
      .eq('subject_type', bucket.subjectType)
      .in(matchCol, values)
    if (error) return err('db_error', error.message)

    const threads = ((data ?? []) as unknown as ThreadRow[]).map(normalizeThread)
    const readable = await filterReadableThreads(db, actor, threads)

    for (const t of readable) {
      const matchVal = bucket.subjectType === 'filter' ? (t.subjectHash ?? '') : (t.entityId ?? '')
      const key = byValue.get(matchVal)
      if (!key) continue
      const entry = acc.get(key)!
      if (t.status === 'open') entry.openCount++
      else if (t.status === 'resolved') entry.resolvedCount++
    }
  }

  return ok(
    subjects.map(cs => {
      const a = acc.get(cs.key)!
      return { key: cs.key, openCount: a.openCount, resolvedCount: a.resolvedCount }
    }),
  )
}
