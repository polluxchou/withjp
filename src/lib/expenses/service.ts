import { createServerClient } from '@/lib/supabase/server'
import { COMPANY_ACCOUNT_BUYERS } from '@/lib/types'
import { fetchAllRows } from '@/lib/supabase/fetchAll'
import { categoryHasPeriod, dateToQuarter, distinctExpenseMonths } from '@/lib/expenses/costs'
import { canModify } from '@/lib/auth/actor'
import { isDbEnum, optionalDbEnum } from '@/lib/supabase/enums'
import type { TablesUpdate } from '@/lib/supabase/database.types'
import { EXPENSE_PAYMENT_STATUSES, isExpensePaymentStatus, toExpense } from '@/lib/expenses/row'
import type { ActorProfile } from '@/lib/auth/actor'
import type {
  Expense,
  ExpenseCategory,
  ExpensePaymentMethod,
  ExpensePaymentStatus,
} from '@/lib/types'

// ── Result type ──────────────────────────────────────────────
// Service functions never throw for validation/not-found; they return a
// tagged result so HTTP routes can map codes to status, and the intent
// executor can map codes to user-facing messages.

export type ServiceErrorCode =
  | 'invalid_input'
  | 'not_found'
  | 'forbidden'
  | 'db_error'

export interface ServiceError {
  code:    ServiceErrorCode
  message: string
}

export type ServiceResult<T> =
  | { data: T;    error: null }
  | { data: null; error: ServiceError }

const ok   = <T,>(data: T):    ServiceResult<T> => ({ data, error: null })
const err  = <T = never,>(code: ServiceErrorCode, message: string): ServiceResult<T> =>
  ({ data: null, error: { code, message } })

// ── Constants ────────────────────────────────────────────────

// 两个 enum 的取值来自生成的数据库类型（isDbEnum）；payment_status 是 text + check，见 row.ts。
const VALID_STATUSES = EXPENSE_PAYMENT_STATUSES

// ── Filters / Inputs ─────────────────────────────────────────

export interface ListExpensesFilters {
  q?:              string | null
  category?:       string | null
  payment_status?: string | null
  payment_method?: string | null
  user_name?:      string | null
  buyer_name?:     string | null
  date_from?:      string | null
  date_to?:        string | null
  period?:         string | null
}

export interface CreateExpenseInput {
  expense_category?: ExpenseCategory
  item_name:         string
  unit_price?:       number | string
  quantity?:         number | string
  expense_date:      string
  location?:         string
  purpose?:          string
  period?:           string | null
  user_name?:        string
  buyer_name?:       string
  payment_method?:   ExpensePaymentMethod | null
  payment_status:    ExpensePaymentStatus
  notes?:            string | null
}

export type UpdateExpenseInput = Partial<
  Omit<Expense, 'id' | 'total_price' | 'created_at' | 'updated_at'>
> & {
  // Allow the legacy field to be explicitly cleared via update.
  payment_method_legacy?: string | null
}

// updateExpense 写库的列。created_by_user_id 不在内：归属不随编辑改变。
const UPDATABLE_KEYS = [
  'expense_category', 'item_name', 'unit_price', 'quantity', 'expense_date', 'location',
  'purpose', 'period', 'user_name', 'buyer_name', 'payment_method', 'payment_method_legacy',
  'payment_status', 'notes',
] as const satisfies readonly (keyof UpdateExpenseInput & keyof TablesUpdate<'expenses'>)[]

// ── list ─────────────────────────────────────────────────────

