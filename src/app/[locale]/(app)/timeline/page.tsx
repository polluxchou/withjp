import { listMilestones } from '@/lib/milestones/list'
import type { Milestone } from '@/lib/types'
import TimelineClient from './TimelineClient'

// Fetched per request (Supabase JS client isn't an instrumented fetch, so Next
// can't auto-detect the dynamic dependency); force on-demand server rendering.
export const dynamic = 'force-dynamic'

// Status/type filters are applied client-side over the full list, so the server
// fetches everything once and hands it to the client for instant filtering.
export default async function TimelinePage() {
  const { data } = await listMilestones({})
  return <TimelineClient initialMilestones={(data as Milestone[] | null) ?? []} />
}
