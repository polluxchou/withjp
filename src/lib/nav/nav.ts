// 内部后台侧边栏导航的纯匹配逻辑。放在 lib 而不是 Sidebar.tsx 里，是因为本轮
// 引入了「同一个 href 挂两个导航入口、靠 query 区分」的深链（/tasks 的人员工时
// tab 与 AI 任务 tab），激活判定不再是一句 startsWith 能说清的事，需要测试兜住。
//
// `NAV` 数据常量和 `NAV_ACCENT` 色板刻意留在 Sidebar.tsx：它们每一项都持有
// lucide 图标组件实例，搬进来会让 nav.test.ts 在 node --test 下连带加载
// lucide-react 和 react。本仓所有测试都只 import 纯 .ts 模块，不破这个例。
// 下面对 LucideIcon 只有类型引用，strip-types 会整条擦掉，不产生运行时依赖。
import type { LucideIcon } from 'lucide-react'

/** 导航项挂的 URL query。同一个 href 靠它区分成多个入口。 */
export type NavQuery = Readonly<Record<string, string>>

export type NavLeaf = {
  href: string
  key: string
  icon: LucideIcon
  /** 精确匹配 pathname。某个 href 是兄弟项的前缀时必须开（如 /team vs /team/org）。 */
  exact?: boolean
  /** 带上它，这一项只在 URL query 也对得上时才算激活。 */
  query?: NavQuery
}

export type NavGroup = { key: string; icon: LucideIcon; children: readonly NavLeaf[] }
export type NavItem  = NavLeaf | NavGroup

export const isGroup = (item: NavItem): item is NavGroup => 'children' in item

/**
 * 带默认值的 query 参数登记表。
 *
 * 页面自己有默认 tab，所以「URL 上没有这个参数」等价于「参数等于默认值」。
 * 不登记的话，首次进 /tasks（URL 上没有 ?view=）会让人员任务和 AI 任务两个
 * 入口都不亮；?view=bogus 这种脏值同理。`values` 把合法取值也一并锁住，
 * 页面的 tab 回退和导航的高亮判定于是共用同一份口径，不可能跑偏。
 */
type QuerySpec = { readonly default: string; readonly values: readonly string[] }

const QUERY_SPECS: Readonly<Record<string, Readonly<Record<string, QuerySpec>>>> = {
  '/tasks': { view: { default: 'workload', values: ['workload', 'ai'] } },
}

/**
 * 把一个原始 query 值收敛成页面真正会用的值：缺失或非法都回落到默认值。
 * 未登记的 href/参数原样透传（返回 null 表示 URL 上确实没有）。
 */
export function resolveNavQuery(href: string, name: string, raw: string | null): string | null {
  const spec = QUERY_SPECS[href]?.[name]
  if (!spec) return raw
  return raw !== null && spec.values.includes(raw) ? raw : spec.default
}

/**
 * pathname 匹配。
 *
 * 比原先的裸 `startsWith(href)` 收紧了一档：要么整段相等，要么后面跟的是 `/`。
 * 旧写法会让 /team 误亮在 /teamfoo 上。当前 NAV 里没有任何一条路由是另一条的
 * 裸前缀延长，所以这是行为等价的加固，不改变今天任何一处高亮。
 */
function pathMatches(pathname: string, href: string, exact = false): boolean {
  if (exact) return pathname === href
  if (href === '/') return pathname === '/'
  return pathname === href || pathname.startsWith(`${href}/`)
}

/**
 * 导航项激活判定。`searchParams` 传 null 表示还拿不到（SSR 首帧），
 * 此时全部参数按默认值算。
 */
export function isNavActive(
  pathname: string,
  searchParams: URLSearchParams | null,
  leaf: Pick<NavLeaf, 'href' | 'exact' | 'query'>,
): boolean {
  if (!pathMatches(pathname, leaf.href, leaf.exact)) return false
  if (!leaf.query) return true
  for (const [name, want] of Object.entries(leaf.query)) {
    const raw = searchParams?.get(name) ?? null
    if (resolveNavQuery(leaf.href, name, raw) !== want) return false
  }
  return true
}

/** 渲染 <Link href> 用：把 leaf 上登记的 query 拼回 URL。 */
export function hrefWithQuery(leaf: Pick<NavLeaf, 'href' | 'query'>): string {
  if (!leaf.query) return leaf.href
  const qs = new URLSearchParams(leaf.query).toString()
  return qs ? `${leaf.href}?${qs}` : leaf.href
}
