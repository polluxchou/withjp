'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import type { SubjectInput } from '@/lib/discussions/types'

// ── Public types ─────────────────────────────────────────────

export interface SubjectCount {
  openCount:     number
  resolvedCount: number
}

export interface SubjectCountState extends SubjectCount {
  loading: boolean
}

// Stable client-side key for a subject. The server still produces the
// canonical subject_hash for filter subjects; this key is purely for
// keying the in-memory count map and pairing batch results back to
// the caller.
export function subjectKey(subject: SubjectInput): string {
  if (subject.subjectType === 'filter') {
    const sortedKeys = Object.keys(subject.filters).sort()
    const ordered: Record<string, unknown> = {}
    for (const k of sortedKeys) ordered[k] = subject.filters[k]
    return `filter:${subject.serviceKey}:${subject.entityType}:${JSON.stringify(ordered)}`
  }
  return `${subject.subjectType}:${subject.serviceKey}:${subject.entityType}:${subject.entityId}`
}

// ── Context shape ────────────────────────────────────────────

interface ContextValue {
  get:        (key: string) => SubjectCountState | undefined
  enqueue:    (subject: SubjectInput) => void
  invalidate: (subject: SubjectInput) => void
  setCount:   (subject: SubjectInput, count: SubjectCount) => void
}

const DiscussionContext = createContext<ContextValue | null>(null)

// ── Provider ─────────────────────────────────────────────────

const FLUSH_DEBOUNCE_MS = 50
const MAX_BATCH_SIZE    = 200

interface ProviderProps {
  children: ReactNode
  // Optional override for tests; defaults to the real fetch endpoint.
  fetcher?: (subjects: Array<{ key: string; subject: SubjectInput }>) =>
    Promise<Array<{ key: string; openCount: number; resolvedCount: number }>>
}

async function defaultFetcher(
  subjects: Array<{ key: string; subject: SubjectInput }>,
): Promise<Array<{ key: string; openCount: number; resolvedCount: number }>> {
  const res = await fetch('/api/discussions/subject/resolve-counts', {
    method:  'POST',
    headers: { 'content-type': 'application/json' },
    body:    JSON.stringify({ subjects }),
  })
  if (!res.ok) {
    throw new Error(`resolve-counts failed: ${res.status}`)
  }
  const json = await res.json() as {
    data:  Array<{ key: string; openCount: number; resolvedCount: number }> | null
    error: string | null
  }
  if (json.error || !json.data) {
    throw new Error(json.error ?? 'resolve-counts returned no data')
  }
  return json.data
}

