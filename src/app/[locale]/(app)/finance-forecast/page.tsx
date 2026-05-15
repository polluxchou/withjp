export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import Header from '@/components/layout/Header'
import FinanceForecastDashboard from '@/components/finance-forecast/FinanceForecastDashboard'
import { createServerClient } from '@/lib/supabase/server'
import { createAuthServerClient } from '@/lib/supabase/auth-server'
import { getActorProfile } from '@/lib/auth/actor'
import {
  calculateMonthlyBudgetCosts,
  type ExpenseForBudget,
  type ForecastMonthInput,
} from '@/lib/finance-forecast/calculations'
import { loadFinanceForecastYears } from '@/lib/finance-forecast/service'
import { listVisibleViews, type ForecastView } from '@/lib/finance-forecast/views'
import {
  buildForecastYearMonthsByYear,
  forecastYearRange,
} from '@/lib/finance-forecast/year'

export default async function FinanceForecastPage({
  params,
}: {
  params: { locale: string }
}) {
  setRequestLocale(params.locale)
  const t = await getTranslations('financeForecast')
  const auth = await createAuthServerClient()
  const { data: { user } } = await auth.auth.getUser()
  if (!user) redirect('/login')

  const actor = await getActorProfile(user.id)
  if (!actor) redirect('/login')

  const viewsResult = await listVisibleViews(actor)
  if (viewsResult.error) console.error('listVisibleViews failed:', viewsResult.error)
  const views = viewsResult.data ?? []

  const defaultView = pickDefaultView(views, actor.id)

  const now = new Date()
  const anchorYear = now.getUTCFullYear()
  const years = forecastYearRange(anchorYear)

  const monthsByYear = defaultView
    ? await loadDefaultViewMonths(defaultView.id, years)
    : emptyByYear(years)

  return (
    <div>
      <Header
        title={t('pageTitle')}
        subtitle={t('pageSubtitle')}
      />
      <FinanceForecastDashboard
        views={views}
        defaultViewId={defaultView?.id ?? null}
        monthsByYear={monthsByYear}
        years={years}
        anchorYear={anchorYear}
        initialSelectedMonth={now.getUTCMonth()}
        currentUserId={actor.id}
        isAdmin={actor.is_admin}
      />
    </div>
  )
}

// Public (全员) view first; fall back to own most-recently-updated, then any view.
function pickDefaultView(views: ForecastView[], currentUserId: string): ForecastView | null {
  if (views.length === 0) return null
  // Prefer the oldest public view (全员视角); list is already ordered by created_at ASC.
  const publicView = views.find((v) => v.is_public)
  if (publicView) return publicView
  const sortByUpdated = (a: ForecastView, b: ForecastView) => b.updated_at.localeCompare(a.updated_at)
  const owned = views.filter((v) => v.owner_id === currentUserId)
  if (owned.length > 0) return [...owned].sort(sortByUpdated)[0]
  return [...views].sort(sortByUpdated)[0]
}

async function loadDefaultViewMonths(viewId: string, years: number[]): Promise<Record<number, ForecastMonthInput[]>> {
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

  const budgetByMonth = calculateMonthlyBudgetCosts((data ?? []) as ExpenseForBudget[])
  const baseMonthsByYear = buildForecastYearMonthsByYear(years, budgetByMonth)
  const saved = await loadFinanceForecastYears(viewId, years, baseMonthsByYear)

  const out: Record<number, ForecastMonthInput[]> = {}
  for (const year of years) {
    out[year] = saved.data?.get(year) ?? baseMonthsByYear.get(year) ?? []
  }
  return out
}

function emptyByYear(years: number[]): Record<number, ForecastMonthInput[]> {
  const out: Record<number, ForecastMonthInput[]> = {}
  for (const year of years) out[year] = []
  return out
}
