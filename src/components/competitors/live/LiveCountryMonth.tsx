// src/components/competitors/live/LiveCountryMonth.tsx
'use client'

import { useMemo, type CSSProperties } from 'react'
import { useTranslations } from 'next-intl'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import EmptyState from '@/components/ui/EmptyState'
import SegmentedControl from '@/components/ui/SegmentedControl'
import Tag from '@/components/ui/Tag'
import {
  HOME_ZONE,
  MONTH_GRID,
  barBox,
  barClock,
  clampMonth,
  countryAccounts,
  countryMonthKpis,
  groupByCompany,
  heatAlpha,
  liveCountries,
  monthBounds,
  monthDays,
  monthRow,
  monthTotals,
  pickCountry,
  regionlessLiveCount,
  spanSource,
  stepMonth,
  type LiveAccount,
  type MonthCell,
} from '@/lib/competitors/liveBoard'
import { regionTimeZone } from '@/lib/competitors/liveSessions'
import { minutesToLabel } from '@/lib/competitors/liveSlots'
import type { RegionCode } from '@/lib/competitors/regions'
import { weekdayOfYmd } from '@/lib/time/zonedTime'
import { FOCUS_RING } from '@/lib/ui/recipes'
import { HISTORY_FILL, NO_DATA_FILL, SCROLL_FADE, SHOT_FILL } from './liveFills'
import { useLiveFormat } from './useLiveFormat'
import { useRegionZone } from './useRegionZone'
import { useScrollFade } from './useScrollFade'

/** 迷你竖条区高度（px）：40px 装下 06:00 → 次日 02:00 的 1200 分钟。几何在 liveBoard.barBox。 */
const STRIP_H = 40
/** 竖条最矮 3px：几分钟的短场、或 02:00 之后才开播被夹到轴尾的零长度条，也得看得见。 */
const MIN_BAR_H = 3
/** 12:00、18:00 两条点线的位置（px），给竖条一个读时刻的参照。与竖条同一套几何。 */
const GUIDE_TOPS = [12 * 60, 18 * 60].map((m) => barBox({ start: m, end: m }, STRIP_H, 0).top)
/** 底行热度超过这个透明度，格子够深，数字改用白字。 */
const DARK_ALPHA = 0.55

/** 列宽（px）在 liveBoard.MONTH_GRID 定，测试量 31 天排不排得进宽屏卡片。 */
const ACCOUNT_W: CSSProperties = { width: MONTH_GRID.accountPx }
const DAY_W: CSSProperties = { width: MONTH_GRID.dayPx }
/**
 * sticky 账号列右缘的 1px 分隔线。用阴影不用边框：没滚动时它正好压在第一天那格的左边框上（同色同位置），
 * 看不出多了一条线；滚动后日格从它底下滑过，这条线还在，账号列与日格分得开。边框会多占 1px、把整行挤歪。
 */
const STICKY_DIVIDER: CSSProperties = { boxShadow: '1px 0 0 var(--line-soft)' }
/** 数据来源色块：同图例与竖条的「实色 = 导入、斜纹 = 截图」，小到放进账号列第二行的行首。 */
const SWATCH = 'h-2.5 w-2 shrink-0 rounded-[2px]'

const isWeekend = (ymd: string) => {
  const wd = weekdayOfYmd(ymd)
  return wd === 0 || wd === 6
}

/**
 * 国家月历：选一个国家、一个月，该国每个有场次的号一行、当月每天一格。
 * 格内迷你竖条画当天每场的时段（导入实色 / 截图斜纹），格下标当天第一场的开播时刻；
 * 左列 handle 下面是本月开播天数与最早 / 最晚开播（不单开右列：31 天加一列汇总，1440 宽屏也放不下）；
 * 底行是当天开播的号数热度。
 *
 * 版面：列宽见 liveBoard.MONTH_GRID，31 天在 1440 宽屏上一屏放下。更窄的屏幕上网格在卡片里横向滚动，
 * 左列账号 sticky 钉住（滚到月底也知道哪行是谁），右边还有没露出来的日子时右缘渐隐（useScrollFade）。
 *
 * 三种格子必须分得开（「无数据」≠「没播」，口径见 liveCoverage.ts）：
 * 有场次、有数据但没场次（确实没播，白底）、不知道播没播（中性斜线）。
 *
 * 数都由 lib/competitors/liveBoard.ts 算（monthRow / monthTotals 与几个整形函数），这里只负责摆。
 * 时区：每行按该号地区时区落日期与时刻；列出的号同属一国，所以整张表是同一个时区，标题处写明。
 */
