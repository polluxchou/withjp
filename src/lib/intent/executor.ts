import { createServerClient } from '@/lib/supabase/server'
import {
  createExpense,
  updateExpense,
  deleteExpense,
  type ServiceError,
} from '@/lib/expenses/service'
import { createWorkTaskFromIntent } from '@/lib/work-tasks/service'
import { canModify, getActorProfile, type ActorProfile } from '@/lib/auth/actor'
import type { Expense } from '@/lib/types'
import {
  ExpenseIntentSchema,
  WorkTaskCreateIntentSchema,
  isWriteIntent,
  type ExpenseFilters,
  type ExpenseIntent,
  type ExpenseQueryIntent,
  type ExpenseWriteIntent,
  type WorkTaskCreateIntent,
} from './schema'
import type { ClassifiedKind } from './parser'
import { logIntentViolation } from './audit'
import { describeFilters, previewCreate, previewDelete, previewQuery, previewUpdate, previewWorkTaskCreate } from './preview'

// ── Defensive sanitiser for LLM-sourced write payloads ────────
//
// The HTTP entry strips control chars from the user's raw text before it ever
// reaches Gemini, but the model can still re-emit control chars (or smuggle
// `<<<system>>>`-style markers via Unicode tricks) inside the structured
// payload it returns. We strip C0/C1 controls from every free-text field that
// gets written back to the DB so:
//   1. The string can be safely shown elsewhere without rendering surprises.
//   2. If a later feature ever feeds these fields back into a downstream LLM
//      (e.g. an end-of-month natural-language summary), there are no
//      prompt-injection markers hiding in stored data — i.e. second-order
//      prompt injection has fewer surfaces.
// Length caps mirror typical DB-side reasonableness; anything longer is
// already pathological and almost certainly an attack payload.
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\x00-\x08\x0B-\x1F\x7F-\x9F]/g
const TEXT_FIELD_MAX = 500

function sanitiseText(v: unknown): string | undefined {
  if (typeof v !== 'string') return undefined
  const cleaned = v.replace(CONTROL_CHARS, ' ').trim().slice(0, TEXT_FIELD_MAX)
  return cleaned
}

function sanitisePayload<T extends Record<string, unknown>>(p: T): T {
  const out: Record<string, unknown> = { ...p }
  for (const k of ['item_name', 'location', 'purpose', 'user_name', 'buyer_name', 'notes']) {
    if (typeof out[k] === 'string') {
      out[k] = sanitiseText(out[k])
    }
  }
  return out as T
}

// ── Public result types ───────────────────────────────────────

export type ExecuteResult =
  | {
      kind:             'pending'
      pendingActionId:  string
      op:               'create' | 'update' | 'delete'
      preview:          string
      targetId?:        string
      expiresAt:        string
      // Surfaced for the UI Edit flow (prefill ExpenseForm without a round-trip).
      payload?:         import('./schema').ExpenseWritePayload   // create
      patch?:           import('./schema').ExpenseWritePayload   // update
      target?:          Expense                                  // update / delete
    }
  | {
      kind:        'query_result'
      breadcrumbs: string
      aggregate:   'sum_total' | 'count' | 'avg_total' | 'list'
      numerator:   { value: number; count: number }
      denominator?: { value: number; count: number; ratio: number }
      groups?:     { key: string; value: number; count: number }[]
      sample?:     Expense[]
      queryLogId?: string
    }
  | {
      kind:       'clarification'
      message:    string
      candidates?: Expense[]
    }
  | { kind: 'error'; code: ExecuteErrorCode; message: string }

export type ExecuteErrorCode =
  | 'parser_failed'      // Gemini could not produce a valid intent
  | 'executor_failed'    // staging or applying the intent failed
  | 'bad_request'        // empty body / invalid JSON
  | 'unknown'

export interface ExecuteContext {
  userId:  string
  channel: string             // 'web' | 'telegram' | ...
  rawText: string             // original user message (for logging)
  channelMessageId?: string
  // Set by the route from the parser's classifier output. Used to cross-check
  // the final intent.op so a compromised extractor cannot promote a "query"
  // into a write — see executeIntent below.
  classifiedAs?: ClassifiedKind
}

// ── Entry point ───────────────────────────────────────────────

