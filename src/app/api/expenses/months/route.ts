import { NextResponse } from 'next/server'
import { authGuardStrict } from '@/lib/auth/guard'
import { listExpenseMonths, httpStatusForError } from '@/lib/expenses/service'
import { getActorProfile } from '@/lib/auth/actor'
import { canAccessExpenses, EXPENSES_ADMIN_ONLY_MESSAGE } from '@/lib/expenses/access'

// GET /api/expenses/months — 有支出记录的月份（YYYY-MM，新的在前）。
// 支出页的月份选择器用；原来是把整张支出表拉到浏览器再数月份。
export async function GET() {
  const user = await authGuardStrict()
  if (user instanceof NextResponse) return user

  if (!canAccessExpenses(await getActorProfile(user.id))) {
    return NextResponse.json({ data: null, error: EXPENSES_ADMIN_ONLY_MESSAGE }, { status: 403 })
  }

  const result = await listExpenseMonths()
  if (result.error) {
    return NextResponse.json(
      { data: null, error: result.error.message },
      { status: httpStatusForError(result.error.code) },
    )
  }
  return NextResponse.json({ data: result.data, error: null })
}
