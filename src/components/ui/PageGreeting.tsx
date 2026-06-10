'use client'

import { useTranslations } from 'next-intl'

interface Props {
  name?: string
}

export default function PageGreeting({ name }: Props) {
  const t = useTranslations('greeting')
  const hour = new Date().getHours()
  const key = hour < 11 ? 'morning' : hour < 18 ? 'afternoon' : 'evening'
  // Renders a span (not a heading): callers place this inside Header's <h1>.
  return (
    <span className="block text-xl font-semibold text-zinc-900" suppressHydrationWarning>
      {t(key)}
      {name ? ` · ${name}` : ''}
      <span aria-hidden="true"> 👋</span>
    </span>
  )
}
