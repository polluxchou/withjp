import type { SubjectInput } from './types.ts'

// Framework-free batching core behind <DiscussionProvider>. Kept out of the
// React file so the queue/debounce/chunking rules are testable without a DOM
// (same split as finance-forecast's save-queue).

export interface SubjectCount {
  openCount:     number
  resolvedCount: number
}

export type CountFetcher = (
  subjects: Array<{ key: string; subject: SubjectInput }>,
) => Promise<Array<{ key: string; openCount: number; resolvedCount: number }>>

export const FLUSH_DEBOUNCE_MS = 50
export const MAX_BATCH_SIZE    = 200

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

export interface CountQueueOptions {
  fetcher: CountFetcher
  /** A key just entered the queue and has no count yet. */
  onLoading: (key: string) => void
  /**
   * One chunk came back. `counts` only carries the keys the server answered
   * for; anything in `keys` but missing from `counts` was dropped (permission
   * filter, or the request failed) and the caller decides the fallback.
   */
  onSettled: (keys: string[], counts: Map<string, SubjectCount>) => void
  debounceMs?:   number
  maxBatchSize?: number
}

export interface CountQueue {
  enqueue:    (subject: SubjectInput) => void
  invalidate: (subject: SubjectInput) => void
  /** Drop a pending timer (provider unmount) without losing the queue. */
  cancel:     () => void
}

export function createCountQueue(options: CountQueueOptions): CountQueue {
  const debounceMs   = options.debounceMs ?? FLUSH_DEBOUNCE_MS
  const maxBatchSize = options.maxBatchSize ?? MAX_BATCH_SIZE

  const queue = new Map<string, SubjectInput>()
  let timer: ReturnType<typeof setTimeout> | null = null

  async function flush() {
    timer = null
    const pending = Array.from(queue.entries())
    queue.clear()
    if (pending.length === 0) return

    // Chunk to keep individual requests reasonable; server allows ≤ 500.
    for (let i = 0; i < pending.length; i += maxBatchSize) {
      const chunk = pending.slice(i, i + maxBatchSize)
      const keys  = chunk.map(([key]) => key)
      const counts = new Map<string, SubjectCount>()
      try {
        const results = await options.fetcher(
          chunk.map(([key, subject]) => ({ key, subject })),
        )
        for (const r of results) {
          counts.set(r.key, { openCount: r.openCount, resolvedCount: r.resolvedCount })
        }
      } catch {
        // Settle with no counts: the caller falls back to its empty state
        // rather than spinning forever.
      } finally {
        options.onSettled(keys, counts)
      }
    }
  }

  function schedule() {
    if (timer !== null) return
    timer = setTimeout(() => { void flush() }, debounceMs)
  }

  return {
    enqueue(subject) {
      const key = subjectKey(subject)
      if (!queue.has(key)) {
        queue.set(key, subject)
        options.onLoading(key)
      }
      // Always (re)schedule, even for an already-queued key. A queued key
      // whose flush was cancelled — StrictMode's mount/unmount/remount does
      // exactly that — would otherwise sit in the queue forever, and every
      // badge waiting on it would never leave its loading state.
      schedule()
    },

    invalidate(subject) {
      const key = subjectKey(subject)
      queue.set(key, subject)
      options.onLoading(key)
      schedule()
    },

    cancel() {
      if (timer !== null) {
        clearTimeout(timer)
        timer = null
      }
    },
  }
}
