'use client'

import { Globe } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useState } from 'react'

const languages = [
  { code: 'zh', flag: '🇨🇳' },
  { code: 'en', flag: '🇺🇸' },
]

export default function LanguageSwitcher() {
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
        className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-slate-400 hover:text-white hover:bg-slate-800 transition-colors w-full"
      >
        <Globe className="w-4 h-4" />
        <span>{current.flag}</span>
        <span className="flex-1 text-left">{t(current.code)}</span>
      </button>

      {isOpen && (
        <div className="absolute bottom-full left-0 mb-2 w-full bg-slate-800 border border-slate-700 rounded-lg shadow-lg overflow-hidden">
          {languages.map((lang) => (
            <button
              key={lang.code}
              onClick={() => handleLanguageChange(lang.code)}
              className={`flex items-center gap-2 px-3 py-2 text-sm w-full hover:bg-slate-700 transition-colors ${
                locale === lang.code ? 'bg-slate-700 text-white' : 'text-slate-400'
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
