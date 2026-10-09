import { createClient } from '@supabase/supabase-js'

// Server-side client with service role key — never expose to the browser
export function createServerClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    // autoRefreshToken must be off: outside a browser auth-js otherwise starts
    // a 30s setInterval per client that is never cleared, leaking one timer
    // (and the client it closes over) per call. Service-role keys never expire.
    { auth: { persistSession: false, autoRefreshToken: false } }
  )
}