export async function executeIntent(
  intent:  ExpenseIntent,
  ctx:     ExecuteContext,
): Promise<ExecuteResult> {
  // P1-G — Defense in depth: re-parse the intent with the same schema before
  // executing. Catches any caller that bypassed the parser or mutated the
  // object between parse and execute.
  const reparsed = ExpenseIntentSchema.safeParse(intent)
  if (!reparsed.success) {
    const reason = `intent rejected by schema: ${reparsed.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ')}`
    await logIntentViolation({
      userId:     ctx.userId,
      channel:    ctx.channel,
      stage:      'schema_refine',
      reason,
      rawText:    ctx.rawText,
      intentJson: intent,
    })
    return { kind: 'error', code: 'executor_failed', message: reason }
  }
  intent = reparsed.data

  // P0-D — Classifier/extractor cross-check. The extractor is told via prompt
  // that "this is a query, op must be query", but that is a soft constraint
  // the LLM can ignore. Reject hard at the code level.
  if (ctx.classifiedAs === 'query' && intent.op !== 'query') {
    const reason = '分类与抽取结果不一致：分类为查询但抽取为写操作，已拒绝。'
    await logIntentViolation({
      userId:     ctx.userId,
      channel:    ctx.channel,
      stage:      'cross_check',
      reason,
      rawText:    ctx.rawText,
      intentJson: intent,
    })
    return { kind: 'error', code: 'executor_failed', message: reason }
  }
  if (ctx.classifiedAs === 'write' && intent.op === 'query') {
    const reason = '分类与抽取结果不一致：分类为写操作但抽取为查询，已拒绝。'
    await logIntentViolation({
      userId:     ctx.userId,
      channel:    ctx.channel,
      stage:      'cross_check',
      reason,
      rawText:    ctx.rawText,
      intentJson: intent,
    })
    return { kind: 'error', code: 'executor_failed', message: reason }
  }

  if (intent.op === 'query')   return runQuery(intent, ctx)
  if (isWriteIntent(intent))   return stageWrite(intent, ctx)
  return { kind: 'error', code: 'unknown', message: 'Unsupported intent.op' }
}

// ── Apply / cancel a pending action ───────────────────────────

export type ApplyResult =
  | { kind: 'applied';   appliedId: string }
  | { kind: 'noop';      reason: 'not_pending' | 'expired' | 'not_owner' }
  | { kind: 'error';     message: string }

export async function applyPendingAction(
  pendingActionId: string,
  userId:          string,
): Promise<ApplyResult> {
  const db = createServerClient()

  const { data: row, error } = await db
    .from('pending_actions')
    .select('*')
    .eq('id', pendingActionId)
    .single()

  if (error || !row) return { kind: 'error', message: error?.message ?? 'pending action not found' }
  if (row.user_id !== userId) return { kind: 'noop', reason: 'not_owner' }
  if (row.status !== 'pending') return { kind: 'noop', reason: 'not_pending' }
  if (new Date(row.expires_at).getTime() < Date.now()) {
    await db.from('pending_actions').update({ status: 'expired' }).eq('id', row.id)
    return { kind: 'noop', reason: 'expired' }
  }

  // P0-B — Load actor and forward to service so canModify() is enforced.
  // Without this, any logged-in user could update/delete records they don't own
  // by staging an intent against someone else's row.
  const actor = await getActorProfile(userId)
  if (!actor) {
    return { kind: 'error', message: 'actor profile not found' }
  }

  let appliedId = ''
  let err: ServiceError | null = null

  if (row.entity === 'work_task') {
    const intent = row.intent_json as WorkTaskCreateIntent
    const r = await createWorkTaskFromIntent(intent.payload, actor.id)
    if (r.error) err = r.error; else appliedId = r.data.id
  } else {
    // Default: expense
    const intent = row.intent_json as ExpenseWriteIntent
    if (intent.op === 'create') {
      const r = await createExpense({
        ...intent.payload,
        payment_status: intent.payload.payment_status!,
        item_name:      intent.payload.item_name!,
        expense_date:   intent.payload.expense_date!,
      }, actor.id)
      if (r.error) err = r.error; else appliedId = r.data.id
    } else if (intent.op === 'update') {
      if (!row.target_id) {
        err = { code: 'invalid_input', message: 'pending action has no target_id' }
      } else {
        const r = await updateExpense(row.target_id, intent.patch, actor)
        if (r.error) err = r.error; else appliedId = r.data.id
      }
    } else if (intent.op === 'delete') {
      if (!row.target_id) {
        err = { code: 'invalid_input', message: 'pending action has no target_id' }
      } else {
        const r = await deleteExpense(row.target_id, actor)
        if (r.error) err = r.error; else appliedId = r.data.id
      }
    }
  }

  if (err) {
    await db.from('pending_actions').update({
      status: 'failed',
      error_message: err.message,
    }).eq('id', row.id)
    // Forbidden at apply time means the row's owner changed between stage and
    // apply (a TOCTOU race), or stage-time pre-filter was bypassed. Audit it.
    if (err.code === 'forbidden') {
      await logIntentViolation({
        userId:     userId,
        stage:      'authz_apply',
        reason:     err.message,
        intentJson: intent,
      })
    }
    return { kind: 'error', message: err.message }
  }

  await db.from('pending_actions').update({
    status:       'applied',
    confirmed_at: new Date().toISOString(),
    applied_at:   new Date().toISOString(),
    applied_id:   appliedId,
  }).eq('id', row.id)

  return { kind: 'applied', appliedId }
}

