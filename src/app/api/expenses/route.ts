import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { authGuard } from '@/lib/auth/guard'
import { COMPANY_ACCOUNT_BUYERS } from '@/lib/types'
import type { ExpenseCategory, ExpensePaymentMethod, ExpensePaymentStatus } from '@/lib/types'

const VALID_CATEGORIES: ExpenseCategory[] = [
  'tangible_asset', 'salary', 'rent', 'travel', 'office_supplies', 'cloud_services',
]

const VALID_PAYMENT_METHODS: ExpensePaymentMethod[] = [
  'company_account', 'wechat_pay', 'alipay', 'bank_card',
]

const VALID_STATUSES: ExpensePaymentStatus[] = [
  'budgeted', 'ordered_unpaid', 'paid', 'refunded', 'partially_refunded',
]

// GET /api/expenses
export async function GET(req: NextRequest) {
  const user = await authGuard()
  if (user instanceof NextResponse) return user

  const db     = createServerClient()
  const params = req.nextUrl.searchParams

  const q               = params.get('q')
  const category        = params.get('category')
  const payment_status  = params.get('payment_status')
  const payment_method  = params.get('payment_method')
  const user_name       = params.get('user_name')
  const buyer_name      = params.get('buyer_name')
  const date_from       = params.get('date_from')
  const date_to         = params.get('date_to')
  const period          = params.get('period')

  let query = db
    .from('expenses')
    .select('*')
    .order('expense_date', { ascending: false })
    .order('created_at',   { ascending: false })

  if (q) {
    query = query.or(
      `item_name.ilike.%${q}%,location.ilike.%${q}%,purpose.ilike.%${q}%,user_name.ilike.%${q}%,buyer_name.ilike.%${q}%`
    )
  }
  if (category)       query = query.eq('expense_category', category)
  if (payment_status) query = query.eq('payment_status', payment_status)
  if (payment_method) query = query.eq('payment_method', payment_method)
  if (user_name)      query = query.ilike('user_name', `%${user_name}%`)
  if (buyer_name)     query = query.ilike('buyer_name', `%${buyer_name}%`)
  if (date_from)      query = query.gte('expense_date', date_from)
  if (date_to)        query = query.lte('expense_date', date_to)
  if (period)         query = query.eq('period', period)

  const { data, error } = await query
  if (error) return NextResponse.json({ data: null, error: error.message }, { status: 500 })
  return NextResponse.json({ data, error: null })
}

// POST /api/expenses
export async function POST(req: NextRequest) {
  const user = await authGuard()
  if (user instanceof NextResponse) return user

  const db   = createServerClient()
  const body = await req.json()

  const {
    expense_category,
    item_name,
    unit_price,
    quantity,
    expense_date,
    location,
    purpose,
    period,
    user_name,
    buyer_name,
    payment_method,
    payment_status,
    notes,
  } = body

  // Required fields
  if (!item_name?.trim()) {
    return NextResponse.json({ data: null, error: 'item_name is required' }, { status: 400 })
  }
  if (!expense_date) {
    return NextResponse.json({ data: null, error: 'expense_date is required' }, { status: 400 })
  }
  if (!payment_status) {
    return NextResponse.json({ data: null, error: 'payment_status is required' }, { status: 400 })
  }

  // Enum validation
  const cat = (expense_category ?? 'tangible_asset') as ExpenseCategory
  if (!VALID_CATEGORIES.includes(cat)) {
    return NextResponse.json({ data: null, error: `Invalid expense_category` }, { status: 400 })
  }
  if (!VALID_STATUSES.includes(payment_status)) {
    return NextResponse.json(
      { data: null, error: `payment_status must be one of: ${VALID_STATUSES.join(', ')}` },
      { status: 400 }
    )
  }
  if (payment_method && !VALID_PAYMENT_METHODS.includes(payment_method)) {
    return NextResponse.json({ data: null, error: `Invalid payment_method` }, { status: 400 })
  }

  // Company account constraint
  if (payment_method === 'company_account') {
    if (!buyer_name || !(COMPANY_ACCOUNT_BUYERS as readonly string[]).includes(buyer_name)) {
      return NextResponse.json(
        {
          data: null,
          error: `公司公共账户的经办人必须为：${COMPANY_ACCOUNT_BUYERS.join('、')}`,
        },
        { status: 400 }
      )
    }
  }

  const { data, error } = await db
    .from('expenses')
    .insert({
      expense_category:      cat,
      item_name:             item_name.trim(),
      unit_price:            Number(unit_price)  || 0,
      quantity:              Number(quantity)    || 1,
      expense_date,
      location:              location    ?? '',
      purpose:               purpose     ?? '',
      period:                period      ?? null,
      user_name:             user_name   ?? '',
      buyer_name:            buyer_name  ?? '',
      payment_method:        payment_method ?? null,
      payment_status,
      notes:                 notes ?? null,
    })
    .select('*')
    .single()

  if (error) return NextResponse.json({ data: null, error: error.message }, { status: 500 })
  return NextResponse.json({ data, error: null }, { status: 201 })
}
