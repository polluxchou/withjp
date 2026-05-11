import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { authGuard } from '@/lib/auth/guard'
import { COMPANY_ACCOUNT_BUYERS } from '@/lib/types'
import type { ExpensePaymentMethod, ExpensePaymentStatus } from '@/lib/types'

type Params = { params: { id: string } }

const VALID_STATUSES: ExpensePaymentStatus[] = [
  'budgeted', 'ordered_unpaid', 'paid', 'refunded', 'partially_refunded',
]

const VALID_PAYMENT_METHODS: ExpensePaymentMethod[] = [
  'company_account', 'wechat_pay', 'alipay', 'bank_card',
]

// PATCH /api/expenses/:id
export async function PATCH(req: NextRequest, { params }: Params) {
  const user = await authGuard()
  if (user instanceof NextResponse) return user

  const db   = createServerClient()
  const body = await req.json()

  // Strip generated / immutable fields
  const {
    total_price: _gen,
    id:          _id,
    created_at:  _ca,
    ...updates
  } = body

  // Validate payment_status if present
  if ('payment_status' in updates && !VALID_STATUSES.includes(updates.payment_status)) {
    return NextResponse.json(
      { data: null, error: `payment_status must be one of: ${VALID_STATUSES.join(', ')}` },
      { status: 400 }
    )
  }

  // Validate payment_method if present
  if (
    'payment_method' in updates &&
    updates.payment_method !== null &&
    !VALID_PAYMENT_METHODS.includes(updates.payment_method)
  ) {
    return NextResponse.json({ data: null, error: 'Invalid payment_method' }, { status: 400 })
  }

  // Company account constraint
  if (updates.payment_method === 'company_account') {
    const buyer = updates.buyer_name
    if (!buyer || !(COMPANY_ACCOUNT_BUYERS as readonly string[]).includes(buyer)) {
      return NextResponse.json(
        {
          data: null,
          error: `公司公共账户的经办人必须为：${COMPANY_ACCOUNT_BUYERS.join('、')}`,
        },
        { status: 400 }
      )
    }
  }

  // Required field guards
  if ('item_name' in updates && !updates.item_name?.trim()) {
    return NextResponse.json({ data: null, error: 'item_name cannot be empty' }, { status: 400 })
  }
  if ('expense_date' in updates && !updates.expense_date) {
    return NextResponse.json({ data: null, error: 'expense_date cannot be empty' }, { status: 400 })
  }

  // When user sets a new payment_method, clear the legacy field
  if ('payment_method' in updates && updates.payment_method) {
    updates.payment_method_legacy = null
  }

  const { data, error } = await db
    .from('expenses')
    .update(updates)
    .eq('id', params.id)
    .select('*')
    .single()

  if (error) return NextResponse.json({ data: null, error: error.message }, { status: 500 })
  return NextResponse.json({ data, error: null })
}

// DELETE /api/expenses/:id
export async function DELETE(_req: NextRequest, { params }: Params) {
  const user = await authGuard()
  if (user instanceof NextResponse) return user

  const db = createServerClient()
  const { error } = await db.from('expenses').delete().eq('id', params.id)
  if (error) return NextResponse.json({ data: null, error: error.message }, { status: 500 })
  return NextResponse.json({ data: { id: params.id }, error: null })
}
