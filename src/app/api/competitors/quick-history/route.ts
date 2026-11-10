// src/app/api/competitors/quick-history/route.ts
// 浏览器扩展 extensions/live-shot 的「读开播记录」入口。业务判定全在 quickHistoryService.ts，
// 这里只绑定真实依赖 + 转成 NextResponse。鉴权只认 Bearer 令牌，不走 authGuard（它只读 Cookie）。
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@/lib/supabase/server'
import { fetchAllRows } from '@/lib/supabase/fetchAll'
import { accessScopeOf } from '@/lib/auth/access-scope'
import { upsertLiveSessions } from '@/lib/competitors/service'
import { createQuickHistoryHandlers, type QuickHistoryDeps } from '@/lib/competitors/quickHistoryService.ts'

function deps(): QuickHistoryDeps {
  const db = createServerClient()
  const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  return {
    verifyToken: async (token) => {
      const { data, error } = await anon.auth.getUser(token)
      if (!error && data.user) {
        if (data.user.is_anonymous) return null
        // 受限范围在 app_metadata（只有 service role 能写），与后台守卫同一来源
        return { id: data.user.id, access_scope: accessScopeOf(data.user.app_metadata) }
      }
      const status = (error as { status?: unknown } | null)?.status
      if (typeof status === 'number' && status >= 400 && status < 500 && status !== 429) return null
      console.error('[quick-history] auth.getUser 暂时不可用', error)
      throw error ?? new Error('auth getUser returned no user')
    },
    listCompetitors: async () => {
      const { data, error } = await fetchAllRows((from, to) => db.from('competitors').select('id, handle, display_name')
        .eq('platform', 'tiktok').order('id', { ascending: true }).range(from, to))
      return error ? null : (data ?? [])
    },
    upsertSessions: async (competitorId, rows, actor) => {
      const r = await upsertLiveSessions(competitorId, rows, actor)
      if (r.error || !r.data) {
        console.error('[quick-history] upsert', r.error)
        return null
      }
      return { inserted: r.data.inserted, updated: r.data.updated, skipped: r.data.skipped }
    },
    now: () => Date.now(),
  }
}

export async function POST(req: NextRequest) {
  try {
    const r = await createQuickHistoryHandlers(deps()).post(req)
    return NextResponse.json(r.body, { status: r.status })
  } catch (e) {
    console.error('[quick-history]', e)
    return NextResponse.json({ data: null, error: 'internal_error' }, { status: 500 })
  }
}
