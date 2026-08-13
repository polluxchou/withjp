import { type Locale } from '../../i18n/routing.ts'
import { PUBLIC_SITE_LOCALES } from './domain-routing.ts'

export interface LocaleMenuOption {
  locale: Locale
  active: boolean
}

export type LocaleMenuEvent = 'toggle' | 'outside' | 'escape' | 'select'
export type LocaleMenuKey = 'ArrowDown' | 'ArrowUp' | 'Home' | 'End' | 'Escape'

/** 切换器按官网自己的语言顺序（日 → 英 → 中）排，不跟后台的 routing 顺序。 */
export function buildLocaleMenuOptions(current: string): LocaleMenuOption[] {
  return PUBLIC_SITE_LOCALES.map((locale) => ({ locale, active: locale === current }))
}

export function nextLocaleMenuOpen(open: boolean, event: LocaleMenuEvent): boolean {
  return event === 'toggle' ? !open : false
}

export function nextLocaleMenuIndex(current: number, key: string, count: number): number {
  if (count <= 0) return -1
  if (key === 'ArrowDown') return (current + 1 + count) % count
  if (key === 'ArrowUp') return (current - 1 + count) % count
  if (key === 'Home') return 0
  if (key === 'End') return count - 1
  return current
}
