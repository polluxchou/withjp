'use client'

import { Link, usePathname, useRouter } from '@/i18n/navigation'
import { useTranslations } from 'next-intl'
import { useEffect, useState } from 'react'
import {
  LayoutDashboard,
  Users,
  CheckSquare,
  GitBranch,
  Bot,
  BookOpen,
  Settings,
  Zap,
  MessageSquare,
  LogOut,
  UserCircle,
  CalendarRange,
  Receipt,
  TrendingUp,
  ChevronLeft,
  ChevronRight,
  Menu,
  X,
} from 'lucide-react'
import LanguageSwitcher from './LanguageSwitcher'
import ProfileEditor from '@/components/profile/ProfileEditor'
import type { UserProfile } from '@/lib/types'

const NAV = [
  { href: '/',          key: 'dashboard', icon: LayoutDashboard },
  { href: '/creators',  key: 'creators',  icon: Users },
  { href: '/pipeline',  key: 'pipeline',  icon: GitBranch },
  { href: '/timeline',  key: 'timeline',  icon: CalendarRange },
  { href: '/tasks',     key: 'tasks',     icon: CheckSquare },
  { href: '/workspace', key: 'workspace', icon: MessageSquare },
  { href: '/team',      key: 'team',      icon: Bot },
  { href: '/knowledge', key: 'knowledge', icon: BookOpen },
  { href: '/expenses',  key: 'expenses',  icon: Receipt },
  { href: '/finance-forecast', key: 'financeForecast', icon: TrendingUp },
  { href: '/config',    key: 'config',    icon: Settings },
]

const COLLAPSED_W = '60px'
const EXPANDED_W  = '240px'
const LS_KEY      = 'sidebar:collapsed'

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

