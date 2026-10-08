// src/components/competitors/WeeklyFollowersCurve.tsx
'use client'

import { useTranslations } from 'next-intl'
import { buildWeeklyCurve, weeklyTipLabel, type WeeklyCurveBridge, type WeeklyCurvePoint } from '@/lib/competitors/chart'
import { FRESH_DAYS, daysSince, daysSincePrevious, latestDelta, windowChange, type IntervalDelta } from '@/lib/competitors/cadence'
import { formatCount } from '@/lib/competitors/metrics'
import type { WeeklyPoint } from '@/lib/competitors/types'
import { fillWeekSlots } from '@/lib/competitors/weekly'

/**
 * 曲线画多少个日历周。改这个数**必须同步改** i18n 的 weeklyFollowers 文案
 * （zh/en/ja 三处的「近N周」），否则标题和图上画的周数会对不上。
 * 也要重新量窄宽度：刻度行是 N 等分格，N 越大每格越窄（见下方 grid 注释）。
 * 5 周的首尾正好隔 4 周，窗口首尾的对比就是「近一个月」。
 */
const WEEKS = 5

/**
 * 折线只负责形状：坐标归一化到 0–100 后非等比铺满容器，线宽靠
 * non-scaling-stroke 恒定 2px。圆点与日期刻度改用 CSS 绝对定位（见下），
 * 因此不会被非等比缩放拉成椭圆，文字也不随 viewBox 缩放。
 *
 * 连续有数据的周画实线 segments；跨缺采空档的 bridges 画浅色虚线——只表示两端
 * 相连，不代表中间每周的走势（不插值）。
 */
function CurveLine({ segments, bridges = [] }: { segments: string[]; bridges?: WeeklyCurveBridge[] }) {
  return (
    <svg
      className="absolute inset-0 h-full w-full text-sky-500"
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      {bridges.map((b) => (
        <line
          key={`${b.x1}-${b.x2}`}
          x1={b.x1}
          y1={b.y1}
          x2={b.x2}
          y2={b.y2}
          className="text-sky-300"
          stroke="currentColor"
          strokeWidth={2}
          strokeDasharray="4 4"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
      ))}
      {segments.map((points) => (
        <polyline
          key={points}
          points={points}
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
      ))}
    </svg>
  )
}

const signed = (n: number) => `${n > 0 ? '+' : ''}${n.toFixed(1)}`
/** 2026-09-16 → 9/16（直接切字符串，不经 Date，免得时区推错一天）。 */
const md = (iso: string) => `${Number(iso.slice(5, 7))}/${Number(iso.slice(8, 10))}`

