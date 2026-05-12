/**
 * Shape of the expense list filter state. Lifted out of the page so URL
 * encoding utilities and the saved-views component can share the same
 * type without circular imports.
 */
export interface Filters {
  q:                 string
  category:          string
  payment_status:    string
  payment_method:    string
  user_name:         string
  buyer_name:        string
  date_from:         string
  date_to:           string
  period:            string
  unpaid_only:       '' | 'yes'   // client-side: budgeted OR ordered_unpaid
  cross_border_only: '' | 'yes'   // client-side: rows where the 4% fee applies
}

export const EMPTY_FILTERS: Filters = {
  q: '', category: '', payment_status: '', payment_method: '',
  user_name: '', buyer_name: '', date_from: '', date_to: '', period: '',
  unpaid_only: '', cross_border_only: '',
}

// Filter keys sent to the server as query params. Anything outside this
// set is applied client-side over `expenses` in memory.
export const SERVER_FILTER_KEYS: ReadonlySet<keyof Filters> = new Set<keyof Filters>([
  'q', 'payment_status', 'payment_method', 'user_name', 'buyer_name',
  'date_from', 'date_to', 'period',
])

/** Deep equality for two Filters values. */
export function filtersEqual(a: Filters, b: Filters): boolean {
  return (Object.keys(EMPTY_FILTERS) as (keyof Filters)[]).every((k) => a[k] === b[k])
}

/** True when every field matches the empty defaults. */
export function isEmptyFilters(f: Filters): boolean {
  return filtersEqual(f, EMPTY_FILTERS)
}

// ── URL ↔ Filters encoding ───────────────────────────────────

const FREE_TEXT_KEYS = [
  'q', 'category', 'payment_status', 'payment_method',
  'user_name', 'buyer_name', 'date_from', 'date_to', 'period',
] as const

const YES_FLAG_KEYS = ['unpaid_only', 'cross_border_only'] as const

/** Encode non-empty filter values as URLSearchParams. */
export function filtersToParams(filters: Filters): URLSearchParams {
  const params = new URLSearchParams()
  for (const k of FREE_TEXT_KEYS) {
    const v = filters[k]
    if (v) params.set(k, v)
  }
  for (const k of YES_FLAG_KEYS) {
    if (filters[k] === 'yes') params.set(k, 'yes')
  }
  return params
}

/** Decode URL params back into Filters, falling back to EMPTY_FILTERS for missing keys. */
export function paramsToFilters(params: URLSearchParams | ReadonlyURLSearchParamsLike): Filters {
  const out: Filters = { ...EMPTY_FILTERS }
  for (const k of FREE_TEXT_KEYS) {
    const v = params.get(k)
    if (v != null) out[k] = v
  }
  for (const k of YES_FLAG_KEYS) {
    out[k] = params.get(k) === 'yes' ? 'yes' : ''
  }
  return out
}

// Minimal interface to accept either a real URLSearchParams or Next.js's
// ReadonlyURLSearchParams (both have .get()).
interface ReadonlyURLSearchParamsLike {
  get(name: string): string | null
}
