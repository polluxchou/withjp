import { RECRUIT_HREF, STAFF_RECRUIT_HREF } from './nav.ts'

export type SiteContactAction = 'recruit' | 'staff-recruit' | 'email'

/** CTA 按钮变体：实底 hot / 描边 ghost。与 SiteButton 的 Variant 对齐。 */
export type SiteContactCtaVariant = 'hot' | 'ghost'

/**
 * 两个招募入口（01 主播报名 / 02 职能招募）是同权重的转化点，都走实底 hot；
 * 03 是邮件咨询（mailto），保持描边 —— 一屏三颗红按钮就没有层次了，而且
 * 「写封邮件」和「去填表」本来就不是一个量级的动作。
 *
 * 放在这里而不是组件里：action → ctaHref 的映射就在下面，两处判读同一个字段，
 * 分开写迟早对不上（02 此前正是只在 ctaHref 那边被认了、在变体这边漏了）。
 */
export function contactCtaVariant(action: SiteContactAction | undefined): SiteContactCtaVariant {
  return action === 'recruit' || action === 'staff-recruit' ? 'hot' : 'ghost'
}

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
