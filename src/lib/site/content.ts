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

// 曾经这里有一个 MEMBER_SLOTS = 12 常量，是 site_members.no 的 check 约束
// （1–12）的上界，buildMembers 用它把查询结果补齐到固定 12 张卡。
//
// 自 20260815132734_member_slots_flexible.sql（去掉 no 的上界，只保留
// unique + no > 0）与本文件的 buildMembers 改成数据驱动起，卡位数完全由
// site_members 表的实际行数决定——库里有几行就渲染几张卡，后台可以任意
// 增删（POST /api/site/members 新增、DELETE /api/site/members/[no] 删除）。
// 常量删掉了：seed 脚本（scripts/seed-site-content.mjs）也没有引用它，它是
// 自己核对"回读行数应为 12"的独立断言，不依赖这个常量——留一个名字听起来
// 像事实源、实际已经不是的常量，比没有常量更容易误导下一个读代码的人。

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
 * 把一个存在的卡位行转成 SiteMember。row 一定存在——数据驱动之后不再有"缺行
 * 补占位"这回事：库里没有这个 no 就是没有这张卡，不渲染，不是渲染一张假的
 * 未公开卡（那是编造内容）。row.is_revealed 仍然可能是 false（管理员新增
 * 卡位但还没到公开时间），这种情况按未公开处理，与"行不存在"是两种不同的
 * 状态，不能混在一起。
 *
 * 未公开卡位的 role 优先用该行自己的 expected_reveal_on 格式化成
 * 'YYYY-MM'，不用全局写死的文案——不同卡位的公开时间不一样。读到 NULL
 * （异常历史数据，理论上不该发生——site_members_unrevealed_schedule 约束
 * 要求未公开卡位必须有 expected_reveal_on）才落到 unrevealedScheduleUnknown，
 * 不能返回空字符串。
 */
function buildMember(
  row: SiteMemberRow,
  locale: Locale,
  unrevealedName: string,
  unrevealedScheduleUnknown: string,
): SiteMember {
  const label = `NO.${String(row.no).padStart(2, '0')}`

  if (!row.is_revealed) {
    const role = row.expected_reveal_on ? formatRevealMonth(row.expected_reveal_on) : unrevealedScheduleUnknown
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
 * 把 site_members 的行集合按 locale 转成展示用的卡片——数据驱动：库里有几行
 * 就渲染几张卡，不再补齐到固定格数。rows 不需要预先排序，这里按 no 升序重排
 * （官网卡位按编号顺序展示，PostgREST 不保证返回顺序）。
 *
 * 0 行是合法状态（尚未配置任何卡位，或全部被后台删除），返回空数组，
 * 由调用方（vision/page.tsx）决定要不要渲染一个空网格——不在这里假装还有
 * 卡位存在。
 */
export function buildMembers(
  rows: SiteMemberRow[],
  locale: Locale,
  unrevealedName: string,
  unrevealedScheduleUnknown: string,
): SiteMember[] {
  return [...rows]
    .sort((a, b) => a.no - b.no)
    .map((row) => buildMember(row, locale, unrevealedName, unrevealedScheduleUnknown))
}

/** 与 supabase-js 查询返回值兼容的最小形状，不引入真实客户端的复杂泛型。 */
export interface SiteMemberQueryResult {
  data: unknown
  error: { code?: string; message?: string } | null
}

/**
 * 查询结果 → 该渲染什么。返回 `null` 表示查询失败，调用方应跳过整个 MEMBERS
 * 区块（不渲染标题、队长、网格——见 vision/page.tsx），而不是像数据驱动之前
 * 那样渲染 12 张编造的"未公开"占位卡：卡位数已经不再是常量，查询失败时根本
 * 不知道该编几张假卡出来，编造内容比不显示这个区块更糟。
 *
 * 返回空数组（`[]`）表示查询成功但库里确实没有任何卡位——这是数据驱动之后
 * 的合法状态（尚未配置，或管理员删光了），调用方应该正常渲染 MEMBERS 区块
 * （标题、队长仍然是有意义的内容），只是卡片网格是空的，不是需要隐藏的故障。
 *
 * onQueryError 是回调而不是这里直接 console.error：页面组件负责实际打印
 * （可以加前缀等上下文），这里只做「出错了该返回什么」的决策。
 */
export function membersFromQuery(
  locale: Locale,
  result: SiteMemberQueryResult,
  labels: { unrevealedName: string; unrevealedScheduleUnknown: string },
  onQueryError: (error: { code?: string; message?: string }) => void,
): SiteMember[] | null {
  if (result.error) {
    onQueryError(result.error)
    return null
  }
  return buildMembers((result.data ?? []) as SiteMemberRow[], locale, labels.unrevealedName, labels.unrevealedScheduleUnknown)
}
