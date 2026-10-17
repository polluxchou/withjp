'use client'

import { useTranslations } from 'next-intl'
import type { ForecastAccountType } from '@/lib/finance-forecast/calculations'

// 账号类型的显示名(输入表下拉、图表图例、类型贡献栏共用)。
export function useAccountTypeLabels(): Record<ForecastAccountType, string> {
  const t = useTranslations('financeForecast')
  return {
    key:     t('typeNameKey'),
    mature:  t('typeNameMature'),
    growing: t('typeNameGrowing'),
    newbie:  t('typeNameNewbie'),
    test:    t('typeNameTest'),
    other:   t('typeNameOther'),
  }
}
