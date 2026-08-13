// 官网内容的形状。文案本体在 messages/{zh,en,ja}.json 的 site.* 里，页面用
// t.raw() 取数组后按这里的类型消费 —— 类型只声明一次，避免每个页面各写一遍
// `as any`。数组长度由 check-i18n 保证三语一致。

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

export interface SiteMemberEntry {
  name: string
  role: string
}

export interface SiteRecruitRow {
  label: string
  body: string
}

/** MOONDOLLZ 共 12 位，设计稿目前只公开了前 8 位的形象。 */
export const MEMBER_SLOTS = 12

const MEMBER_IMAGES = [
  '/site/card-kano.webp',
  '/site/card-mikoto.webp',
  '/site/card-lulu.webp',
  '/site/card-chiyo.webp',
  '/site/card-akaya.webp',
  '/site/card-yumeki.webp',
  '/site/card-shino.webp',
  '/site/card-himene.webp',
]

export interface SiteMember {
  no: string
  name: string
  role: string
  image?: string
}

/**
 * 把 i18n 里已公开的成员名单补齐到 12 个卡位：没文案也没图的位置显示
 * 「尚未公开」+ 蓝图占位框，而不是让网格缺角。
 */
export function buildMembers(
  revealed: SiteMemberEntry[],
  unrevealedName: string,
  unrevealedRole: string,
): SiteMember[] {
  return Array.from({ length: MEMBER_SLOTS }, (_, i) => {
    const entry = revealed[i]
    return {
      no: `NO.${String(i + 1).padStart(2, '0')}`,
      name: entry ? entry.name : unrevealedName,
      role: entry ? entry.role : unrevealedRole,
      image: MEMBER_IMAGES[i],
    }
  })
}
