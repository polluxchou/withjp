'use client'

import { useMemo, useState, type MouseEvent as ReactMouseEvent } from 'react'
import { Link } from '@/i18n/navigation'
import { format } from 'date-fns/format'
import type { Milestone } from '@/lib/types'
import {
  DAY_MS,
  buildUpcomingRange,
  filterUpcomingMilestones,
  getDaysLeft,
  getTimelinePosition,
  getTimelineVisual,
  groupTimelineItems,
  shouldNavigateTimelinePress,
} from '@/lib/milestones/next-timeline'

const RANGE_OPTIONS = [14, 30, 90] as const
type RangeDays = (typeof RANGE_OPTIONS)[number]

function readableX(x: number): number {
  return Math.min(94, Math.max(6, x))
}

function isTouchLikeTimelineClick(event: ReactMouseEvent<HTMLElement>): boolean {
  const nativeEvent = event.nativeEvent as MouseEvent & { pointerType?: string }
  if (nativeEvent.pointerType) return nativeEvent.pointerType !== 'mouse'
  if (typeof window === 'undefined') return false

  return (
    window.matchMedia?.('(hover: none), (pointer: coarse)').matches ||
    navigator.maxTouchPoints > 0
  )
}

const TONE_CLASS = {
  danger: {
    dot: 'bg-red-500 ring-red-100',
    hollow: 'border-red-500 bg-white ring-red-100',
    card: 'border-red-200 bg-red-50',
    text: 'text-red-600',
    stem: 'bg-red-400',
  },
  warning: {
    dot: 'bg-amber-500 ring-amber-100',
    hollow: 'border-amber-500 bg-white ring-amber-100',
    card: 'border-amber-200 bg-amber-50',
    text: 'text-amber-700',
    stem: 'bg-amber-400',
  },
  success: {
    dot: 'bg-green-500 ring-green-100',
    hollow: 'border-green-500 bg-white ring-green-100',
    card: 'border-green-200 bg-green-50',
    text: 'text-green-700',
    stem: 'bg-green-400',
  },
  neutral: {
    dot: 'bg-zinc-400 ring-zinc-100',
    hollow: 'border-zinc-400 bg-white ring-zinc-100',
    card: 'border-zinc-200 bg-white',
    text: 'text-zinc-500',
    stem: 'bg-zinc-300',
  },
} as const

