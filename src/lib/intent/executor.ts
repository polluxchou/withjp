import { createServerClient } from '@/lib/supabase/server'
import {
  createExpense,
  updateExpense,
  deleteExpense,
  type ServiceError,
} from '@/lib/expenses/service'
import type { Expense } from '@/lib/types'
import { isWriteIntent, type ExpenseFilters, type ExpenseIntent, type ExpenseQueryIntent, type ExpenseWriteIntent } from './schema'
import { describeFilters, previewCreate, previewDelete, previewQuery, previewUpdate } from './preview'

// ── Public result types ───────────────────────────────────────

export type ExecuteResult =
  | {
      kind:             'pending'
      pendingActionId:  string
      op:               'create' | 'update' | 'delete'
      preview:          string
      targetId?:        string
      expiresAt:        string
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
  | { kind: 'error'; message: string }

export interface ExecuteContext {
  userId:  string
  channel: string             // 'web' | 'telegram' | ...
  rawText: string             // original user message (for logging)
  channelMessageId?: string
}

// ── Entry point ───────────────────────────────────────────────

export async function executeIntent(
  intent:  ExpenseIntent,
  ctx:     ExecuteContext,
): Promise<ExecuteResult> {
  if (intent.op === 'query')   return runQuery(intent, ctx)
  if (isWriteIntent(intent))   return stageWrite(intent, ctx)
  return { kind: 'error', message: 'Unsupported intent.op' }
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

  const intent = row.intent_json as ExpenseWriteIntent
  let appliedId = ''
  let err: ServiceError | null = null

  if (intent.op === 'create') {
    const r = await createExpense({
      ...intent.payload,
      payment_status: intent.payload.payment_status!,
      item_name:      intent.payload.item_name!,
      expense_date:   intent.payload.expense_date!,
    })
    if (r.error) err = r.error; else appliedId = r.data.id
  } else if (intent.op === 'update') {
    if (!row.target_id) {
      err = { code: 'invalid_input', message: 'pending action has no target_id' }
    } else {
      const r = await updateExpense(row.target_id, intent.patch)
      if (r.error) err = r.error; else appliedId = r.data.id
    }
  } else if (intent.op === 'delete') {
    if (!row.target_id) {
      err = { code: 'invalid_input', message: 'pending action has no target_id' }
    } else {
      const r = await deleteExpense(row.target_id)
      if (r.error) err = r.error; else appliedId = r.data.id
    }
  }

  if (err) {
    await db.from('pending_actions').update({
      status: 'failed',
      error_message: err.message,
    }).eq('id', row.id)
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

  let target: Expense | null = null
  let targetId: string | undefined

  if (intent.op === 'update' || intent.op === 'delete') {
    const lookup = await resolveTarget(intent.targetMatch)
    if (lookup.kind === 'none')      return { kind: 'clarification', message: '未找到匹配的支出记录。请放宽或修正筛选条件。' }
    if (lookup.kind === 'multiple')  return {
      kind:       'clarification',
      message:    `匹配到 ${lookup.candidates.length} 条记录，请增加筛选条件后重试。`,
      candidates: lookup.candidates,
    }
    target   = lookup.row
    targetId = lookup.row.id
  }

  let previewText: string
  if (intent.op === 'create')      previewText = previewCreate(intent)
  else if (intent.op === 'update') previewText = previewUpdate(intent, target!)
  else                             previewText = previewDelete(intent, target!)

  const { data: inserted, error } = await db
    .from('pending_actions')
    .insert({
      user_id:         ctx.userId,
      channel:         ctx.channel,
      channel_msg_id:  ctx.channelMessageId ?? null,
      entity:          'expense',
      op:              intent.op,
      intent_json:     intent,
      target_id:       targetId ?? null,
      preview_text:    previewText,
    })
    .select('id, expires_at')
    .single()

  if (error || !inserted) {
    return { kind: 'error', message: error?.message ?? 'failed to stage pending action' }
  }

  return {
    kind:            'pending',
    pendingActionId: inserted.id,
    op:              intent.op,
    preview:         previewText,
    targetId,
    expiresAt:       inserted.expires_at,
  }
}

type LookupResult =
  | { kind: 'one';      row: Expense }
  | { kind: 'multiple'; candidates: Expense[] }
  | { kind: 'none' }

async function resolveTarget(
  targetMatch: { id?: string; filters?: ExpenseFilters },
): Promise<LookupResult> {
  const db = createServerClient()

  if (targetMatch.id) {
    const { data } = await db.from('expenses').select('*').eq('id', targetMatch.id).maybeSingle()
    return data ? { kind: 'one', row: data as Expense } : { kind: 'none' }
  }

  const q = applyFilters(db.from('expenses').select('*'), targetMatch.filters ?? {})
    .order('expense_date', { ascending: false })
    .limit(11)

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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
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