export function DiscussionProvider({ children, fetcher }: ProviderProps) {
  const [counts, setCounts] = useState<Map<string, SubjectCount>>(() => new Map())
  const [loading, setLoading] = useState<Set<string>>(() => new Set())

  // Queue of subjects waiting to be batched. Held in a ref so writes
  // do not cause re-renders.
  const queueRef = useRef<Map<string, SubjectInput>>(new Map())
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const fetcherRef = useRef(fetcher ?? defaultFetcher)
  useEffect(() => {
    fetcherRef.current = fetcher ?? defaultFetcher
  }, [fetcher])

  const flush = useCallback(async () => {
    timerRef.current = null
    const pending = Array.from(queueRef.current.entries())
    queueRef.current.clear()
    if (pending.length === 0) return

    // Chunk to keep individual requests reasonable; server allows ≤ 500.
    const chunks: Array<Array<[string, SubjectInput]>> = []
    for (let i = 0; i < pending.length; i += MAX_BATCH_SIZE) {
      chunks.push(pending.slice(i, i + MAX_BATCH_SIZE))
    }

    for (const chunk of chunks) {
      const payload = chunk.map(([key, subject]) => ({ key, subject }))
      try {
        const results = await fetcherRef.current(payload)
        const byKey = new Map(results.map(r => [r.key, r]))
        setCounts(prev => {
          const next = new Map(prev)
          for (const [key] of chunk) {
            const r = byKey.get(key)
            if (r) next.set(key, { openCount: r.openCount, resolvedCount: r.resolvedCount })
            // If the server omitted this key (e.g. dropped due to permission
            // filter inside a saved_view bucket), keep prior value or set 0/0.
            if (!r && !next.has(key)) next.set(key, { openCount: 0, resolvedCount: 0 })
          }
          return next
        })
      } catch {
        // Leave loading=false so the badge falls back to its empty state.
        setCounts(prev => {
          const next = new Map(prev)
          for (const [key] of chunk) {
            if (!next.has(key)) next.set(key, { openCount: 0, resolvedCount: 0 })
          }
          return next
        })
      } finally {
        setLoading(prev => {
          const next = new Set(prev)
          for (const [key] of chunk) next.delete(key)
          return next
        })
      }
    }
  }, [])

  const scheduleFlush = useCallback(() => {
    if (timerRef.current !== null) return
    timerRef.current = setTimeout(() => { void flush() }, FLUSH_DEBOUNCE_MS)
  }, [flush])

  const enqueue = useCallback((subject: SubjectInput) => {
    const key = subjectKey(subject)
    if (queueRef.current.has(key)) return
    queueRef.current.set(key, subject)
    setLoading(prev => {
      if (prev.has(key)) return prev
      const next = new Set(prev)
      next.add(key)
      return next
    })
    scheduleFlush()
  }, [scheduleFlush])

  const invalidate = useCallback((subject: SubjectInput) => {
    const key = subjectKey(subject)
    setCounts(prev => {
      if (!prev.has(key)) return prev
      const next = new Map(prev)
      next.delete(key)
      return next
    })
    queueRef.current.set(key, subject)
    setLoading(prev => {
      if (prev.has(key)) return prev
      const next = new Set(prev)
      next.add(key)
      return next
    })
    scheduleFlush()
  }, [scheduleFlush])

  // Allow callers (e.g. after createThread) to push a known count
  // synchronously instead of round-tripping through the API.
  const setCount = useCallback((subject: SubjectInput, count: SubjectCount) => {
    const key = subjectKey(subject)
    setCounts(prev => {
      const next = new Map(prev)
      next.set(key, count)
      return next
    })
  }, [])

  const get = useCallback((key: string): SubjectCountState | undefined => {
    const c = counts.get(key)
    const isLoading = loading.has(key)
    if (!c) return isLoading ? { openCount: 0, resolvedCount: 0, loading: true } : undefined
    return { ...c, loading: isLoading }
  }, [counts, loading])

  // Flush any pending work on unmount so devtools doesn't see a stuck timer.
  useEffect(() => () => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }, [])

  const value = useMemo<ContextValue>(
    () => ({ get, enqueue, invalidate, setCount }),
    [get, enqueue, invalidate, setCount],
  )

  return (
    <DiscussionContext.Provider value={value}>
      {children}
    </DiscussionContext.Provider>
  )
}

// ── Hooks ────────────────────────────────────────────────────

function useDiscussionContextOrThrow(): ContextValue {
  const ctx = useContext(DiscussionContext)
  if (!ctx) {
    throw new Error('useDiscussionCount must be used inside <DiscussionProvider>')
  }
  return ctx
}

// Read a subject's count. On first read, the subject is enqueued for
// fetching; subsequent renders return the cached value.
export function useDiscussionCount(subject: SubjectInput): SubjectCountState {
  const ctx = useDiscussionContextOrThrow()
  const key = subjectKey(subject)

  // Stable JSON identity for the effect's dep list — `subject` object
  // is often recreated by the caller on every render.
  const subjectJSON = JSON.stringify(subject)

  useEffect(() => {
    const current = ctx.get(key)
    if (current === undefined) ctx.enqueue(subject)
    // We only care about (re-)enqueuing when the subject identity changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subjectJSON])

  const state = ctx.get(key)
  return state ?? { openCount: 0, resolvedCount: 0, loading: true }
}

// Imperative escape hatch: invalidate after create/resolve so the
// badge re-fetches.
export function useInvalidateDiscussion() {
  return useDiscussionContextOrThrow().invalidate
}

// Imperative escape hatch: push a known count directly (e.g. right after
// createThread returns) to avoid the extra round-trip.
export function useSetDiscussionCount() {
  return useDiscussionContextOrThrow().setCount
}
