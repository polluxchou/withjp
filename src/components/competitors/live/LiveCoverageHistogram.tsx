// src/components/competitors/live/LiveCoverageHistogram.tsx
'use client'

import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import {
  AXIS_END, AXIS_START, BUCKET_MINUTES, coverageHistogram, inRange, type LocatedSpan,
} from '@/lib/competitors/liveStats'
import { minutesToLabel, summarizeLiveHabit, type LiveSlot } from '@/lib/competitors/liveSlots'

/** 柱区高度（px）：份额 1.0 = 满高。 */
const PLOT_H = 120
/** 柱区上方留给主档标签的高度：两行，相邻两档靠得近时第二个标签落到上一行。 */
const LABEL_ROWS_H = 40
const AXIS_SPAN = AXIS_END - AXIS_START
/** X 刻度：06 → 次日 02，三小时一格，末尾补上轴终点 02。 */
const TICKS = [360, 540, 720, 900, 1080, 1260, 1440, 1560]
/** 同一行两个主档标签之间至少留这么宽（px），再近就把后一个挪到上一行。 */
const LABEL_GAP_PX = 6
/** 主档标签离图框左右边缘不到这个百分比时不居中，改为贴边对齐，免得半截字溢出图框。 */
const EDGE_PCT = 12

const pct = (minute: number) => ((minute - AXIS_START) / AXIS_SPAN) * 100

/**
 * 刻度文字只写两位小时：窄屏上 8 个「06:00」排不开。轴上 24 点写 24，过了午夜才回到 02
 * （与「次日 02:00」的轴说明一致）。
 */
const tickLabel = (minute: number) =>
  String(minute > 1440 ? Math.floor(minute / 60) - 24 : Math.floor(minute / 60)).padStart(2, '0')

/**
 * 主档在轴上的位置：档的代表时刻先归一到 0–1439（跨午夜合并的档会是负数），
 * 早于 06:00 的接到 24 点之后（与 locateSpans 的口径相同）；落在轴外的不画竖线。
 */
function slotAxisMinute(slot: LiveSlot): number | null {
  const m0 = ((slot.startMinutes % 1440) + 1440) % 1440
  const m = m0 < AXIS_START ? m0 + 1440 : m0
  return m <= AXIS_END ? m : null
}

/**
 * 开播时段分布：06:00 → 次日 02:00，每 15 分钟一根柱，高度 = 开播日里这一刻在播的天数占比。
 * 主档（summarizeLiveHabit 的 slots）画竖线并标精确时刻 —— 图看分布，数字给精确值。
 */
