'use client'

import { useTranslations } from 'next-intl'
import SegmentedControl from '@/components/ui/SegmentedControl'
import { CURRENCIES, CURRENCY_LABELS, CURRENCY_SYMBOLS, useCurrency, type Currency } from '@/lib/currency'

/**
 * Pill toggle for switching the displayed currency between CNY / USD / JPY.
 * All amounts on the current page reformat reactively via the
 * CurrencyContext. The DB always stores CNY — this is display only.
 */
export default function CurrencySwitcher() {
  const t = useTranslations('currency')
  const { currency, setCurrency } = useCurrency()

  return (
    <SegmentedControl
      label={t('switchHint')}
      items={CURRENCIES.map((c) => ({ value: c, label: `${CURRENCY_SYMBOLS[c]} ${CURRENCY_LABELS[c]}` }))}
      value={currency}
      onChange={(v) => setCurrency(v as Currency)}
    />
  )
}
