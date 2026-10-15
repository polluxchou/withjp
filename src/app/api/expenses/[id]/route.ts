import { NextRequest, NextResponse } from 'next/server'
import { authGuardStrict } from '@/lib/auth/guard'
import { getActorProfile } from '@/lib/auth/actor'
import {
  updateExpense,
  deleteExpense,
  httpStatusForError,
  type UpdateExpenseInput,
} from '@/lib/expenses/service'
import { canAccessExpenses, EXPENSES_ADMIN_ONLY_MESSAGE } from '@/lib/expenses/access'

type Params = { params: { id: string } }

// PATCH /api/expenses/:id
export async function PATCH(req: NextRequest, { params }: Params) {
  const user = await authGuardStrict()
  if (user instanceof NextResponse) return user

  const actor = await getActorProfile(user.id)
  if (!canAccessExpenses(actor)) {
    return NextResponse.json({ data: null, error: EXPENSES_ADMIN_ONLY_MESSAGE }, { status: 403 })
  }
  let body: UpdateExpenseInput
  try {
    body = (await req.json()) as UpdateExpenseInput
  } catch {
    return NextResponse.json({ data: null, error: 'Invalid JSON body' }, { status: 400 })
  }
  const result = await updateExpense(params.id, body, actor)

  if (result.error) {
    return NextResponse.json(
      { data: null, error: result.error.message },
      { status: httpStatusForError(result.error.code) },
    )
  }
  return NextResponse.json({ data: result.data, error: null })
}

// DELETE /api/expenses/:id
export async function DELETE(_req: NextRequest, { params }: Params) {
  const user = await authGuardStrict()
  if (user instanceof NextResponse) return user

  const actor  = await getActorProfile(user.id)
  if (!canAccessExpenses(actor)) {
    return NextResponse.json({ data: null, error: EXPENSES_ADMIN_ONLY_MESSAGE }, { status: 403 })
  }
  const result = await deleteExpense(params.id, actor)
  if (result.error) {
    return NextResponse.json(
      { data: null, error: result.error.message },
      { status: httpStatusForError(result.error.code) },
    )
  }
  return NextResponse.json({ data: result.data, error: null })
}