export default function WeeklyFollowersCurve({
  weekly,
  compact = false,
  today = null,
}: {
  weekly: WeeklyPoint[]
  compact?: boolean
  /** 本地今天，挂载后才有：首帧为 null 时不画「已 N 天未采」那一格，避免 hydration 不一致。 */
  today?: string | null
}) {
  const t = useTranslations('competitors')
  // fillWeekSlots 而非 slice(-WEEKS)：后者取「最近 N 个**有数据**的周」，漏采一周后
  // 剩下的点仍被等距铺满，图上看不出缺口。右端锚在最新有数据的周。
  const slots = fillWeekSlots(weekly, WEEKS)
  const lastCaptured = [...slots].reverse().find((s) => s.captured_on)?.captured_on ?? null
  const staleDays = daysSince(lastCaptured, today)
  // 超过一周没采：右侧多一格把断采的时间压成一格，不占前面 5 周的位置。
  const showStale = !compact && staleDays !== null && staleDays > FRESH_DAYS
  // 非 compact 才用 'cell'：刻度行是等分 grid，圆点必须落在同一批格心上才逐列对齐。
  // compact 是 96×20px 稀疏图，没有圆点也没有刻度行，继续走内缩口径。
  const curve = buildWeeklyCurve(slots, compact ? {} : { align: 'cell', trailingCells: showStale ? 1 : 0 })
  const pts = curve.points
  const cols = pts.length + (showStale ? 1 : 0)
  const latest = pts.length ? pts[pts.length - 1].followers : null

  // 涨幅取最近两次有数据的采集，跨着缺采的周也算；区间不是一周就写真实天数。
  const d = latestDelta(weekly)
  const deltaMain = (x: IntervalDelta) =>
    x.perWeekPct === null
      ? t('weeklyDelta', { pct: signed(x.pct) })
      : t('weeklyDeltaSpan', { pct: signed(x.pct), days: x.days })
  const deltaSub = d && d.perWeekPct !== null ? t('weeklyDeltaPerWeek', { pct: signed(d.perWeekPct) }) : null
  const month = compact ? null : windowChange(slots)
  const since = daysSincePrevious(weekly)

  // 精确数字（非 26.9K 这样的压缩值）。显式传 locale：无参 toLocaleString 取运行时
  // 默认区域，SSR 与浏览器不一致会引发 hydration 不匹配。
  // 日期报的是真实采集日而非 x 轴那个周一刻度；缺采的周没有采集日，由 weeklyTipLabel
  // 退回「某周起」的文案，数值位给 formatCount(null) 的「—」。
  const tip = (p: WeeklyCurvePoint) => {
    const label = weeklyTipLabel(p)
    return t(label.key, {
      date: label.date,
      count: p.followers == null ? formatCount(null) : p.followers.toLocaleString('zh-CN'),
    })
  }
  const sinceText = (p: WeeklyCurvePoint) => {
    const s = p.captured_on ? since.get(p.captured_on) : undefined
    return s ? t('weeklySincePrev', { days: s.days, date: s.prev.slice(5) }) : null
  }
  // 圆点不进 tab 序（每张卡 4 个空按钮会污染键盘导航），改由整图一条可读序列
  // 一次给全；精确数字另有展开区的「历史打点」表格兜底。
  const seriesLabel = `${t('weeklyFollowers')} — ${pts.map(tip).join('; ')}`

  if (compact) {
    // 子账号 compact 行在父卡 1/4 宽的格里：标签/数值/环比/迷你曲线挤一行。
    // min-w-0 + truncate + shrink-0:让它在窄格里收缩而不是撑破轨道(见 Step 1)。
    return (
      <div className="flex min-w-0 items-center gap-2 self-start overflow-hidden rounded-md bg-canvas px-2.5 py-1.5 text-xs">
        <span className="truncate text-ink-500">{t('weeklyFollowers')}</span>
        <span className="font-medium tabular-nums text-ink-900">{formatCount(latest)}</span>
        {d && <span className="whitespace-nowrap text-sky-600">{deltaMain(d)}</span>}
        {curve.segments.length || curve.bridges.length ? (
          <span className="relative ml-auto h-5 w-24 shrink-0" role="img" aria-label={seriesLabel}>
            <CurveLine segments={curve.segments} bridges={curve.bridges} />
          </span>
        ) : pts.length === 0 ? (
          // 只有真的无数据才提示；单点画不出线，但左侧已有数值，再说「暂无」会自相矛盾
          <span className="ml-auto text-micro text-ink-400">{t('weeklyEmpty')}</span>
        ) : null}
      </div>
    )
  }

  const cellStyle = (i: number) => ({ left: `${(i / cols) * 100}%`, width: `${100 / cols}%` })

  return (
    <div className="flex flex-col self-start rounded-md bg-canvas p-2.5">
      <span className="text-micro text-ink-500">{t('weeklyFollowers')}</span>
      <div className="flex flex-wrap items-baseline gap-x-2">
        <span className="text-lg font-semibold leading-tight tabular-nums text-ink-900">{formatCount(latest)}</span>
        {d && (
          <span className="text-micro text-sky-600">
            {deltaMain(d)}
            {deltaSub && <span className="ml-1 text-ink-400">{deltaSub}</span>}
          </span>
        )}
      </div>
      {month && (
        <span className="text-micro text-ink-500">
          {t.rich('weeklyWindowChange', {
            pct: signed(month.pct),
            days: month.days,
            from: md(month.from),
            to: md(month.to),
            b: (c) => <b className="font-semibold text-ink-700">{c}</b>,
          })}
        </span>
      )}
      {pts.length ? (
        <div className="mt-2" role="img" aria-label={seriesLabel}>
          <div className="relative h-16">
            {/* 格子底色：缺采的周灰底、断采至今那一格琥珀底。画在折线下面。 */}
            {pts.map((p, i) =>
              p.yPct === null ? (
                <span key={`miss-${p.week_start}`} aria-hidden className="absolute -inset-y-1 px-0.5" style={cellStyle(i)}>
                  <span className="block h-full rounded-field bg-muted-soft" />
                </span>
              ) : null,
            )}
            {showStale && staleDays !== null && (
              <span className="absolute -inset-y-1 px-0.5" style={cellStyle(pts.length)}>
                <span className="flex h-full flex-col items-center justify-center rounded-field bg-warning-soft text-center text-micro font-semibold leading-tight text-warning-text">
                  {t.rich('weeklyStaleCell', { days: staleDays, l: (c) => <span className="whitespace-nowrap">{c}</span> })}
                </span>
              </span>
            )}
            {(curve.segments.length > 0 || curve.bridges.length > 0) && (
              <CurveLine segments={curve.segments} bridges={curve.bridges} />
            )}
            {curve.bridges.map((b) => (
              <span
                key={`gap-${b.x1}-${b.x2}`}
                aria-hidden
                className="absolute bottom-0 -translate-x-1/2 whitespace-nowrap text-micro text-sky-600"
                style={{ left: `${(b.x1 + b.x2) / 2}%` }}
              >
                {t('weeklyGapWeeks', { count: b.missing })}
              </span>
            ))}
            {/* 缺采的周只占格子、不画圆点，也就没有 hover 提示——空档本身就是信息。 */}
            {pts.map((p, i) => {
              if (p.yPct == null) return null
              const s = sinceText(p)
              return (
                <span
                  key={p.week_start}
                  className="group absolute flex h-6 w-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center hover:z-20"
                  style={{ left: `${p.xPct}%`, top: `${p.yPct}%` }}
                >
                  <span className="h-2 w-2 rounded-full bg-sky-500 ring-2 ring-canvas" />
                  {/* 提示框比这一列还宽，所以左半边的点朝右展开、右半边朝左展开，
                      避免在窄列下溢出到视口外；同时限宽换行而非一行拉长。 */}
                  <span
                    className={`pointer-events-none absolute hidden w-max max-w-[10rem] rounded-field bg-ink-900 px-1.5 py-1 text-micro tabular-nums text-white group-hover:block ${
                      p.yPct < 50 ? 'top-full mt-0.5' : 'bottom-full mb-0.5'
                    } ${i < pts.length / 2 ? 'left-0' : 'right-0'}`}
                  >
                    {tip(p)}
                    {s && <span className="block text-amber-200">{s}</span>}
                  </span>
                </span>
              )
            })}
          </div>
          {/* 日期与数值同列的等分 grid：相邻标签不可能重叠（最坏只是单格 truncate），
              比 absolute left:x% 居中稳——后者在窄列（卡片 1/4 宽）下会互相压。
              列数是运行时值，只能走 style：动态拼 grid-cols-[...] 类名 Tailwind
              扫不到、会静默失效。精确值仍由圆点的 hover 提示给出。
              缺采的周由 formatCount(null) 渲染成「—」，与空白格区分开。
              断采那一格的刻度写「今天」：它的右边界就是今天。 */}
          <div className="mt-1 grid" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
            {pts.map((p) => (
              <div key={p.week_start} className="min-w-0 text-center">
                <div className="text-micro tabular-nums text-ink-400">{p.tick}</div>
                <div
                  className={`truncate text-micro font-medium tabular-nums ${
                    p.followers == null ? 'text-ink-400' : 'text-ink-700'
                  }`}
                >
                  {formatCount(p.followers)}
                </div>
              </div>
            ))}
            {showStale && (
              <div className="min-w-0 text-center">
                <div className="text-micro text-warning-text">{t('weeklyStaleTick')}</div>
                <div className="text-micro text-ink-400">{formatCount(null)}</div>
              </div>
            )}
          </div>
        </div>
      ) : (
        <span className="mt-1.5 text-micro text-ink-400">{t('weeklyEmpty')}</span>
      )}
    </div>
  )
}
