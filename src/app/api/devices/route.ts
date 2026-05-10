import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { authGuard } from '@/lib/auth/guard'
import type { DevicePaymentStatus } from '@/lib/types'

const VALID_STATUSES: DevicePaymentStatus[] = [
  'budgeted', 'ordered_unpaid', 'paid', 'refunded', 'partially_refunded',
]

// GET /api/devices — list devices with optional filters
export async function GET(req: NextRequest) {
  const user = await authGuard()
  if (user instanceof NextResponse) return user

  const db     = createServerClient()
  const params = req.nextUrl.searchParams

  const q                = params.get('q')
  const payment_status   = params.get('payment_status')
  const payment_method   = params.get('payment_method')
  const user_name        = params.get('user_name')
  const buyer_name       = params.get('buyer_name')
  const purchase_location = params.get('purchase_location')
  const purpose          = params.get('purpose')
  const date_from        = params.get('date_from')
  const date_to          = params.get('date_to')

  let query = db
    .from('devices')
    .select('*')
    .order('purchase_date', { ascending: false })
    .order('created_at',    { ascending: false })

  if (q) {
    query = query.or(
      `device_name.ilike.%${q}%,purchase_location.ilike.%${q}%,purchase_purpose.ilike.%${q}%,user_name.ilike.%${q}%,buyer_name.ilike.%${q}%`
    )
  }
  if (payment_status) query = query.eq('payment_status', payment_status)
  if (payment_method) query = query.ilike('payment_method', `%${payment_method}%`)
  if (user_name)      query = query.ilike('user_name', `%${user_name}%`)
  if (buyer_name)     query = query.ilike('buyer_name', `%${buyer_name}%`)
  if (purchase_location) query = query.ilike('purchase_location', `%${purchase_location}%`)
  if (purpose)        query = query.ilike('purchase_purpose', `%${purpose}%`)
  if (date_from)      query = query.gte('purchase_date', date_from)
  if (date_to)        query = query.lte('purchase_date', date_to)

  const { data, error } = await query
  if (error) return NextResponse.json({ data: null, error: error.message }, { status: 500 })
  return NextResponse.json({ data, error: null })
}

// POST /api/devices — create a new device record
export async function POST(req: NextRequest) {
  const user = await authGuard()
  if (user instanceof NextResponse) return user

  const db   = createServerClient()
  const body = await req.json()

  const {
    device_name,
    unit_price,
    quantity,
    purchase_date,
    purchase_location,
    purchase_purpose,
    user_name,
    buyer_name,
    payment_method,
    payment_status,
  } = body

  if (!device_name || !purchase_date || !payment_status) {
    return NextResponse.json(
      { data: null, error: 'device_name, purchase_date, and payment_status are required' },
      { status: 400 }
    )
  }

  if (!VALID_STATUSES.includes(payment_status)) {
    return NextResponse.json(
      { data: null, error: `payment_status must be one of: ${VALID_STATUSES.join(', ')}` },
      { status: 400 }
    )
  }

  const { data, error } = await db
    .from('devices')
    .insert({
      device_name,
      unit_price:        unit_price        ?? 0,
      quantity:          quantity           ?? 1,
      purchase_date,
      purchase_location: purchase_location ?? '',
      purchase_purpose:  purchase_purpose  ?? '',
      user_name:         user_name         ?? '',
      buyer_name:        buyer_name        ?? '',
      payment_method:    payment_method    ?? '',
      payment_status,
    })
    .select('*')
    .single()

  if (error) return NextResponse.json({ data: null, error: error.message }, { status: 500 })
  return NextResponse.json({ data, error: null }, { status: 201 })
}
