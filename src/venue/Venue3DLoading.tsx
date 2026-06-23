'use client'

import { useTranslations } from 'next-intl'
import { Loader2 } from 'lucide-react'

export default function Venue3DLoading() {
  const t = useTranslations('venue')
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-slate-50">
      <div className="flex flex-col items-center gap-3 text-slate-500">
        <Loader2 className="w-6 h-6 animate-spin" />
        <span className="text-xs">{t('mode3dLoading')}</span>
      </div>
    </div>
  )
}
