import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { createHealthCache, httpStatusForHealth, runHealthChecks } from '@/lib/observability/health'

// 健康检查：给外部探活（uptime 监控、部署后核对）用，所以不带鉴权。
// 正因为公开，响应只有 ok / degraded 与检查项名，细节一律不出（见 health.ts）。
// 官网域名下不开放：domain-routing.ts 对 /api/* 只放行投递接口，这里照旧 404。
export const dynamic = 'force-dynamic'

const DB_TIMEOUT_MS = 3000
const CACHE_TTL_MS = 10_000

// 极轻的一次读：只取一行的主键，不取内容。失败原因不往外带，也不记录原文。
async function pingDatabase(): Promise<boolean> {
  const { error } = await createServerClient()
    .from('config')
    .select('id')
    .limit(1)
    .abortSignal(AbortSignal.timeout(DB_TIMEOUT_MS))
  return !error
}

const checkHealth = createHealthCache(
  () => runHealthChecks({ env: process.env, pingDatabase }),
  CACHE_TTL_MS,
)

export async function GET() {
  const report = await checkHealth()
  return NextResponse.json(report, {
    status: httpStatusForHealth(report),
    headers: { 'Cache-Control': 'no-store' },
  })
}
