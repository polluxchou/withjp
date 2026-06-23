// Pure permission helpers for discussion threads.
//
// Mirrors the convention in finance-forecast/views-permissions.ts:
// synchronous, no Supabase client, no async fetcher. The API layer
// loads any required side data (e.g. the underlying saved view) and
// passes a canonical shape in via `opts`.

import type { Message, Thread } from './types.ts'

export interface Actor {
  id:       string
  is_admin: boolean
}

// Canonical shape for saved views across services.
// API layer normalizes:
//   expense_saved_view.user_id        → ownerId, isPublic=false
//   finance_forecast_view.owner_id    → ownerId
//   finance_forecast_view.is_public   → isPublic
export interface SavedViewLike {
  ownerId:  string | null
  isPublic: boolean
}

export interface ReadOpts {
  // Required when thread.subject_type === 'saved_view'.
  // If omitted on a saved_view thread, access is denied (fail-closed).
  savedView?: SavedViewLike
}

export type ReadDenyReason =
  | 'not_admin_and_unknown_saved_view_entity'
  | 'saved_view_not_loaded'
  | 'saved_view_owner_mismatch'

export interface ReadDecision {
  allowed: boolean
  reason?: ReadDenyReason
}

// Detail / list / messages / resolve / counts all funnel through this.
// Returns a decision object so caller can log denial reasons; for
// most call sites the boolean shortcut `canReadThread(...).allowed`
// is sufficient.
export function evaluateReadThread(
  actor: Actor,
  thread: Pick<Thread, 'subjectType' | 'entityType' | 'createdByUserId'>,
  opts: ReadOpts = {},
): ReadDecision {
  if (actor.is_admin) return { allowed: true }

  // record subjects defer to the underlying business table's visibility.
  // v1 expenses are visible to all logged-in users; when that tightens,
  // this branch tightens automatically via the API loading the row first.
  if (thread.subjectType === 'record') return { allowed: true }

  // filter subjects carry no row-level info — the filter criteria are
  // public knowledge within the page.
  if (thread.subjectType === 'filter') return { allowed: true }

  if (thread.subjectType === 'saved_view') {
    if (!opts.savedView) {
      return { allowed: false, reason: 'saved_view_not_loaded' }
    }
    switch (thread.entityType) {
      case 'expense_saved_view':
        // Private to the owner. No public flag in the underlying table.
        return opts.savedView.ownerId === actor.id
          ? { allowed: true }
          : { allowed: false, reason: 'saved_view_owner_mismatch' }
      case 'finance_forecast_view':
        if (opts.savedView.isPublic) return { allowed: true }
        return opts.savedView.ownerId === actor.id
          ? { allowed: true }
          : { allowed: false, reason: 'saved_view_owner_mismatch' }
      default:
        // Fail closed for unknown entity types so future integrations
        // can't accidentally leak via a missing case branch.
        return { allowed: false, reason: 'not_admin_and_unknown_saved_view_entity' }
    }
  }

  return { allowed: false, reason: 'not_admin_and_unknown_saved_view_entity' }
}

export function canReadThread(
  actor: Actor,
  thread: Pick<Thread, 'subjectType' | 'entityType' | 'createdByUserId'>,
  opts: ReadOpts = {},
): boolean {
  return evaluateReadThread(actor, thread, opts).allowed
}

// Resolve gate: only creator or admin. Agents do not auto-close in v1.
export function canResolveThread(
  actor: Actor,
  thread: Pick<Thread, 'createdByUserId'>,
): boolean {
  if (actor.is_admin) return true
  return thread.createdByUserId === actor.id
}

// Delete-message gate: only the user who sent the message. Intentionally
// NOT including admin in v1 — admins can still soft-delete via the
// Supabase Dashboard if needed; surfacing admin moderation through the
// UI requires its own audit / abuse-prevention design.
//
// Agent and external messages are never user-deletable here. They have
// no human author whose intent we can pin "I want this gone" to.
//
// Soft-deleted messages are filtered out at read time, so calling delete
// on an already-deleted message is a no-op — the gate still returns the
// same result; the service layer treats repeat deletes as idempotent.
export function canDeleteMessage(
  actor: Actor,
  message: Pick<Message, 'senderType' | 'senderUserId'>,
): boolean {
  if (message.senderType !== 'user') return false
  return message.senderUserId === actor.id
}
