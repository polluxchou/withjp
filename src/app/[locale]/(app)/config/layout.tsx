'use client'

import { Link, usePathname } from '@/i18n/navigation'
import { useTranslations } from 'next-intl'
import { Settings, History } from 'lucide-react'

const TABS = [
  { href: '/config',           key: 'rules',     icon: Settings },
  { href: '/config/changelog', key: 'changelog', icon: History  },
] as const

export default function ConfigLayout({ children }: { children: React.ReactNode }) {
  const path = usePathname()
  const t = useTranslations('config.tabs')

  return (
    <div>
      <div className="flex gap-1 mb-5 border-b border-zinc-200 overflow-x-auto scrollbar-thin">
        {TABS.map(({ href, key, icon: Icon }) => {
          // /config is the rules tab — only active on exact match so it
          // doesn't light up while we're on /config/changelog.
          const active = href === '/config' ? path === '/config' : path.startsWith(href)
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px whitespace-nowrap transition-colors ${
                active
                  ? 'border-violet-500 text-primary'
                  : 'border-transparent text-zinc-500 hover:text-zinc-700'
              }`}
            >
              <Icon className="w-4 h-4" />
              {t(key)}
            </Link>
          )
        })}
      </div>
      {children}
    </div>
  )
}
