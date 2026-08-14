// 官网内容的形状。文案本体在 messages/{zh,en,ja}.json 的 site.* 里，页面用
// t.raw() 取数组后按这里的类型消费 —— 类型只声明一次，避免每个页面各写一遍
// `as any`。数组长度由 check-i18n 保证三语一致。
//
// 成员是例外（同 NEWS，见 news.ts 顶部注释）：内容本身（2026-08-14 起）已经从
// messages/{ja,zh,en}.json 的 site.members.list[] 搬进 site_members 表
// （`supabase/migrations/20260814112723_site_content.sql`），本文件负责把一行/
// 多行 site_members 按 locale 转成页面用的 SiteMember，以及"查询结果（含
// error）→ 该渲染什么"这层决策（membersFromQuery）。真正发起网络请求仍是页面
// 组件自己的事（`src/app/[locale]/site/vision/page.tsx`）——这里不做 IO，这样
// 降级行为才能脱离 next dev server 单独用 node:test 验证。
import type { Locale } from '../../i18n/routing.ts'
import { pickLocaleText } from './i18n-content.ts'

export interface SiteStat {
  value: string
  label: string
}

export interface SiteVisionCard {
  no: string
  title: string
  body: string
}

export interface SiteEra {
  value: string
  title: string
  body: string
}

export interface SitePrinciple {
  label: string
  title: string
  body: string
}

export interface SiteProjectTerm {
  term: string
  body: string
}

export interface SiteServiceItem {
  no: string
  code: string
  title: string
  en: string
  /** 首页四栏用的短说明 */
  short: string
  /** SERVICES 页用的完整说明 */
  body: string
}

export interface SiteSubItem {
  no: string
  title: string
  body: string
}

export interface SiteScheduleRow {
  day: string
  program: string
  /** 该阶段的重点（STYLE SETUP / DANCE TRAINING …）。原来这一列是出演单元，
      排期从「每晚节目表」改成「训练到开播的阶段计划」后换成了阶段标签。 */
  focus: string
  time: string
}

export interface SiteCaptain {
  eyebrow: string
  name: string
  jp: string
  body: string
}

export interface SiteRecruitRow {
  label: string
  body: string
}

/**
 * MOONDOLLZ 共 12 位，是 site_members.no 的 check 约束（1–12）的上界，两处
 * 必须一致——改任何一边都要连带看看另一边。
 */
export const MEMBER_SLOTS = 12

/**
 * 渲染官网所需的 site_members 列集合（渲染视角，不含 id/created_at 等审计
 * 列——那些是后台配置页的关注点，见 `src/lib/site/members-service.ts` 的
 * MemberRow）。
 */
export interface SiteMemberRow {
  no: number
  is_revealed: boolean
  photo_url: string | null
  /** 罗马字卡片主标题（KANO / MIKOTO…），不分语言。 */
  name: string | null
  name_ja: string | null
  /**
   * 不能省——多数成员 zh 与 ja 是同一个词的繁简变体，但 3 号 LULU 例外：
   * ja 用片假名音译「ルル」，zh 用汉字「露露」，是两种不同的书写形式，
   * 不是同一字的简繁差异。这里回退到 name_ja 会让「露露」永久丢失。
   */
  name_zh: string | null
  name_en: string | null
  specialty_ja: string | null
  specialty_zh: string | null
  specialty_en: string | null
  /** 未公开卡位各自的预计公开时间，替代 i18n 里写死的 unrevealedRole/note。 */
  expected_reveal_on: string | null
}

export interface SiteMember {
  no: string
  name: string
  role: string
  /** 缺图时留空，MemberCard 渲染蓝图占位框——不用别的成员的图顶替。 */
  image?: string
}

/** expected_reveal_on（'YYYY-MM-DD'）→ 展示用月份（'YYYY-MM'）。 */
function formatRevealMonth(expectedRevealOn: string): string {
  return expectedRevealOn.slice(0, 7)
}

/**
 * 姓名／特长的拼接分隔符：ja/zh 用全角「／」，en 用半角" / "——与
 * scripts/seed-site-content.mjs 的 SPLITTERS 互为逆操作，同一条规则两处
 * 必须同步（那边负责把 i18n 的合并字符串拆开写库，这边负责把库里拆开的两列
 * 拼回展示用的一行）。
 */
