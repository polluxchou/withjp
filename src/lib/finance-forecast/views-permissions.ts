// Pure permission helpers extracted from views.ts so they're testable
// without pulling in the Supabase client (which uses path aliases that
// the Node test runner cannot resolve directly).

export const MAX_VIEWS_PER_USER = 3

interface Actor {
  id:       string
  is_admin: boolean
}

interface ViewLike {
  owner_id:  string | null
  is_public: boolean
}

// Visibility: own + public + admin sees everything.
export function canViewView(actor: Actor, view: ViewLike): boolean {
  if (actor.is_admin) return true
  if (view.is_public) return true
  return view.owner_id === actor.id
}

// Edit name/note: owner + admin.
export function canEditView(actor: Actor, view: Pick<ViewLike, 'owner_id'>): boolean {
  if (actor.is_admin) return true
  return view.owner_id === actor.id
}

// Toggle is_public: admin only.
export function canTogglePublic(actor: Actor): boolean {
  return actor.is_admin
}

// Delete: owner + admin.
export function canDeleteView(actor: Actor, view: Pick<ViewLike, 'owner_id'>): boolean {
  if (actor.is_admin) return true
  return view.owner_id === actor.id
}

type ServiceErrorCode = 'invalid_input' | 'db_error' | 'forbidden' | 'not_found' | 'quota_exceeded'

export function httpStatusForViewError(code: ServiceErrorCode): number {
  switch (code) {
    case 'invalid_input':   return 400
    case 'quota_exceeded':  return 400
    case 'forbidden':       return 403
    case 'not_found':       return 404
    default:                return 500
  }
}