export default function LiveCountryMonth({
  accounts,
  patrolDays,
  today,
  country: requestedCountry,
  month: requestedMonth,
  onCountryChange,
  onMonthChange,
  onOpenRecords,
}: {
  /** 全部账号（已摊平，含没场次的）；选哪些号进月历在这里定。 */
  accounts: LiveAccount[]
  patrolDays: ReadonlySet<string>
  /** 页面级「今天」（日区 YYYY-MM-DD）：默认月份与可翻范围的上端。 */
  today: string
  /** URL 上的原始值，可能缺失或不合法，这里收敛。 */
  country: string | null
  month: string | null
  onCountryChange: (code: RegionCode) => void
  /**
   * 翻月。给的是「拿地址栏当前的月份算目标月」的函数，不是算好的月份：连点两下时第二下还没等到重渲染，
   * 用渲染时的月份会算出同一个月（见 CompetitorLiveView.setQuery 与 liveBoard.stepMonth）。
   */
  onMonthChange: (next: (current: string | null) => string) => void
  onOpenRecords: (competitorId: string) => void
}) {
  const t = useTranslations('competitors')
  const fmt = useLiveFormat()

  const options = useMemo(() => liveCountries(accounts), [accounts])
  const country = pickCountry(options, requestedCountry)
  const listed = useMemo(() => (country ? countryAccounts(accounts, country) : []), [accounts, country])
  // HOME_ZONE 只是 regionTimeZone 的回落值：月历只列地区在清单里的号（liveCountries / countryAccounts），实际用不上，
  // 取它与页面级「今天」同一口径。
  const bounds = useMemo(() => monthBounds(listed, today, HOME_ZONE), [listed, today])
  const month = clampMonth(requestedMonth, bounds)
  const days = useMemo(() => monthDays(month), [month])
  const { zoneLabel } = useRegionZone(country)
  // 有场次、但地区未填 / 不在清单里的号哪个国家都进不去：不提一句它们就悄无声息地消失了。
  const regionless = useMemo(() => regionlessLiveCount(accounts), [accounts])
  // Hook 不能放在下面的提前返回之后。
  const scroll = useScrollFade<HTMLDivElement>()

  const groups = useMemo(
    () =>
      groupByCompany(listed).map((g) => ({
        company: g.company,
        rows: g.accounts.map((account) => ({
          account,
          source: spanSource(account.spans),
          result: monthRow(account, month, regionTimeZone(account.region, HOME_ZONE), patrolDays, today),
        })),
      })),
    [listed, month, patrolDays, today],
  )
  const rows = useMemo(() => groups.flatMap((g) => g.rows), [groups])
  const totals = useMemo(() => monthTotals(rows.map((r) => r.result.cells)), [rows])
  const kpis = useMemo(() => countryMonthKpis(rows.map((r) => r.result), totals), [rows, totals])
  const maxLive = kpis.busiest?.live ?? 0

  const regionlessNote =
    regionless > 0 ? <p className="basis-full text-micro text-ink-500">{t('liveMonthRegionless', { count: regionless })}</p> : null

  if (!country) {
    return (
      <div>
        <EmptyState title={t('liveMonthEmpty')} hint={t('liveMonthEmptyHint')} />
        {regionlessNote}
      </div>
    )
  }

  const sourceLabel = (source: ReturnType<typeof spanSource>) =>
    source === 'history' ? t('liveSourceHistory') : source === 'mixed' ? t('liveSourceMixed') : t('liveSourceShot')

  // 提示框：日期 · 每场精确起止（截图推断的下播前加「约」，跨午夜标 +1）/ 没播 / 无数据 / 未到。
  const cellTip = (cell: MonthCell) => {
    const head = `${cell.date.slice(5)} ${fmt.weekday(cell.date)}`
    if (cell.future && cell.status !== 'live') return `${head} · ${t('liveCalendarFuture')}`
    if (cell.status === 'nodata') return `${head} · ${t('liveCalendarNoData')}`
    if (cell.status === 'idle') return `${head} · ${t('liveCalendarNone')}`
    const sessions = cell.tip.map((bar) => {
      const c = barClock(bar)
      return `${c.start}–${bar.approx ? t('liveApproxPrefix') : ''}${c.end}${c.nextDay ? ' +1' : ''}`
    })
    return `${head} · ${sessions.join(' / ')}`
  }

  const kpiTiles = [
    { key: 'active', label: t('liveMonthKpiActive'), value: `${kpis.active} / ${kpis.total}` },
    {
      key: 'busiest',
      label: t('liveMonthKpiBusiest'),
      value: kpis.busiest
        ? t('liveMonthKpiBusiestValue', {
            day: kpis.busiest.index + 1,
            weekday: fmt.weekday(days[kpis.busiest.index]),
            count: kpis.busiest.live,
          })
        : '—',
    },
    {
      key: 'dataDays',
      label: t('liveMonthKpiDataDays'),
      value: t('liveMonthKpiDataDaysValue', { days: kpis.dataDays, total: days.length }),
    },
  ]

  const navBtn = `inline-flex h-8 w-8 items-center justify-center rounded-full border border-line bg-surface text-ink-700 hover:bg-row-hover disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-surface ${FOCUS_RING}`

  return (
    <div className="space-y-4">
      {/* 控件行：国家 · ‹ 月份 › · 时区说明 */}
      <div className="flex flex-wrap items-center gap-2 rounded-card border border-line bg-surface p-3">
        {/* 国家多了分段控件会比手机屏还宽：包一层自己横向滚动（min-w-0 让它能被压窄），整页不出横向滚动条。
            -m-0.5 p-0.5：滚动容器会裁掉溢出的内容，给按钮的焦点环留出 2px。
            里层 w-max：否则分段控件按滚动容器的宽度收缩，「Japan 4」这类标签会被挤成两行。 */}
        <div className="-m-0.5 min-w-0 max-w-full overflow-x-auto p-0.5 scrollbar-thin">
          <div className="w-max">
            <SegmentedControl
              label={t('liveCountryLabel')}
              value={country}
              onChange={(v) => onCountryChange(v as RegionCode)}
              items={options.map((o) => ({
                value: o.code,
                label: t('liveCountryOption', { name: t(`regionName.${o.code}`), count: o.count }),
              }))}
            />
          </div>
        </div>
        <span aria-hidden className="mx-1 h-4 w-px bg-line" />
        <button
          type="button"
          className={navBtn}
          aria-label={t('liveMonthPrev')}
          title={t('liveMonthPrev')}
          disabled={month <= bounds.from}
          onClick={() => onMonthChange((current) => stepMonth(current, -1, bounds))}
        >
          <ChevronLeft size={16} strokeWidth={1.5} aria-hidden />
        </button>
        <strong className="min-w-[104px] text-center text-sm font-semibold text-ink-900 tabular-nums" aria-live="polite">
          {fmt.monthYear(month)}
        </strong>
        <button
          type="button"
          className={navBtn}
          aria-label={t('liveMonthNext')}
          title={t('liveMonthNext')}
          disabled={month >= bounds.to}
          onClick={() => onMonthChange((current) => stepMonth(current, 1, bounds))}
        >
          <ChevronRight size={16} strokeWidth={1.5} aria-hidden />
        </button>
        {zoneLabel && <span className="ml-auto text-xs text-ink-500">{t('liveZoneNote', { zone: zoneLabel })}</span>}
        {regionlessNote}
      </div>

      {/* 三个指标 */}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        {kpiTiles.map((k) => (
          <div key={k.key} className="flex min-w-0 flex-col gap-0.5 rounded-field border border-line bg-surface px-3 py-2.5">
            <span className="truncate text-xs text-ink-500" title={k.label}>{k.label}</span>
            <span className="truncate text-xl font-semibold text-ink-900 tabular-nums">{k.value}</span>
          </div>
        ))}
      </div>

      {/* 图例：怎么读一格 + 三种样式 */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-ink-700">
        <span className="text-pretty">{t('liveMonthLegend')}</span>
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden className="h-3.5 w-2.5 rounded-sm" style={HISTORY_FILL} />
          {t('liveSourceHistory')}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden className="h-3.5 w-2.5 rounded-sm" style={SHOT_FILL} />
          {t('liveSourceShot')}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden className="box-border h-3.5 w-3.5 rounded-sm border border-line" style={NO_DATA_FILL} />
          {t('liveMonthLegendNoData')}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden className="box-border h-3.5 w-3.5 rounded-sm border border-dashed border-line-strong" />
          {t('liveCalendarFuture')}
        </span>
      </div>

      {/* 月历网格：左列账号 + 每天一列（宽度见 MONTH_GRID）。放不下时网格在卡片里横向滚动，整页不出横向滚动条。
          卡片左边不留内边距，由 sticky 左列自己的 pl-3 补上（同番组表的时间轴）：左列带底色盖住滚过去的日格，
          连卡片左内边距那一条也要盖住，否则日格会从左列左边漏出来。 */}
      <div className="relative">
        <div ref={scroll.ref} className="overflow-x-auto rounded-card border border-line bg-surface pb-4 pr-3 pt-3 scrollbar-thin">
          <div className="flex w-max flex-col">
            <div className="flex h-10 items-end">
              <div className="sticky left-0 z-10 flex shrink-0 items-end self-stretch bg-surface pl-3">
                <div className="pb-1 pr-2 text-micro text-ink-500" style={ACCOUNT_W}>
                  {t('liveMonthColAccount')}
                </div>
              </div>
              {days.map((d) => (
                <div
                  key={d}
                  className={`flex shrink-0 flex-col items-center justify-end pb-1 leading-tight ${
                    isWeekend(d) ? 'text-warning-text' : 'text-ink-700'
                  }`}
                  style={DAY_W}
                >
                  <span className="text-xs font-semibold tabular-nums">{Number(d.slice(8))}</span>
                  <span className="text-[10px]">{fmt.weekdayNarrow(d)}</span>
                </div>
              ))}
            </div>

            {groups.map((g) => (
              <div key={g.company ?? ''}>
                {/* 公会标签也钉在左边：滚到月底时仍看得出下面几行属于哪家。 */}
                <div className="mt-1.5 flex h-[26px] items-center">
                  <div className="sticky left-0 z-10 w-max pl-3">
                    <Tag
                      tone="violet"
                      size="sm"
                      label={t('liveMonthGroup', { name: g.company ?? t('liveMonthUnassigned'), count: g.rows.length })}
                    />
                  </div>
                </div>
                {g.rows.map(({ account, source, result }) => (
                  <div key={account.id} className="flex h-14 items-stretch border-t border-line-soft">
                    <div className="sticky left-0 z-10 flex shrink-0 bg-surface pl-3" style={STICKY_DIVIDER}>
                      {/* 不写 aria-label：它会盖掉按钮里看得见的文字，读屏就听不到来源与本月汇总了。
                          可见文字（加上读屏专用的来源）就是无障碍名称；「打开开播记录」的说明与来源放在 title
                          （读屏当描述读、鼠标悬停看得到，handle 被截断时也在这里看全名）。 */}
                      <button
                        type="button"
                        onClick={() => onOpenRecords(account.id)}
                        title={`${t('liveMonthOpenRecords', { handle: account.handle })}\n${sourceLabel(source)}`}
                        className={`group flex min-w-0 flex-col justify-center rounded-field pr-2 text-left ${FOCUS_RING}`}
                        style={ACCOUNT_W}
                      >
                        <span className="truncate text-xs font-semibold text-ink-900 group-hover:text-primary">{account.handle}</span>
                        {/* 第二行：来源色块 + 本月开播天数。来源原来是一整行字，「LIVE History + 截图推断」在 132px 里放不下，
                            改成与图例同样式的色块；读屏照样读到来源文字。 */}
                        <span className="flex min-w-0 items-center gap-1 text-[10px] font-semibold leading-[13px] text-ink-700 tabular-nums">
                          {source === 'mixed' ? (
                            <span aria-hidden className="flex shrink-0 gap-px">
                              <span className={SWATCH} style={HISTORY_FILL} />
                              <span className={SWATCH} style={SHOT_FILL} />
                            </span>
                          ) : (
                            <span aria-hidden className={SWATCH} style={source === 'shot' ? SHOT_FILL : HISTORY_FILL} />
                          )}
                          <span className="sr-only">{sourceLabel(source)}</span>
                          <span className="truncate">{t('liveMonthLiveDays', { days: result.liveDays })}</span>
                        </span>
                        <span className="truncate text-[10px] leading-[13px] text-ink-500 tabular-nums">
                          {result.earliest != null && result.latest != null
                            ? t('liveMonthRange', {
                                earliest: minutesToLabel(result.earliest),
                                latest: minutesToLabel(result.latest),
                              })
                            : t('liveMonthNoneThisMonth')}
                        </span>
                      </button>
                    </div>
                    {result.cells.map((cell) => {
                      // 今天之后的日子：画成虚线框、不画斜线与参照线（同弹窗日历的「未到」）——
                      // 画成「无数据」斜线会被读成巡检漏了这些天。
                      const upcoming = cell.future && cell.status !== 'live'
                      const hatched = cell.status === 'nodata' && !upcoming
                      return (
                        <div
                          key={cell.date}
                          title={cellTip(cell)}
                          data-cell={upcoming ? 'future' : cell.status}
                          className={`relative box-border shrink-0 border-l border-line-soft pt-px ${
                            hatched ? '' : isWeekend(cell.date) ? 'bg-canvas' : 'bg-surface'
                          }`}
                          style={hatched ? { ...DAY_W, ...NO_DATA_FILL } : DAY_W}
                        >
                          {upcoming ? (
                            <div aria-hidden className="absolute inset-1 rounded-sm border border-dashed border-line-strong" />
                          ) : (
                            <>
                              <div className="relative" style={{ height: STRIP_H }}>
                                {GUIDE_TOPS.map((top) => (
                                  <div key={top} aria-hidden className="absolute inset-x-1 border-t border-dotted border-line" style={{ top }} />
                                ))}
                                {cell.bars.map((bar, i) => (
                                  <span
                                    key={i}
                                    aria-hidden
                                    className="absolute left-1/2 w-3 -translate-x-1/2 rounded-sm"
                                    style={{ ...barBox(bar, STRIP_H, MIN_BAR_H), ...(bar.approx ? SHOT_FILL : HISTORY_FILL) }}
                                  />
                                ))}
                              </div>
                              {/* 只写当天第一场的 HH:mm，不加「+」：一天几场在上面的竖条里本来就数得出，
                                  30px 的格子塞「12:13+」会和邻格的字挤在一起；每场的精确起止在格子的提示框里。 */}
                              <div
                                data-start-label
                                className="h-3.5 whitespace-nowrap text-center text-[9.5px] leading-[14px] text-ink-700 tabular-nums"
                              >
                                {cell.firstStart != null ? minutesToLabel(cell.firstStart) : ''}
                              </div>
                            </>
                          )}
                        </div>
                      )
                    })}
                  </div>
                ))}
              </div>
            ))}

            {/* 底行：当天开播号数。分母只算那天有数据的号，没人有数据的日子留空，不写 0。
                h-11 + 说明最多两行：左列收到 132px 后「Among accounts with data」「データのあるアカウントのみ」一行放不下，
                截成「…」就读不出分母是谁了。 */}
            <div className="mt-1.5 flex h-11 items-stretch border-t border-line-strong">
              <div className="sticky left-0 z-10 flex shrink-0 bg-surface pl-3">
                <div className="flex min-w-0 flex-col justify-center pr-2" style={ACCOUNT_W}>
                  <span className="truncate text-xs font-semibold text-ink-900">{t('liveMonthTotals')}</span>
                  <span className="line-clamp-2 text-[10px] leading-[13px] text-ink-500">{t('liveMonthTotalsHint')}</span>
                </div>
              </div>
              {totals.map((d, i) => {
                const alpha = heatAlpha(d.live, maxLive)
                return (
                  <div
                    key={days[i]}
                    title={`${days[i].slice(5)} · ${t('liveMonthTotalsTip', { live: d.live, withData: d.withData })}`}
                    className={`flex shrink-0 items-center justify-center border-l border-surface text-xs font-semibold tabular-nums ${
                      alpha == null ? 'text-ink-400' : alpha > DARK_ALPHA ? 'text-white' : 'text-ink-900'
                    }`}
                    style={alpha == null ? DAY_W : { ...DAY_W, backgroundColor: `rgb(var(--primary) / ${alpha.toFixed(2)})` }}
                  >
                    {d.withData > 0 ? d.live : ''}
                  </div>
                )
              })}
            </div>
          </div>
        </div>
        {/* 右缘渐隐：只在右边还有没露出来的日子时出现（滚到底就撤），压在卡片边框以内、不挡点击。 */}
        {scroll.fade && (
          <div
            aria-hidden
            data-scroll-fade
            className="pointer-events-none absolute inset-y-px right-px z-20 w-10 rounded-r-card"
            style={SCROLL_FADE}
          />
        )}
      </div>
    </div>
  )
}
