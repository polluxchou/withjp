'use client'

import { createContext, ReactNode, useCallback, useContext, useEffect, useState } from 'react'
import { useLocale } from 'next-intl'
export {
  CURRENCIES,
  CURRENCY_LABELS,
  CURRENCY_RATES,
  CURRENCY_SYMBOLS,
  convertFromCny,
  fmtAmount,
  fmtCompact,
  type Currency,
} from './currency-format'
import { CURRENCIES, fmtAmount, type Currency } from './currency-format'

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
