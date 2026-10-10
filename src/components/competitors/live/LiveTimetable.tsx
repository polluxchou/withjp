// src/components/competitors/live/LiveTimetable.tsx
'use client'

import { useMemo } from 'react'
import { useTranslations } from 'next-intl'
import EmptyState from '@/components/ui/EmptyState'
import SegmentedControl from '@/components/ui/SegmentedControl'
import { Table, TBody, Td, Th, THead, Tr } from '@/components/ui/Table'
import {
  OUR_SCHEDULE_JST,
  TIMETABLE_DAYS,
  bucketClock,
  densityAlpha,
  densityColumn,
  liveCountries,
  peakBucket,
  pickTimetableCountry,
  pickTimetableGuild,
  timetableGroups,
  timetableGuilds,
  timetableRange,
  timetableSchedule,
  timetableSlotLabels,
  timetableSplit,
  timetableZone,
  type LiveAccount,
  type TimetableColumn,
  type TimetableZoneMode,
} from '@/lib/competitors/liveBoard'
import { minutesToLabel, SLOT_MIN_SESSIONS } from '@/lib/competitors/liveSlots'
import { AXIS_END, AXIS_START, BUCKET_MINUTES } from '@/lib/competitors/liveStats'
import { normalizeRegion, type RegionCode } from '@/lib/competitors/regions'
import { FOCUS_RING } from '@/lib/ui/recipes'
import { densityFill } from './liveFills'

/** 列体 0.6px / 分钟：06:00 → 次日 02:00 的 1200 分钟画成 720px，一小时 36px，15 分钟一格 9px。 */
const PX_PER_MIN = 0.6
const STRIP_H = (AXIS_END - AXIS_START) * PX_PER_MIN
const CELL_H = BUCKET_MINUTES * PX_PER_MIN
/** 主档标签的高度：11px 字、16px 行高，再加上下 1px 边框。标签取舍（lib timetableSlotLabels）按它量会不会叠字。 */
const LABEL_PX = 18
const LABEL_GEO = { stripPx: STRIP_H, labelPx: LABEL_PX }

/**
 * 列体上方的三层：国家条、公会条、列头，层间距 4px。时间轴的上边距由它们加出来，
 * 不写死一个数——哪层改了高度，时间轴跟着对齐，不会和列体错开几像素。
 */
const COUNTRY_BAR_H = 24
const GUILD_BAR_H = 22
const HEAD_H = 46
const STACK_GAP = 4
const AXIS_TOP = COUNTRY_BAR_H + GUILD_BAR_H + HEAD_H + 3 * STACK_GAP

/** 轴上的整点：6 → 26（次日 02:00）。12/18/24 三条加粗，给眼睛一个分段的参照（中午、傍晚、午夜）。 */
const AXIS_HOURS = Array.from({ length: 21 }, (_, i) => 6 + i)
const STRONG_HOURS = [12, 18, 24]
const minuteTop = (minute: number) => (minute - AXIS_START) * PX_PER_MIN

/** 每小时一条细线，画在列体底色上（格子盖住的地方看不见也无妨：有颜色的格子本身就是读数）。 */
const HOUR_LINES = {
  backgroundImage: `repeating-linear-gradient(to bottom, rgb(var(--ink-900) / 0.06) 0 1px, transparent 1px ${60 * PX_PER_MIN}px)`,
}

/** 主档标签：白底小字，居中压在对应时刻上（top 由 lib 给，已收进列体）。开播黑框粗体，下播灰框。 */
const CHIP = 'box-border whitespace-nowrap rounded border bg-surface px-1 text-[11px] leading-4 tabular-nums'
const START_CHIP = 'border-ink-900 font-bold text-ink-900 shadow-card'
const END_CHIP = 'border-ink-900/30 text-ink-500'

/** 国家分段的「全部」。国家码是两位大写字母，不会撞上它。 */
const ALL = 'all'

/** 我方排期写成「14:30–17:30 · 18:30–21:30」，图例用。 */
const OUR_SLOTS = OUR_SCHEDULE_JST.map(([a, b]) => `${minutesToLabel(a)}–${minutesToLabel(b)}`).join(' · ')