export async function cancelPendingAction(
  pendingActionId: string,
  userId:          string,
): Promise<ApplyResult> {
  const db = createServerClient()
  const { data: row, error } = await db
    .from('pending_actions')
    .select('user_id, status')
    .eq('id', pendingActionId)
    .single()
  if (error || !row) return { kind: 'error', message: error?.message ?? 'not found' }
  if (row.user_id !== userId) return { kind: 'noop', reason: 'not_owner' }
  if (row.status !== 'pending') return { kind: 'noop', reason: 'not_pending' }
  await db.from('pending_actions').update({ status: 'cancelled' }).eq('id', pendingActionId)
  return { kind: 'applied', appliedId: pendingActionId }
}

// ── Write staging ─────────────────────────────────────────────

async function stageWrite(
  intent: ExpenseWriteIntent,
  ctx:    ExecuteContext,
): Promise<ExecuteResult> {
  const db = createServerClient()

  // P0-B/C — Actor is required to scope target lookup to records the user is
  // allowed to modify. Non-admins should not see other users' rows surface as
  // edit/delete candidates (and certainly should not be able to stage them).
  const actor = await getActorProfile(ctx.userId)
  if (!actor) {
    return { kind: 'error', code: 'executor_failed', message: 'actor profile not found' }
  }

  // L5-2 — Strip control chars from any LLM-emitted free-text field before
  // we persist the intent. See sanitisePayload() above.
  let sanitised: ExpenseWriteIntent = intent
  if (sanitised.op === 'create') {
    sanitised = { ...sanitised, payload: sanitisePayload(sanitised.payload) }
  } else if (sanitised.op === 'update') {
    sanitised = { ...sanitised, patch:   sanitisePayload(sanitised.patch)   }
  }

  let target: Expense | null = null
  let targetId: string | undefined

  if (sanitised.op === 'update' || sanitised.op === 'delete') {
    const lookup = await resolveTarget(sanitised.targetMatch, actor)
    if (lookup.kind === 'none')          return { kind: 'clarification', message: '未找到你有权限修改的匹配记录。请放宽或修正筛选条件。' }
    if (lookup.kind === 'forbidden') {
      await logIntentViolation({
        userId:     ctx.userId,
        channel:    ctx.channel,
        stage:      'authz_stage',
        reason:     `${sanitised.op} blocked: target not owned by actor`,
        rawText:    ctx.rawText,
        intentJson: sanitised,
      })
      return { kind: 'clarification', message: '匹配到的记录不是你创建的，无权修改。' }
    }
    if (lookup.kind === 'multiple')      return {
      kind:       'clarification',
      message:    `匹配到 ${lookup.candidates.length} 条记录，请增加筛选条件后重试。`,
      candidates: lookup.candidates,
    }
    target   = lookup.row
    targetId = lookup.row.id
  }

  let previewText: string
  if (sanitised.op === 'create')      previewText = previewCreate(sanitised)
  else if (sanitised.op === 'update') previewText = previewUpdate(sanitised, target!)
  else                                previewText = previewDelete(sanitised, target!)

  const { data: inserted, error } = await db
    .from('pending_actions')
    .insert({
      user_id:         ctx.userId,
      channel:         ctx.channel,
      channel_msg_id:  ctx.channelMessageId ?? null,
      entity:          'expense',
      op:              sanitised.op,
      intent_json:     sanitised,
      target_id:       targetId ?? null,
      preview_text:    previewText,
    })
    .select('id, expires_at')
    .single()

  if (error || !inserted) {
    return { kind: 'error', code: 'executor_failed', message: error?.message ?? 'failed to stage pending action' }
  }

  return {
    kind:            'pending',
    pendingActionId: inserted.id,
    op:              sanitised.op,
    preview:         previewText,
    targetId,
    expiresAt:       inserted.expires_at,
    payload:         sanitised.op === 'create' ? sanitised.payload : undefined,
    patch:           sanitised.op === 'update' ? sanitised.patch   : undefined,
    target:          target ?? undefined,
  }
}

