import { NextRequest, NextResponse } from 'next/server'
import { authGuard } from '@/lib/auth/guard'
import {
  listExpenses,
  createExpense,
  httpStatusForError,
  type CreateExpenseInput,
} from '@/lib/expenses/service'

// GET /api/expenses
export async function GET(req: NextRequest) {
  const user = await authGuard()
  if (user instanceof NextResponse) return user

  const params = req.nextUrl.searchParams
  const result = await listExpenses({
    q:              params.get('q'),
    category:       params.get('category'),
    payment_status: params.get('payment_status'),
    payment_method: params.get('payment_method'),
    user_name:      params.get('user_name'),
    buyer_name:     params.get('buyer_name'),
    date_from:      params.get('date_from'),
    date_to:        params.get('date_to'),
    period:         params.get('period'),
  })

  if (result.error) {
    return NextResponse.json(
      { data: null, error: result.error.message },
      { status: httpStatusForError(result.error.code) },
    )
  }
  return NextResponse.json({ data: result.data, error: null })
}

// POST /api/expenses
export async function POST(req: NextRequest) {
  const user = await authGuard()
  if (user instanceof NextResponse) return user

  let body: CreateExpenseInput
  try {
    body = (await req.json()) as CreateExpenseInput
  } catch {
    return NextResponse.json({ data: null, error: 'Invalid JSON body' }, { status: 400 })
  }
  const result = await createExpense(body, user.id)

  if (result.error) {
    return NextResponse.json(
      { data: null, error: result.error.message },
      { status: httpStatusForError(result.error.code) },
    )
  }
  return NextResponse.json({ data: result.data, error: null }, { status: 201 })
}
