'use client'

import { Link, usePathname } from '@/i18n/navigation'
import { useTranslations } from 'next-intl'
import { useEffect, useState } from 'react'
import {
  LayoutDashboard,
  Users,
  CheckSquare,
  GitBranch,
  Bot,
  ClipboardList,
  Network,
  BookOpen,
  Settings,
  Zap,
  MessageSquare,
  UserCircle,
  CalendarRange,
  Receipt,
  TrendingUp,
  Wallet,
  Package,
  Map as MapIcon,
  Radar,
  Inbox,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Menu,
  X,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import LanguageSwitcher from './LanguageSwitcher'
import ProfileEditor from '@/components/profile/ProfileEditor'
import NotificationBell from '@/components/notifications/NotificationBell'
import type { AgentRole, UserProfile } from '@/lib/types'
import { ACCENT_CHIP } from '@/lib/ui/accent'
import type { Accent } from '@/lib/ui/accent'

type NavLeaf  = { href: string; key: string; icon: LucideIcon; exact?: boolean }
type NavGroup = { key: string; icon: LucideIcon; children: readonly NavLeaf[] }
type NavItem  = NavLeaf | NavGroup

// messages/*.json "roles" 命名空间已登记的角色键（对齐 workspace 页
// isKnownRole 模式）。`satisfies Record<AgentRole, true>` 强制这里覆盖
// AgentRole 全部值——以后 DB enum 再新增角色而忘记登记翻译，这里会编译期
// 报错，而不是运行时静默展示裸 key。
const REGISTERED_ROLE_KEYS = {
  bd: true, ops: true, finance: true, content: true,
  growth: true, legal: true, tech: true, pmo: true,
} satisfies Record<AgentRole, true>

function isRegisteredRole(role: string): role is AgentRole {
  return Object.hasOwn(REGISTERED_ROLE_KEYS, role)
}

const isGroup = (item: NavItem): item is NavGroup => 'children' in item

// `as const satisfies` 保留字面量 key 类型（供下方 NAV_ACCENT 派生），同时仍按
// NavItem 结构校验每一项。
const NAV = [
  { href: '/',          key: 'dashboard', icon: LayoutDashboard },
  {
    key: 'creators',
    icon: Users,
    children: [
      { href: '/creators',    key: 'creatorsList', icon: Users, exact: true },
      { href: '/competitors', key: 'competitors',  icon: Radar },
      // 官网 RECRUIT 表单的投递：招募来的人最终进 creators，归在同一组
      { href: '/recruit-applications', key: 'recruitApplications', icon: Inbox },
    ],
  },
  { href: '/pipeline',  key: 'pipeline',  icon: GitBranch },
  { href: '/timeline',  key: 'timeline',  icon: CalendarRange },
  { href: '/tasks',     key: 'tasks',     icon: CheckSquare },
  { href: '/workspace', key: 'workspace', icon: MessageSquare },
  {
    key: 'team',
    icon: Bot,
    children: [
      { href: '/team',             key: 'teamAgents',      icon: Bot, exact: true },
      { href: '/team/assignments', key: 'teamAssignments', icon: ClipboardList },
      { href: '/team/org', key: 'teamOrg', icon: Network },
    ],
  },
  { href: '/knowledge', key: 'knowledge', icon: BookOpen },
  {
    key: 'costManagement',
    icon: Wallet,
    children: [
      { href: '/expenses',         key: 'expenses',        icon: Receipt },
      { href: '/items',            key: 'items',           icon: Package },
      { href: '/guild-venue',      key: 'venue',           icon: MapIcon },
      { href: '/finance-forecast', key: 'financeForecast', icon: TrendingUp },
    ],
  },
  { href: '/config',    key: 'config',    icon: Settings },
] as const satisfies readonly NavItem[]

// 从 NAV 派生一级菜单 key 的字面量联合——NAV_ACCENT 漏登记某个一级菜单时
// 编译报错（新增一级菜单必须同时登记色板，design-system §1.4）。
type TopNavKey   = (typeof NAV)[number]['key']
type NavGroupLit = Extract<(typeof NAV)[number], { children: readonly unknown[] }>
type ChildNavKey = NavGroupLit['children'][number]['key']

// 一级菜单固定一色，强制登记；子项可选登记覆盖色，未登记时渲染处回退继承
// 所属一级菜单的 accent（见 accentOf 调用处的 parentAccent 参数），不强制登记。
type NavAccentMap = Record<TopNavKey, Accent> & Partial<Record<ChildNavKey, Accent>>

const NAV_ACCENT: NavAccentMap = {
  dashboard: 'mauve', creators: 'pink', pipeline: 'blue', timeline: 'violet',
  tasks: 'green', workspace: 'blue', team: 'violet', knowledge: 'amber',
  costManagement: 'green', config: 'mauve',
  expenses: 'violet', items: 'amber', venue: 'violet', financeForecast: 'green',
  teamAgents: 'violet', teamAssignments: 'blue', teamOrg: 'green',
  recruitApplications: 'pink',
}

// 渲染处 item.key 的类型是普通 string（NavLeaf/NavGroup 接口未按字面量收窄），
// 用这个函数做“宽 string 查表”；NAV_ACCENT 声明处仍保留强类型的漏登记检查。
const accentOf = (key: string): Accent | undefined =>
  (NAV_ACCENT as Partial<Record<string, Accent>>)[key]

// `NAV` 的字面量元组类型有 10 个互不相同的成员形状，`isGroup` 的 union 收窄在
// 那么多互异字面量上不可靠（TS 无法可靠证明每个叶子字面量都不满足 NavGroup
// 形状）；渲染遍历改用这个收窄到 NavLeaf|NavGroup 两种形状的别名，`isGroup`
// 收窄恢复正常，同时 `NAV` 本身仍保留字面量类型供上方 key 派生使用。
const NAV_ITEMS: readonly NavItem[] = NAV

const COLLAPSED_W = '60px'
const EXPANDED_W  = '240px'
const LS_KEY      = 'sidebar:collapsed'
const LS_GROUPS   = 'sidebar:groups'

// Quick "initials" derivation for the avatar bubble. Falls back to the
// first character of email / user_code / generic placeholder.
function initialsOf(profile: UserProfile | null): string {
  const source = profile?.name?.trim() || profile?.email || profile?.user_code || ''
  if (!source) return '·'
  // Take the first 2 Chinese / Latin chars
  const trimmed = source.trim()
  if (/^[一-鿿]/.test(trimmed)) return trimmed.slice(0, 1)
  return trimmed.slice(0, 2).toUpperCase()
}

// Collapsed (icon-only) sidebar can't show an inline expand tree, so a nav
// group renders as a single icon that reveals a hover flyout with its children.
// The flyout uses fixed positioning to escape the nav's overflow clipping.
function CollapsedNavGroup({
  item, label, childLabel, isActive,
}: {
  item: NavGroup
  label: string
  childLabel: (key: string) => string
  isActive: (href: string, exact?: boolean) => boolean
}) {
  const [top, setTop] = useState<number | null>(null)
  const GroupIcon = item.icon
  const hasActiveChild = item.children.some((c) => isActive(c.href, c.exact))
  const accent = accentOf(item.key) ?? 'mauve'
  return (
    <div
      className="relative"
      onMouseEnter={(e) => setTop(e.currentTarget.getBoundingClientRect().top)}
      onMouseLeave={() => setTop(null)}
    >
      <button
        type="button"
        title={label}
        aria-label={label}
        className={`flex w-full items-center justify-center rounded-field px-2 py-2.5 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-ring focus-visible:ring-inset ${
          hasActiveChild ? 'bg-primary-soft text-primary-hover font-semibold' : 'text-ink-500 hover:text-ink-900 hover:bg-line-soft'
        }`}
      >
        <span aria-hidden className={`w-6 h-6 rounded-icon flex items-center justify-center flex-none ${ACCENT_CHIP[accent]}`}>
          <GroupIcon className="w-[13px] h-[13px]" strokeWidth={1.5} />
        </span>
      </button>
      {top !== null && (
        <div className="fixed z-40 min-w-44 rounded-field border border-line bg-surface p-1 shadow-pop" style={{ top, left: 56 }}>
          <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-ink-400">{label}</div>
          {item.children.map((child) => {
            const ChildIcon = child.icon
            const active = isActive(child.href, child.exact)
            // 未单独登记的子项（如 creatorsList/competitors）继承所属一级菜单的 accent。
            const childAccent = accentOf(child.key) ?? accent
            return (
              <Link
                key={child.href}
                href={child.href}
                className={`flex items-center gap-2 rounded-field px-2 py-1.5 text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-ring focus-visible:ring-inset ${
                  active ? 'bg-primary-soft text-primary-hover font-semibold' : 'text-ink-700 hover:bg-line-soft hover:text-ink-900'
                }`}
              >
                <span aria-hidden className={`w-6 h-6 rounded-icon flex items-center justify-center flex-none ${ACCENT_CHIP[childAccent]}`}>
                  <ChildIcon className="w-[13px] h-[13px]" strokeWidth={1.5} />
                </span>
                <span className="whitespace-nowrap">{childLabel(child.key)}</span>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}

// Collapsed (icon-only) leaf item: an icon link with a hover name tooltip.
// Fixed positioning escapes the nav's overflow clipping (same as the group flyout).
function CollapsedNavLeaf({
  item, label, active,
}: {
  item: NavLeaf
  label: string
  active: boolean
}) {
  const [top, setTop] = useState<number | null>(null)
  const Icon = item.icon
  const accent = accentOf(item.key) ?? 'mauve'
  return (
    <div
      className="relative"
      onMouseEnter={(e) => setTop(e.currentTarget.getBoundingClientRect().top)}
      onMouseLeave={() => setTop(null)}
    >
      <Link
        href={item.href}
        aria-label={label}
        className={`flex items-center justify-center rounded-field px-2 py-2.5 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-ring focus-visible:ring-inset ${
          active ? 'bg-primary-soft text-primary-hover font-semibold' : 'text-ink-500 hover:text-ink-900 hover:bg-line-soft'
        }`}
      >
        <span aria-hidden className={`w-6 h-6 rounded-icon flex items-center justify-center flex-none ${ACCENT_CHIP[accent]}`}>
          <Icon className="w-[13px] h-[13px]" strokeWidth={1.5} />
        </span>
      </Link>
      {top !== null && (
        <div
          className="fixed z-40 rounded-field bg-ink-900 px-2 py-1 text-xs font-medium text-white shadow-pop whitespace-nowrap pointer-events-none"
          style={{ top: top + 8, left: 56 }}
        >
          {label}
        </div>
      )}
    </div>
  )
}

export default function Sidebar() {
  const path = usePathname()
  const t = useTranslations('nav')
  const tRoles = useTranslations('roles')
  const tSidebar = useTranslations('sidebar')
  const tCommon = useTranslations('common')
  const [profileOpen, setProfileOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(false)
  const [hydrated, setHydrated] = useState(false)
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [isMobile, setIsMobile] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  // Explicit open/closed state per nav group. A group not present here falls
  // back to "auto" — open whenever one of its children is the active route.
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({})

  // Fetch the logged-in user's profile once on mount; refresh when the
  // ProfileEditor modal closes (so a rename reflects immediately).
  const loadProfile = async () => {
    try {
      const res  = await fetch('/api/profile')
      const json = await res.json()
      if (json?.data) setProfile(json.data as UserProfile)
    } catch {
      // best-effort; sidebar still works without the nickname
    }
  }

  useEffect(() => { loadProfile() }, [])

  // Restore persisted state on mount
  useEffect(() => {
    const stored = typeof window !== 'undefined' ? localStorage.getItem(LS_KEY) : null
    setCollapsed(stored === '1')
    try {
      const rawGroups = typeof window !== 'undefined' ? localStorage.getItem(LS_GROUPS) : null
      if (rawGroups) setOpenGroups(JSON.parse(rawGroups) as Record<string, boolean>)
    } catch {
      // ignore malformed persisted state
    }
    setHydrated(true)
  }, [])

  // Persist explicit group toggles
  const toggleGroup = (key: string, open: boolean) => {
    setOpenGroups((prev) => {
      const next = { ...prev, [key]: open }
      try { localStorage.setItem(LS_GROUPS, JSON.stringify(next)) } catch { /* best-effort */ }
      return next
    })
  }

  // Track whether we're in mobile-drawer mode (<lg breakpoint).
  // Below 1024 CSS px the sidebar lives off-canvas and ignores the
  // `collapsed` setting — always expanded when the user pulls it in.
  // We use 1024 (not 768) because tablets and large phones in landscape
  // sit between 768–1023 and don't have room for a 240px permanent
  // sidebar plus comfortable content.
  useEffect(() => {
    if (typeof window === 'undefined') return
    const mq = window.matchMedia('(max-width: 1023px)')
    const update = () => setIsMobile(mq.matches)
    update()
    mq.addEventListener('change', update)
    return () => mq.removeEventListener('change', update)
  }, [])

  // Auto-close the mobile drawer when navigating to a new route
  useEffect(() => { setMobileOpen(false) }, [path])

  // Lock body scroll while the mobile drawer is open
  useEffect(() => {
    if (!isMobile) return
    const prev = document.body.style.overflow
    document.body.style.overflow = mobileOpen ? 'hidden' : prev
    return () => { document.body.style.overflow = prev }
  }, [mobileOpen, isMobile])

  // Sync CSS var + persistence whenever collapsed changes (after hydration).
  // On mobile we force the var to 0 so the main content sits flush against
  // the viewport edge while the drawer is hidden off-canvas.
  useEffect(() => {
    if (!hydrated) return
    const desktopWidth = effectiveCollapsed ? COLLAPSED_W : EXPANDED_W
    document.documentElement.style.setProperty('--sidebar-width', isMobile ? '0px' : desktopWidth)
    localStorage.setItem(LS_KEY, effectiveCollapsed ? '1' : '0')
  }, [collapsed, hydrated, isMobile])

  // On mobile, ignore the desktop `collapsed` setting so the drawer
  // always slides in fully expanded.
  const effectiveCollapsed = isMobile ? false : collapsed
  const effectiveWidth     = effectiveCollapsed ? COLLAPSED_W : EXPANDED_W
  const showLabel          = !effectiveCollapsed

  // `exact` matches the pathname exactly — needed when one nav href is a prefix
  // of a sibling (e.g. /team vs /team/assignments) so both don't light up.
  const isActive = (href: string, exact = false) =>
    exact ? path === href : href === '/' ? path === '/' : path.startsWith(href)

  // Render a single navigable item. `indented` nudges it right so children of
  // a group read as a sub-level; when the sidebar is icon-only we skip the
  // indent and rely on the flat icon list instead.
  // `parentAccent` — 未单独登记 accent 的子项继承所属一级菜单的 accent；
  // 顶层调用不传，回退 mauve（design-system §1.4：只有一级菜单强制固定一色）。
  const renderLeaf = (item: NavLeaf, indented = false, parentAccent?: Accent) => {
    const active = isActive(item.href, item.exact)
    if (effectiveCollapsed) {
      return <CollapsedNavLeaf key={item.href} item={item} label={t(item.key)} active={active} />
    }
    const Icon = item.icon
    const accent = accentOf(item.key) ?? parentAccent ?? 'mauve'
    return (
      <Link
        key={item.href}
        href={item.href}
        className={`flex items-center rounded-field text-sm transition-colors gap-3 py-2.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-ring focus-visible:ring-inset ${
          indented ? 'pl-9 pr-3' : 'px-3'
        } ${active ? 'bg-primary-soft text-primary-hover font-semibold' : 'font-medium text-ink-500 hover:text-ink-900 hover:bg-line-soft'}`}
      >
        <span aria-hidden className={`w-6 h-6 rounded-icon flex items-center justify-center flex-none ${ACCENT_CHIP[accent]}`}>
          <Icon className="w-[13px] h-[13px]" strokeWidth={1.5} />
        </span>
        {showLabel && <span className="truncate">{t(item.key)}</span>}
      </Link>
    )
  }

  return (
    <>
      {/* Mobile hamburger — only visible on small screens.
          Sits on the right so it doesn't collide with the iOS back-swipe edge.
          The inline top offset respects the iOS notch / Dynamic Island. */}
      <button
        type="button"
        onClick={() => setMobileOpen(true)}
        className="lg:hidden fixed right-3 z-30 w-10 h-10 rounded-field bg-surface border border-line text-ink-700 shadow-card flex items-center justify-center"
        style={{ top: 'calc(env(safe-area-inset-top, 0px) + 12px)' }}
        aria-label={tSidebar('openMenu')}
      >
        <Menu className="w-5 h-5" />
      </button>

      {/* Backdrop — only shown when the mobile drawer is open.
          这里的 `fixed inset-0` 是**抽屉遮罩**，不是手写 modal 遮罩（§6.1
          只有"阻断式编辑/确认"才必须走 Modal）：它恒与下方 <aside> 抽屉体
          一起出现/消失，z-40 属抽屉层（50）的内部构成，design-system §3
          层级表已单独登记。全库 `fixed inset-0` 清点时按抽屉归类。 */}
      {isMobile && mobileOpen && (
        <div
          className="lg:hidden fixed inset-0 bg-black/50 z-40"
          onClick={() => setMobileOpen(false)}
          aria-hidden="true"
        />
      )}

      <aside
        className={`fixed top-0 left-0 h-screen bg-atmosphere lg:bg-transparent border-r border-line flex flex-col z-50 transition-transform duration-200 lg:transition-[width] lg:translate-x-0 ${
          isMobile && !mobileOpen ? '-translate-x-full' : 'translate-x-0'
        }`}
        style={{
          width: effectiveWidth,
          /* 100dvh accounts for iOS Safari's collapsible URL/toolbar so the
             bottom items (profile / logout / footer) don't get hidden
             behind it. Browsers without dvh support silently drop this
             rule and fall back to the h-screen class above (100vh). */
          height: '100dvh',
          paddingTop: 'env(safe-area-inset-top)',
          paddingBottom: 'env(safe-area-inset-bottom)',
        }}
      >
      {/* Logo + collapse toggle */}
      <div className={`flex items-center border-b border-line ${effectiveCollapsed ? 'justify-center px-2 py-5' : 'gap-2.5 px-5 py-5'}`}>
        <div className="w-8 h-8 rounded-icon bg-primary flex items-center justify-center flex-shrink-0">
          <Zap className="w-4 h-4 text-white" />
        </div>
        {showLabel && (
          <div className="min-w-0 flex-1">
            <div className="text-ink-900 font-semibold text-sm leading-tight truncate">{t('appName')}</div>
            <div className="text-ink-500 text-xs truncate">{t('appSubtitle')}</div>
          </div>
        )}
        {showLabel && !isMobile && (
          <button
            onClick={() => setCollapsed(true)}
            className="w-8 h-8 flex items-center justify-center rounded-field text-ink-500 hover:text-ink-900 hover:bg-line-soft transition-colors flex-shrink-0"
            title={tSidebar('collapse')}
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Floating expand button when collapsed — desktop only. Mobile uses
          the hamburger / drawer overlay instead. */}
      {effectiveCollapsed && (
        <button
          onClick={() => setCollapsed(false)}
          className="absolute top-5 -right-3 w-6 h-6 rounded-full bg-surface border border-line text-ink-500 hover:text-ink-900 hover:bg-line-soft transition-colors flex items-center justify-center shadow-pop"
          title={tSidebar('expand')}
        >
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
      )}

      {/* Mobile drawer close button */}
      {isMobile && (
        <button
          type="button"
          onClick={() => setMobileOpen(false)}
          className="lg:hidden absolute top-3 right-3 w-9 h-9 rounded-field text-ink-500 hover:text-ink-900 hover:bg-line-soft flex items-center justify-center"
          aria-label={tSidebar('closeMenu')}
        >
          <X className="w-5 h-5" />
        </button>
      )}

      {/* Nav — min-h-0 lets the flex child shrink below its natural content
          size so the bottom items (profile / logout) are always anchored at
          the visible bottom instead of being pushed off-screen. */}
      <nav className={`flex-1 min-h-0 py-4 space-y-0.5 overflow-y-auto scrollbar-thin ${effectiveCollapsed ? 'px-2' : 'px-3'}`}>
        {NAV_ITEMS.map((item) => {
          if (!isGroup(item)) return renderLeaf(item)

          // Icon-only sidebar: render the group as one icon with a hover flyout.
          if (effectiveCollapsed) {
            return (
              <CollapsedNavGroup
                key={item.key}
                item={item}
                label={t(item.key)}
                childLabel={(k) => t(k)}
                isActive={isActive}
              />
            )
          }

          const GroupIcon     = item.icon
          const hasActiveChild = item.children.some((c) => isActive(c.href, c.exact))
          const open = openGroups[item.key] ?? hasActiveChild
          const accent = accentOf(item.key) ?? 'mauve'
          return (
            <div key={item.key}>
              <button
                type="button"
                onClick={() => toggleGroup(item.key, !open)}
                aria-expanded={open}
                className={`flex w-full items-center gap-3 rounded-field px-3 py-2.5 text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-ring focus-visible:ring-inset ${
                  hasActiveChild
                    ? 'bg-primary-soft text-primary-hover font-semibold'
                    : 'font-medium text-ink-500 hover:text-ink-900 hover:bg-line-soft'
                }`}
              >
                <span aria-hidden className={`w-6 h-6 rounded-icon flex items-center justify-center flex-none ${ACCENT_CHIP[accent]}`}>
                  <GroupIcon className="w-[13px] h-[13px]" strokeWidth={1.5} />
                </span>
                <span className="truncate flex-1 text-left">{t(item.key)}</span>
                <ChevronDown className={`w-4 h-4 flex-shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
              </button>
              {open && (
                <div className="mt-0.5 space-y-0.5">
                  {item.children.map((child) => renderLeaf(child, true, accent))}
                </div>
              )}
            </div>
          )
        })}
      </nav>

      {/* Language Switcher */}
      <div className={effectiveCollapsed ? 'px-2 pb-2' : 'px-3 pb-2'}>
        <LanguageSwitcher collapsed={effectiveCollapsed} />
      </div>

      {/* Notifications */}
      <div className={effectiveCollapsed ? 'px-2 pb-2' : 'px-3 pb-2'}>
        <NotificationBell collapsed={effectiveCollapsed} />
      </div>

      {/* Profile Button — shows the logged-in user's nickname + role */}
      <div className={effectiveCollapsed ? 'px-2 pb-2' : 'px-3 pb-2'}>
        <button
          onClick={() => setProfileOpen(true)}
          title={effectiveCollapsed ? (profile?.name ?? t('profile')) : undefined}
          className={`flex items-center rounded-field text-sm font-medium transition-colors text-ink-500 hover:text-ink-900 hover:bg-line-soft w-full ${
            effectiveCollapsed ? 'justify-center px-2 py-2' : 'gap-2.5 px-2 py-2'
          }`}
        >
          {profile ? (
            <span className="w-7 h-7 rounded-full bg-primary text-white text-xs font-semibold flex items-center justify-center flex-shrink-0">
              {initialsOf(profile)}
            </span>
          ) : (
            <UserCircle className="w-7 h-7 flex-shrink-0 text-ink-400" />
          )}
          {showLabel && (
            <span className="min-w-0 flex-1 text-left">
              <span className="block text-sm font-medium text-ink-900 truncate">
                {profile?.name ?? t('profile')}
              </span>
              <span className="block text-[10px] text-ink-500 truncate">
                {profile
                  ? [
                      profile.user_code,
                      // 未登记角色（脏数据/历史遗留）回退显示原始 role 字符串，
                      // 而不是 next-intl 缺省渲染出的裸 key "roles.xxx"。
                      profile.role ? (isRegisteredRole(profile.role) ? tRoles(profile.role) : profile.role) : null,
                    ].filter(Boolean).join(' · ')
                  : tCommon('loading')}
              </span>
            </span>
          )}
        </button>
      </div>

      {/* Logout intentionally lives inside the profile modal — keeps the
          sidebar from accidentally triggering sign-out on a stray click. */}

      {/* Footer — hidden on mobile to save vertical room for the profile
          button above. */}
      {showLabel && !isMobile && (
        <div className="px-5 py-4 border-t border-line">
          <div className="text-xs text-ink-400">v0.1.1</div>
        </div>
      )}

      {/* Profile Editor Modal */}
      <ProfileEditor
        open={profileOpen}
        onClose={() => setProfileOpen(false)}
        onSuccess={() => { loadProfile() }}
      />
      </aside>
    </>
  )
}