type LookupResult =
  | { kind: 'one';       row: Expense }
  | { kind: 'multiple';  candidates: Expense[] }
  | { kind: 'none' }
  | { kind: 'forbidden' }  // matched a row, but actor isn't allowed to modify it

async function resolveTarget(
  targetMatch: { id?: string; filters?: ExpenseFilters },
  actor:       ActorProfile,
): Promise<LookupResult> {
  const db = createServerClient()

  if (targetMatch.id) {
    const { data } = await db.from('expenses').select('*').eq('id', targetMatch.id).maybeSingle()
    if (!data) return { kind: 'none' }
    if (!canModify(actor, (data as Expense).created_by_user_id ?? null)) {
      return { kind: 'forbidden' }
    }
    return { kind: 'one', row: data as Expense }
  }

  let q = applyFilters(db.from('expenses').select('*'), targetMatch.filters ?? {})
  // P0-C — Non-admins can only target rows they created. Service-layer
  // canModify() is the authoritative gate, but pre-filtering here keeps the
  // candidate list honest so users don't see preview/clarification UI built
  // from records they can't actually touch.
  if (!actor.is_admin) {
    q = q.eq('created_by_user_id', actor.id)
  }
  q = q.order('expense_date', { ascending: false }).limit(11)

  const { data } = await q
  const rows = (data ?? []) as Expense[]
  if (rows.length === 0) return { kind: 'none' }
  if (rows.length === 1) return { kind: 'one', row: rows[0] }
  return { kind: 'multiple', candidates: rows.slice(0, 10) }
}

// ── Query execution ───────────────────────────────────────────

