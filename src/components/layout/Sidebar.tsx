'use client'

import { Link, usePathname, useRouter } from '@/i18n/navigation'
import { useTranslations } from 'next-intl'
import { useState } from 'react'
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

export default function Sidebar() {
  const path = usePathname()
  const router = useRouter()
  const t = useTranslations('nav')
  const [profileOpen, setProfileOpen] = useState(false)

  const handleLogout = async () => {
    const { supabase } = await import('@/lib/supabase/client')
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <aside className="fixed top-0 left-0 h-screen w-60 bg-slate-900 flex flex-col z-40">
      {/* Logo */}
      <div className="flex items-center gap-2.5 px-5 py-5 border-b border-slate-800">
        <div className="w-8 h-8 rounded-lg bg-indigo-500 flex items-center justify-center">
          <Zap className="w-4 h-4 text-white" />
        </div>
        <div>
          <div className="text-white font-semibold text-sm leading-tight">{t('appName')}</div>
          <div className="text-slate-400 text-xs">{t('appSubtitle')}</div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto scrollbar-thin">
        {NAV.map(({ href, key, icon: Icon }) => {
          const active = href === '/' ? path === '/' : path.startsWith(href)
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                active
                  ? 'bg-indigo-600 text-white'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              <Icon className="w-4 h-4 flex-shrink-0" />
              {t(key)}
            </Link>
          )
        })}
      </nav>

      {/* Language Switcher */}
      <div className="px-3 pb-2">
        <LanguageSwitcher />
      </div>

      {/* Profile Button */}
      <div className="px-3 pb-2">
        <button
          onClick={() => setProfileOpen(true)}
          className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors text-slate-400 hover:text-white hover:bg-slate-800 w-full"
        >
          <UserCircle className="w-4 h-4 flex-shrink-0" />
          {t('profile')}
        </button>
      </div>

      {/* Logout Button */}
      <div className="px-3 pb-2">
        <button
          onClick={handleLogout}
          className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors text-slate-400 hover:text-white hover:bg-slate-800 w-full"
        >
          <LogOut className="w-4 h-4 flex-shrink-0" />
          {t('logout')}
        </button>
      </div>

      {/* Footer */}
      <div className="px-5 py-4 border-t border-slate-800">
        <div className="text-xs text-slate-600">v0.1.1</div>
      </div>

      {/* Profile Editor Modal */}
      <ProfileEditor open={profileOpen} onClose={() => setProfileOpen(false)} />
    </aside>
  )
}
