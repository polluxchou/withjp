import { defineRouting } from 'next-intl/routing'

export const locales = ['zh', 'en', 'ja'] as const
export type Locale = (typeof locales)[number]
export const defaultLocale: Locale = 'zh'

export const routing = defineRouting({
  locales,
  defaultLocale,
  localePrefix: 'always',
})

export function isLocale(value: string | undefined): value is Locale {
  return !!value && locales.includes(value as Locale)
}
