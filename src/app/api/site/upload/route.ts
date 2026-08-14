import { NextRequest, NextResponse } from 'next/server'
import { authGuard } from '@/lib/auth/guard'
import { getActorProfile } from '@/lib/auth/actor'
import { canEditSiteContent } from '@/lib/auth/site-content'
import { validateImage, uploadImage } from '@/lib/storage/upload-image.ts'

const BUCKET = 'site-media'

export async function POST(req: NextRequest) {
  const user = await authGuard()
  if (user instanceof NextResponse) return user

  const actor = await getActorProfile(user.id)
  if (!canEditSiteContent(actor)) {
    return NextResponse.json({ data: null, error: 'Forbidden' }, { status: 403 })
  }

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

  const validated = validateImage(file)
  if (!validated.ok) {
    const message = validated.error === 'type' ? '仅支持 PNG/JPEG/WebP/GIF 图片' : '图片不能超过 5MB'
    return NextResponse.json({ data: null, error: message }, { status: 400 })
  }

  const { url, error } = await uploadImage(BUCKET, file)
  if (error) {
    return NextResponse.json({ data: null, error }, { status: 500 })
  }

  return NextResponse.json({ data: { url }, error: null }, { status: 201 })
}
