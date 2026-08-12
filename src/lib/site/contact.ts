import { RECRUIT_HREF } from './nav.ts'

export type SiteContactAction = 'recruit' | 'email'

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
  rows: SiteContactRow[]
}

export function buildContactSections(copy: SiteContactSectionCopy[]): SiteContactSection[] {
  return copy.map((section) => ({
    ...section,
    id: `contact-${section.no}`,
    ctaHref:
      section.action === 'recruit'
        ? RECRUIT_HREF
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
