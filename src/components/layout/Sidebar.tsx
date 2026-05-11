'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useState, useEffect } from 'react'
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

const NAV_LABELS: Record<string, Record<string, string>> = {
  en: {
    dashboard: 'Dashboard',
    creators:  'Creators',
    pipeline:  'Pipeline',
    timeline:  'Master Timeline',
    tasks:     'Tasks',
    workspace: 'Workspace',
    team:      'Team (Agents)',
    knowledge: 'Knowledge',
    expenses:  'Expense Management',
    config:    'Config',
  },
  zh: {
    dashboard: '仪表盘',
    creators:  '创作者',
    pipeline:  '流程管理',
    timeline:  '战略时间轴',
    tasks:     '任务',
    workspace: '工作区',
    team:      '团队（AI代理）',
    knowledge: '知识库',
    expenses:  '支出管理',
    config:    '配置',
  },
  ja: {
    dashboard: 'ダッシュボード',
    creators:  'クリエイター',
    pipeline:  'パイプライン',
    timeline:  'マスタータイムライン',
    tasks:     'タスク',
    workspace: 'ワークスペース',
    team:      'チーム（AIエージェント）',
    knowledge: 'ナレッジ',
    expenses:  '経費管理',
    config:    '設定',
  },
}

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
  const [lang, setLang] = useState('zh')
  const [profileOpen, setProfileOpen] = useState(false)

  useEffect(() => {
    const stored = localStorage.getItem('language') || 'zh'
    setLang(stored)
  }, [])

  const labels = NAV_LABELS[lang] || NAV_LABELS['zh']

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
          <div className="text-white font-semibold text-sm leading-tight">Creator Guild</div>
          <div className="text-slate-400 text-xs">AI Operating System</div>
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
              {labels[key]}
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
          {lang === 'zh' ? '个人信息' : lang === 'ja' ? 'プロフィール' : 'Profile'}
        </button>
      </div>

      {/* Logout Button */}
      <div className="px-3 pb-2">
        <button
          onClick={handleLogout}
          className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors text-slate-400 hover:text-white hover:bg-slate-800 w-full"
        >
          <LogOut className="w-4 h-4 flex-shrink-0" />
          {lang === 'zh' ? '退出登录' : lang === 'ja' ? 'ログアウト' : 'Logout'}
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
