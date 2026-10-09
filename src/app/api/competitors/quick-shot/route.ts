// src/app/api/competitors/quick-shot/route.ts
// 浏览器扩展 extensions/live-shot 的一键上传入口。业务判定全在 quickShotService.ts，
// 这里只绑定真实依赖 + 转成 NextResponse。鉴权只认 Bearer 令牌，不走 authGuard（它只读 Cookie）。
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@/lib/supabase/server'
import { uploadImage, validateImage } from '@/lib/storage/upload-image.ts'
import { QUICK_SHOT_TAG } from '@/lib/competitors/quickShot.ts'
import { createQuickShotHandlers, type QuickShotDeps } from '@/lib/competitors/quickShotService.ts'

function deps(): QuickShotDeps {
  const db = createServerClient()
  const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  return {
    verifyToken: async (token) => {
      const { data, error } = await anon.auth.getUser(token)
      return error || !data.user ? null : { id: data.user.id }
    },
    listCompetitors: async () => {
      const { data, error } = await db.from('competitors').select('id, handle, display_name').eq('platform', 'tiktok')
      return error ? null : (data ?? [])
    },
    validateImage,
    uploadImage,
    findShot: async (createdBy, competitorId, capturedAtIso) => {
      const { data, error } = await db
        .from('competitor_shots')
        .select('id')
        .eq('created_by', createdBy)
        .eq('competitor_id', competitorId)
        .eq('captured_at', capturedAtIso)
        .limit(1)
        .maybeSingle()
      return error || !data ? null : String((data as { id: string }).id)
    },
    insertShot: async (row) => {
      const { data, error } = await db.from('competitor_shots').insert(row).select('id').single()
      return error || !data ? null : { id: String((data as { id: string }).id) }
    },
    insertReadings: async (rows) => {
      // 重试时同一读数时刻会再来一次：撞唯一约束的行直接跳过，不让整批失败、不报假的 207
      const { error } = await db
        .from('competitor_viewer_readings')
        .upsert(rows, { onConflict: 'competitor_id,captured_at,source', ignoreDuplicates: true })
      return !error
    },
    countTodayUploads: async (userId, shotOn) => {
      const { count, error } = await db
        .from('competitor_shots')
        .select('id', { count: 'exact', head: true })
        .eq('created_by', userId)
        .eq('tag', QUICK_SHOT_TAG)
        .eq('shot_on', shotOn)
      return error ? null : (count ?? 0)
    },
    now: () => Date.now(),
  }
}

export async function POST(req: NextRequest) {
  const r = await createQuickShotHandlers(deps()).post(req)
  return NextResponse.json(r.body, { status: r.status })
}

export async function GET(req: NextRequest) {
  const r = await createQuickShotHandlers(deps()).get(req)
  return NextResponse.json(r.body, { status: r.status })
}
