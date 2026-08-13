// 官网导航与内容的形状定义。放在 lib 而不是各页面里，是为了让 6 个导航项、
// 12 个成员、6 行排班这些「设计稿里写死的结构」只有一处真相，页面只负责渲染。
//
// 文案本身全部在 messages/{zh,en,ja}.json 的 site.* 下（check-no-bare-han
// 禁止 JSX 里出现汉字，日文汉字同样命中）。这里只放 key 与路径。

export const SITE_BASE = '/site'

export interface SiteNavItem {
  /** messages 的 site.nav.<key> */
  key: string
  /** 相对 /[locale] 的路径 */
  href: string
}

/** 顶栏导航。设计稿把 MEMBERS 并入 VISION，顶栏不单列 —— 保持一致。 */
export const SITE_NAV: SiteNavItem[] = [
  { key: 'top', href: SITE_BASE },
  { key: 'news', href: `${SITE_BASE}/news` },
  { key: 'vision', href: `${SITE_BASE}/vision` },
  { key: 'live', href: `${SITE_BASE}/live` },
  { key: 'services', href: `${SITE_BASE}/services` },
  { key: 'contact', href: `${SITE_BASE}/contact` },
]

export const RECRUIT_HREF = `${SITE_BASE}/recruit`

const CLEAN_SITE_SECTION_RE = /^\/(?:news|vision|live|services|contact|recruit)(?:\/.*)?$/

/**
 * 导航激活判定。TOP 必须精确匹配，否则每个子页都会把 TOP 点亮
 * （子页路径都以 /site 开头）。
 */
export function isNavActive(pathname: string, href: string): boolean {
  const stripped = normalizeSiteNavigationPath(pathname)
  if (href === SITE_BASE) return stripped === SITE_BASE || stripped === `${SITE_BASE}/`
  return stripped === href || stripped.startsWith(`${href}/`)
}

/**
 * 官网独立域名把 /ja/site/news 暴露为 /news。导航仍以 /site/* 为唯一内部模型，
 * 所以在比较激活态前把干净 URL 映射回来；未知路径保持原样，避免误亮。
 */
export function normalizeSiteNavigationPath(pathname: string): string {
  const stripped = stripLocale(pathname)
  if (stripped === '/') return SITE_BASE
  if (CLEAN_SITE_SECTION_RE.test(stripped)) return `${SITE_BASE}${stripped}`
  return stripped
}

/** 去掉 /zh /en /ja 前缀，得到与 SITE_NAV.href 同构的路径。 */
export function stripLocale(pathname: string): string {
  const match = pathname.match(/^\/(?:zh|en|ja)(\/.*)?$/)
  if (!match) return pathname
  return match[1] ?? '/'
}