/**
 * 时段对比（番组表）：一个号一列、按国家 → 公会分组，时间从上往下走（06:00 → 次日 02:00）。
 * 每列 80 格是近 90 天里「这一刻在播的天数 / 开播天数」（导入实色、只有截图的号斜纹），白底标签是主档的开播 / 下播时刻；
 * 我方排期画成 warning 色虚线框；右上「同时在播最多」是常在播（≥ 30%）的号最多的那一格；下方逐号列表按列序给精确时刻。
 *
 * 时区：「统一按日本时间」全部列按日本时间（跨国看同一时刻谁在播），「各自当地时间」每列按账号地区时区
 * （看各自的作息）。我方排期是日本时间的钟点，在各列上换成该列的当地钟点（同一时刻），见 liveBoard.timetableSchedule。
 *
 * 筛选与开关都挂在 URL 上（查询参数见 CompetitorLiveView），这里只收敛原始值、把改动交出去。
 * 数都由 lib/competitors/liveBoard.ts 算：每列的 densityColumn 在这里按时区模式 useMemo 一次——
 * 40 个号 × 90 天的场次，切筛选、开关我方排期都不该重算。
 */
export default function LiveTimetable({
  accounts,
  today,
  country: requestedCountry,
  guild: requestedGuild,
  zone: requestedZone,
  ours: requestedOurs,
  onCountryChange,
  onGuildChange,
  onZoneChange,
  onToggleOurs,
  onOpenRecords,
}: {
  /** 全部账号（已摊平，含没场次的）；列哪些号在这里定。 */
  accounts: LiveAccount[]
  /** 页面级「今天」（日区 YYYY-MM-DD）：近 90 天的上端。 */
  today: string
  /** URL 上的原始值（tcountry / guild / tz / ours），可能缺失或不合法，这里收敛。 */
  country: string | null
  guild: string | null
  zone: string | null
  ours: string | null
  /** null = 全部。 */
  onCountryChange: (code: RegionCode | null) => void
  /** 公司名 = 这家；空串 = 未归属公会；null = 全部（写法同 liveBoard.pickTimetableGuild）。 */
  onGuildChange: (guild: string | null) => void
  onZoneChange: (mode: TimetableZoneMode) => void
  /** 切换「我方排期参考线」：给的是切换动作而不是目标值，连点两下按地址栏当前值翻转（理由同翻月）。 */
  onToggleOurs: () => void
  onOpenRecords: (competitorId: string) => void
}) {
  const t = useTranslations('competitors')

  const mode: TimetableZoneMode = requestedZone === 'local' ? 'local' : 'jst'
  const showOurs = requestedOurs !== '0'
  const range = useMemo(() => timetableRange(today), [today])

  // 每列一次 densityColumn：只随账号、范围、时区模式变，筛选与我方排期开关不碰它。
  const columns = useMemo(
    () =>
      accounts.map((account): TimetableColumn => {
        const timeZone = timetableZone(account.region, mode)
        return { account, timeZone, column: densityColumn(account.spans, { from: range.from, to: range.to, timeZone }) }
      }),
    [accounts, range, mode],
  )
  const { listed, regionless } = useMemo(() => timetableSplit(columns), [columns])
  // listed 里的号都有场次、地区都在清单里，liveCountries 数出来的正是番组表的列数。
  const countryOptions = useMemo(() => liveCountries(listed.map((c) => c.account)), [listed])
  const country = pickTimetableCountry(countryOptions, requestedCountry)
  const inCountry = useMemo(
    () => (country ? listed.filter((c) => normalizeRegion(c.account.region) === country) : listed),
    [listed, country],
  )
  // 公会选项只列当前国家里有的公会；URL 上的公会换国家后不在了就按全部看（URL 原样留着）。
  const guildOptions = useMemo(() => timetableGuilds(inCountry), [inCountry])
  const guild = pickTimetableGuild(guildOptions, requestedGuild)
  const visible = useMemo(
    // 公司名为空即未归属，与 groupByCompany 的 `company || null` 同一口径
    () => (guild == null ? inCountry : inCountry.filter((c) => (c.account.company || '') === guild)),
    [inCountry, guild],
  )
  const groups = useMemo(() => timetableGroups(visible), [visible])
  const ordered = useMemo(() => groups.flatMap((g) => g.companies.flatMap((c) => c.columns)), [groups])
  const peak = useMemo(() => peakBucket(visible.map((c) => c.column.shares)), [visible])
  const schedule = useMemo(() => timetableSchedule(visible.map((c) => c.timeZone), range.to), [visible, range.to])

  const regionlessNote =
    regionless > 0 ? <p className="text-micro text-ink-500">{t('liveMonthRegionless', { count: regionless })}</p> : null

  if (listed.length === 0) {
    return (
      <div className="space-y-2">
        <EmptyState title={t('liveTimetableEmpty', { days: TIMETABLE_DAYS })} hint={t('liveMonthEmptyHint')} />
        {regionlessNote}
      </div>
    )
  }

  const zoneLabel = mode === 'jst' ? t('zoneName.JP') : t('liveTimetableLocalZone')
  const zoneNote = mode === 'jst' ? t('liveZoneNote', { zone: t('zoneName.JP') }) : t('liveTimetableZoneNoteLocal')
  const peakClock = peak ? bucketClock(peak.index) : null

  const sourceLabel = (source: TimetableColumn['column']['source']) =>
    source === 'history' ? t('liveSourceHistory') : source === 'mixed' ? t('liveSourceMixed') : t('liveSourceShot')

  // 逐号列表的主档：有下播中位的写起止，没有（档内有截图推断的场次）只写开播。
  // 一档也没有时分两种说法（同单个直播间）：场次不足 3 场根本成不了档；够了却没有，是开播时刻零散。
  const slotsText = (c: TimetableColumn) =>
    c.column.slots.length
      ? c.column.slots
          .map((s) =>
            s.end != null
              ? t('liveTimetableSlotRange', { start: minutesToLabel(s.start), end: minutesToLabel(s.end), count: s.count })
              : t('liveTimetableSlotOpen', { start: minutesToLabel(s.start), count: s.count }),
          )
          .join(' · ')
      : c.column.sessions < SLOT_MIN_SESSIONS
        ? t('liveTimetableSlotsFew')
        : t('liveRoomSlotsScattered')

  const rowLabel = 'w-14 shrink-0 text-xs text-ink-500'
  // 分段控件放进自己横向滚动的容器（同国家月历）：选项多了不把整页撑出横向滚动条。
  // -m-0.5 p-0.5 给焦点环留 2px；里层 w-max 免得分段按容器宽度收缩、标签被挤成两行。
  const scroller = '-m-0.5 min-w-0 max-w-full overflow-x-auto p-0.5 scrollbar-thin'

  return (
    <div className="space-y-4">
      {/* 怎么读 + 同时在播最多 */}
      <div className="flex flex-wrap items-end gap-3">
        <p className="min-w-0 flex-[1_1_420px] text-pretty text-xs text-ink-500">{t('liveTimetableIntro')}</p>
        <div
          className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5 rounded-field border border-line bg-surface px-3 py-2 text-xs"
          title={t('liveTimetablePeakHint')}
        >
          <span className="text-ink-500">
            {t('liveTimetablePeak')}
            {t('liveZoneSuffix', { zone: zoneLabel })}
          </span>
          {peak && peakClock ? (
            <>
              <strong className="text-lg font-semibold text-ink-900 tabular-nums">{`${peakClock.start}–${peakClock.end}`}</strong>
              <span className="text-ink-700 tabular-nums">{t('liveTimetablePeakCount', { count: peak.count })}</span>
            </>
          ) : (
            <span className="text-ink-700">{t('liveTimetablePeakNone')}</span>
          )}
        </div>
      </div>

      {/* 控件：国家 / 公会 / 时间 + 我方排期 + 范围 */}
      <div className="flex flex-col gap-2 rounded-card border border-line bg-surface p-3">
        <div className="flex items-center gap-2">
          <span className={rowLabel}>{t('liveCountryLabel')}</span>
          <div className={scroller}>
            <div className="w-max">
              <SegmentedControl
                label={t('liveCountryLabel')}
                value={country ?? ALL}
                onChange={(v) => onCountryChange(v === ALL ? null : (v as RegionCode))}
                items={[
                  { value: ALL, label: t('liveTimetableAll', { count: listed.length }) },
                  ...countryOptions.map((o) => ({
                    value: o.code,
                    label: t('liveCountryOption', { name: t(`regionName.${o.code}`), count: o.count }),
                  })),
                ]}
              />
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className={rowLabel}>{t('liveTimetableGuildLabel')}</span>
          <div className={scroller}>
            <div className="w-max">
              {/* 公司名是用户填的，任何字符串都可能出现：分段的值用下标，不拿公司名当值，免得撞上「全部」。 */}
              <SegmentedControl
                label={t('liveTimetableGuildLabel')}
                value={String(guild == null ? 0 : guildOptions.findIndex((o) => (o.company ?? '') === guild) + 1)}
                onChange={(v) => {
                  const picked = guildOptions[Number(v) - 1]
                  onGuildChange(picked ? (picked.company ?? '') : null)
                }}
                items={[
                  { value: '0', label: t('liveTimetableGuildAll') },
                  ...guildOptions.map((o, i) => ({
                    value: String(i + 1),
                    label: t('liveCountryOption', { name: o.company ?? t('liveMonthUnassigned'), count: o.count }),
                  })),
                ]}
              />
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* 标签与分段绑在一个不换行的小组里：窄屏上分段在标签旁边自己横向滚动，而不是整个掉到下一行、把标签晾在上面。 */}
          <div className="flex min-w-0 max-w-full items-center gap-2">
            <span className={rowLabel}>{t('liveTimetableZoneLabel')}</span>
            <div className={scroller}>
              <div className="w-max">
                <SegmentedControl
                  label={t('liveTimetableZoneLabel')}
                  value={mode}
                  onChange={(v) => onZoneChange(v === 'local' ? 'local' : 'jst')}
                  items={[
                    { value: 'jst', label: t('liveTimetableZoneJst') },
                    { value: 'local', label: t('liveTimetableZoneLocal') },
                  ]}
                />
              </div>
            </div>
          </div>
          {/* 分隔线只在一行排得下时有意义；窄屏换行后它会孤零零挂在新一行行首。 */}
          <span aria-hidden className="mx-1 hidden h-4 w-px bg-line sm:block" />
          <button
            type="button"
            aria-pressed={showOurs}
            onClick={onToggleOurs}
            className={`inline-flex h-8 items-center gap-1.5 rounded-field border px-3 text-xs transition-colors ${FOCUS_RING} ${
              showOurs
                ? 'border-warning-border bg-warning-soft font-semibold text-warning-text'
                : 'border-line-strong bg-surface text-ink-500 hover:text-ink-700'
            }`}
          >
            <span aria-hidden className="box-border h-2.5 w-3.5 border-y-[1.5px] border-dashed border-warning-text" />
            {t('liveTimetableOurs')}
          </button>
          <span className="ml-auto text-xs text-ink-500">
            {zoneNote} · {t('liveTimetableRange', { days: TIMETABLE_DAYS })}
          </span>
        </div>
        {regionlessNote}
      </div>

      {/* 图例 */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-ink-700">
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden className="h-3.5 w-3.5 shrink-0 rounded-sm" style={densityFill(0.72, false)} />
          {t('liveTimetableLegendHistory')}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden className="h-3.5 w-3.5 shrink-0 rounded-sm" style={densityFill(0.72, true)} />
          {t('liveTimetableLegendShot')}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden className={`${CHIP} ${START_CHIP}`}>
            12:00
          </span>
          {t('liveTimetableLegendStart')}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden className={`${CHIP} ${END_CHIP}`}>
            15:00
          </span>
          {t('liveTimetableLegendEnd')}
        </span>
        {showOurs && (
          <span className="inline-flex items-center gap-1.5">
            <span aria-hidden className="box-border h-3.5 w-4 shrink-0 border-y-[1.5px] border-dashed border-warning-text bg-warning-soft" />
            {t('liveTimetableLegendOurs', { slots: OUR_SLOTS })}
          </span>
        )}
      </div>

      {/* 番组表：宽了在自己的卡片里横向滚动，整页不出横向滚动条；左侧时间轴 sticky，滚到哪都对得上列体。
          卡片左边不留内边距，由时间轴自己的 pl-3 补上：时间轴带底色盖住滚过去的列，连卡片左内边距那一条也要盖住。 */}
      <div className="overflow-x-auto rounded-card border border-line bg-surface pb-4 pr-3 pt-3 scrollbar-thin">
        <div className="flex w-max items-start">
          <div aria-hidden className="sticky left-0 z-10 shrink-0 self-stretch bg-surface pl-3 pr-2.5" style={{ paddingTop: AXIS_TOP }}>
            <div className="relative w-12" style={{ height: STRIP_H }}>
              {AXIS_HOURS.map((hour) => (
                <span
                  key={hour}
                  className={`absolute right-1 whitespace-nowrap leading-4 tabular-nums ${
                    STRONG_HOURS.includes(hour) ? 'text-xs font-bold text-ink-900' : 'text-[10px] text-ink-400'
                  }`}
                  style={{ top: minuteTop(hour * 60) - 8 }}
                >
                  {`${String(hour % 24).padStart(2, '0')}:00`}
                </span>
              ))}
              {/* 「我方」放在两段中点、贴着时间轴左缘（伸进 pl-3 的左内边距，不压中点上的整点标签）；
                  各列钟点不一致时 axis 为 null，不标。 */}
              {showOurs &&
                schedule.axis?.map(([a, b]) => (
                  <span
                    key={a}
                    className="absolute -left-3 whitespace-nowrap rounded bg-warning-soft px-[3px] text-[10px] font-bold leading-4 text-warning-text"
                    style={{ top: minuteTop((a + b) / 2) - 8 }}
                  >
                    {t('liveTimetableOursAxis')}
                  </span>
                ))}
            </div>
          </div>

          <div className="flex gap-2.5">
            {groups.map((g) => (
              <div key={g.code} className="flex shrink-0 flex-col" style={{ gap: STACK_GAP }}>
                <div
                  className="flex items-center whitespace-nowrap rounded-md bg-ink-900 px-2 text-xs font-semibold text-white"
                  style={{ height: COUNTRY_BAR_H }}
                >
                  {t('liveTimetableCountry', { name: t(`regionName.${g.code}`), code: g.code, count: g.count })}
                </div>
                <div className="flex gap-2">
                  {g.companies.map((cg) => (
                    <div key={cg.company ?? ''} className="flex flex-col" style={{ gap: STACK_GAP }}>
                      <div
                        className="flex items-center whitespace-nowrap rounded-md bg-primary-soft px-2 text-xs font-semibold text-primary-hover"
                        style={{ height: GUILD_BAR_H }}
                      >
                        {t('liveMonthGroup', { name: cg.company ?? t('liveMonthUnassigned'), count: cg.columns.length })}
                      </div>
                      <div className="flex gap-0.5">
                        {cg.columns.map((c) => {
                          const hatched = c.column.source === 'shot'
                          const ranges = showOurs ? (schedule.byZone.get(c.timeZone) ?? []) : []
                          return (
                            <div key={c.account.id} className="flex w-[58px] flex-col" style={{ gap: STACK_GAP }}>
                              {/* 不写 aria-label：它会盖掉按钮里看得见的「账号 + N 场」，读屏就听不到场次数了。
                                  可见文字就是无障碍名称，「打开开播记录」的说明放在 title（读屏当描述读、鼠标悬停看得到）。 */}
                              <button
                                type="button"
                                onClick={() => onOpenRecords(c.account.id)}
                                title={t('liveMonthOpenRecords', { handle: c.account.handle })}
                                className={`group flex min-w-0 flex-col justify-end rounded-sm px-0.5 text-left text-[10px] leading-tight ${FOCUS_RING}`}
                                style={{ height: HEAD_H }}
                              >
                                <span className="line-clamp-2 break-all font-semibold text-ink-900 group-hover:text-primary">
                                  {c.account.handle}
                                </span>
                                <span className="truncate text-ink-500 tabular-nums">
                                  {hatched
                                    ? t('liveTimetableColShot', { count: c.column.sessions })
                                    : t('liveTimetableColSessions', { count: c.column.sessions })}
                                </span>
                              </button>
                              {/* 列体对读屏隐藏：同样的数在下方逐号列表里有文字版。提示框照常给鼠标用户。 */}
                              <div aria-hidden className="relative rounded-sm bg-canvas" style={{ height: STRIP_H, ...HOUR_LINES }}>
                                {c.column.shares.map((share, i) => {
                                  const alpha = densityAlpha(share)
                                  if (alpha == null) return null
                                  const clock = bucketClock(i)
                                  return (
                                    <span
                                      key={i}
                                      title={t('liveTimetableCellTip', {
                                        handle: c.account.handle,
                                        start: clock.start,
                                        end: clock.end,
                                        pct: Math.round(share * 100),
                                      })}
                                      className="absolute inset-x-0"
                                      style={{ top: i * CELL_H, height: CELL_H, ...densityFill(alpha, hatched) }}
                                    />
                                  )
                                })}
                                {STRONG_HOURS.map((hour) => (
                                  <div
                                    key={hour}
                                    className="pointer-events-none absolute inset-x-0 z-[1] border-t border-ink-900/20"
                                    style={{ top: minuteTop(hour * 60) }}
                                  />
                                ))}
                                {/* 我方排期：虚线框 + 极浅底，盖在格子上、标签下；不挡格子的提示框。 */}
                                {ranges.map(([a, b]) => (
                                  <div
                                    key={a}
                                    className="pointer-events-none absolute inset-x-0 z-[1] box-border border-y-[1.5px] border-dashed border-warning-text"
                                    style={{ top: minuteTop(a), height: minuteTop(b) - minuteTop(a) }}
                                  >
                                    <div className="h-full bg-warning-soft opacity-50" />
                                  </div>
                                ))}
                                {timetableSlotLabels(c.column.slots, LABEL_GEO).map((label, i) => (
                                  <span
                                    key={i}
                                    title={
                                      label.kind === 'end'
                                        ? t('liveTimetableChipEndTip', { time: label.time })
                                        : label.open
                                          ? t('liveTimetableChipOpenTip', { time: label.time, count: label.count })
                                          : t('liveTimetableChipStartTip', { time: label.time, count: label.count })
                                    }
                                    className={`${CHIP} absolute left-1/2 z-[2] -translate-x-1/2 ${
                                      label.kind === 'start' ? START_CHIP : END_CHIP
                                    }`}
                                    style={{ top: label.top }}
                                  >
                                    {label.kind === 'start' && label.open
                                      ? t('liveTimetableChipOpen', { time: label.time })
                                      : label.time}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 逐号列表：顺序同上方各列，主档按当前时区模式写精确时刻。 */}
      <section className="overflow-hidden rounded-card border border-line bg-surface">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 px-4 pb-2 pt-3">
          <h2 className="text-md font-semibold text-ink-900">{t('liveTimetableListTitle')}</h2>
          <span className="text-xs text-ink-500">{t('liveTimetableListHint')}</span>
        </div>
        <Table minWidth={760} label={t('liveTimetableListTitle')}>
          <THead>
            <Th>{t('liveMonthColAccount')}</Th>
            <Th>{t('liveCountryLabel')}</Th>
            <Th>{t('liveTimetableGuildLabel')}</Th>
            <Th>{t('liveTimetableColSlots', { zone: zoneLabel })}</Th>
            <Th align="right">{t('liveKpiSessions')}</Th>
            <Th>{t('liveTableColSource')}</Th>
          </THead>
          <TBody>
            {ordered.map((c) => {
              const code = normalizeRegion(c.account.region)
              return (
                <Tr key={c.account.id}>
                  <Td className="whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() => onOpenRecords(c.account.id)}
                      title={t('liveMonthOpenRecords', { handle: c.account.handle })}
                      className={`rounded-sm font-semibold text-primary hover:text-primary-hover ${FOCUS_RING}`}
                    >
                      {c.account.handle}
                    </button>
                  </Td>
                  <Td className="whitespace-nowrap">{code ? `${t(`regionName.${code}`)} ${code}` : ''}</Td>
                  <Td className="whitespace-nowrap">{c.account.company || t('liveMonthUnassigned')}</Td>
                  <Td className="whitespace-nowrap">
                    <span className={`tabular-nums ${c.column.slots.length ? 'font-semibold text-ink-900' : 'text-ink-500'}`}>
                      {slotsText(c)}
                    </span>
                  </Td>
                  <Td align="right" numeric>
                    {c.column.sessions}
                  </Td>
                  <Td className="whitespace-nowrap">
                    <span className="text-ink-500">{sourceLabel(c.column.source)}</span>
                  </Td>
                </Tr>
              )
            })}
          </TBody>
        </Table>
      </section>
    </div>
  )
}