export default function NextTimelineView({ milestones }: { milestones: Milestone[] }) {
  const [rangeDays, setRangeDays] = useState<RangeDays>(30)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [armedId, setArmedId] = useState<string | null>(null)

  const range = useMemo(() => buildUpcomingRange(new Date(), rangeDays), [rangeDays])
  const upcoming = useMemo(() => filterUpcomingMilestones(milestones, range), [milestones, range])
  const groups = useMemo(
    () => groupTimelineItems(upcoming, range, rangeDays === 90 ? 2 : 3),
    [upcoming, range, rangeDays],
  )

  const activeMilestone = activeId
    ? upcoming.find((m) => m.id === activeId) ?? upcoming[0] ?? null
    : upcoming[0] ?? null

  const ticks = useMemo(() => {
    const midpoint = Math.round(rangeDays / 2)
    return [
      { label: '今天', date: range.start },
      { label: '+7 天', date: new Date(range.start.getTime() + Math.min(7, rangeDays) * DAY_MS) },
      { label: `+${midpoint} 天`, date: new Date(range.start.getTime() + midpoint * DAY_MS) },
      { label: `+${rangeDays} 天`, date: range.end },
    ]
  }, [range, rangeDays])

  const handleRangeChange = (days: RangeDays) => {
    setRangeDays(days)
    setActiveId(null)
    setArmedId(null)
  }

  const handleMilestonePress = (event: ReactMouseEvent<HTMLElement>, milestoneId: string) => {
    const shouldNavigate = shouldNavigateTimelinePress({
      isTouchLike: isTouchLikeTimelineClick(event),
      milestoneId,
      armedMilestoneId: armedId,
    })

    if (shouldNavigate) return

    event.preventDefault()
    setActiveId(milestoneId)
    setArmedId(milestoneId)
  }

  if (upcoming.length === 0) {
    return (
      <section className="bg-white border border-zinc-200 rounded-card p-10 text-center">
        <p className="text-sm font-medium text-zinc-600">未来 {rangeDays} 天暂无战略节点</p>
        <p className="text-xs text-zinc-400 mt-1">可以切换到 90 天查看更远的规划。</p>
        <div className="mt-5 flex justify-center">
          <RangeSwitch value={rangeDays} onChange={handleRangeChange} />
        </div>
      </section>
    )
  }

  return (
    <section className="bg-white border border-zinc-200 rounded-card p-5">
      <div className="flex items-end justify-between gap-4 mb-5 flex-wrap">
        <div>
          <h2 className="text-lg font-bold text-zinc-900">接下来 {rangeDays} 天</h2>
          <p className="text-xs text-zinc-500 mt-1">按日期查看即将到来的战略节点</p>
        </div>
        <RangeSwitch value={rangeDays} onChange={handleRangeChange} />
      </div>

      <div className="overflow-x-auto pb-2">
        <div className="relative min-w-[900px] h-[320px] mx-2">
          <div className="absolute left-0 right-0 top-[150px] h-0.5 bg-zinc-200" />

          {ticks.map((tick) => {
            const left = getTimelinePosition(tick.date.toISOString(), range)
            return (
              <div
                key={`${tick.label}-${tick.date.toISOString()}`}
                className="absolute top-[160px] -translate-x-1/2 text-center"
                style={{ left: `${left}%` }}
              >
                <div className="mx-auto mb-1 h-2 w-px bg-zinc-300" />
                <p className="text-[10px] font-medium text-zinc-500">{tick.label}</p>
                <p className="text-[10px] text-zinc-400">{format(tick.date, 'MMM d')}</p>
              </div>
            )
          })}

          {groups.map((group, index) => {
            const first = group.milestones[0]
            const visual = getTimelineVisual(first)
            const cls = TONE_CLASS[visual.tone]
            const above = index % 2 === 0
            const isCluster = group.milestones.length > 1
            const selected = activeMilestone && group.milestones.some((m) => m.id === activeMilestone.id)

            return (
              <div
                key={group.id}
                className="absolute -translate-x-1/2"
                style={{ left: `${readableX(group.x)}%`, top: above ? 28 : 154 }}
                onMouseEnter={() => setActiveId(first.id)}
              >
                {above && (
                  <TimelineCard
                    milestone={first}
                    isCluster={isCluster}
                    count={group.milestones.length}
                    selected={!!selected}
                    onPress={handleMilestonePress}
                  />
                )}
                <div className={`mx-auto w-0.5 ${above ? 'h-10' : 'h-8'} ${cls.stem}`} />
                <TimelineDot
                  milestone={first}
                  count={group.milestones.length}
                  isCluster={isCluster}
                  selected={!!selected}
                  onFocus={() => setActiveId(first.id)}
                  onPress={handleMilestonePress}
                />
                {!above && (
                  <TimelineCard
                    milestone={first}
                    isCluster={isCluster}
                    count={group.milestones.length}
                    selected={!!selected}
                    onPress={handleMilestonePress}
                  />
                )}
              </div>
            )
          })}
        </div>
      </div>

      {activeMilestone && <FocusDetail milestone={activeMilestone} />}
    </section>
  )
}

