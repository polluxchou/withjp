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
 * For money amounts, the abbreviation system follows the currency, not
 * the UI locale. For non-money counts, leave currency undefined and use
 * locale-driven formatting.
 */
export function fmtCompact(n: number, locale: string, currency?: Currency): string {
  const abs = Math.abs(n)
  const sign = n < 0 ? '-' : ''

  const useWan =
    currency === 'CNY' || currency === 'JPY' ||
    (currency === undefined && locale === 'zh')

  if (useWan) {
    if (abs >= 10000) return `${sign}${trim1(abs / 10000)}w`
    return n.toFixed(0)
  }
  if (abs >= 1000000) return `${sign}${trim1(abs / 1000000)}m`
  if (abs >= 1000) return `${sign}${trim1(abs / 1000)}k`
  return n.toFixed(0)
}

export function fmtAmount(
  cnyAmount: number,
  currency: Currency,
  opts?: { compact?: boolean; locale?: string },
): string {
  const v = convertFromCny(cnyAmount, currency)
  const sym = CURRENCY_SYMBOLS[currency]

  if (opts?.compact) {
    return `${sym}${fmtCompact(v, opts.locale ?? 'zh', currency)}`
  }

  const decimals = currency === 'JPY' ? 0 : 2
  return sym + v.toFixed(decimals).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}
