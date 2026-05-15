'use client'

import { createContext, ReactNode, useCallback, useContext, useEffect, useState } from 'react'
import { useLocale } from 'next-intl'
import { CURRENCY_RATES as BASE_RATES } from './currency-rates'

export type Currency = 'CNY' | 'USD' | 'JPY'

export const CURRENCIES: Currency[] = ['CNY', 'USD', 'JPY']

export const CURRENCY_RATES: Record<Currency, number> = BASE_RATES

export const CURRENCY_SYMBOLS: Record<Currency, string> = {
  CNY: '¥',
  USD: '$',
  JPY: '¥',
}

export const CURRENCY_LABELS: Record<Currency, string> = {
  CNY: '人民币',
  USD: '美金',
  JPY: '日元',
}

export function convertFromCny(cny: number, target: Currency): number {
  return cny * CURRENCY_RATES[target]
}

function trim1(n: number): string {
  const s = n.toFixed(1)
  return s.endsWith('.0') ? n.toFixed(0) : s
}

/**
 * Compact-format a number.
 *
 * For **money amounts**, the abbreviation system should follow the
 * currency, not the UI locale — a USD value should always read as $28.6K,
 * even when the page is in Chinese, because "$2.86w" is nonsense to
 * readers of either language.
 *
 * For **non-money counts** (followers, view counts, etc.), there is no
 * currency, so we fall back to the UI locale: zh → 万-based, everything
 * else → K/M.
 *
 * `currency` arg:
 *   - 'CNY' / 'JPY': 万-based ("w" suffix), 10000 threshold
 *   - 'USD':         K/M-based, 1000/1000000 thresholds
 *   - undefined:     locale-driven, for non-money counts
 */
export function fmtCompact(n: number, locale: string, currency?: Currency): string {
  const abs  = Math.abs(n)
  const sign = n < 0 ? '-' : ''

  const useWan =
    currency === 'CNY' || currency === 'JPY' ||
    (currency === undefined && locale === 'zh')

  if (useWan) {
    if (abs >= 10000) return `${sign}${trim1(abs / 10000)}w`
    return n.toFixed(0)
  }
  if (abs >= 1000000) return `${sign}${trim1(abs / 1000000)}m`
  if (abs >= 1000)    return `${sign}${trim1(abs / 1000)}k`
  return n.toFixed(0)
}

/**
 * Format a CNY-denominated amount in the given currency.
 * `compact` produces a short label suitable for chart axes / KPI cards
 * (¥3.8w / $5.4k / $1.2m). Default is full precision with thousands separators.
 */
export function fmtAmount(
  cnyAmount: number,
  currency: Currency,
  opts?: { compact?: boolean; locale?: string },
): string {
  const v   = convertFromCny(cnyAmount, currency)
  const sym = CURRENCY_SYMBOLS[currency]

  if (opts?.compact) {
    return `${sym}${fmtCompact(v, opts.locale ?? 'zh', currency)}`
  }

  const decimals = currency === 'JPY' ? 0 : 2
  return sym + v.toFixed(decimals).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

// ── Context + provider ─────────────────────────────────────────

interface CurrencyContextValue {
  currency:    Currency
  setCurrency: (c: Currency) => void
  fmt:         (cny: number, opts?: { compact?: boolean }) => string
}

const STORAGE_KEY = 'app:currency'

const CurrencyContext = createContext<CurrencyContextValue | null>(null)

export function CurrencyProvider({ children }: { children: ReactNode }) {
  const [currency, setCurrencyState] = useState<Currency>('CNY')
  const locale = useLocale()

  useEffect(() => {
    if (typeof window === 'undefined') return
    const stored = localStorage.getItem(STORAGE_KEY) as Currency | null
    if (stored && CURRENCIES.includes(stored)) setCurrencyState(stored)
  }, [])

  const setCurrency = useCallback((c: Currency) => {
    setCurrencyState(c)
    if (typeof window !== 'undefined') localStorage.setItem(STORAGE_KEY, c)
  }, [])

  const fmt = useCallback(
    (cny: number, opts?: { compact?: boolean }) => fmtAmount(cny, currency, { ...opts, locale }),
    [currency, locale],
  )

  return (
    <CurrencyContext.Provider value={{ currency, setCurrency, fmt }}>
      {children}
    </CurrencyContext.Provider>
  )
}

/**
 * Read the current currency. Falls back to CNY (no-op setter) if the
 * provider isn't mounted, so call sites stay safe in standalone pages.
 */
export function useCurrency(): CurrencyContextValue {
  const ctx = useContext(CurrencyContext)
  if (ctx) return ctx
  return {
    currency:    'CNY',
    setCurrency: () => {},
    fmt:         (cny, opts) => fmtAmount(cny, 'CNY', opts),
  }
}
