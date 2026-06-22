import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'
import { authGuard } from '@/lib/auth/guard'
import { createServerClient } from '@/lib/supabase/server'

const BUCKET = 'item-photos'
const MAX_BYTES = 5 * 1024 * 1024 // 5MB
const ALLOWED = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif'])

export async function POST(req: NextRequest) {
  const user = await authGuard()
  if (user instanceof NextResponse) return user

  let form: FormData
  try {
    form = await req.formData()
  } catch {
    return NextResponse.json({ data: null, error: 'Invalid form data' }, { status: 400 })
  }

  const file = form.get('file')
  if (!(file instanceof File)) {
    return NextResponse.json({ data: null, error: 'file is required' }, { status: 400 })
  }
  if (!ALLOWED.has(file.type)) {
    return NextResponse.json({ data: null, error: '仅支持 PNG/JPEG/WebP/GIF 图片' }, { status: 400 })
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ data: null, error: '图片不能超过 5MB' }, { status: 400 })
  }

  const ext = file.name.includes('.') ? file.name.split('.').pop() : 'png'
  const path = `${randomUUID()}.${ext}`
  const buffer = Buffer.from(await file.arrayBuffer())

  const db = createServerClient()
  const { error } = await db.storage.from(BUCKET).upload(path, buffer, {
    contentType: file.type,
    upsert: false,
  })
  if (error) {
    return NextResponse.json({ data: null, error: error.message }, { status: 500 })
  }

  const { data } = db.storage.from(BUCKET).getPublicUrl(path)
  return NextResponse.json({ data: { url: data.publicUrl }, error: null }, { status: 201 })
}
