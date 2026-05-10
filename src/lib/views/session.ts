// View-session aggregation for the PMO read-behavior stream.
//
// One session = one stretch of activity by a user with no gap longer than
// SESSION_GAP_MS. While the session is open, repeated views of the same
// (entity_type, entity_id) are folded into a counter rather than appended
// as separate rows. See docs/pmo-agent-design.md §2.2 / §3.5.

import type { ActivityEntity } from '@/lib/types'

export const SESSION_GAP_MS = 30 * 60 * 1000 // 30 minutes

export interface ViewSession {
  id?:         string
  user_id:     string
  started_at:  string  // ISO timestamp
  ended_at:    string  // ISO timestamp
  views:       Record<string, Record<string, number>>
  routes:      string[]
}

export interface ViewPing {
  user_id:      string
  entity_type:  ActivityEntity | null
  entity_id:    string | null
  route:        string
  at:           Date
}

export interface MergeResult {
  session: ViewSession
  isNew:   boolean
}

// Decide whether `ping` extends the open session or starts a new one.
// - If no open session, always new.
// - If gap from session.ended_at to ping.at exceeds SESSION_GAP_MS, new.
// - Otherwise extend.
export function shouldStartNewSession(
  open: ViewSession | null,
  pingAt: Date
): boolean {
  if (!open) return true
  const gap = pingAt.getTime() - new Date(open.ended_at).getTime()
  return gap > SESSION_GAP_MS
}

// Merge a ping into an existing session in-place style (returns a new object).
export function extendSession(session: ViewSession, ping: ViewPing): ViewSession {
  const views = cloneViews(session.views)

  if (ping.entity_type && ping.entity_id) {
    const bucket = views[ping.entity_type] ?? {}
    bucket[ping.entity_id] = (bucket[ping.entity_id] ?? 0) + 1
    views[ping.entity_type] = bucket
  }

  const routes = session.routes.includes(ping.route)
    ? session.routes
    : [...session.routes, ping.route]

  return {
    ...session,
    ended_at: ping.at.toISOString(),
    views,
    routes,
  }
}

// Build a brand-new session from a single ping.
export function startSession(ping: ViewPing): ViewSession {
  const iso  = ping.at.toISOString()
  const session: ViewSession = {
    user_id:    ping.user_id,
    started_at: iso,
    ended_at:   iso,
    views:      {},
    routes:     ping.route ? [ping.route] : [],
  }
  if (ping.entity_type && ping.entity_id) {
    session.views = { [ping.entity_type]: { [ping.entity_id]: 1 } }
  }
  return session
}

// Convenience: given the user's most recent open session (or null) and a
// new ping, return the next session row state and whether it's new.
export function applyPing(
  open: ViewSession | null,
  ping: ViewPing
): MergeResult {
  if (shouldStartNewSession(open, ping.at)) {
    return { session: startSession(ping), isNew: true }
  }
  return { session: extendSession(open!, ping), isNew: false }
}

function cloneViews(
  views: ViewSession['views']
): ViewSession['views'] {
  const out: ViewSession['views'] = {}
  for (const [k, inner] of Object.entries(views)) {
    out[k] = { ...inner }
  }
  return out
}
