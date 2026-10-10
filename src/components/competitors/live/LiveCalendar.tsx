// src/components/competitors/live/LiveCalendar.tsx
'use client'

import { useMemo } from 'react'
import { useTranslations } from 'next-intl'
import { calendarWeeks, type CalendarDay, type HasData, type LocatedSpan } from '@/lib/competitors/liveStats'
import { useLiveFormat } from './useLiveFormat'

const WEEKS = 13

/**
 * 档位 1–4 的主色透明度。0 档（没播）用 bg-line-soft 中性底，不和「播得很短」混成同一种浅紫。
 * 透明度写在 style 里：Tailwind 的 /N 修饰符要字面量，四档逐个写类名反而更难对照。
 */
const LEVEL_ALPHA: Record<1 | 2 | 3 | 4, number> = { 1: 0.22, 2: 0.42, 3: 0.66, 4: 1 }

const levelStyle = (level: CalendarDay['level']) =>
  level === 0 ? undefined : { backgroundColor: `rgb(var(--primary) / ${LEVEL_ALPHA[level]})` }

/**
 * 「无数据」格：中性斜线，和「没播」（实底浅灰）一眼分得开 —— 只有截图的号，巡检没跑的日子
 * 我们不知道它播没播，画成没播会被读成「断播一个月」。颜色用墨色低透明度，不用主色，免得被读成场次。
 */
const NO_DATA_STYLE = {
  backgroundImage: 'repeating-linear-gradient(45deg, rgb(var(--ink-900) / 0.07) 0 2px, transparent 2px 6px)',
}

/**
 * 开播日历：最近 13 周 × 周一到周日，按当天总时长分 5 档深浅。
 * 统计区间之外的日子变淡（仍画出来，看得到区间前的习惯）；今天之后画虚线框；无数据画斜线。
 */
export default function LiveCalendar({
  located,
  today,
  from,
  liveDays,
  hasData,
}: {
  located: LocatedSpan[]
  today: string
  /** 当前统计区间起点：早于它的格子变淡。 */
  from: string
  /** 区间内开播天数（右下角那句说明）。 */
  liveDays: number
  /** 某天有没有数据（见 liveCoverage.ts）。 */
  hasData: HasData
}) {
  const t = useTranslations('competitors')
  const fmt = useLiveFormat()
  const weeks = useMemo(
    () => calendarWeeks(located, { today, weeks: WEEKS, rangeFrom: from }, hasData),
    [located, today, from, hasData],
  )

  const tip = (d: CalendarDay) => {
    const head = `${d.date.slice(5)} ${fmt.weekday(d.date)}`
    if (d.future) return `${head} · ${t('liveCalendarFuture')}`
    if (d.noData) return `${head} · ${t('liveCalendarNoData')}`
    if (!d.sessions) return `${head} · ${t('liveCalendarNone')}`
    return `${head} · ${t('liveSessionsCount', { count: d.sessions })} · ${fmt.duration(d.minutes)}`
  }

  return (
    <section className="flex min-w-0 flex-col gap-2.5 rounded-field border border-line bg-surface p-3">
      <header className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <h3 className="text-sm font-semibold text-ink-900">{t('liveCalendarTitle')}</h3>
        <span className="text-xs text-ink-500">{t('liveCalendarHint')}</span>
      </header>

      <div className="flex gap-1.5">
        {/* 行标签只标一、三、五、日，隔行标足够定位，全标会挤。 */}
        <div className="grid w-4 grid-rows-[16px_repeat(7,18px)] gap-y-[3px] text-right text-micro leading-[18px] text-ink-400">
          <span />
          {weeks[0]?.map((d, i) => (
            <span key={d.date}>{i % 2 === 0 ? fmt.weekdayNarrow(d.date) : ''}</span>
          ))}
        </div>
        <div className="flex gap-[3px]">
          {weeks.map((col) => {
            // 月份标签放在含 1 号的那一列顶上：列与月份的边界对得上。
            const first = col.find((d) => d.date.endsWith('-01'))
            return (
              <div key={col[0].date} className="grid grid-cols-[18px] grid-rows-[16px_repeat(7,18px)] gap-y-[3px]">
                <span className="overflow-visible whitespace-nowrap text-micro text-ink-400">
                  {first ? fmt.month(first.date) : ''}
                </span>
                {col.map((d) => (
                  <span
                    key={d.date}
                    title={tip(d)}
                    className={`box-border h-[18px] w-[18px] rounded ${
                      d.future
                        ? 'border border-dashed border-line-strong'
                        : d.noData ? 'border border-line' : d.level === 0 ? 'bg-line-soft' : ''
                    } ${d.inRange ? '' : 'opacity-30'}`}
                    style={d.future ? undefined : d.noData ? NO_DATA_STYLE : levelStyle(d.level)}
                  />
                ))}
              </div>
            )
          })}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1.5 text-micro text-ink-500">
        <span>{t('liveCalendarNone')}</span>
        <span className="h-3 w-3 rounded-sm bg-line-soft" />
        {([1, 2, 3, 4] as const).map((lv) => (
          <span key={lv} className="h-3 w-3 rounded-sm" style={levelStyle(lv)} />
        ))}
        <span>{t('liveCalendarMax')}</span>
        <span className="ml-2 box-border h-3 w-3 rounded-sm border border-line" style={NO_DATA_STYLE} />
        <span>{t('liveCalendarNoData')}</span>
        <span className="ml-auto tabular-nums">{t('liveCalendarNote', { days: liveDays })}</span>
      </div>
    </section>
  )
}
