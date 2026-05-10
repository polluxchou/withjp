'use client'

import { useEffect, useRef } from 'react'
import type { ActivityEntity } from '@/lib/types'

interface Options {
  entity_type?: ActivityEntity
  entity_id?:   string
  route:        string
  // Skip pinging when neither entity nor route changed since last fire.
  // Defaults to true.
  dedupe?: boolean
}

// Fire-and-forget read-behavior ping. Server-side aggregation is in
// /api/views (see src/lib/views/session.ts).
//
// Failure is silent: this is best-effort instrumentation, not a hot path.
export function useViewTracker({
  entity_type,
  entity_id,
  route,
  dedupe = true,
}: Options) {
  const lastKey = useRef<string | null>(null)

  useEffect(() => {
    const key = `${entity_type ?? ''}|${entity_id ?? ''}|${route}`
    if (dedupe && lastKey.current === key) return
    lastKey.current = key

    const controller = new AbortController()
    void fetch('/api/views', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ entity_type, entity_id, route }),
      signal:  controller.signal,
      keepalive: true,
    }).catch(() => {
      // intentionally swallowed
    })

    return () => controller.abort()
  }, [entity_type, entity_id, route, dedupe])
}
