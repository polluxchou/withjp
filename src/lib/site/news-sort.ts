export interface NewsOrderable {
  is_pinned: boolean
  published_on: string
  is_published: boolean
}

export function publishedOnly<T extends NewsOrderable>(rows: T[]): T[] {
  return rows.filter((r) => r.is_published)
}

/** 置顶优先；同组内按发布日倒序。日期是 ISO 串，字典序即时间序。 */
export function sortNews<T extends NewsOrderable>(rows: T[]): T[] {
  return [...rows].sort((a, b) => {
    if (a.is_pinned !== b.is_pinned) return a.is_pinned ? -1 : 1
    return b.published_on.localeCompare(a.published_on)
  })
}

/**
 * 与 `20260814112723_site_content.sql` 里 site_news.slug 的 check 约束**同一条规则**，两边改必须一起改。
 * 前置校验存在的意义是给出字段级错误，而不是让用户撞一个数据库约束错误。
 */
const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/

export function isValidNewsSlug(slug: string): boolean {
  return slug.length > 0 && slug.length <= 60 && SLUG_RE.test(slug)
}
