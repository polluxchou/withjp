import { RECRUIT_HREF, STAFF_RECRUIT_HREF } from './nav.ts'

export type SiteContactAction = 'recruit' | 'staff-recruit' | 'email'

export interface SiteContactRowCopy {
  label: string
  value: string
  subvalue?: string
  link?: 'email' | 'external'
}

export interface SiteContactBrandCopy {
  primary: string
  secondary: string
}

export interface SiteContactSectionCopy {
  no: string
  eyebrow: string
  title: string
  body: string
  note?: string
  cta?: string
  action?: SiteContactAction
  partner?: string
  brand?: SiteContactBrandCopy
  rows: SiteContactRowCopy[]
}

export interface SiteContactRow extends SiteContactRowCopy {
  href?: string
}

export interface SiteContactSection extends Omit<SiteContactSectionCopy, 'rows'> {
  id: string
  ctaHref?: string
  brandLogo?: string
  rows: SiteContactRow[]
}

/**
 * 各段的品牌标识图，按段号配对。与 NEWS 同一套约定：资源路径写在代码里，
 * 文案留在 messages —— 路径不需要翻译，放进三份 message 文件只会被译歪。
 *
 * 图是单色带透明通道的 PNG 转 webp，组件用 CSS mask + bg-site-fg 上色，
 * 所以深浅主题各自都成立，不用备两版反白图。
 */
const BRAND_LOGOS: Record<string, string> = {
  '01': '/site/chiron-logo.webp',
}

export function buildContactSections(copy: SiteContactSectionCopy[]): SiteContactSection[] {
  return copy.map((section) => ({
    ...section,
    id: `contact-${section.no}`,
    brandLogo: section.brand ? BRAND_LOGOS[section.no] : undefined,
    ctaHref:
      section.action === 'recruit'
        ? RECRUIT_HREF
        : section.action === 'staff-recruit'
          ? STAFF_RECRUIT_HREF
          : section.action === 'email' && section.cta
            ? `mailto:${section.cta}`
            : undefined,
    rows: section.rows.map((row) => ({
      ...row,
      href:
        row.link === 'email'
          ? `mailto:${row.value}`
          : row.link === 'external'
            ? row.value
            : undefined,
    })),
  }))
}
