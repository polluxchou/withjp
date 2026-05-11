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
  ChevronLeft,
  ChevronRight,
} from 'lucide-react'
import LanguageSwitcher from './LanguageSwitcher'
import ProfileEditor from '@/components/profile/ProfileEditor'

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
  { href: '/config',    key: 'config',    icon: Settings },
]

const COLLAPSED_W = '60px'
const EXPANDED_W  = '240px'
const LS_KEY      = 'sidebar:collapsed'

export default function Sidebar() {
  const path = usePathname()
  const router = useRouter()
  const t = useTranslations('nav')
  const [profileOpen, setProfileOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(false)
  const [hydrated, setHydrated] = useState(false)

  // Restore persisted state on mount
  useEffect(() => {
    const stored = typeof window !== 'undefined' ? localStorage.getItem(LS_KEY) : null
    setCollapsed(stored === '1')
    setHydrated(true)
  }, [])

  // Sync CSS var + persistence whenever collapsed changes (after hydration)
  useEffect(() => {
    if (!hydrated) return
    document.documentElement.style.setProperty('--sidebar-width', collapsed ? COLLAPSED_W : EXPANDED_W)
    localStorage.setItem(LS_KEY, collapsed ? '1' : '0')
  }, [collapsed, hydrated])

  const handleLogout = async () => {
    const { supabase } = await import('@/lib/supabase/client')
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  const showLabel = !collapsed

  return (
    <aside
      className="fixed top-0 left-0 h-screen bg-slate-900 flex flex-col z-40 transition-[width] duration-200"
      style={{ width: collapsed ? COLLAPSED_W : EXPANDED_W }}
    >
      {/* Logo + collapse toggle */}
      <div className={`flex items-center border-b border-slate-800 ${collapsed ? 'justify-center px-2 py-5' : 'gap-2.5 px-5 py-5'}`}>
        <div className="w-8 h-8 rounded-lg bg-indigo-500 flex items-center justify-center flex-shrink-0">
          <Zap className="w-4 h-4 text-white" />
        </div>
        {showLabel && (
          <div className="min-w-0 flex-1">
            <div className="text-white font-semibold text-sm leading-tight truncate">{t('appName')}</div>
            <div className="text-slate-400 text-xs truncate">{t('appSubtitle')}</div>
          </div>
        )}
        {showLabel && (
          <button
            onClick={() => setCollapsed(true)}
            className="text-slate-400 hover:text-white transition-colors flex-shrink-0"
            title="Collapse sidebar"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Floating expand button when collapsed */}
      {collapsed && (
        <button
          onClick={() => setCollapsed(false)}
          className="absolute top-5 -right-3 w-6 h-6 rounded-full bg-slate-900 border border-slate-700 text-slate-300 hover:text-white hover:bg-slate-800 transition-colors flex items-center justify-center shadow-md"
          title="Expand sidebar"
        >
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
      )}

      {/* Nav */}
      <nav className={`flex-1 py-4 space-y-0.5 overflow-y-auto scrollbar-thin ${collapsed ? 'px-2' : 'px-3'}`}>
        {NAV.map(({ href, key, icon: Icon }) => {
          const active = href === '/' ? path === '/' : path.startsWith(href)
          return (
            <Link
              key={href}
              href={href}
              title={collapsed ? t(key) : undefined}
              className={`flex items-center rounded-lg text-sm font-medium transition-colors ${
                collapsed ? 'justify-center px-2 py-2.5' : 'gap-3 px-3 py-2.5'
              } ${active ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}
            >
              <Icon className="w-4 h-4 flex-shrink-0" />
              {showLabel && <span className="truncate">{t(key)}</span>}
            </Link>
          )
        })}
      </nav>

      {/* Language Switcher */}
      <div className={collapsed ? 'px-2 pb-2' : 'px-3 pb-2'}>
        <LanguageSwitcher collapsed={collapsed} />
      </div>

      {/* Profile Button */}
      <div className={collapsed ? 'px-2 pb-2' : 'px-3 pb-2'}>
        <button
          onClick={() => setProfileOpen(true)}
          title={collapsed ? t('profile') : undefined}
          className={`flex items-center rounded-lg text-sm font-medium transition-colors text-slate-400 hover:text-white hover:bg-slate-800 w-full ${
            collapsed ? 'justify-center px-2 py-2.5' : 'gap-3 px-3 py-2.5'
          }`}
        >
          <UserCircle className="w-4 h-4 flex-shrink-0" />
          {showLabel && <span className="truncate">{t('profile')}</span>}
        </button>
      </div>

      {/* Logout Button */}
      <div className={collapsed ? 'px-2 pb-2' : 'px-3 pb-2'}>
        <button
          onClick={handleLogout}
          title={collapsed ? t('logout') : undefined}
          className={`flex items-center rounded-lg text-sm font-medium transition-colors text-slate-400 hover:text-white hover:bg-slate-800 w-full ${
            collapsed ? 'justify-center px-2 py-2.5' : 'gap-3 px-3 py-2.5'
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
      <ProfileEditor open={profileOpen} onClose={() => setProfileOpen(false)} />
    </aside>
  )
}
