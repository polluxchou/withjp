import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { authGuard } from '@/lib/auth/guard'
import type { DevicePaymentStatus } from '@/lib/types'

type Params = { params: { id: string } }

const VALID_STATUSES: DevicePaymentStatus[] = [
  'budgeted', 'ordered_unpaid', 'paid', 'refunded', 'partially_refunded',
]

// PATCH /api/devices/:id — update device fields
export async function PATCH(req: NextRequest, { params }: Params) {
  const user = await authGuard()
  if (user instanceof NextResponse) return user

  const db   = createServerClient()
  const body = await req.json()

  // Strip generated column — DB computes it
  const { total_price: _generated, id: _id, created_at: _ca, ...updates } = body

  if ('payment_status' in updates && !VALID_STATUSES.includes(updates.payment_status)) {
    return NextResponse.json(
      { data: null, error: `payment_status must be one of: ${VALID_STATUSES.join(', ')}` },
      { status: 400 }
    )
  }

  if ('device_name' in updates && !updates.device_name) {
    return NextResponse.json({ data: null, error: 'device_name cannot be empty' }, { status: 400 })
  }

  if ('purchase_date' in updates && !updates.purchase_date) {
    return NextResponse.json({ data: null, error: 'purchase_date cannot be empty' }, { status: 400 })
  }

  const { data, error } = await db
    .from('devices')
    .update(updates)
    .eq('id', params.id)
    .select('*')
    .single()

  if (error) return NextResponse.json({ data: null, error: error.message }, { status: 500 })
  return NextResponse.json({ data, error: null })
}

// DELETE /api/devices/:id
export async function DELETE(_req: NextRequest, { params }: Params) {
  const user = await authGuard()
  if (user instanceof NextResponse) return user

  const db = createServerClient()
  const { error } = await db.from('devices').delete().eq('id', params.id)
  if (error) return NextResponse.json({ data: null, error: error.message }, { status: 500 })
  return NextResponse.json({ data: { id: params.id }, error: null })
}
