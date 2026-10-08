// src/lib/competitors/companies.ts
// 竞品公司页的数据形状与纯拼装。零 IO：service 把四张表的行原样交进来，
// 这里负责把"公司 ↔ 团"的关联挂好、给已追踪的团补上最新粉丝数、
// 再算出没有归属任何公司的追踪账号。拼装放在 lib 才测得到真行为（本仓没有 DOM 测试环境）。

export type CapitalBackground = 'confirmed' | 'suspected' | 'none_seen' | 'unknown'

export interface CompanySource {
  label: string
  url: string
}

export interface CompetitorCompany {
  id: string
  name: string
  legal_name: string | null
  website: string | null
  location: string
  group_format: string
  scale: string
  capital_background: CapitalBackground
  capital_note: string
  recruit_note: string
  note: string
  sources: CompanySource[]
  info_as_of: string | null
  sort_order: number
}

export interface CompanyAccountRow {
  id: string
  company_id: string
  group_name: string
  handle: string | null
  competitor_id: string | null
  /** 20261008 迁移加的列；迁移执行前查不到，按缺失处理。 */
  highlight?: string | null
  /** active / inactive（已停更）。迁移执行前没有这列，按 active。 */
  status?: string | null
  /** 不追踪的团一次性存档的主页数据（jsonb，形状见 normalizeAccountSnapshot）。 */
  profile_snapshot?: unknown
  note: string
  sort_order: number
}

export type AccountStatus = 'active' | 'inactive'

/** 不追踪的团存档的那一次主页数据。 */
export interface AccountSnapshot {
  captured_on: string
  followers: number | null
  likes: number | null
  avatar_url: string | null
}

/** 拼装只需要竞品的这几个字段；真实 Competitor 行结构上满足它。 */
export interface CompanyCompetitorInput {
  id: string
  handle: string
  display_name: string | null
  parent_id: string | null
  avatar_url?: string | null
}

export interface CompanySnapshotInput {
  competitor_id: string
  captured_on: string
  followers: number | null
  likes?: number | null
}

export interface TrackedAccount {
  competitor_id: string
  handle: string
  display_name: string | null
  avatar_url: string | null
  /** 最新一条快照的粉丝数；没有快照或快照里粉丝为空时为 null。 */
  followers: number | null
  /** 同一条快照的获赞数。 */
  likes: number | null
  followers_on: string | null
}

export interface CompanyAccountView {
  id: string
  group_name: string
  /** 优先取已追踪竞品的 handle（对方改过 id 时追踪表是新的），其次是关联行自己记的。 */
  handle: string | null
  /** 方块左上角的战绩角标，如「Diamond #1」；没有就不显示。 */
  highlight: string | null
  note: string
  /** inactive = 已停更：不进追踪清单，页面标「已停更」。 */
  status: AccountStatus
  /** null = 这个团还没进追踪清单。 */
  tracked: TrackedAccount | null
  /** 没追踪时的存档数据；已追踪的团一律为 null（以追踪快照为准）。 */
  snapshot: AccountSnapshot | null
}

export interface CompanyView extends CompetitorCompany {
  accounts: CompanyAccountView[]
  /** 旗下已追踪团的粉丝合计；一个有数据的都没有时为 null（显示「—」而不是 0）。 */
  follower_total: number | null
}

export interface CompanyBoard {
  companies: CompanyView[]
  /** 追踪清单里的主账号，但还没挂到任何公司下。按粉丝数降序，无数据的垫底。 */
  unassigned: TrackedAccount[]
}

const CAPITAL_VALUES: readonly CapitalBackground[] = ['confirmed', 'suspected', 'none_seen', 'unknown']

/** 数据库 check 约束之外再兜一层：脏值一律当"无从判断"，不让页面拿到未知枚举。 */
export function normalizeCapital(v: unknown): CapitalBackground {
  return CAPITAL_VALUES.includes(v as CapitalBackground) ? (v as CapitalBackground) : 'unknown'
}

