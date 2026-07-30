import { listExpenses } from '@/lib/expenses/service'
import { paramsToFilters, SERVER_FILTER_KEYS, type Filters } from '@/lib/expenses/filter-types'
import type { Expense } from '@/lib/types'
import ExpensesClient from './ExpensesClient'

// Fetched from Supabase per request; force on-demand server rendering so the
// list is never frozen at build time (the Supabase JS client is not an
// instrumented fetch, so Next can't auto-detect the dynamic dependency).
export const dynamic = 'force-dynamic'

type SearchParams = Record<string, string | string[] | undefined>

// Mirror the client's load(): send ONLY the server-side filter keys to the
// query. category / unpaid_only / cross_border_only are applied client-side
// over the full list (the category chart needs the un-narrowed data), so they
// must NOT be pushed into the server query here.
function serverFilters(f: Filters) {
  const out: Record<string, string | null> = {}
  for (const key of Array.from(SERVER_FILTER_KEYS) as (keyof Filters)[]) {
    out[key] = f[key] || null
  }
  return out
}

export default async function ExpensesPage({
  searchParams,
}: {
  searchParams: SearchParams
}) {
  const sp = new URLSearchParams()
  for (const [k, v] of Object.entries(searchParams ?? {})) {
    if (typeof v === 'string') sp.set(k, v)
    else if (Array.isArray(v) && v[0] != null) sp.set(k, v[0])
  }
  const filters = paramsToFilters(sp)

  // Filtered list for the current view + an unfiltered pass to populate the
  // month picker (matches the client's two mount fetches), run in parallel.
  const [listRes, monthsRes] = await Promise.all([
    listExpenses(serverFilters(filters)),
    listExpenses({}),
  ])

  const months = new Set<string>()
  for (const e of monthsRes.data ?? []) {
    if (e.expense_date) months.add(e.expense_date.slice(0, 7))
  }

  return (
    <ExpensesClient
      initialExpenses={(listRes.data as Expense[] | null) ?? []}
      initialError={listRes.error ? listRes.error.message : null}
      initialMonths={Array.from(months)}
    />
  )
}
