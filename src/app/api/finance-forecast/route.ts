import { NextRequest, NextResponse } from 'next/server'
import { authGuard } from '@/lib/auth/guard'
import { getActorProfile } from '@/lib/auth/actor'
import {
  httpStatusForFinanceForecastError,
  loadFinanceForecastYears,
  saveFinanceForecastYear,
} from '@/lib/finance-forecast/service'
import { assertViewAccess, httpStatusForViewError } from '@/lib/finance-forecast/views'
import { buildForecastYearMonthsByYear } from '@/lib/finance-forecast/year'
import { calculateMonthlyBudgetCosts, type ExpenseForBudget, type ForecastMonthInput } from '@/lib/finance-forecast/calculations'
import { createServerClient } from '@/lib/supabase/server'

export async function GET(req: NextRequest) {
  const user = await authGuard()
  if (user instanceof NextResponse) return user

  const actor = await getActorProfile(user.id)
  if (!actor) return NextResponse.json({ data: null, error: 'Unknown user' }, { status: 403 })

  const viewId = req.nextUrl.searchParams.get('view_id')
  if (!viewId) return NextResponse.json({ data: null, error: 'view_id is required' }, { status: 400 })

  const access = await assertViewAccess(actor, viewId, 'read')
  if (access.error) {
    return NextResponse.json(
      { data: null, error: access.error.message, code: access.error.code },
      { status: httpStatusForViewError(access.error.code) },
    )
  }

  const years = parseYearsParam(req.nextUrl.searchParams)
  if (years.length === 0) {
    return NextResponse.json({ data: null, error: 'No valid years requested' }, { status: 400 })
  }

  const baseMonthsByYear = await buildBaseMonths(years)
  const result = await loadFinanceForecastYears(viewId, years, baseMonthsByYear)

  if (result.error) {
    return NextResponse.json(
      { data: null, error: result.error.message },
      { status: httpStatusForFinanceForecastError(result.error.code) },
    )
  }

  // Serialize Map → plain object keyed by year for JSON transport.
  const data: Record<number, ForecastMonthInput[]> = {}
  for (const year of years) data[year] = result.data?.get(year) ?? []
  return NextResponse.json({ data, error: null })
}

export async function PUT(req: NextRequest) {
  const user = await authGuard()
  if (user instanceof NextResponse) return user

  const actor = await getActorProfile(user.id)
  if (!actor) return NextResponse.json({ data: null, error: 'Unknown user' }, { status: 403 })

  let body: { view_id?: string; year?: number; months?: ForecastMonthInput[] }
  try {
    body = await req.json() as typeof body
  } catch {
    return NextResponse.json({ data: null, error: 'Invalid JSON body' }, { status: 400 })
  }
  if (!body.view_id) return NextResponse.json({ data: null, error: 'view_id is required' }, { status: 400 })

  const access = await assertViewAccess(actor, body.view_id, 'write')
  if (access.error) {
    return NextResponse.json(
      { data: null, error: access.error.message, code: access.error.code },
      { status: httpStatusForViewError(access.error.code) },
    )
  }

  const year = Number(body.year) || new Date().getUTCFullYear()
  const result = await saveFinanceForecastYear(body.view_id, year, body.months ?? [])

  if (result.error) {
    return NextResponse.json(
      { data: null, error: result.error.message },
      { status: httpStatusForFinanceForecastError(result.error.code) },
    )
  }
  return NextResponse.json({ data: result.data, error: null, debug: result.debug })
}

function parseYearsParam(params: URLSearchParams): number[] {
  // Supports either ?years=2026,2027,2028 or a single ?year=2026 for back-compat.
  const raw = params.get('years') ?? params.get('year') ?? ''
  if (!raw) return [new Date().getUTCFullYear()]
  const parsed = raw
    .split(',')
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isInteger(n) && n >= 2020 && n <= 2100)
  return Array.from(new Set(parsed))
}

async function buildBaseMonths(years: number[]): Promise<Map<number, ForecastMonthInput[]>> {
  const db = createServerClient()
  const startYear = years[0]
  const endYear   = years[years.length - 1]
  const { data } = await db
    .from('expenses')
    .select('expense_date,period,total_price,payment_status,buyer_name,expense_category')
    .or(
      `and(expense_date.gte.${startYear}-01-01,expense_date.lte.${endYear}-12-31),` +
      years.map((y) => `period.like.${y}-Q%`).join(','),
    )

  return buildForecastYearMonthsByYear(
    years,
    calculateMonthlyBudgetCosts((data ?? []) as ExpenseForBudget[]),
  )
}