export default function LiveCoverageHistogram({
  located,
  from,
  to,
  timeZone,
}: {
  located: LocatedSpan[]
  from: string
  to: string
  /** 账号地区时区：主档按它聚类（「一天里的第几分钟」依赖时区）。 */
  timeZone: string
}) {
  const t = useTranslations('competitors')
  const { shares, liveDays } = useMemo(() => coverageHistogram(located, from, to), [located, from, to])
  const { slots, sessions } = useMemo(
    () => summarizeLiveHabit(inRange(located, from, to).map((s) => s.startedAt), timeZone),
    [located, from, to, timeZone],
  )

  const marks = slots
    .map((slot) => ({ slot, m: slotAxisMinute(slot) }))
    .filter((x): x is { slot: LiveSlot; m: number } => x.m != null)
    .map(({ slot, m }) => ({ slot, left: pct(m) }))

  // 主档标签错行：按实测宽度判断会不会叠在一起。按百分比估不准 —— 同样两档，
  // 弹窗全宽时隔得开，手机上图只有 280px 宽，英文「12:05 · 10 sessions」就和下一个叠上了。
  // 标签的水平范围只取决于位置与文字，与它落在哪一行无关，所以量一次就能定行。
  const plotRef = useRef<HTMLDivElement>(null)
  const [rowOf, setRowOf] = useState<Record<string, 0 | 1>>({})
  const marksKey = marks.map((x) => `${x.slot.startMinutes}:${x.slot.count}`).join(',')
  useLayoutEffect(() => {
    const plot = plotRef.current
    if (!plot) return
    const assign = () => {
      const labels = Array.from(plot.querySelectorAll<HTMLElement>('[data-slot-label]'))
        .map((el) => ({ key: el.dataset.slotLabel ?? '', rect: el.getBoundingClientRect() }))
        .sort((a, b) => a.rect.left - b.rect.left)
      const next: Record<string, 0 | 1> = {}
      const rowRight = [-Infinity, -Infinity]
      for (const { key, rect } of labels) {
        // 优先放贴着图的那一行；被占了才上移。两行都占满的情形（6 档挤在一起）不再处理。
        const row: 0 | 1 = rect.left >= rowRight[0] + LABEL_GAP_PX ? 0 : 1
        next[key] = row
        rowRight[row] = rect.right
      }
      setRowOf((prev) => (JSON.stringify(prev) === JSON.stringify(next) ? prev : next))
    }
    assign()
    const ro = new ResizeObserver(assign)
    ro.observe(plot)
    return () => ro.disconnect()
  }, [marksKey])

  const inSlots = slots.reduce((a, s) => a + s.count, 0)
  const foot = slots.length
    ? t('liveSlotFoot', {
        slots: slots.map((s) => t('liveSlotFootItem', { time: s.label, count: s.count })).join(' / '),
        rest: Math.max(0, sessions - inSlots),
      })
    : t('liveSlotFootNone', { count: sessions })

  return (
    <section className="flex min-w-0 flex-col gap-2.5 rounded-field border border-line bg-surface p-3">
      <header className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <h3 className="text-sm font-semibold text-ink-900">{t('liveCoverageTitle')}</h3>
        <span className="text-xs text-ink-500">{t('liveCoverageHint')}</span>
      </header>

      {sessions === 0 ? (
        <p className="text-xs text-ink-500">{t('liveRangeEmpty')}</p>
      ) : (
        <>
          <div className="relative" style={{ height: LABEL_ROWS_H + PLOT_H + 24 }}>
            <span className="absolute left-0 text-micro text-ink-400 tabular-nums" style={{ top: LABEL_ROWS_H - 7 }}>100%</span>
            <span className="absolute left-0 text-micro text-ink-400 tabular-nums" style={{ top: LABEL_ROWS_H + PLOT_H / 2 - 7 }}>50%</span>

            <div ref={plotRef} className="absolute left-9 right-0 border-b border-line-strong" style={{ top: LABEL_ROWS_H, height: PLOT_H }}>
              <div className="absolute inset-x-0 top-0 border-t border-dashed border-line" />
              <div className="absolute inset-x-0 border-t border-dashed border-line" style={{ top: PLOT_H / 2 }} />
              <div className="absolute inset-0 flex items-end gap-px">
                {shares.map((share, i) => {
                  const minute = AXIS_START + i * BUCKET_MINUTES
                  return (
                    <span
                      key={minute}
                      title={t('liveCoverageTip', {
                        time: minutesToLabel(minute),
                        days: Math.round(share * liveDays),
                        total: liveDays,
                        pct: Math.round(share * 100),
                      })}
                      className="min-w-0 flex-1 rounded-t-sm bg-primary/80"
                      // 有份额但不到 1px 的也给 2px，免得「偶尔在播」的时刻看起来和没播一样。
                      style={{ height: share > 0 ? Math.max(2, Math.round(share * PLOT_H)) : 0 }}
                    />
                  )
                })}
              </div>
              {marks.map(({ slot, left }) => (
                <div
                  key={slot.startMinutes}
                  className="pointer-events-none absolute -bottom-px border-l-[1.5px] border-ink-900"
                  style={{ left: `${left}%`, top: rowOf[slot.startMinutes] === 1 ? -LABEL_ROWS_H / 2 : 0 }}
                >
                  <span
                    data-slot-label={slot.startMinutes}
                    className={`absolute left-0 whitespace-nowrap bg-surface px-1 text-micro font-semibold text-ink-900 tabular-nums ${
                      left < EDGE_PCT ? '' : left > 100 - EDGE_PCT ? '-translate-x-full' : '-translate-x-1/2'
                    }`}
                    style={{ top: -18 }}
                  >
                    {slot.label} · {t('liveSessionsCount', { count: slot.count })}
                  </span>
                </div>
              ))}
            </div>

            <div className="absolute left-9 right-0 h-4 text-micro text-ink-400 tabular-nums" style={{ top: LABEL_ROWS_H + PLOT_H + 6 }}>
              {TICKS.map((m, i) => (
                <span
                  key={m}
                  className={`absolute whitespace-nowrap ${
                    // 两端的刻度不居中：首个左对齐、末个右对齐，免得溢出图框。
                    i === 0 ? '' : i === TICKS.length - 1 ? '-translate-x-full' : '-translate-x-1/2'
                  }`}
                  style={{ left: `${pct(m)}%` }}
                >
                  {tickLabel(m)}
                </span>
              ))}
            </div>
          </div>

          <p className="text-micro text-ink-500 tabular-nums">{foot}</p>
        </>
      )}
    </section>
  )
}
