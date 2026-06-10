'use client'

import { useTranslations } from 'next-intl'

interface Props {
  name?: string
}

export default function PageGreeting({ name }: Props) {
  const t = useTranslations('greeting')
  const hour = new Date().getHours()
  const key = hour < 11 ? 'morning' : hour < 18 ? 'afternoon' : 'evening'
  return (
    <h1 className="text-xl font-semibold text-zinc-900">
      {t(key)}
      {name ? ` · ${name}` : ''} 👋
    </h1>
  )
}