export async function listExpenses(
  filters: ListExpensesFilters,
): Promise<ServiceResult<Expense[]>> {
  const db = createServerClient()

  const {
    q, payment_status,
    user_name, buyer_name, date_from, date_to, period,
  } = filters
  const category = optionalDbEnum('expense_category', filters.category)
  if (category === undefined) return err('invalid_input', 'Invalid category')
  const payment_method = optionalDbEnum('expense_payment_method', filters.payment_method)
  if (payment_method === undefined) return err('invalid_input', 'Invalid payment_method')

  // 分页取全：单次响应最多 1000 行且静默截断。回调每页重建一次查询（builder 不能复用）。
  // 排序与原来一致，末尾加 id 兜底——同一天同一 created_at 的行否则可能在两页之间漏掉或重复。
  const { data, error } = await fetchAllRows((from, to) => {
    let query = db.from('expenses').select('*')
    if (q) {
      query = query.or(
        `item_name.ilike.%${q}%,location.ilike.%${q}%,purpose.ilike.%${q}%,user_name.ilike.%${q}%,buyer_name.ilike.%${q}%`,
      )
    }
    if (category)       query = query.eq('expense_category', category)
    if (payment_status) query = query.eq('payment_status',   payment_status)
    if (payment_method) query = query.eq('payment_method',   payment_method)
    if (user_name)      query = query.ilike('user_name',  `%${user_name}%`)
    if (buyer_name)     query = query.ilike('buyer_name', `%${buyer_name}%`)
    if (date_from)      query = query.gte('expense_date', date_from)
    if (date_to)        query = query.lte('expense_date', date_to)
    if (period)         query = query.eq('period', period)
    return query
      .order('expense_date', { ascending: false })
      .order('created_at',   { ascending: false })
      .order('id',           { ascending: true })
      .range(from, to)
  })
  if (error) return err('db_error', error.message)
  return ok((data ?? []).map(toExpense))
}

// ── months ───────────────────────────────────────────────────

/**
 * 有支出记录的月份（YYYY-MM，新的在前），给支出页的月份选择器用。
 * 只取 expense_date 一列，不为了算月份把整表的全部字段搬到浏览器。
 */
export async function listExpenseMonths(): Promise<ServiceResult<string[]>> {
  const db = createServerClient()
  const { data, error } = await fetchAllRows((from, to) => db.from('expenses').select('expense_date')
    .order('id', { ascending: true }).range(from, to))
  if (error) return err('db_error', error.message)
  return ok(distinctExpenseMonths((data ?? []).map((r) => r.expense_date as string | null)))
}

// ── create ──────────────────────────────────────────────────

export async function createExpense(
  input: CreateExpenseInput,
  actorId?: string,
): Promise<ServiceResult<Expense>> {
  if (!input.item_name?.trim()) {
    return err('invalid_input', 'item_name is required')
  }
  if (!input.expense_date) {
    return err('invalid_input', 'expense_date is required')
  }
  if (!input.payment_status) {
    return err('invalid_input', 'payment_status is required')
  }

  const cat: unknown = input.expense_category ?? 'tangible_asset'
  if (!isDbEnum('expense_category', cat)) {
    return err('invalid_input', 'Invalid expense_category')
  }
  if (!VALID_STATUSES.includes(input.payment_status)) {
    return err(
      'invalid_input',
      `payment_status must be one of: ${VALID_STATUSES.join(', ')}`,
    )
  }
  if (input.payment_method && !isDbEnum('expense_payment_method', input.payment_method)) {
    return err('invalid_input', 'Invalid payment_method')
  }

  if (input.payment_method === 'company_account') {
    const buyer = input.buyer_name
    if (!buyer || !(COMPANY_ACCOUNT_BUYERS as readonly string[]).includes(buyer)) {
      return err(
        'invalid_input',
        `公司公共账户的经办人必须为：${COMPANY_ACCOUNT_BUYERS.join('、')}`,
      )
    }
  }

  // Derive period from expense_date for any category when no explicit period
  // was provided. Matches what ExpenseForm does client-side.
  const derivedPeriod = categoryHasPeriod(cat) && !input.period
    ? (dateToQuarter(input.expense_date) || null)
    : (input.period ?? null)

  const db = createServerClient()
  const { data, error } = await db
    .from('expenses')
    .insert({
      expense_category:    cat,
      item_name:           input.item_name.trim(),
      unit_price:          Number(input.unit_price) || 0,
      quantity:            Number(input.quantity)   || 1,
      expense_date:        input.expense_date,
      location:            input.location   ?? '',
      purpose:             input.purpose    ?? '',
      period:              derivedPeriod,
      user_name:           input.user_name  ?? '',
      buyer_name:          input.buyer_name ?? '',
      payment_method:      input.payment_method ?? null,
      payment_status:      input.payment_status,
      notes:               input.notes ?? null,
      created_by_user_id:  actorId ?? null,
    })
    .select('*')
    .single()

  if (error) return err('db_error', error.message)
  return ok(toExpense(data))
}

