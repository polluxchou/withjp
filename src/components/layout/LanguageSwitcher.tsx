'use client'

import { Globe } from 'lucide-react'
import { useEffect, useState } from 'react'

const languages = [
  { code: 'zh', name: '中文', flag: '🇨🇳' },
  { code: 'en', name: 'English', flag: '🇺🇸' },
  { code: 'ja', name: '日本語', flag: '🇯🇵' },
]

export default function LanguageSwitcher() {
  const [currentLang, setCurrentLang] = useState('zh')
  const [isOpen, setIsOpen] = useState(false)

  useEffect(() => {
    const stored = localStorage.getItem('language')
    if (stored && languages.some((lang) => lang.code === stored)) {
      setCurrentLang(stored)
    }
  }, [])

  const handleLanguageChange = (langCode: string) => {
    setCurrentLang(langCode)
    setIsOpen(false)
    // Store in localStorage
    localStorage.setItem('language', langCode)
    // Reload to apply language
    window.location.reload()
  }

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-slate-400 hover:text-white hover:bg-slate-800 transition-colors w-full"
      >
        <Globe className="w-4 h-4" />
        <span>{languages.find(l => l.code === currentLang)?.flag}</span>
        <span className="flex-1 text-left">{languages.find(l => l.code === currentLang)?.name}</span>
      </button>

      {isOpen && (
        <div className="absolute bottom-full left-0 mb-2 w-full bg-slate-800 border border-slate-700 rounded-lg shadow-lg overflow-hidden">
          {languages.map((lang) => (
            <button
              key={lang.code}
              onClick={() => handleLanguageChange(lang.code)}
              className={`flex items-center gap-2 px-3 py-2 text-sm w-full hover:bg-slate-700 transition-colors ${
                currentLang === lang.code ? 'bg-slate-700 text-white' : 'text-slate-400'
              }`}
            >
              <span>{lang.flag}</span>
              <span>{lang.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
