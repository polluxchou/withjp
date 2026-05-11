'use client'

import { CURRENCIES, CURRENCY_LABELS, CURRENCY_SYMBOLS, useCurrency } from '@/lib/currency'

/**
 * Pill toggle for switching the displayed currency between CNY / USD / JPY.
 * All amounts on the current page reformat reactively via the
 * CurrencyContext. The DB always stores CNY — this is display only.
 */
export default function CurrencySwitcher() {
  const { currency, setCurrency } = useCurrency()

  return (
    <div
      className="flex gap-0.5 bg-slate-100 rounded-lg p-0.5"
      title="按固定汇率切换显示币种（1 USD = 7 CNY；1 CNY = 20 JPY）"
    >
      {CURRENCIES.map((c) => (
        <button
          key={c}
          onClick={() => setCurrency(c)}
          className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
            currency === c ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          <span className="font-semibold">{CURRENCY_SYMBOLS[c]}</span>{' '}
          <span>{CURRENCY_LABELS[c]}</span>
        </button>
      ))}
    </div>
  )
}
