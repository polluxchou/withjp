'use client'

import { Globe } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useState } from 'react'

const languages = [
  { code: 'zh', flag: '🇨🇳' },
  { code: 'en', flag: '🇺🇸' },
  { code: 'ja', flag: '🇯🇵' },
]

interface Props {
  collapsed?: boolean
}

export default function LanguageSwitcher({ collapsed = false }: Props) {
  const locale = useLocale()
  const pathname = usePathname()
  const router = useRouter()
  const searchParams = useSearchParams()
  const t = useTranslations('language')
  const [isOpen, setIsOpen] = useState(false)

  const handleLanguageChange = (langCode: string) => {
    setIsOpen(false)
    const segments = pathname.split('/')
    segments[1] = langCode
    const query = searchParams.toString()
    router.push(`${segments.join('/')}${query ? `?${query}` : ''}`)
  }

  const current = languages.find((lang) => lang.code === locale) ?? languages[0]

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        title={collapsed ? t('switchLanguage') : undefined}
        className={`flex items-center rounded-lg text-sm text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100 transition-colors w-full ${
          collapsed ? 'justify-center px-2 py-2' : 'gap-2 px-3 py-2'
        }`}
      >
        <Globe className="w-4 h-4 flex-shrink-0" />
        {!collapsed && (
          <>
            <span>{current.flag}</span>
            <span className="flex-1 text-left">{t(current.code)}</span>
          </>
        )}
      </button>

      {isOpen && (
        <div className={`absolute bottom-full mb-2 bg-white border border-zinc-200 rounded-lg shadow-card-hover overflow-hidden ${
          collapsed ? 'left-full ml-2 w-32' : 'left-0 w-full'
        }`}>
          {languages.map((lang) => (
            <button
              key={lang.code}
              onClick={() => handleLanguageChange(lang.code)}
              className={`flex items-center gap-2 px-3 py-2 text-sm w-full hover:bg-zinc-100 transition-colors ${
                locale === lang.code ? 'bg-primary-soft text-primary' : 'text-zinc-700'
              }`}
            >
              <span>{lang.flag}</span>
              <span>{t(lang.code)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
