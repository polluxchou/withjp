import { createServerClient } from '@/lib/supabase/server'
import { COMPANY_ACCOUNT_BUYERS } from '@/lib/types'
import { categoryHasPeriod, dateToQuarter } from '@/lib/expenses/costs'
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

const VALID_CATEGORIES: ExpenseCategory[] = [
  'tangible_asset', 'salary', 'rent', 'travel', 'office_supplies', 'cloud_services',
]

const VALID_PAYMENT_METHODS: ExpensePaymentMethod[] = [
  'company_account', 'wechat_pay', 'alipay', 'bank_card',
]

const VALID_STATUSES: ExpensePaymentStatus[] = [
  'budgeted', 'ordered_unpaid', 'paid', 'refunded', 'partially_refunded',
]

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

// ── list ─────────────────────────────────────────────────────

export async function listExpenses(
  filters: ListExpensesFilters,
): Promise<ServiceResult<Expense[]>> {
  const db = createServerClient()

  let query = db
    .from('expenses')
    .select('*')
    .order('expense_date', { ascending: false })
    .order('created_at',   { ascending: false })

  const {
    q, category, payment_status, payment_method,
    user_name, buyer_name, date_from, date_to, period,
  } = filters

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

  const { data, error } = await query
  if (error) return err('db_error', error.message)
  return ok((data ?? []) as Expense[])
}

// ── create ──────────────────────────────────────────────────

export async function createExpense(
  input: CreateExpenseInput,
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

  const cat = (input.expense_category ?? 'tangible_asset') as ExpenseCategory
  if (!VALID_CATEGORIES.includes(cat)) {
    return err('invalid_input', 'Invalid expense_category')
  }
  if (!VALID_STATUSES.includes(input.payment_status)) {
    return err(
      'invalid_input',
      `payment_status must be one of: ${VALID_STATUSES.join(', ')}`,
    )
  }
  if (input.payment_method && !VALID_PAYMENT_METHODS.includes(input.payment_method)) {
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

  // Derive period from expense_date when the category requires one and no
  // explicit period was provided. Matches what ExpenseForm does client-side.
  const derivedPeriod = categoryHasPeriod(cat) && !input.period
    ? (dateToQuarter(input.expense_date) || null)
    : (input.period ?? null)

  const db = createServerClient()
  const { data, error } = await db
    .from('expenses')
    .insert({
      expense_category: cat,
      item_name:        input.item_name.trim(),
      unit_price:       Number(input.unit_price) || 0,
      quantity:         Number(input.quantity)   || 1,
      expense_date:     input.expense_date,
      location:         input.location   ?? '',
      purpose:          input.purpose    ?? '',
      period:           derivedPeriod,
      user_name:        input.user_name  ?? '',
      buyer_name:       input.buyer_name ?? '',
      payment_method:   input.payment_method ?? null,
      payment_status:   input.payment_status,
      notes:            input.notes ?? null,
    })
    .select('*')
    .single()

  if (error) return err('db_error', error.message)
  return ok(data as Expense)
}

// ── update ──────────────────────────────────────────────────

export async function updateExpense(
  id: string,
  patch: UpdateExpenseInput,
): Promise<ServiceResult<Expense>> {
  // Strip generated / immutable fields if a caller passed a full record.
  const {
    id:          _ignoredId,
    total_price: _ignoredTotal,
    created_at:  _ignoredCreated,
    ...updates
  } = patch as Record<string, unknown>
  void _ignoredId; void _ignoredTotal; void _ignoredCreated

  if ('payment_status' in updates) {
    if (!VALID_STATUSES.includes(updates.payment_status as ExpensePaymentStatus)) {
      return err(
        'invalid_input',
        `payment_status must be one of: ${VALID_STATUSES.join(', ')}`,
      )
    }
  }

  if (
    'payment_method' in updates &&
    updates.payment_method !== null &&
    !VALID_PAYMENT_METHODS.includes(updates.payment_method as ExpensePaymentMethod)
  ) {
    return err('invalid_input', 'Invalid payment_method')
  }

  if (updates.payment_method === 'company_account') {
    const buyer = updates.buyer_name as string | undefined
    if (!buyer || !(COMPANY_ACCOUNT_BUYERS as readonly string[]).includes(buyer)) {
      return err(
        'invalid_input',
        `公司公共账户的经办人必须为：${COMPANY_ACCOUNT_BUYERS.join('、')}`,
      )
    }
  }

  if ('item_name' in updates && !(updates.item_name as string | undefined)?.trim()) {
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
  return ok(data as Expense)
}

// ── delete ──────────────────────────────────────────────────

export async function deleteExpense(
  id: string,
): Promise<ServiceResult<{ id: string }>> {
  const db = createServerClient()
  const { error } = await db.from('expenses').delete().eq('id', id)
  if (error) return err('db_error', error.message)
  return ok({ id })
}

// ── HTTP mapping helper (for route handlers) ─────────────────

export function httpStatusForError(code: ServiceErrorCode): number {
  switch (code) {
    case 'invalid_input': return 400
    case 'not_found':     return 404
    case 'db_error':      return 500
  }
}
