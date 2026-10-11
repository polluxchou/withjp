// src/components/competitors/live/LiveRoomMonth.tsx
'use client'

import { Fragment, useId, useMemo, type CSSProperties } from 'react'
import { useTranslations } from 'next-intl'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import EmptyState from '@/components/ui/EmptyState'
import { Select } from '@/components/ui/Field'
import {
  ROOM_GRID,
  clampMonth,
  monthBounds,
  monthRow,
  pickRoomAccount,
  roomAccounts,
  roomDayBars,
  roomHistoryRange,
  roomMonthSummary,
  roomSlotLines,
  spanSource,
  stepMonth,
  type LiveAccount,
  type MonthCell,
  type RoomBar,
} from '@/lib/competitors/liveBoard'
import { SLOT_MIN_SESSIONS, summarizeLiveHabit } from '@/lib/competitors/liveSlots'
import { AXIS_START } from '@/lib/competitors/liveStats'
import { normalizeRegion } from '@/lib/competitors/regions'
import { weekdayOfYmd } from '@/lib/time/zonedTime'
import { FOCUS_RING } from '@/lib/ui/recipes'
import { HISTORY_FILL, NO_DATA_FILL, SCROLL_FADE, SHOT_FILL } from './liveFills'
import { useLiveFormat } from './useLiveFormat'
import { useRegionZone } from './useRegionZone'
import { useScrollFade } from './useScrollFade'

/** 图高 600px 装 06:00 → 次日 02:00 的 1200 分钟：0.5px / 分钟，一小时 30px。 */
const STRIP_H = 600
const PX_PER_MIN = 0.5
/** 竖条最矮 4px：几分钟的短场、02:00 之后才开播被夹到轴尾的零长度条，也得看得见。 */
const MIN_BAR_H = 4
/** 标签占的高度：9.5px 字、12px 行高，再空 1px。标签取舍（lib roomDayBars）按它量会不会叠字。 */
const LABEL_PX = 13
const GEOMETRY = { stripPx: STRIP_H, minPx: MIN_BAR_H, labelPx: LABEL_PX }

/** 轴上的整点：6 → 26（次日 02:00）。12/18/24 三条加粗，给眼睛一个分段的参照（中午、傍晚、午夜）。 */
const AXIS_HOURS = Array.from({ length: 21 }, (_, i) => 6 + i)
const STRONG_HOURS = new Set([12, 18, 24])
const hourTop = (hour: number) => (hour * 60 - AXIS_START) * PX_PER_MIN
const minuteTop = (minute: number) => (minute - AXIS_START) * PX_PER_MIN

/**
 * 每小时一条细线。画在一层盖在列上面的覆盖层里，而不是图的底色：
 * 周末列是不透明的 bg-canvas、无数据列有斜线，画在底下会被它们盖掉。颜色写在 style 里（渐变写不进类名）。
 */
const HOUR_LINES: CSSProperties = {
  backgroundImage: `repeating-linear-gradient(to bottom, rgb(var(--ink-900) / 0.06) 0 1px, transparent 1px ${60 * PX_PER_MIN}px)`,
}

/** 列宽、时间轴宽、右侧主档标签槽宽（px）在 liveBoard.ROOM_GRID 定，测试量 31 天排不排得进宽屏卡片。 */
const DAY_W: CSSProperties = { width: ROOM_GRID.dayPx }
/** 主档标签在槽里离最后一列的距离（px）：虚线从图左端一直画到标签左缘，标签读起来是这条线的端点。 */
const SLOT_CHIP_INSET = 4

/**
 * 条上下方时刻标签的公共样式：白底小字压在网格线与相邻竖条之上（z-[3]），居中于本列。
 * 9.5px + tracking-tight：列收到 32px 后，10px 粗体的「14:27」连白底内边距量出来 33px，比列还宽，
 * 相邻两天同一高度的开播标签会互相压掉一像素；这样收窄到约 30px，两个标签之间还空 3px 多。行高仍是 12px（LABEL_PX 不变）。
 */
const LABEL =
  'absolute left-1/2 z-[3] -translate-x-1/2 whitespace-nowrap rounded-sm bg-surface px-px text-[9.5px] leading-3 tracking-tight tabular-nums'

const isWeekend = (ymd: string) => {
  const wd = weekdayOfYmd(ymd)
  return wd === 0 || wd === 6
}

