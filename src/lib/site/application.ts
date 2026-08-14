import { createHash } from 'node:crypto'
// 相对路径 + .ts 后缀：node --test 直接跑 TS 时不认 tsconfig 的 `@/` 别名
// （仓库既有测试模块同样用相对导入）。
import { locales, type Locale } from '../../i18n/routing.ts'

/**
 * 应募表单的校验与反垃圾判定。纯函数、无 IO —— 数据库和 HTTP 的部分在
 * src/app/api/site/applications/route.ts 里，这里只回答「这份提交合不合法」。
 *
 * 上限与数据库的 check 约束一致（supabase/migrations/20260811183310_site_applications.sql），
 * 两边改必须一起改。
 */
export const APPLICATION_KINDS = ['creator', 'photographer', 'makeup', 'group_live_ops'] as const
export type ApplicationKind = (typeof APPLICATION_KINDS)[number]

export const COMMUTE_MODES = ['subway', 'bicycle', 'walk', 'car'] as const
export type CommuteMode = (typeof COMMUTE_MODES)[number]

export const LIMITS = {
  name: 30,
  residence: 60,
  contact: 120,
  experience: 1000,
  email: 254,
  ageMin: 16,
  ageMax: 60,
  /** 比这更快提交的不可能是人在填表 */
  minElapsedMs: 3000,
} as const

/** 字段级错误码。人类可读的文案由前端按当前语言渲染，API 不返回自然语言。 */
export type FieldError = 'required' | 'tooLong' | 'outOfRange' | 'invalidAge' | 'consent' | 'invalidEmail'

export interface ApplicationInput {
  kind?: unknown
  name?: unknown
  age?: unknown
  residence?: unknown
  contact?: unknown
  experience?: unknown
  email?: unknown
  commuteMode?: unknown
  consent?: unknown
  locale?: unknown
}

export interface ApplicationValue {
  kind: ApplicationKind
  name: string
  contact: string
  locale: Locale
  age: number | null
  residence: string | null
  experience: string | null
  email: string | null
  commuteMode: CommuteMode | null
}

export type ApplicationFields = Partial<Record<keyof ApplicationInput, FieldError>>

export type ValidationResult =
  | { ok: true; value: ApplicationValue }
  | { ok: false; fields: ApplicationFields }

function asTrimmed(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

/**
 * 校验一份应募提交。一次返回所有出错字段，而不是遇到第一个错就停 ——
 * 让应募者一轮就能改完。
 */
export function validateApplication(input: ApplicationInput): ValidationResult {
  const fields: ApplicationFields = {}

  // 不传 kind = 在飞的旧主播表单，按 creator 处理；传了但不认识则明确报错，
  // 不静默落成 creator —— 静默会让一条本该是摄影师的线索永远进错下游。
  const rawKind = input.kind === undefined || input.kind === null || input.kind === ''
    ? 'creator'
    : input.kind
  if (!APPLICATION_KINDS.includes(rawKind as ApplicationKind)) {
    return { ok: false, fields: { kind: 'required' } }
  }
  const kind = rawKind as ApplicationKind

  const name = asTrimmed(input.name)
  if (!name) fields.name = 'required'
  else if (name.length > LIMITS.name) fields.name = 'tooLong'

  const contact = asTrimmed(input.contact)
  if (!contact) fields.contact = 'required'
  else if (contact.length > LIMITS.contact) fields.contact = 'tooLong'

  const experience = asTrimmed(input.experience)
  if (experience.length > LIMITS.experience) fields.experience = 'tooLong'

  // 收集姓名/联系方式属于个人信息，没有明示同意就不能落库。
  if (input.consent !== true) fields.consent = 'consent'

  const locale = typeof input.locale === 'string' ? input.locale : ''
  if (!locales.includes(locale as Locale)) fields.locale = 'required'

  let age: number | null = null
  let residence: string | null = null
  let email: string | null = null
  let commuteMode: CommuteMode | null = null

  if (kind === 'creator') {
    const rawResidence = asTrimmed(input.residence)
    if (!rawResidence) fields.residence = 'required'
    else if (rawResidence.length > LIMITS.residence) fields.residence = 'tooLong'
    else residence = rawResidence

    // 表单里 age 是 <input>，到手一定是字符串；同时容忍已经是 number 的调用方。
    // 「没填」和「填了但不是数字」要分开报：前者是 required，后者是 invalidAge。
    const rawAge = input.age
    let ageValue = Number.NaN
    if (rawAge === undefined || rawAge === null || (typeof rawAge === 'string' && rawAge.trim() === '')) {
      fields.age = 'required'
    } else if (typeof rawAge === 'number') {
      ageValue = rawAge
    } else if (typeof rawAge === 'string' && /^\d+$/.test(rawAge.trim())) {
      ageValue = Number(rawAge.trim())
    } else {
      fields.age = 'invalidAge'
    }
    if (!fields.age) {
      if (!Number.isInteger(ageValue)) fields.age = 'invalidAge'
      else if (ageValue < LIMITS.ageMin || ageValue > LIMITS.ageMax) fields.age = 'outOfRange'
      else age = ageValue
    }
  } else {
    const rawEmail = asTrimmed(input.email)
    if (!rawEmail) fields.email = 'required'
    else if (rawEmail.length > LIMITS.email) fields.email = 'tooLong'
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(rawEmail)) fields.email = 'invalidEmail'
    else email = rawEmail

    const rawMode = asTrimmed(input.commuteMode)
    if (!rawMode) fields.commuteMode = 'required'
    else if (!COMMUTE_MODES.includes(rawMode as CommuteMode)) fields.commuteMode = 'required'
    else commuteMode = rawMode as CommuteMode

    // 员工类的居住位置是选填
    const rawResidence = asTrimmed(input.residence)
    if (rawResidence.length > LIMITS.residence) fields.residence = 'tooLong'
    else residence = rawResidence || null
  }

  if (Object.keys(fields).length > 0) return { ok: false, fields }

  return {
    ok: true,
    value: {
      kind,
      name,
      contact,
      locale: locale as Locale,
      age,
      residence,
      experience: experience || null,
      email,
      commuteMode,
    },
  }
}

/**
 * 反垃圾判定。两道弱信号合起来能挡掉绝大多数无脑投递，而且对真人零摩擦：
 *   - honeypot：页面上隐藏的字段，真人看不到所以永远是空的
 *   - 填写时长：表单挂载到提交之间的毫秒数
 *
 * elapsedMs 缺失或不是有效数字一律按机器人处理（fail closed）：我们自己的
 * 表单一定会带上它，不带的客户端就不是我们的表单。
 */
export function isBotSubmission(input: { hp?: unknown; elapsedMs?: unknown }): boolean {
  if (typeof input.hp === 'string' && input.hp.trim() !== '') return true
  const elapsed = input.elapsedMs
  if (typeof elapsed !== 'number' || !Number.isFinite(elapsed)) return true
  return elapsed < LIMITS.minElapsedMs
}

/**
 * IP 的限流指纹。存哈希而不是原始 IP：我们要的是「同一来源一小时内提交了
 * 几次」，不需要知道来源是谁，也不该把访客地址留在库里。
 */
export function hashIp(ip: string, salt: string): string {
  return createHash('sha256').update(`${salt}:${ip}`).digest('hex')
}
