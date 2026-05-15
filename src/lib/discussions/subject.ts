import { createHash } from 'node:crypto'
import type { NormalizedSubject, SubjectInput } from './types.ts'

// Keys allowed in a filter subject's hash, per entity_type. Anything
// outside this set is dropped server-side so the hash is stable across
// UI refactors and immune to caller bugs that leak transient state.
//
// `q` (free-text search) is intentionally excluded: typing different
// search terms should not create different discussion subjects.
const FILTER_WHITELIST: Record<string, readonly string[]> = {
  expense: [
    'category',
    'payment_status',
    'payment_method',
    'user_name',
    'buyer_name',
    'date_from',
    'date_to',
    'period',
    'unpaid_only',
    'cross_border_only',
  ],
}

function isMeaningful(v: unknown): boolean {
  if (v === null || v === undefined) return false
  if (typeof v === 'string' && v.trim() === '') return false
  if (Array.isArray(v) && v.length === 0) return false
  return true
}

function stableCompare(a: unknown, b: unknown): number {
  const sa = String(a)
  const sb = String(b)
  return sa < sb ? -1 : sa > sb ? 1 : 0
}

function normalizeValue(v: unknown): unknown {
  if (Array.isArray(v)) {
    return v.map(normalizeValue).filter(isMeaningful).sort(stableCompare)
  }
  if (typeof v === 'string') return v.trim()
  return v
}

function canonicalJSON(obj: Record<string, unknown>): string {
  const keys = Object.keys(obj).sort()
  const ordered: Record<string, unknown> = {}
  for (const k of keys) ordered[k] = obj[k]
  return JSON.stringify(ordered)
}

export function normalizeSubject(input: SubjectInput): NormalizedSubject {
  const base = {
    serviceKey: input.serviceKey,
    subjectType: input.subjectType,
    entityType: input.entityType,
  }

  if (input.subjectType === 'record' || input.subjectType === 'saved_view') {
    return {
      ...base,
      entityId: input.entityId,
      subjectHash: null,
      subjectPayload: { label: input.label, route: input.route },
    }
  }

  const allowed = FILTER_WHITELIST[input.entityType] ?? []
  const cleaned: Record<string, unknown> = {}
  for (const key of allowed) {
    const raw = (input.filters as Record<string, unknown>)[key]
    if (!isMeaningful(raw)) continue
    const normalized = normalizeValue(raw)
    if (!isMeaningful(normalized)) continue
    cleaned[key] = normalized
  }

  const canonical = canonicalJSON(cleaned)
  const subjectHash = createHash('sha256').update(canonical).digest('hex')

  return {
    ...base,
    entityId: null,
    subjectHash,
    subjectPayload: {
      label: input.label,
      route: input.route,
      filters: cleaned,
    },
  }
}
