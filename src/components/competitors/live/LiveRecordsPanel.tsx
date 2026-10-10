// src/components/competitors/live/LiveRecordsPanel.tsx
'use client'

import { useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'
import { ClipboardPaste } from 'lucide-react'
import Button from '@/components/ui/Button'
import SegmentedControl from '@/components/ui/SegmentedControl'
import type { LiveSpan } from '@/lib/competitors/liveSessions'
import { inRange, likesSeries, locateSpans, windowStats } from '@/lib/competitors/liveStats'
import { coverageOf } from '@/lib/competitors/liveCoverage'
import { addDaysYmd } from '@/lib/time/zonedTime'
import LiveKpiTiles from './LiveKpiTiles'
import LiveCalendar from './LiveCalendar'
import LiveCoverageHistogram from './LiveCoverageHistogram'
import LiveLikesBars from './LiveLikesBars'
import LiveSessionTable from './LiveSessionTable'

type Range = '30' | 'all'

/**
 * 开播记录弹窗的记录视图：顶部一行（来源与时区、统计范围、粘贴导入）+ 指标 / 日历 / 时段分布 / 点赞 / 清单。
 *
 * 统计范围只在这里定，各块拿同一组 [from, to]：
 * - 近 30 天 = 截至今天（账号地区时区）的 30 个自然日；对比的前 30 天 = 再往前 30 天
 * - 全部 = 最早一场的当地日期 ～ 今天
 */
export default function LiveRecordsPanel({
  spans,
  timeZone,
  zoneLabel,
  today,
  patrolDays,
  canEdit,
  onImport,
}: {
  spans: LiveSpan[]
  /** 账号地区时区（regionTimeZone）。 */
  timeZone: string
  /** 时区名（「日本时间」）；地区不在清单里为 null，不写时区名。 */
  zoneLabel: string | null
  /** 账号地区时区的今天（卡片取好传下来，与卡片上的「近 30 天 N 场」同一天）。 */
  today: string
  /** 巡检日（全库截图的 shot_on）。 */
  patrolDays: ReadonlySet<string>
  canEdit: boolean
  onImport: () => void
}) {
  const t = useTranslations('competitors')
  const [range, setRange] = useState<Range>('30')

  const located = useMemo(() => locateSpans(spans, timeZone), [spans, timeZone])
  // 哪些日子有数据（无数据 ≠ 没播）：导入首末场之间，加上巡检日。断播、开播天数、日历都按它算。
  const hasData = useMemo(() => coverageOf(located, patrolDays), [located, patrolDays])
  // 最早一场的当地日期（YYYY-MM-DD 可直接按字符串比较）。晚于今天只可能是时钟偏差，按今天算。
  const allFrom = useMemo(() => {
    const earliest = located.reduce<string | null>((m, s) => (m == null || s.date < m ? s.date : m), null)
    return earliest != null && earliest < today ? earliest : today
  }, [located, today])
  const from = range === '30' ? addDaysYmd(today, -29) : allFrom
  const to = today

  const cur = useMemo(() => windowStats(located, from, to, hasData), [located, from, to, hasData])
  const prev = useMemo(
    () => (range === '30' ? windowStats(located, addDaysYmd(today, -59), addDaysYmd(today, -30), hasData) : null),
    [located, range, today, hasData],
  )
  const allCount = useMemo(() => inRange(located, allFrom, today).length, [located, allFrom, today])
  // 清单要最近在上；inRange 保留输入顺序，这里显式排一次，不依赖上游恰好是降序。
  const windowed = useMemo(
    () => inRange(located, from, to).sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt)),
    [located, from, to],
  )
  // 区间里有截图推断的场次：它们的时长是下限，平均单场 / 总时长要加注（见 LiveKpiTiles）。
  const hasApprox = useMemo(() => windowed.some((s) => s.approxEnd), [windowed])
  // 全部视图「单场点赞中位数」下面补一句最高那场。全是 0 赞时不报「最高 0」。
  const maxLikes = useMemo(() => {
    const series = likesSeries(located, from, to)
    const top = series.max > 0 ? series.bars.find((b) => b.likes === series.max) : undefined
    return top ? { likes: top.likes, date: top.date } : null
  }, [located, from, to])

  const historyCount = spans.filter((s) => s.source === 'history').length
  const meta = t('liveRecordsMeta', { history: historyCount, shots: spans.length - historyCount })

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <p className="min-w-0 flex-1 basis-64 text-xs text-ink-500 tabular-nums">
          {meta}
          {zoneLabel && ` · ${t('liveZoneNote', { zone: zoneLabel })}`}
        </p>
        <SegmentedControl
          label={t('liveRecordsRangeLabel')}
          items={[
            { value: '30', label: t('liveRecordsRange30') },
            { value: 'all', label: t('liveRecordsRangeAll', { count: allCount }) },
          ]}
          value={range}
          onChange={(v) => setRange(v === 'all' ? 'all' : '30')}
        />
        {canEdit && (
          <Button variant="secondary" size="sm" onClick={onImport}>
            <ClipboardPaste className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden />
            {t('liveImportOpen')}
          </Button>
        )}
      </div>

      {located.length === 0 ? (
        <p className="py-6 text-center text-sm text-ink-500">{t('liveRecordsEmpty')}</p>
      ) : (
        <>
          <LiveKpiTiles cur={cur} prev={prev} from={from} maxLikes={maxLikes} hasApprox={hasApprox} />
          <div className="grid gap-3 lg:grid-cols-2">
            <LiveCalendar located={located} today={today} from={from} liveDays={cur.liveDays} hasData={hasData} />
            <LiveCoverageHistogram located={located} from={from} to={to} timeZone={timeZone} />
          </div>
          <LiveLikesBars located={located} from={from} to={to} timeZone={timeZone} />
          {/* 换范围时清单回到默认的 8 行，不带着上一个范围的「查看全部」。 */}
          <LiveSessionTable key={range} sessions={windowed} timeZone={timeZone} />
        </>
      )}
    </div>
  )
}
