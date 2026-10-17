'use client'

import { useCallback } from 'react'
import { useCurrency } from '@/lib/currency'

// Forecast amounts are stored in USD. The shared CurrencyContext uses CNY
// as its base unit, so we convert USD → CNY (× 7) before calling fmt().
const USD_TO_CNY = 7

export function useForecastFormatter() {
  const { fmt: fmtCurrency } = useCurrency()
  return useCallback(
    (usd: number) => fmtCurrency(usd * USD_TO_CNY, { compact: true }),
    [fmtCurrency],
  )
}
