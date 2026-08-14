import { createServerClient } from '@/lib/supabase/server'
import { createNotification } from '@/lib/notifications/create'
import { hashIp, type ApplicationValue } from './application'

/**
 * 应募投递的服务端部分：限流、落库、通知 ops。校验与反垃圾判定在
 * ./application.ts（纯函数，有单测），这里只做有 IO 的事。
 */

/** 同一来源一小时内允许的提交数。超过就 429。 */
export const RATE_LIMIT_PER_HOUR = 5

export type ApplicationErrorCode = 'rate_limited' | 'db_error'

export type SubmitResult =
  | { data: { id: string }; error: null }
  | { data: null; error: ApplicationErrorCode }

export function httpStatusForApplicationError(code: ApplicationErrorCode): number {
  return code === 'rate_limited' ? 429 : 500
}

function ipSalt(): string {
  const salt = process.env.SITE_APPLICATION_IP_SALT
  if (salt) return salt
  // 兜底值让功能在未配置环境变量时仍可用（限流照常生效），但同一 IP 的指纹在
  // 不同部署间可预测，所以生产必须配。
  console.warn('[site] SITE_APPLICATION_IP_SALT is not set, falling back to a shared default salt')
  return 'echoamp-site-default-salt'
}

export interface SubmitMeta {
  ip: string | null
  userAgent: string | null
}

export async function submitApplication(
  value: ApplicationValue,
  meta: SubmitMeta,
): Promise<SubmitResult> {
  const db = createServerClient()
  const ip_hash = meta.ip ? hashIp(meta.ip, ipSalt()) : null

  if (ip_hash) {
    const since = new Date(Date.now() - 60 * 60 * 1000).toISOString()
    const { count, error } = await db
      .from('site_applications')
      .select('id', { count: 'exact', head: true })
      .eq('ip_hash', ip_hash)
      .gte('created_at', since)
    if (error) return { data: null, error: 'db_error' }
    if ((count ?? 0) >= RATE_LIMIT_PER_HOUR) return { data: null, error: 'rate_limited' }
  }

  // TODO(task-3): value 已含 kind/email/commuteMode（见 application.ts），这里仍按旧字段落库——
  // 员工类提交（kind: 'photographer' | 'makeup' | 'group_live_ops'）会被
  // site_applications_creator_fields 约束拒绝：insert 不写 kind（DB 走 default 'creator'），
  // 而 value.age/value.residence 对这三类是 null，触发该约束，稳定返回 500。
  // src/app/api/site/applications/route.ts 是全站唯一不过 authGuard 的公开写接口，把整个
  // 请求体原样传给 validateApplication(body)，所以任何人直接带 kind: 'photographer' 调用该
  // API 即可复现。落库前必须补齐 kind/email/commute_mode 三个新字段，并按 kind 分流写入。
  const { data, error } = await db
    .from('site_applications')
    .insert({
      name: value.name,
      age: value.age,
      residence: value.residence,
      contact: value.contact,
      experience: value.experience,
      locale: value.locale,
      ip_hash,
      user_agent: meta.userAgent?.slice(0, 400) ?? null,
    })
    .select('id')
    .single()

  if (error || !data) return { data: null, error: 'db_error' }

  await notifyOps(data.id, value)
  return { data: { id: data.id }, error: null }
}

/**
 * 通知运营。招募归 ops，所以只推给 role='ops' 的人；一个 ops 都没有时退回全员，
 * 免得投递静静躺在库里没人看。通知失败不影响投递结果（createNotification 自己
 * 吞异常并 warn）。
 */
async function notifyOps(id: string, value: ApplicationValue): Promise<void> {
  const db = createServerClient()
  const { data: ops } = await db.from('users').select('id').eq('role', 'ops')
  let targets = ops ?? []
  if (targets.length === 0) {
    const { data: everyone } = await db.from('users').select('id')
    targets = everyone ?? []
  }

  await Promise.all(
    targets.map((user: { id: string }) =>
      createNotification({
        user_id: user.id,
        type: 'site_application',
        // 标题自带 RECRUIT 前缀：站内通知面板只给 approval_requested 画了类型
        // 徽标，新类型没有徽标，靠标题本身说清是什么。联系方式不进通知，
        // 要看就去后台页面 —— 个人信息少一处流转。
        title: `RECRUIT ／ ${value.name}`,
        body: `${value.age} ／ ${value.residence}`,
        entity_type: 'site_application',
        entity_id: id,
        action_url: '/recruit-applications',
      }),
    ),
  )
}