export default function Sidebar() {
  const path = usePathname()
  const router = useRouter()
  const t = useTranslations('nav')
  const tRoles = useTranslations('roles')
  const [profileOpen, setProfileOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(false)
  const [hydrated, setHydrated] = useState(false)
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [isMobile, setIsMobile] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)

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
    setHydrated(true)
  }, [])

  // Track whether we're in mobile-drawer mode (<md breakpoint).
  // On mobile the sidebar lives off-canvas and ignores the `collapsed`
  // setting — always expanded when the user pulls it in.
  useEffect(() => {
    if (typeof window === 'undefined') return
    const mq = window.matchMedia('(max-width: 767px)')
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

  const handleLogout = async () => {
    const { supabase } = await import('@/lib/supabase/client')
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  // On mobile, ignore the desktop `collapsed` setting so the drawer
  // always slides in fully expanded.
  const effectiveCollapsed = isMobile ? false : collapsed
  const effectiveWidth     = effectiveCollapsed ? COLLAPSED_W : EXPANDED_W
  const showLabel          = !effectiveCollapsed

  return (
    <>
      {/* Mobile hamburger — only visible on small screens.
          Sits on the right so it doesn't collide with the iOS back-swipe edge. */}
      <button
        type="button"
        onClick={() => setMobileOpen(true)}
        className="md:hidden fixed top-3 right-3 z-30 w-10 h-10 rounded-lg bg-white border border-slate-200 text-slate-700 shadow-sm flex items-center justify-center"
        aria-label="Open menu"
      >
        <Menu className="w-5 h-5" />
      </button>

      {/* Backdrop — only shown when the mobile drawer is open */}
      {isMobile && mobileOpen && (
        <div
          className="md:hidden fixed inset-0 bg-black/50 z-40"
          onClick={() => setMobileOpen(false)}
          aria-hidden="true"
        />
      )}

      <aside
        className={`fixed top-0 left-0 h-screen bg-slate-900 flex flex-col z-50 transition-transform duration-200 md:transition-[width] md:translate-x-0 ${
          isMobile && !mobileOpen ? '-translate-x-full' : 'translate-x-0'
        }`}
        style={{ width: effectiveWidth }}
      >
      {/* Logo + collapse toggle */}
      <div className={`flex items-center border-b border-slate-800 ${effectiveCollapsed ? 'justify-center px-2 py-5' : 'gap-2.5 px-5 py-5'}`}>
        <div className="w-8 h-8 rounded-lg bg-indigo-500 flex items-center justify-center flex-shrink-0">
          <Zap className="w-4 h-4 text-white" />
        </div>
        {showLabel && (
          <div className="min-w-0 flex-1">
            <div className="text-white font-semibold text-sm leading-tight truncate">{t('appName')}</div>
            <div className="text-slate-400 text-xs truncate">{t('appSubtitle')}</div>
          </div>
        )}
        {showLabel && !isMobile && (
          <button
            onClick={() => setCollapsed(true)}
            className="text-slate-400 hover:text-white transition-colors flex-shrink-0"
            title="Collapse sidebar"
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
          className="absolute top-5 -right-3 w-6 h-6 rounded-full bg-slate-900 border border-slate-700 text-slate-300 hover:text-white hover:bg-slate-800 transition-colors flex items-center justify-center shadow-md"
          title="Expand sidebar"
        >
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
      )}

      {/* Mobile drawer close button */}
      {isMobile && (
        <button
          type="button"
          onClick={() => setMobileOpen(false)}
          className="md:hidden absolute top-3 right-3 w-9 h-9 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800 flex items-center justify-center"
          aria-label="Close menu"
        >
          <X className="w-5 h-5" />
        </button>
      )}

      {/* Nav */}
      <nav className={`flex-1 py-4 space-y-0.5 overflow-y-auto scrollbar-thin ${effectiveCollapsed ? 'px-2' : 'px-3'}`}>
        {NAV.map(({ href, key, icon: Icon }) => {
          const active = href === '/' ? path === '/' : path.startsWith(href)
          return (
            <Link
              key={href}
              href={href}
              title={effectiveCollapsed ? t(key) : undefined}
              className={`flex items-center rounded-lg text-sm font-medium transition-colors ${
                effectiveCollapsed ? 'justify-center px-2 py-2.5' : 'gap-3 px-3 py-2.5'
              } ${active ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}
            >
              <Icon className="w-4 h-4 flex-shrink-0" />
              {showLabel && <span className="truncate">{t(key)}</span>}
            </Link>
          )
        })}
      </nav>

      {/* Language Switcher */}
      <div className={effectiveCollapsed ? 'px-2 pb-2' : 'px-3 pb-2'}>
        <LanguageSwitcher collapsed={effectiveCollapsed} />
      </div>

      {/* Profile Button — shows the logged-in user's nickname + role */}
      <div className={effectiveCollapsed ? 'px-2 pb-2' : 'px-3 pb-2'}>
        <button
          onClick={() => setProfileOpen(true)}
          title={effectiveCollapsed ? (profile?.name ?? t('profile')) : undefined}
          className={`flex items-center rounded-lg text-sm font-medium transition-colors text-slate-300 hover:text-white hover:bg-slate-800 w-full ${
            effectiveCollapsed ? 'justify-center px-2 py-2' : 'gap-2.5 px-2 py-2'
          }`}
        >
          {profile ? (
            <span className="w-7 h-7 rounded-full bg-indigo-500 text-white text-xs font-semibold flex items-center justify-center flex-shrink-0">
              {initialsOf(profile)}
            </span>
          ) : (
            <UserCircle className="w-7 h-7 flex-shrink-0 text-slate-500" />
          )}
          {showLabel && (
            <span className="min-w-0 flex-1 text-left">
              <span className="block text-sm font-medium text-white truncate">
                {profile?.name ?? t('profile')}
              </span>
              <span className="block text-[10px] text-slate-400 truncate">
                {profile
                  ? [profile.user_code, profile.role ? tRoles(profile.role) : null]
                      .filter(Boolean).join(' · ')
                  : '加载中…'}
              </span>
            </span>
          )}
        </button>
      </div>

      {/* Logout Button */}
      <div className={effectiveCollapsed ? 'px-2 pb-2' : 'px-3 pb-2'}>
        <button
          onClick={handleLogout}
          title={effectiveCollapsed ? t('logout') : undefined}
          className={`flex items-center rounded-lg text-sm font-medium transition-colors text-slate-400 hover:text-white hover:bg-slate-800 w-full ${
            effectiveCollapsed ? 'justify-center px-2 py-2.5' : 'gap-3 px-3 py-2.5'
          }`}
        >
          <LogOut className="w-4 h-4 flex-shrink-0" />
          {showLabel && <span className="truncate">{t('logout')}</span>}
        </button>
      </div>

      {/* Footer */}
      {showLabel && (
        <div className="px-5 py-4 border-t border-slate-800">
          <div className="text-xs text-slate-600">v0.1.1</div>
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
