// src/components/competitors/live/useLiveFormat.ts
'use client'

import { useMemo } from 'react'
import { useLocale, useTranslations } from 'next-intl'

/**
 * 开播记录弹窗与开播时段页共用的显示格式：时长、星期、月份。
 * 只管「怎么写」，不碰统计 —— 数都由 lib/competitors/liveStats.ts 算好再传进来。
 */
export function useLiveFormat() {
  const t = useTranslations('competitors')
  const locale = useLocale()
  return useMemo(() => {
    // 日期一律是 YYYY-MM-DD 日历日，按 UTC 零点取星期/月份，不再被任何时区挪一天
    // （与 zonedTime.addDaysYmd / weekdayOfYmd 同一口径）。
    const weekdayShort = new Intl.DateTimeFormat(locale, { weekday: 'short', timeZone: 'UTC' })
    const weekdayNarrow = new Intl.DateTimeFormat(locale, { weekday: 'narrow', timeZone: 'UTC' })
    const monthShort = new Intl.DateTimeFormat(locale, { month: 'short', timeZone: 'UTC' })
    const monthYear = new Intl.DateTimeFormat(locale, { year: 'numeric', month: 'long', timeZone: 'UTC' })
    const at = (ymd: string) => new Date(`${ymd}T00:00:00Z`)
    return {
      /** 不满一小时只报分钟：「0时49分」读起来像漏了什么（同导入预览表的写法）。 */
      duration: (minutes: number) =>
        minutes < 60
          ? t('liveDurationM', { m: minutes })
          : t('liveDurationHm', { h: Math.floor(minutes / 60), m: minutes % 60 }),
      weekday: (ymd: string) => weekdayShort.format(at(ymd)),
      weekdayNarrow: (ymd: string) => weekdayNarrow.format(at(ymd)),
      month: (ymd: string) => monthShort.format(at(ymd)),
      /** YYYY-MM → 「2026年8月」/「August 2026」，翻月控件的标题用。 */
      monthYear: (ym: string) => monthYear.format(at(`${ym}-01`)),
    }
  }, [t, locale])
}
