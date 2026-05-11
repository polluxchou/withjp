import { NextRequest, NextResponse } from 'next/server'
import { authGuard } from '@/lib/auth/guard'
import {
  updateExpense,
  deleteExpense,
  httpStatusForError,
  type UpdateExpenseInput,
} from '@/lib/expenses/service'

type Params = { params: { id: string } }

// PATCH /api/expenses/:id
export async function PATCH(req: NextRequest, { params }: Params) {
  const user = await authGuard()
  if (user instanceof NextResponse) return user

  const body   = (await req.json()) as UpdateExpenseInput
  const result = await updateExpense(params.id, body)

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
  const user = await authGuard()
  if (user instanceof NextResponse) return user

  const result = await deleteExpense(params.id)
  if (result.error) {
    return NextResponse.json(
      { data: null, error: result.error.message },
      { status: httpStatusForError(result.error.code) },
    )
  }
  return NextResponse.json({ data: result.data, error: null })
}
