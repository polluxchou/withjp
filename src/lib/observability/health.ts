// /api/health 的纯逻辑。接口不带鉴权，所以对外只有两档状态与检查项名：
// 不出版本号、表名、变量值、报错原文。

export type CheckStatus = 'ok' | 'fail'
export type HealthStatus = 'ok' | 'degraded'

export interface HealthReport {
  status: HealthStatus
  checks: { env: CheckStatus; database: CheckStatus }
}

// 缺任何一个，后台都起不来（登录、读库、服务端写入）。
export const REQUIRED_ENV = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
] as const

/** 只判有无，不读值、不回报是哪一个缺了。 */
export function checkRequiredEnv(env: Record<string, string | undefined>): CheckStatus {
  return REQUIRED_ENV.every((key) => (env[key] ?? '').trim() !== '') ? 'ok' : 'fail'
}

export function summarizeHealth(checks: HealthReport['checks']): HealthReport {
  const allOk = Object.values(checks).every((status) => status === 'ok')
  return { status: allOk ? 'ok' : 'degraded', checks }
}

export function httpStatusForHealth(report: HealthReport): 200 | 503 {
  return report.status === 'ok' ? 200 : 503
}

export interface HealthDeps {
  env: Record<string, string | undefined>
  /** 做一次极轻的查询；连不上、超时、返回错误都算 false。不许抛。 */
  pingDatabase: () => Promise<boolean>
}

export async function runHealthChecks(deps: HealthDeps): Promise<HealthReport> {
  const env = checkRequiredEnv(deps.env)
  // 变量不齐时连库的 client 都建不出来，直接判失败，不去试。
  let database: CheckStatus = 'fail'
  if (env === 'ok') {
    try {
      database = (await deps.pingDatabase()) ? 'ok' : 'fail'
    } catch {
      database = 'fail'
    }
  }
  return summarizeHealth({ env, database })
}

/**
 * 短时缓存：接口是公开的，不能让外面每打一次就查一次库。
 * 同一实例 ttlMs 内复用上一份结果，并发中的请求共用同一次检查。
 */
export function createHealthCache(
  run: () => Promise<HealthReport>,
  ttlMs: number,
  now: () => number = Date.now,
): () => Promise<HealthReport> {
  let cached: { at: number; report: HealthReport } | null = null
  let inflight: Promise<HealthReport> | null = null

  return async () => {
    if (cached && now() - cached.at < ttlMs) return cached.report
    inflight ??= run()
      .then((report) => {
        cached = { at: now(), report }
        return report
      })
      .finally(() => {
        inflight = null
      })
    return inflight
  }
}