/** sources 是 jsonb，只保留 label、url 都是非空字符串且 url 为 http(s) 的项。 */
export function normalizeSources(v: unknown): CompanySource[] {
  if (!Array.isArray(v)) return []
  const out: CompanySource[] = []
  for (const item of v) {
    if (!item || typeof item !== 'object') continue
    const { label, url } = item as Record<string, unknown>
    if (typeof label !== 'string' || typeof url !== 'string') continue
    if (!label.trim() || !/^https?:\/\//i.test(url)) continue
    out.push({ label: label.trim(), url })
  }
  return out
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/
const finiteOrNull = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)

export function normalizeStatus(v: unknown): AccountStatus {
  return v === 'inactive' ? 'inactive' : 'active'
}

/**
 * profile_snapshot 是手写进库的 jsonb：采集日必须是 YYYY-MM-DD，否则整份当没有
 * （说不清是哪天的数字不能展示）；数字字段不是有限数就当缺失；头像只放行 http(s)。
 */
export function normalizeAccountSnapshot(v: unknown): AccountSnapshot | null {
  if (!v || typeof v !== 'object') return null
  const o = v as Record<string, unknown>
  if (typeof o.captured_on !== 'string' || !ISO_DATE.test(o.captured_on)) return null
  return {
    captured_on: o.captured_on,
    followers: finiteOrNull(o.followers),
    likes: finiteOrNull(o.likes),
    avatar_url: normalizeWebsite(o.avatar_url),
  }
}

/**
 * 要渲染成 href / img src 的地址（官网、头像）：只放行 http(s)，其余（空串、javascript:、
 * 手工 SQL 留下的占位文字等）一律当没有。
 */
export function normalizeWebsite(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const url = v.trim()
  return /^https?:\/\//i.test(url) ? url : null
}

/** 公司名旁的官网链接文字：只显示域名（去掉 www.），比整条 URL 短且一眼能认。 */
export function websiteLabel(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./i, '')
  } catch {
    return url
  }
}

/** 每个竞品取 captured_on 最大的那条快照。同一天多条时保留先出现的。 */
export function latestSnapshotByCompetitor(
  snapshots: CompanySnapshotInput[],
): Map<string, CompanySnapshotInput> {
  const latest = new Map<string, CompanySnapshotInput>()
  for (const s of snapshots) {
    const cur = latest.get(s.competitor_id)
    if (!cur || s.captured_on > cur.captured_on) latest.set(s.competitor_id, s)
  }
  return latest
}

function byOrderThenName<T extends { sort_order: number }>(name: (x: T) => string) {
  return (a: T, b: T) => a.sort_order - b.sort_order || name(a).localeCompare(name(b))
}

export function assembleCompanyBoard(
  companies: CompetitorCompany[],
  links: CompanyAccountRow[],
  competitors: CompanyCompetitorInput[],
  snapshots: CompanySnapshotInput[],
): CompanyBoard {
  const latest = latestSnapshotByCompetitor(snapshots)
  // 只有主账号算"团"；下探出来的子主播挂在父竞品下面，不参与公司归属。
  const topLevel = new Map(competitors.filter((c) => c.parent_id === null).map((c) => [c.id, c]))

  const tracked = (id: string): TrackedAccount | null => {
    const c = topLevel.get(id)
    if (!c) return null
    const snap = latest.get(id)
    return {
      competitor_id: c.id,
      handle: c.handle,
      display_name: c.display_name,
      // 和官网链接同一道闸：手工 SQL 曾把占位文字写进 avatar_url，不拦就是一张破图。
      avatar_url: normalizeWebsite(c.avatar_url),
      followers: snap?.followers ?? null,
      likes: snap?.likes ?? null,
      followers_on: snap ? snap.captured_on : null,
    }
  }

  const linksByCompany = new Map<string, CompanyAccountRow[]>()
  for (const l of links) {
    const arr = linksByCompany.get(l.company_id) ?? []
    arr.push(l)
    linksByCompany.set(l.company_id, arr)
  }

  const assigned = new Set<string>()
  const views: CompanyView[] = [...companies]
    .sort(byOrderThenName<CompetitorCompany>((c) => c.name))
    .map((co) => {
      const accounts = (linksByCompany.get(co.id) ?? [])
        .sort(byOrderThenName<CompanyAccountRow>((l) => l.group_name))
        .map((l): CompanyAccountView => {
          const t = l.competitor_id ? tracked(l.competitor_id) : null
          if (t) assigned.add(t.competitor_id)
          return {
            id: l.id,
            group_name: l.group_name,
            handle: t?.handle ?? l.handle,
            highlight: l.highlight?.trim() || null,
            note: l.note,
            status: normalizeStatus(l.status),
            tracked: t,
            snapshot: t ? null : normalizeAccountSnapshot(l.profile_snapshot),
          }
        })
      const counted = accounts.filter((a) => a.tracked?.followers != null)
      return {
        ...co,
        capital_background: normalizeCapital(co.capital_background),
        website: normalizeWebsite(co.website),
        sources: normalizeSources(co.sources),
        accounts,
        follower_total: counted.length
          ? counted.reduce((sum, a) => sum + (a.tracked?.followers ?? 0), 0)
          : null,
      }
    })

  const unassigned = Array.from(topLevel.keys())
    .filter((id) => !assigned.has(id))
    .map((id) => tracked(id) as TrackedAccount)
    .sort((a, b) => {
      if (a.followers === null && b.followers === null) return a.handle.localeCompare(b.handle)
      if (a.followers === null) return 1
      if (b.followers === null) return -1
      return b.followers - a.followers
    })

  return { companies: views, unassigned }
}
