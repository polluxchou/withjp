import { createServerClient } from '@/lib/supabase/server'
import { formatSupabaseError } from '@/lib/supabase/errors'
import type { Creator } from '@/lib/types'
import CreatorsClient from './CreatorsClient'

// The list is fetched from Supabase per request; without this Next would try to
// prerender it as static HTML at build time (the Supabase JS client isn't an
// instrumented fetch, so Next can't auto-detect the dynamic dependency) and the
// data would be frozen at build. Force per-request server rendering.
export const dynamic = 'force-dynamic'

// Keep the same joined shape the client (and the /api/creators route) expects.
const CREATOR_SELECT =
  '*, broadcast_account:broadcast_accounts(*), operator_user:users(id,name,email,user_code,role)'

// Server-render the list so the page arrives with data — no client fetch
// waterfall, no first-paint spinner. Auth is already enforced by middleware.
export default async function CreatorsPage() {
  const db = createServerClient()
  const { data, error } = await db
    .from('creators')
    .select(CREATOR_SELECT)
    .order('created_at', { ascending: false })

  return (
    <CreatorsClient
      initialCreators={(data as Creator[] | null) ?? []}
      loadError={error ? formatSupabaseError(error.message) : null}
    />
  )
}