// ── update ──────────────────────────────────────────────────

export async function updateExpense(
  id: string,
  patch: UpdateExpenseInput,
  actor?: ActorProfile | null,
): Promise<ServiceResult<Expense>> {
  // 只收可编辑列（白名单）。以前是黑名单剔除 id / total_price / created_at /
  // created_by_user_id，其余键原样写库；路由把请求体直接传进来，黑名单挡不住新列。
  const updates: TablesUpdate<'expenses'> = {}
  for (const key of UPDATABLE_KEYS) {
    if (key in patch) Object.assign(updates, { [key]: patch[key] })
  }

  if (actor !== undefined) {
    const db2 = createServerClient()
    const { data: existing } = await db2
      .from('expenses')
      .select('created_by_user_id')
      .eq('id', id)
      .single()
    if (!canModify(actor, existing?.created_by_user_id ?? null)) {
      return err('forbidden', '权限不足：只能编辑自己创建的条目')
    }
  }

  if ('payment_status' in updates) {
    if (!isExpensePaymentStatus(updates.payment_status)) {
      return err(
        'invalid_input',
        `payment_status must be one of: ${VALID_STATUSES.join(', ')}`,
      )
    }
  }

  if (
    'payment_method' in updates &&
    updates.payment_method !== null &&
    !isDbEnum('expense_payment_method', updates.payment_method)
  ) {
    return err('invalid_input', 'Invalid payment_method')
  }

  if (updates.payment_method === 'company_account') {
    const buyer = updates.buyer_name
    if (!buyer || !(COMPANY_ACCOUNT_BUYERS as readonly string[]).includes(buyer)) {
      return err(
        'invalid_input',
        `公司公共账户的经办人必须为：${COMPANY_ACCOUNT_BUYERS.join('、')}`,
      )
    }
  }

  if ('item_name' in updates && !updates.item_name?.trim()) {
    return err('invalid_input', 'item_name cannot be empty')
  }
  if ('expense_date' in updates && !updates.expense_date) {
    return err('invalid_input', 'expense_date cannot be empty')
  }

  // When user sets a new payment_method, clear the legacy field.
  if ('payment_method' in updates && updates.payment_method) {
    updates.payment_method_legacy = null
  }

  const db = createServerClient()
  const { data, error } = await db
    .from('expenses')
    .update(updates)
    .eq('id', id)
    .select('*')
    .single()

  if (error) {
    // PostgREST returns PGRST116 when .single() finds 0 rows.
    if (error.code === 'PGRST116') return err('not_found', 'expense not found')
    return err('db_error', error.message)
  }
  return ok(toExpense(data))
}

// ── delete ──────────────────────────────────────────────────

export async function deleteExpense(
  id: string,
  actor?: ActorProfile | null,
): Promise<ServiceResult<{ id: string }>> {
  const db = createServerClient()

  if (actor !== undefined) {
    const { data: existing } = await db
      .from('expenses')
      .select('created_by_user_id')
      .eq('id', id)
      .single()
    if (!canModify(actor, existing?.created_by_user_id ?? null)) {
      return err('forbidden', '权限不足：只能删除自己创建的条目')
    }
  }

  const { error } = await db.from('expenses').delete().eq('id', id)
  if (error) {
    // 23503 = 外键冲突：该支出仍被物品（items）以 RESTRICT 引用。
    if (error.code === '23503') {
      return err('invalid_input', '该支出仍有关联物品，请先在物品管理中改挂或删除相关物品')
    }
    return err('db_error', error.message)
  }
  return ok({ id })
}

// ── HTTP mapping helper (for route handlers) ─────────────────

export function httpStatusForError(code: ServiceErrorCode): number {
  switch (code) {
    case 'invalid_input': return 400
    case 'forbidden':     return 403
    case 'not_found':     return 404
    case 'db_error':      return 500
  }
}