async function runQuery(
  intent: ExpenseQueryIntent,
  ctx:    ExecuteContext,
): Promise<ExecuteResult> {
  const t0 = Date.now()
  const db = createServerClient()

  // For now: fetch matching rows and aggregate in app code. Cheap given
  // typical row counts, and avoids RPC dependency.
  const numeratorRows = await fetchAllMatching(intent.filters)

  const numeratorAgg = aggregate(numeratorRows, intent.aggregate)

  let denominator: { value: number; count: number; ratio: number } | undefined
  if (intent.ratioOf) {
    const denomRows = await fetchAllMatching(intent.ratioOf.filters)
    const denomAgg  = aggregate(denomRows, intent.aggregate)
    const ratio = denomAgg.value === 0 ? 0 : numeratorAgg.value / denomAgg.value
    denominator = { value: denomAgg.value, count: denomAgg.count, ratio }
  }

  let groups: { key: string; value: number; count: number }[] | undefined
  if (intent.groupBy) {
    const buckets = new Map<string, { value: number; count: number }>()
    for (const r of numeratorRows) {
      const key = String((r as unknown as Record<string, unknown>)[intent.groupBy] ?? '—')
      const cur = buckets.get(key) ?? { value: 0, count: 0 }
      cur.value += intent.aggregate === 'count' ? 1 : Number(r.total_price)
      cur.count += 1
      buckets.set(key, cur)
    }
    groups = Array.from(buckets.entries())
      .map(([key, v]) => ({ key, ...v }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 50)
  }

  const sample = intent.aggregate === 'list'
    ? numeratorRows.slice(0, intent.limit ?? 50)
    : undefined

  const breadcrumbs = previewQuery(intent) || describeFilters(intent.filters)

  // Log
  const result = {
    numerator:   { value: numeratorAgg.value, count: numeratorAgg.count },
    denominator,
    groups,
    sampleCount: sample?.length,
  }
  const { data: logged } = await db
    .from('query_log')
    .insert({
      user_id:     ctx.userId,
      channel:     ctx.channel,
      entity:      'expense',
      raw_text:    ctx.rawText,
      intent_json: intent,
      result_json: result,
      breadcrumbs,
      duration_ms: Date.now() - t0,
    })
    .select('id')
    .single()

  return {
    kind:        'query_result',
    breadcrumbs,
    aggregate:   intent.aggregate,
    numerator:   { value: numeratorAgg.value, count: numeratorAgg.count },
    denominator,
    groups,
    sample,
    queryLogId:  logged?.id,
  }
}

async function fetchAllMatching(filters: ExpenseFilters): Promise<Expense[]> {
  const db = createServerClient()
  const { data } = await applyFilters(db.from('expenses').select('*'), filters)
    .order('expense_date', { ascending: false })
    .limit(5000)
  return (data ?? []) as Expense[]
}

function aggregate(
  rows: Expense[],
  kind: ExpenseQueryIntent['aggregate'],
): { value: number; count: number } {
  const count = rows.length
  if (kind === 'count') return { value: count, count }
  const sum = rows.reduce((acc, r) => acc + Number(r.total_price), 0)
  if (kind === 'sum_total') return { value: sum,                 count }
  if (kind === 'avg_total') return { value: count ? sum / count : 0, count }
  return { value: sum, count } // 'list' — still expose sum for context
}

// ── Filter application (shared by query + targetMatch) ────────
//
// `q` is a PostgrestFilterBuilder; we keep the type loose (`any`) here
// because supabase-js's filter builder generics are awkward to thread
// through a helper. All call sites pass `db.from('expenses').select(...)`.

// eslint-disable-next-line
function applyFilters(q: any, f: ExpenseFilters): any {
  let query = q
  if (f.expense_category?.length) query = query.in('expense_category', f.expense_category)
  if (f.period_in?.length)        query = query.in('period',           f.period_in)
  if (f.payment_status?.length)   query = query.in('payment_status',   f.payment_status)
  if (f.payment_method?.length)   query = query.in('payment_method',   f.payment_method)
  if (f.date_range?.from)         query = query.gte('expense_date', f.date_range.from)
  if (f.date_range?.to)           query = query.lte('expense_date', f.date_range.to)
  if (f.user_name_contains)       query = query.ilike('user_name',  `%${f.user_name_contains}%`)
  if (f.buyer_name_contains)      query = query.ilike('buyer_name', `%${f.buyer_name_contains}%`)
  if (f.item_name_contains)       query = query.ilike('item_name',  `%${f.item_name_contains}%`)
  if (f.purpose_contains)         query = query.ilike('purpose',    `%${f.purpose_contains}%`)
  return query
}

// ── Work task intent execution ────────────────────────────────

export async function executeWorkTaskIntent(
  intent: WorkTaskCreateIntent,
  ctx:    ExecuteContext,
): Promise<ExecuteResult> {
  // Re-validate at executor boundary (same pattern as expense executor)
  const reparsed = WorkTaskCreateIntentSchema.safeParse(intent)
  if (!reparsed.success) {
    const reason = `work_task intent rejected by schema: ${reparsed.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ')}`
    await logIntentViolation({ userId: ctx.userId, channel: ctx.channel, stage: 'schema_refine', reason, rawText: ctx.rawText, intentJson: intent })
    return { kind: 'error', code: 'executor_failed', message: reason }
  }

  const sanitised: WorkTaskCreateIntent = {
    ...reparsed.data,
    payload: {
      ...reparsed.data.payload,
      title:               sanitiseText(reparsed.data.payload.title)               ?? reparsed.data.payload.title,
      completion_criteria: sanitiseText(reparsed.data.payload.completion_criteria) ?? null,
      notes:               sanitiseText(reparsed.data.payload.notes)               ?? null,
    },
  }

  const previewText = previewWorkTaskCreate(sanitised)
  const db = createServerClient()

  const { data: inserted, error } = await db
    .from('pending_actions')
    .insert({
      user_id:        ctx.userId,
      channel:        ctx.channel,
      channel_msg_id: ctx.channelMessageId ?? null,
      entity:         'work_task',
      op:             'create',
      intent_json:    sanitised,
      target_id:      null,
      preview_text:   previewText,
    })
    .select('id, expires_at')
    .single()

  if (error || !inserted) {
    return { kind: 'error', code: 'executor_failed', message: error?.message ?? 'failed to stage work task' }
  }

  return {
    kind:            'pending',
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    pendingActionId: (inserted as any).id,
    op:              'create',
    preview:         previewText,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expiresAt:       (inserted as any).expires_at,
  }
}
