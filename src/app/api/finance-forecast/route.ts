import { NextRequest, NextResponse } from 'next/server'
import { authGuard } from '@/lib/auth/guard'
import {
  httpStatusForFinanceForecastError,
  loadFinanceForecastYear,
  saveFinanceForecastYear,
} from '@/lib/finance-forecast/service'
import { buildForecastYearMonths } from '@/lib/finance-forecast/year'
import { calculateMonthlyBudgetCosts, type ExpenseForBudget, type ForecastMonthInput } from '@/lib/finance-forecast/calculations'
import { createServerClient } from '@/lib/supabase/server'

export async function GET(req: NextRequest) {
  const user = await authGuard()
  if (user instanceof NextResponse) return user

  const year = Number(req.nextUrl.searchParams.get('year')) || new Date().getUTCFullYear()
  const baseMonths = await buildBaseMonths(year)
  const result = await loadFinanceForecastYear(year, baseMonths)

  if (result.error) {
    return NextResponse.json(
      { data: null, error: result.error.message },
      { status: httpStatusForFinanceForecastError(result.error.code) },
    )
  }
  return NextResponse.json({ data: result.data, error: null })
}

export async function PUT(req: NextRequest) {
  const user = await authGuard()
  if (user instanceof NextResponse) return user

  const body = await req.json() as { year?: number; months?: ForecastMonthInput[] }
  const year = Number(body.year) || new Date().getUTCFullYear()
  const result = await saveFinanceForecastYear(year, body.months ?? [])

  if (result.error) {
    return NextResponse.json(
      { data: null, error: result.error.message },
      { status: httpStatusForFinanceForecastError(result.error.code) },
    )
  }
  return NextResponse.json({ data: result.data, error: null })
}

async function buildBaseMonths(year: number): Promise<ForecastMonthInput[]> {
  const db = createServerClient()
  const { data } = await db
    .from('expenses')
    .select('expense_date,period,total_price,payment_status,buyer_name,expense_category')
    .or(`and(expense_date.gte.${year}-01-01,expense_date.lte.${year}-12-31),period.like.${year}-Q%`)

  return buildForecastYearMonths(
    year,
    calculateMonthlyBudgetCosts((data ?? []) as ExpenseForBudget[]),
  )
}
