'use client'

import { useTranslations } from 'next-intl'
import { Loader2 } from 'lucide-react'

export default function Venue3DLoading() {
  const t = useTranslations('venue')
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-canvas">
      <div className="flex flex-col items-center gap-3 text-ink-500">
        <Loader2 className="w-6 h-6 animate-spin" strokeWidth={1.5} />
        <span className="text-xs">{t('mode3dLoading')}</span>
      </div>
    </div>
  )
}