function RangeSwitch({
  value,
  onChange,
}: {
  value: RangeDays
  onChange: (value: RangeDays) => void
}) {
  return (
    <div className="flex bg-zinc-100 rounded-lg p-0.5">
      {RANGE_OPTIONS.map((days) => (
        <button
          key={days}
          type="button"
          onClick={() => onChange(days)}
          className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
            value === days
              ? 'bg-white shadow-sm text-zinc-900'
              : 'text-zinc-500 hover:text-zinc-700'
          }`}
        >
          {days} 天
        </button>
      ))}
    </div>
  )
}

function TimelineDot({
  milestone,
  count,
  isCluster,
  selected,
  onFocus,
  onPress,
}: {
  milestone: Milestone
  count: number
  isCluster: boolean
  selected: boolean
  onFocus: () => void
  onPress: (event: ReactMouseEvent<HTMLElement>, milestoneId: string) => void
}) {
  const visual = getTimelineVisual(milestone)
  const cls = TONE_CLASS[visual.tone]
  const title = isCluster
    ? `${count} 个节点 · ${format(new Date(milestone.target_date), 'MMM d')}`
    : `${milestone.title} · ${format(new Date(milestone.target_date), 'MMM d')}`
  const dotClass = visual.hollow
    ? `border-2 ${cls.hollow}`
    : cls.dot

  if (isCluster) {
    return (
      <button
        type="button"
        onClick={onFocus}
        title={title}
        className={`relative mx-auto block h-4 w-4 rounded-full ring-4 transition-transform hover:scale-110 ${dotClass} ${selected ? 'scale-125' : ''}`}
      >
        <span className="absolute -mt-5 ml-2 rounded-full bg-zinc-900 px-1.5 py-0.5 text-[10px] text-white">
          {count}
        </span>
      </button>
    )
  }

  return (
    <Link
      href={`/timeline/${milestone.id}`}
      title={title}
      onClick={(event) => onPress(event, milestone.id)}
      className={`mx-auto block h-4 w-4 rounded-full ring-4 transition-transform hover:scale-110 ${dotClass} ${selected ? 'scale-125' : ''}`}
    />
  )
}

function TimelineCard({
  milestone,
  isCluster,
  count,
  selected,
  onPress,
}: {
  milestone: Milestone
  isCluster: boolean
  count: number
  selected: boolean
  onPress: (event: ReactMouseEvent<HTMLElement>, milestoneId: string) => void
}) {
  const visual = getTimelineVisual(milestone)
  const daysLeft = getDaysLeft(milestone.target_date)
  const cls = TONE_CLASS[visual.tone]
  const owner = (milestone.owner_agent as { name?: string } | null | undefined)?.name

  return (
    <Link
      href={`/timeline/${milestone.id}`}
      title={`${milestone.title} · ${visual.label}`}
      onClick={(event) => onPress(event, milestone.id)}
      className={`block w-44 rounded-lg border px-3 py-2 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md ${cls.card} ${selected ? 'ring-2 ring-violet-300' : ''}`}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-semibold text-zinc-900 line-clamp-2">
          {isCluster ? `${count} 个节点` : milestone.title}
        </p>
        <span className={`text-[10px] font-semibold whitespace-nowrap ${cls.text}`}>
          {daysLeft < 0 ? `${Math.abs(daysLeft)}d overdue` : `${daysLeft}d`}
        </span>
      </div>
      <p className="text-[10px] text-zinc-500 mt-1 truncate">
        {owner ?? 'Owner 未定'}
      </p>
      {isCluster && (
        <p className="text-[10px] text-zinc-400 mt-1 truncate">
          点击查看最近节点
        </p>
      )}
    </Link>
  )
}

function FocusDetail({ milestone }: { milestone: Milestone }) {
  const visual = getTimelineVisual(milestone)
  const daysLeft = getDaysLeft(milestone.target_date)
  const cls = TONE_CLASS[visual.tone]
  const owner = (milestone.owner_agent as { name?: string; role?: string } | null | undefined)

  return (
    <div className={`mt-4 rounded-lg border px-4 py-3 ${cls.card}`}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <Link
            href={`/timeline/${milestone.id}`}
            className="text-sm font-semibold text-zinc-900 hover:text-primary transition-colors"
          >
            {milestone.title}
          </Link>
          {milestone.description && (
            <p className="text-xs text-zinc-600 mt-1 line-clamp-2">{milestone.description}</p>
          )}
          <div className="flex items-center gap-3 flex-wrap mt-2 text-xs text-zinc-500">
            <span>{format(new Date(milestone.target_date), 'MMM d, yyyy')}</span>
            <span>{owner?.name ? `${owner.name}${owner.role ? ` (${owner.role})` : ''}` : 'Owner 未定'}</span>
            <span className={cls.text}>{visual.label}</span>
          </div>
        </div>
        <div className={`text-xs font-semibold whitespace-nowrap ${cls.text}`}>
          {daysLeft < 0 ? `${Math.abs(daysLeft)}d overdue` : `${daysLeft}d`}
        </div>
      </div>
    </div>
  )
}