function joinNameAndSpecialty(locale: Locale, name: string, specialty: string): string {
  return locale === 'en' ? `${name} / ${specialty}` : `${name}／${specialty}`
}

/**
 * 把一个卡位（可能不存在，也可能存在但未公开）转成 SiteMember。row 为
 * undefined（查询没返回这个 no，比如降级或异常数据）与显式
 * `is_revealed: false` 同等处理，都不能让卡片区块缺角或渲染出空白——这两种
 * 情况的展示结果必须一样。
 *
 * 未公开卡位的 role 优先用该行自己的 expected_reveal_on 格式化成
 * 'YYYY-MM'，不用全局写死的文案——不同卡位的公开时间不一样。读到 NULL
 * （异常历史数据）或整行都没有时才落到 unrevealedScheduleUnknown，不能
 * 返回空字符串。正常 seed 的 9–12 行都带 expected_reveal_on，这条 fallback
 * 只处理异常情况。
 */
function buildMember(
  row: SiteMemberRow | undefined,
  no: number,
  locale: Locale,
  unrevealedName: string,
  unrevealedScheduleUnknown: string,
): SiteMember {
  const label = `NO.${String(no).padStart(2, '0')}`

  if (!row || !row.is_revealed) {
    const role = row?.expected_reveal_on ? formatRevealMonth(row.expected_reveal_on) : unrevealedScheduleUnknown
    return { no: label, name: unrevealedName, role }
  }

  const localizedName = pickLocaleText(locale, { ja: row.name_ja ?? row.name ?? '', zh: row.name_zh, en: row.name_en })
  const specialty = pickLocaleText(locale, { ja: row.specialty_ja ?? '', zh: row.specialty_zh, en: row.specialty_en })

  return {
    no: label,
    name: row.name ?? unrevealedName,
    role: joinNameAndSpecialty(locale, localizedName, specialty),
    image: row.photo_url ?? undefined,
  }
}

/**
 * 把 site_members 的行集合按 locale 补齐到 12 个卡位。rows 不需要排好序或
 * 补满 12 行——缺行（查询降级、seed 尚未跑）一律按未公开卡位处理，不让网格
 * 缺角或让整页挂掉。
 */
export function buildMembers(
  rows: SiteMemberRow[],
  locale: Locale,
  unrevealedName: string,
  unrevealedScheduleUnknown: string,
): SiteMember[] {
  const byNo = new Map(rows.map((row) => [row.no, row]))
  return Array.from({ length: MEMBER_SLOTS }, (_, i) => {
    const no = i + 1
    return buildMember(byNo.get(no), no, locale, unrevealedName, unrevealedScheduleUnknown)
  })
}

/** 与 supabase-js 查询返回值兼容的最小形状，不引入真实客户端的复杂泛型。 */
export interface SiteMemberQueryResult {
  data: unknown
  error: { code?: string; message?: string } | null
}

/**
 * 查询结果 → 12 个卡位。数据库故障不该让 VISION 整页 500（连带宣言/年代/团体
 * 性格一起）——这里查询失败时降级为全部按「未公开」渲染的 12 个占位卡位（复用
 * buildMembers 传空数组的行为，role 落到 unrevealedScheduleUnknown，因为拿不到
 * 每行各自的 expected_reveal_on），而不是抛错。但降级不等于沉默：真实故障必须
 * 经 onQueryError 上报，否则「数据库打嗝」在监控里会和「目前确实还没公开任何
 * 成员」长得一模一样。
 *
 * onQueryError 是回调而不是这里直接 console.error：页面组件负责实际打印
 * （可以加前缀等上下文），这里只做「出错了该返回什么」的决策。
 */
export function membersFromQuery(
  locale: Locale,
  result: SiteMemberQueryResult,
  labels: { unrevealedName: string; unrevealedScheduleUnknown: string },
  onQueryError: (error: { code?: string; message?: string }) => void,
): SiteMember[] {
  if (result.error) {
    onQueryError(result.error)
    return buildMembers([], locale, labels.unrevealedName, labels.unrevealedScheduleUnknown)
  }
  return buildMembers((result.data ?? []) as SiteMemberRow[], locale, labels.unrevealedName, labels.unrevealedScheduleUnknown)
}
