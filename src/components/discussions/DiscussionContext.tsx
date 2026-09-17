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
import {
  createCountQueue,
  subjectKey,
  type CountFetcher,
  type CountQueue,
  type SubjectCount,
} from '@/lib/discussions/count-queue'
import type { SubjectInput } from '@/lib/discussions/types'

// ── Public types ─────────────────────────────────────────────

// The batching core (queue, debounce, chunking) lives in
// @/lib/discussions/count-queue so it can be tested without a DOM. This file
// is the React shell: it owns the count/loading state and drives that queue.
export { subjectKey }
export type { SubjectCount }

export interface SubjectCountState extends SubjectCount {
  loading: boolean
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

interface ProviderProps {
  children: ReactNode
  // Optional override for tests; defaults to the real fetch endpoint.
  fetcher?: CountFetcher
}

const defaultFetcher: CountFetcher = async (subjects) => {
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

  const fetcherRef = useRef<CountFetcher>(fetcher ?? defaultFetcher)
  useEffect(() => {
    fetcherRef.current = fetcher ?? defaultFetcher
  }, [fetcher])

  // One queue per provider instance, created lazily so the ref survives
  // StrictMode's mount/unmount/remount without rebuilding it.
  const queueRef = useRef<CountQueue | null>(null)
  if (queueRef.current === null) {
    queueRef.current = createCountQueue({
      fetcher: payload => fetcherRef.current(payload),

      onLoading: (key) => {
        setLoading(prev => {
          if (prev.has(key)) return prev
          const next = new Set(prev)
          next.add(key)
          return next
        })
      },

      onSettled: (keys, resolved) => {
        setCounts(prev => {
          const next = new Map(prev)
          for (const key of keys) {
            const r = resolved.get(key)
            if (r) next.set(key, r)
            // If the server omitted this key (e.g. dropped due to permission
            // filter inside a saved_view bucket), keep prior value or set 0/0.
            else if (!next.has(key)) next.set(key, { openCount: 0, resolvedCount: 0 })
          }
          return next
        })
        // Leave loading=false either way so a dropped or failed key falls
        // back to the badge's empty state instead of spinning forever.
        setLoading(prev => {
          const next = new Set(prev)
          for (const key of keys) next.delete(key)
          return next
        })
      },
    })
  }
  const queue = queueRef.current

  const enqueue = useCallback((subject: SubjectInput) => {
    queue.enqueue(subject)
  }, [queue])

  const invalidate = useCallback((subject: SubjectInput) => {
    const key = subjectKey(subject)
    setCounts(prev => {
      if (!prev.has(key)) return prev
      const next = new Map(prev)
      next.delete(key)
      return next
    })
    queue.invalidate(subject)
  }, [queue])

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

  // Drop any pending timer on unmount so devtools doesn't see a stuck timer.
  // The queue keeps its entries, and re-enqueuing reschedules the flush.
  useEffect(() => () => { queue.cancel() }, [queue])

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
