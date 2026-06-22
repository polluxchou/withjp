export interface ItemFilters {
  q:                  string
  kind:               '' | 'physical' | 'virtual'
  status:             string
  floor_id:           string
  venue_item_id:      string
  responsible_person: string
}

export const EMPTY_ITEM_FILTERS: ItemFilters = {
  q: '', kind: '', status: '', floor_id: '', venue_item_id: '', responsible_person: '',
}

// Filter keys sent to the server as query params. Anything outside this
// set (e.g. floor_id) is applied client-side.
const ITEM_SERVER_FILTER_KEY_LIST = [
  'q', 'kind', 'status', 'venue_item_id', 'responsible_person',
] as const satisfies readonly (keyof ItemFilters)[]

export const ITEM_SERVER_FILTER_KEYS: ReadonlySet<keyof ItemFilters> =
  new Set<keyof ItemFilters>(ITEM_SERVER_FILTER_KEY_LIST)

export function itemFiltersToParams(filters: ItemFilters): URLSearchParams {
  const params = new URLSearchParams()
  for (const k of ITEM_SERVER_FILTER_KEY_LIST) {
    const v = filters[k]
    if (v) params.set(k, String(v))
  }
  return params
}
