// Builders that turn the expense page's local Filters / Expense shapes
// into the SubjectInput the discussions module expects. Lives in
// src/lib/discussions/ so the page integration stays small.

import type { Expense } from '@/lib/types'
import type { Filters } from '@/lib/expenses/filter-types'
import type {
  FilterSubjectInput,
  RecordSubjectInput,
} from './types'

// Subset of next-intl's translator signature, accepting either a bare key
// or a key with named params. Keeping our own type avoids importing
// next-intl from a non-React module.
export type DiscussionFilterTranslator = (
  key: string,
  values?: Record<string, string | number>,
) => string

// Build a record subject for a single expense row. The label echoes
// date + item name; falls back to a short UUID if both are missing.
// Stored on the thread row, so we keep it locale-neutral here.
export function expenseRecordSubject(e: Expense): RecordSubjectInput {
  const parts: string[] = []
  if (e.expense_date) parts.push(e.expense_date)
  if (e.item_name)    parts.push(e.item_name)
  const label = parts.length > 0 ? parts.join(' · ') : `Expense ${e.id.slice(0, 8)}`

  return {
    subjectType: 'record',
    serviceKey:  'expenses',
    entityType:  'expense',
    entityId:    e.id,
    label,
    route:       `/expenses?id=${e.id}`,
  }
}

// Build a filter subject from the page's current Filters state. Only
// whitelisted keys end up in subject_hash (see subject.ts); we pass the
// full set here so subject_payload.filters can echo the human-readable
// state for the panel header. The label is computed via the supplied
// translator so the value stored on the thread row matches the locale
// active at creation time.
export function expenseFilterSubject(
  filters: Filters,
  route: string,
  t: DiscussionFilterTranslator,
): FilterSubjectInput {
  return {
    subjectType: 'filter',
    serviceKey:  'expenses',
    entityType:  'expense',
    filters:     filters as unknown as Record<string, unknown>,
    label:       describeExpenseFilters(filters, t),
    route,
  }
}

// Human-readable summary of an active filter set. Used as the panel's
// "绑定对象" line so users can see what they're discussing without
// re-reading the URL.
function describeExpenseFilters(f: Filters, t: DiscussionFilterTranslator): string {
  const parts: string[] = []
  if (f.category)       parts.push(t('category',       { value: f.category }))
  if (f.payment_status) parts.push(t('paymentStatus',  { value: f.payment_status }))
  if (f.payment_method) parts.push(t('paymentMethod',  { value: f.payment_method }))
  if (f.user_name)      parts.push(t('userName',       { value: f.user_name }))
  if (f.buyer_name)     parts.push(t('buyerName',      { value: f.buyer_name }))
  if (f.period)         parts.push(t('period',         { value: f.period }))
  if (f.date_from || f.date_to) {
    parts.push(t('dateRange', { from: f.date_from || '…', to: f.date_to || '…' }))
  }
  if (f.unpaid_only       === 'yes') parts.push(t('unpaidOnly'))
  if (f.cross_border_only === 'yes') parts.push(t('crossBorderOnly'))
  return parts.length === 0 ? t('all') : parts.join('，')
}
