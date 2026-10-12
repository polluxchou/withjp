// src/components/competitors/live/LiveLikesBars.tsx
'use client'

import { useMemo } from 'react'
import { useTranslations } from 'next-intl'
import { formatCount } from '@/lib/competitors/metrics'
import { inRange, likesSeries, type LocatedSpan } from '@/lib/competitors/liveStats'
import { zonedHm } from '@/lib/time/zonedTime'
import { useLiveFormat } from './useLiveFormat'

/** 柱区高度（px）：最高那场 = 满高。 */
const PLOT_H = 148
/** X 轴最多标这么多个日期，再多就挤成一团。 */
const MAX_TICKS = 9
/**
 * 日期标签从柱子左沿往右写，比柱子宽（柱子最宽 28px，「10-09」约 32px）：
 * 至少隔一根标一个，且最右边这一截不标，否则末尾的标签会伸出图框。
 */
const MIN_TICK_EVERY = 2
const TICK_TAIL = 0.88

/**
 * 每场点赞：按开播顺序一根柱子一场，中位数画虚线，最高两场直接标数。
 * 点赞为空的场次（截图推断的都没有点赞）不画 —— 画成 0 会被读成「这场没人点赞」。
 */
export default function LiveLikesBars({
  located,
  from,
  to,
  timeZone,
}: {
  located: LocatedSpan[]
  from: string
  to: string
  timeZone: string
}) {
  const t = useTranslations('competitors')
  const fmt = useLiveFormat()
  const { bars, median, max } = useMemo(() => likesSeries(located, from, to), [located, from, to])
  const windowed = useMemo(() => inRange(located, from, to), [located, from, to])
  // 悬停说明要带时段，LikesBar 只有开播时刻：按开播时刻回查同一场的下播。
  const endOf = useMemo(() => new Map(windowed.map((s) => [s.startedAt, s.endedAt])), [windowed])

  const heightOf = (likes: number) => (max > 0 ? Math.max(2, Math.round((likes / max) * PLOT_H)) : 2)
  const every = Math.max(MIN_TICK_EVERY, Math.ceil(bars.length / MAX_TICKS))
  const showTick = (i: number) => i % every === 0 && (i === 0 || i <= (bars.length - 1) * TICK_TAIL)
  // 柱间距随场次数收窄：固定 2px 时 500 场光间距就近 1000px，手机上会撑出横向滚动条。
  // 柱子本身 flex-1 + min-w-0 可以缩到不足 1px，间距是唯一撑宽的东西。
  const gap = bars.length > 200 ? 'gap-0' : bars.length > 80 ? 'gap-px' : 'gap-0.5'

  return (
    <section className="flex min-w-0 flex-col gap-2.5 rounded-field border border-line bg-surface p-3">
      <header className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <h3 className="text-sm font-semibold text-ink-900">{t('liveLikesTitle')}</h3>
        {bars.length > 0 && (
          <span className="text-xs text-ink-500 tabular-nums">{t('liveLikesHint', { median: formatCount(median) })}</span>
        )}
      </header>

      {bars.length === 0 ? (
        // 区间里一场都没有，和「有场次但都没点赞数据（截图推断）」是两回事，分开说。
        <p className="text-xs text-ink-500">{windowed.length === 0 ? t('liveRangeEmpty') : t('liveLikesEmpty')}</p>
      ) : (
        <div className="relative" style={{ height: 24 + PLOT_H + 24 }}>
          <div className="absolute inset-x-0 top-6 border-b border-line-strong" style={{ height: PLOT_H }}>
            {median != null && (
              <div
                className="pointer-events-none absolute inset-x-0 z-[1] border-t-[1.5px] border-dashed border-ink-400"
                style={{ bottom: max > 0 ? Math.round((median / max) * PLOT_H) : 0 }}
              />
            )}
            <div className={`absolute inset-0 flex items-end ${gap}`}>
              {bars.map((b, i) => {
                const h = heightOf(b.likes)
                const end = endOf.get(b.startedAt)
                const time = `${zonedHm(b.startedAt, timeZone) ?? ''}–${end ? zonedHm(end, timeZone) ?? '' : ''}`
                // 最高两场的数字标在柱顶。贴着左右边缘的不居中，免得半截字溢出图框。
                const edge = i < bars.length * 0.1 ? 'left-0' : i >= bars.length * 0.9 ? 'right-0' : 'left-1/2 -translate-x-1/2'
                return (
                  <div key={b.startedAt} className="relative flex h-full min-w-0 max-w-[28px] flex-1 items-end">
                    <div
                      className="w-full rounded-t bg-primary"
                      style={{ height: h }}
                      title={t('liveLikesTip', {
                        date: b.date.slice(5),
                        weekday: fmt.weekday(b.date),
                        time,
                        likes: formatCount(b.likes),
                      })}
                    />
                    {b.top && (
                      <span
                        className={`absolute ${edge} whitespace-nowrap text-micro font-semibold text-ink-900 tabular-nums`}
                        style={{ bottom: h + 4 }}
                      >
                        {b.date.slice(5)} · {formatCount(b.likes)}
                      </span>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
          <div className={`absolute inset-x-0 flex ${gap} text-micro text-ink-400 tabular-nums`} style={{ top: 24 + PLOT_H + 6 }}>
            {bars.map((b, i) => (
              <span key={b.startedAt} className="relative min-w-0 max-w-[28px] flex-1 overflow-visible whitespace-nowrap">
                {showTick(i) ? b.date.slice(5) : ''}
              </span>
            ))}
          </div>
        </div>
      )}
    </section>
  )
}