/**
 * 单个直播间：选一个号、一个月，横轴当月每天（一列 32px），纵轴 06:00 → 次日 02:00（600px）。
 * 每场一根竖条（导入实色 / 截图斜纹），上方粗体开播、下方灰字下播；主档开播画成横向虚线，
 * 时刻标在图右侧单独的一条槽里（不压在月末几列上盖住那几天的开播时刻）。
 * 版面见 liveBoard.ROOM_GRID：31 天连同槽在 1440 宽屏上一屏放下，更窄时在卡片里横向滚动、右缘渐隐。
 *
 * 「无数据」≠「没播」：不知道播没播的日子整列斜线，确实没播的日子留白，今天之后的日子画虚线框。
 * 时区：整张图按这个号的地区时区（useRegionZone，与卡片、弹窗同一份推导），控件行写明时区名。
 * 「今天」用页面级的日区业务日标「未到」——与国家月历同一个近似，只在午夜前后那一两个小时差一天。
 *
 * 数都由 lib/competitors/liveBoard.ts 算（monthRow / roomDayBars / roomSlotLines / roomMonthSummary），
 * 这里只负责摆：仓库没有 DOM 测试环境，取舍规则只有放在 lib 里才测得到。
 */
export default function LiveRoomMonth({
  accounts,
  patrolDays,
  today,
  account: requestedAccount,
  month: requestedMonth,
  onPickAccount,
  onMonthChange,
  onOpenRecords,
}: {
  /** 全部账号（已摊平，含没场次的）；下拉只列有场次的号，在这里筛。 */
  accounts: LiveAccount[]
  patrolDays: ReadonlySet<string>
  /** 页面级「今天」（日区 YYYY-MM-DD）：默认月份、可翻范围的上端与「未到」标记。 */
  today: string
  /** URL 上的原始值（acc = 竞品 id、month），可能缺失或不合法，这里收敛。 */
  account: string | null
  month: string | null
  onPickAccount: (competitorId: string) => void
  /** 翻月：给「拿地址栏当前月份算目标月」的函数，理由同 LiveCountryMonth。 */
  onMonthChange: (next: (current: string | null) => string) => void
  onOpenRecords: (competitorId: string) => void
}) {
  const t = useTranslations('competitors')
  const fmt = useLiveFormat()
  const selectId = useId()

  const options = useMemo(() => roomAccounts(accounts), [accounts])
  const account = pickRoomAccount(options, requestedAccount)
  // Hook 不能放在下面的提前返回之后：没有号时传 null，回落到界面语言时区，反正用不上。
  const { timeZone, zoneLabel } = useRegionZone(account?.region)
  const bounds = useMemo(() => monthBounds(account ? [account] : [], today, timeZone), [account, today, timeZone])
  const month = clampMonth(requestedMonth, bounds)

  const row = useMemo(
    () => (account ? monthRow(account, month, timeZone, patrolDays, today) : null),
    [account, month, timeZone, patrolDays, today],
  )
  const columns = useMemo(() => (row ? row.cells.map((cell) => ({ cell, bars: roomDayBars(cell, GEOMETRY) })) : []), [row])
  const summary = useMemo(
    () => (account ? roomMonthSummary(account, month, timeZone, patrolDays) : null),
    [account, month, timeZone, patrolDays],
  )
  // 主档按该号全部场次算，不随翻月变：一个月里只有几场时，按当月算出来的「主档」靠不住。
  const habit = useMemo(
    () => (account ? summarizeLiveHabit(account.spans.map((s) => s.startedAt), timeZone) : null),
    [account, timeZone],
  )
  const slotLines = useMemo(() => roomSlotLines(habit?.slots ?? []), [habit])
  const history = useMemo(() => (account ? roomHistoryRange(account, timeZone) : null), [account, timeZone])
  // Hook 不能放在下面的提前返回之后。
  const scroll = useScrollFade<HTMLDivElement>()

  if (!account || !row || !summary || !habit) {
    return <EmptyState title={t('liveMonthEmpty')} hint={t('liveMonthEmptyHint')} />
  }

  const regionText = (region: string | null) => {
    const code = normalizeRegion(region)
    return code ? t(`regionName.${code}`) : t('liveRoomNoRegion')
  }
  // 选项文案 handle · 地区 · 公司；没登记公司就不写，下拉里一长串「未归属公会」只是噪音。
  const optionLabel = (a: LiveAccount) => [a.handle, regionText(a.region), a.company].filter(Boolean).join(' · ')

  // 元信息：地区 · 公司 · 数据覆盖到哪。导入号写导入的首末日（这段里没场次就是没播）；
  // 只有截图的号没有连续的覆盖范围，直说只有巡检日有数据。
  const source = spanSource(account.spans)
  const coverage = history
    ? t(source === 'mixed' ? 'liveRoomMetaMixed' : 'liveRoomMetaHistory', { from: history.from, to: history.to })
    : t('liveRoomMetaShot')
  const meta = [regionText(account.region), account.company ?? t('liveMonthUnassigned'), coverage].join(' · ')

  // 列的提示框：MM/DD 星期 · 每场 起–止（时长）/ 没播 / 无数据 / 未到。截图推断的下播前加「约」，跨午夜标 +1。
  const columnTip = (cell: MonthCell, bars: RoomBar[]) => {
    const head = `${cell.date.slice(5).replace('-', '/')} ${fmt.weekday(cell.date)}`
    if (cell.future && cell.status !== 'live') return `${head} · ${t('liveCalendarFuture')}`
    if (cell.status === 'nodata') return `${head} · ${t('liveCalendarNoData')}`
    if (cell.status === 'idle') return `${head} · ${t('liveCalendarNone')}`
    const sessions = bars.map((b) =>
      t('liveRoomSessionTip', {
        start: b.start,
        end: `${b.approx ? t('liveApproxPrefix') : ''}${b.end}${b.nextDay ? ' +1' : ''}`,
        duration: fmt.duration(b.minutes),
      }),
    )
    return `${head} · ${sessions.join(' / ')}`
  }

  // 主档：场次不足 3 场根本成不了档（「场次太少」）；够了却一档也没有，是开播时刻零散，两种情况分开说。
  const slotsValue = habit.slots.length
    ? habit.slots.map((s) => s.label).join(' / ')
    : habit.sessions < SLOT_MIN_SESSIONS
      ? t('liveRoomSlotsFew')
      : t('liveRoomSlotsScattered')

  const kpiTiles: { key: string; label: string; value: string; note?: string }[] = [
    {
      key: 'live',
      label: t('liveRoomKpiLive'),
      value: t('liveRoomKpiLiveValue', { days: summary.liveDays, sessions: summary.sessions }),
    },
    {
      key: 'dataDays',
      label: t('liveMonthKpiDataDays'),
      value: t('liveMonthKpiDataDaysValue', { days: summary.dataDays, total: summary.totalDays }),
    },
    {
      key: 'avg',
      label: t('liveKpiAvg'),
      value: summary.avgMinutes == null ? '—' : fmt.duration(summary.avgMinutes),
      // 本月有截图推断的场次：它们的下播只是最后一张截图的时刻，平均单场是下限。
      note: summary.avgMinutes != null && summary.approx ? t('liveRoomKpiAvgShort') : undefined,
    },
    { key: 'slots', label: t('liveRoomKpiSlots'), value: slotsValue },
  ]

  const navBtn = `inline-flex h-8 w-8 items-center justify-center rounded-full border border-line bg-surface text-ink-700 hover:bg-row-hover disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-surface ${FOCUS_RING}`
  // 日期列的总宽：网格线只盖到这里，主档虚线从这里再往右伸进标签槽。
  const daysPx = row.cells.length * ROOM_GRID.dayPx

  return (
    <div className="space-y-4">
      {/* 控件行：直播间 · 元信息 · ‹ 月份 › · 时区说明 · 逐场清单 */}
      <div className="flex flex-wrap items-center gap-2 rounded-card border border-line bg-surface p-3">
        <label htmlFor={selectId} className="text-xs text-ink-500">
          {t('liveRoomAccountLabel')}
        </label>
        {/* 下拉按选项文案的宽度排（原生 select 的自然宽度 = 最长的那个选项），不再定死 256px 把
            「handle · 地区 · 公司」截掉一半；最宽不超过控件行，窄屏上仍能被压窄、不把整页撑出横向滚动。
            被压窄截断时 title 里有选中项的全文。 */}
        <div className="min-w-0 max-w-full">
          <Select
            id={selectId}
            value={account.id}
            onChange={(e) => onPickAccount(e.target.value)}
            title={optionLabel(account)}
            className="font-semibold"
          >
            {options.map((a) => (
              <option key={a.id} value={a.id}>
                {optionLabel(a)}
              </option>
            ))}
          </Select>
        </div>
        <span className="min-w-0 text-xs text-ink-500 tabular-nums" data-room-meta>
          {meta}
        </span>
        {/* ‹ 月份 › 绑成一个不拆开的小组：下拉按选项文案排宽以后，一行常排不下，
            散着放的话会在中间折行，把「‹」留在上一行、月份和「›」掉到下一行。
            也不再画分隔线：折行后它会孤零零挂在新一行行首。 */}
        <div className="flex shrink-0 items-center gap-2" data-month-nav>
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
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-x-3 gap-y-1">
          {zoneLabel && <span className="text-xs text-ink-500">{t('liveZoneNote', { zone: zoneLabel })}</span>}
          <button
            type="button"
            onClick={() => onOpenRecords(account.id)}
            className={`inline-flex items-center gap-0.5 rounded-field text-xs text-primary hover:text-primary-hover ${FOCUS_RING}`}
          >
            {t('liveRoomRecords')}
            <ChevronRight size={13} strokeWidth={1.5} aria-hidden />
          </button>
        </div>
      </div>

      {/* 四个指标。手机上一列：「26 days · 44 sessions」这类值两列放不下，会被截断。 */}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {kpiTiles.map((k) => (
          <div key={k.key} className="flex min-w-0 flex-col gap-0.5 rounded-field border border-line bg-surface px-3 py-2.5">
            <span className="truncate text-xs text-ink-500" title={k.label}>
              {k.label}
            </span>
            <span className="flex min-w-0 items-baseline gap-1">
              <span className="truncate text-xl font-semibold text-ink-900 tabular-nums">{k.value}</span>
              {k.note && (
                <span className="shrink-0 text-xs text-ink-500" title={t('liveKpiApproxNote')}>
                  {k.note}
                </span>
              )}
            </span>
          </div>
        ))}
      </div>

      {/* 图：左时间轴 + 每天一列 + 右侧主档标签槽（宽度见 ROOM_GRID）。放不下时整块在自己的容器里横向滚动，
          整页不出横向滚动条；右边还有没露出来的日子时右缘渐隐。 */}
      <div className="relative">
        <div ref={scroll.ref} className="overflow-x-auto rounded-card border border-line bg-surface px-3 pb-2 pt-3 scrollbar-thin">
          <div className="flex w-max" style={{ gap: ROOM_GRID.gapPx }}>
            <div aria-hidden className="relative mt-10 shrink-0" style={{ width: ROOM_GRID.axisPx, height: STRIP_H }}>
              {AXIS_HOURS.map((hour) => (
                <span
                  key={hour}
                  className={`absolute right-1 whitespace-nowrap leading-4 tabular-nums ${
                    STRONG_HOURS.has(hour) ? 'text-xs font-bold text-ink-900' : 'text-[10px] text-ink-400'
                  }`}
                  style={{ top: hourTop(hour) - 8 }}
                >
                  {`${String(hour % 24).padStart(2, '0')}:00`}
                </span>
              ))}
            </div>

            <div className="flex flex-col">
              {/* 日期表头：周末暖色；有场次的日子底部一道主色条，扫一眼就知道哪几天播了。最右是标签槽的表头。 */}
              <div className="flex h-10 items-end">
                {row.cells.map((cell) => (
                  <div
                    key={cell.date}
                    className={`relative flex h-full shrink-0 flex-col items-center justify-end pb-1 leading-tight ${
                      isWeekend(cell.date) ? 'text-warning-text' : 'text-ink-700'
                    }`}
                    style={DAY_W}
                  >
                    <span className="text-xs font-semibold tabular-nums">{Number(cell.date.slice(8))}</span>
                    <span className="text-[10px]">{fmt.weekdayNarrow(cell.date)}</span>
                    {cell.status === 'live' && <span aria-hidden data-live-day className="absolute inset-x-0 bottom-0 h-[3px] bg-primary" />}
                  </div>
                ))}
                <div
                  className="shrink-0 truncate pb-1 text-micro text-ink-500"
                  style={{ width: ROOM_GRID.gutterPx, paddingLeft: SLOT_CHIP_INSET }}
                >
                  {slotLines.length > 0 ? t('liveRoomSlotGutter') : ''}
                </div>
              </div>

              {/* mb-3.5：轴尾那场的下播标签画在条区下方，留出一行的位置，不让它撑出纵向滚动条。 */}
              <div className="relative mb-3.5 flex" style={{ height: STRIP_H }}>
                {columns.map(({ cell, bars }) => {
                  // 今天之后的日子：虚线框、不画斜线（同国家月历）——画成「无数据」会被读成巡检漏了这些天。
                  const upcoming = cell.future && cell.status !== 'live'
                  const hatched = cell.status === 'nodata' && !upcoming
                  return (
                    <div
                      key={cell.date}
                      title={columnTip(cell, bars)}
                      data-cell={upcoming ? 'future' : cell.status}
                      data-date={cell.date}
                      className={`relative box-border h-full shrink-0 border-l border-line-soft ${
                        hatched ? '' : isWeekend(cell.date) ? 'bg-canvas' : 'bg-surface'
                      }`}
                      style={hatched ? { ...DAY_W, ...NO_DATA_FILL } : DAY_W}
                    >
                      {upcoming ? (
                        <div aria-hidden className="absolute inset-1 rounded-sm border border-dashed border-line-strong" />
                      ) : (
                        bars.map((b, i) => (
                          <Fragment key={i}>
                            <span
                              aria-hidden
                              data-bar={b.approx ? 'shot' : 'history'}
                              className="absolute left-1/2 z-[1] w-4 -translate-x-1/2 rounded"
                              style={{ top: b.top, height: b.height, ...(b.approx ? SHOT_FILL : HISTORY_FILL) }}
                            />
                            {b.showStart && (
                              <span data-label="start" className={`${LABEL} font-bold text-ink-900`} style={{ top: b.top - LABEL_PX }}>
                                {b.start}
                              </span>
                            )}
                            {b.showEnd && (
                              <span data-label="end" className={`${LABEL} text-ink-500`} style={{ top: b.top + b.height + 1 }}>
                                {b.end}
                              </span>
                            )}
                          </Fragment>
                        ))
                      )}
                    </div>
                  )
                })}
                {/* 主档标签槽：不画网格，只让虚线伸进来、标签落在线的右端。 */}
                <div aria-hidden className="shrink-0" style={{ width: ROOM_GRID.gutterPx }} />

                {/* 网格线覆盖层：每小时一条细线，12/18/24 三条加深。放在列之后，盖在列底色之上、竖条之下；只盖日期列，不伸进标签槽。 */}
                <div aria-hidden className="pointer-events-none absolute inset-y-0 left-0" style={{ width: daysPx, ...HOUR_LINES }} />
                {Array.from(STRONG_HOURS).map((hour) => (
                  <div
                    key={hour}
                    aria-hidden
                    className="pointer-events-none absolute left-0 border-t border-ink-900/15"
                    style={{ top: hourTop(hour), width: daysPx }}
                  />
                ))}

                {/* 主档参考线：横贯整月的虚线，一直伸进右侧的槽，深色标签是线的右端。
                    虚线压在竖条之上、开播 / 下播标签之下（z-[2]），线上的开播时刻照常读得到。
                    标签放在槽里而不是压在最后一列上：原来标签贴着图的右缘，月末两三天的开播标签全被它盖住。
                    几档之间不会叠：同一档的开播相邻相差不到 SLOT_GAP_MINUTES（45 分钟）才连成一档，
                    两档的中位至少差 45 分钟 = 22.5px，比标签高 18px 还多。 */}
                {slotLines.map((line) => (
                  <Fragment key={line.minute}>
                    <div
                      aria-hidden
                      className="pointer-events-none absolute left-0 z-[2] border-t-[1.5px] border-dashed border-ink-900/55"
                      style={{ top: minuteTop(line.minute), width: daysPx + SLOT_CHIP_INSET }}
                    />
                    {/* 槽只有 56px，标签里只写时刻；「主档」写在槽的表头，整句（主档 HH:mm 开）给读屏与悬停提示。 */}
                    <span
                      data-slot-line={line.label}
                      title={t('liveRoomSlotLine', { time: line.label })}
                      className="absolute z-[4] whitespace-nowrap rounded bg-ink-900 px-1.5 text-micro font-bold leading-[18px] text-white tabular-nums"
                      style={{ top: minuteTop(line.minute) - 9, left: daysPx + SLOT_CHIP_INSET }}
                    >
                      <span className="sr-only">{t('liveRoomSlotLine', { time: line.label })}</span>
                      <span aria-hidden>{line.label}</span>
                    </span>
                  </Fragment>
                ))}
              </div>
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

      {/* 图例：怎么读一列 + 几种样式 */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-ink-700">
        <span className="text-pretty">{t('liveRoomLegend')}</span>
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden className="h-3.5 w-2.5 rounded-sm" style={HISTORY_FILL} />
          {t('liveSourceHistory')}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden className="h-3.5 w-2.5 rounded-sm" style={SHOT_FILL} />
          {t('liveSourceShot')}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden className="w-[18px] border-t-[1.5px] border-dashed border-ink-900/55" />
          {t('liveRoomLegendSlot')}
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
    </div>
  )
}
