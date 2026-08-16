// src/components/competitors/CompetitorSummaryBar.tsx
'use client'

import { useMemo } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { Stat, StatBand } from '@/components/ui/Stat'
import { formatCount } from '@/lib/competitors/metrics'
import { STALE_DAYS, type BoardSummary } from '@/lib/competitors/summary'

// 「待更新」副文案最多点名两个账号，再多就折成 +N，否则一格塞不下。
const NAMED_STALE = 2

export default function CompetitorSummaryBar({ summary }: { summary: BoardSummary }) {
  const t = useTranslations('competitors')
  const locale = useLocale()
  // 名字之间的分隔符各语言不同（中日是「、」，英文是「, 」），交给 Intl 而不是
  // 硬编码一个符号——硬编码的 '、' 在英文界面里会很突兀。
  // type 必须是 conjunction：'unit' 档在 zh/ja 的 CLDR 数据里三种 style 都是
  // 直接拼接、一个分隔符都不给（实测 "Yozora LiveHoshi Kan"）。narrow 则是为了
  // 拿到「、」和「, 」而不是「和」「and」——这里是罗列不是并列连词。
  const listFmt = useMemo(() => new Intl.ListFormat(locale, { style: 'narrow', type: 'conjunction' }), [locale])
  const { tracked, withData, totalFollowers, latestCapturedOn, daysSinceLatest, staleCount, staleNames } = summary

  if (tracked === 0) return null

  const staleNote = staleCount === 0
    ? t('statStaleNone', { days: STALE_DAYS })
    : staleNames.length > NAMED_STALE
      ? t('statStaleMore', {
          names: listFmt.format(staleNames.slice(0, NAMED_STALE)),
          count: staleNames.length - NAMED_STALE,
        })
      : listFmt.format(staleNames)

  return (
    <StatBand>
      <Stat
        label={t('statTracked')}
        value={tracked}
        note={withData < tracked ? t('statTrackedNote', { count: withData }) : undefined}
      />
      <Stat
        label={t('statFollowers')}
        value={formatCount(totalFollowers)}
        note={t('statFollowersNote', { count: withData })}
      />
      <Stat
        label={t('statLatest')}
        value={latestCapturedOn ?? '—'}
        note={
          daysSinceLatest == null
            ? undefined
            : daysSinceLatest <= 0
              ? t('statLatestToday')
              : t('statLatestDaysAgo', { days: daysSinceLatest })
        }
      />
      <Stat
        label={t('statStale')}
        value={staleCount}
        tone={staleCount > 0 ? 'danger' : 'default'}
        note={staleNote}
      />
    </StatBand>
  )
}
