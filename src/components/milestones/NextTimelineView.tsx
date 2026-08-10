'use client'

import { useMemo, useState, type MouseEvent as ReactMouseEvent } from 'react'
import { useTranslations } from 'next-intl'
import { Link } from '@/i18n/navigation'
import { format } from 'date-fns/format'
import SegmentedControl from '@/components/ui/SegmentedControl'
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
  type TimelineGroup,
} from '@/lib/milestones/next-timeline'

const RANGE_OPTIONS = [14, 30, 90] as const
type RangeDays = (typeof RANGE_OPTIONS)[number]

// ── Layout constants for the above/below stem+dot chain ────────
// (see the collision-avoidance block below for how these combine)
const ABOVE_TOP = 28
const ABOVE_STEM = 40
const BELOW_TOP = 154
const BELOW_STEM = 32
// Extra vertical reach (px) per stagger layer when two same-side cards would
// otherwise overlap horizontally.
const LAYER_STEP = 56
// Bounded to 2 lanes per side — enough for the common "two neighbours landed
// on the same side" case without growing the canvas indefinitely for rare,
// very dense clusters (see the comment on `assignLayer` below).
const MAX_LAYER = 2
// `TimelineCard` is `w-44` (176px) against the canvas's own `min-w-[900px]`
// baseline ≈ 19.5% of the width — two same-side cards whose x is closer than
// that will visually overlap. 18% leaves a small buffer while not
// over-triggering the stagger for cards that are merely close-ish.
const COLLISION_PCT = 18

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

// Tone → class lookup (design-system §1.3 dot/soft/text triad), plus a
// `stem` color for the thin connector line. Same shadow-halo idiom as
// RecordRow.tsx's own DOT map (`shadow-[0_0_0_Npx_var(--x-soft)]` — a
// private arbitrary-value shadow, not a registered token, per that file's
// own comment) instead of the old `ring-4 ring-{color}-100` pairing.
const TONE_CLASS = {
  danger: {
    dot: 'bg-danger-dot shadow-[0_0_0_4px_var(--danger-soft)]',
    hollow: 'border-danger-dot bg-surface shadow-[0_0_0_4px_var(--danger-soft)]',
    card: 'border-danger-border bg-danger-soft',
    text: 'text-danger-text',
    stem: 'bg-danger-dot',
  },
  warning: {
    dot: 'bg-warning-dot shadow-[0_0_0_4px_var(--warning-soft)]',
    hollow: 'border-warning-dot bg-surface shadow-[0_0_0_4px_var(--warning-soft)]',
    card: 'border-warning-border bg-warning-soft',
    text: 'text-warning-text',
    stem: 'bg-warning-dot',
  },
  success: {
    dot: 'bg-success-dot shadow-[0_0_0_4px_var(--success-soft)]',
    hollow: 'border-success-dot bg-surface shadow-[0_0_0_4px_var(--success-soft)]',
    card: 'border-success-border bg-success-soft',
    text: 'text-success-text',
    stem: 'bg-success-dot',
  },
  neutral: {
    dot: 'bg-muted-dot shadow-[0_0_0_4px_var(--muted-soft)]',
    hollow: 'border-muted-dot bg-surface shadow-[0_0_0_4px_var(--muted-soft)]',
    card: 'border-line bg-surface',
    text: 'text-ink-500',
    stem: 'bg-muted-dot',
  },
} as const

// ── Collision avoidance (fix 1/3: overlapping node cards) ──────
//
// `groupTimelineItems` (next-timeline.ts) only clusters milestones whose
// *target dates* land within a couple of percentage points of each other —
// it has no notion of how wide a rendered `TimelineCard` is. Two groups a
// few points apart pass that test as "distinct", but at ~19.5% wide each
// (COLLISION_PCT above), their cards still overlap on screen once both land
// on the same side of the axis (above/below alternates strictly by index,
// not by proximity).
//
// Fix: a second, purely visual pass. Groups already arrive x-ascending
// (`groups` is built by walking milestones sorted by target_date), so for
// each side (above/below) we greedily assign the first "lane" whose last
// occupant is far enough away in x; a lane that's still too close bumps to
// the next one, up to MAX_LAYER. `layer > 0` pushes that card's leader line
// further from the axis instead of moving the dot (see the wrapperTop/stem
// math where this is consumed) — the dot stays exactly on its true date
// position; only the card's "reach" grows.
function assignLayer(lastXByLane: number[], x: number): number {
  for (let layer = 0; layer < MAX_LAYER; layer++) {
    if (lastXByLane[layer] === undefined || x - lastXByLane[layer] >= COLLISION_PCT) {
      lastXByLane[layer] = x
      return layer
    }
  }
  // Every lane still collides (a dense cluster of 3+ near-neighbours on the
  // same side) — pile onto the last lane rather than adding a third. A
  // small residual overlap here is the accepted trade-off of a bounded,
  // simple avoidance pass rather than an open-ended layout solve.
  lastXByLane[MAX_LAYER - 1] = x
  return MAX_LAYER - 1
}

function placeGroups(groups: TimelineGroup<Milestone>[]) {
  const lastXAbove: number[] = []
  const lastXBelow: number[] = []
  return groups.map((group, index) => {
    const above = index % 2 === 0
    const layer = assignLayer(above ? lastXAbove : lastXBelow, group.x)
    return { group, above, layer }
  })
}

export default function NextTimelineView({ milestones }: { milestones: Milestone[] }) {
  const t = useTranslations('timeline')
  const [rangeDays, setRangeDays] = useState<RangeDays>(30)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [armedId, setArmedId] = useState<string | null>(null)

  const range = useMemo(() => buildUpcomingRange(new Date(), rangeDays), [rangeDays])
  const upcoming = useMemo(() => filterUpcomingMilestones(milestones, range), [milestones, range])
  const groups = useMemo(
    () => groupTimelineItems(upcoming, range, rangeDays === 90 ? 2 : 3),
    [upcoming, range, rangeDays],
  )
  const placedGroups = useMemo(() => placeGroups(groups), [groups])

  const activeMilestone = activeId
    ? upcoming.find((m) => m.id === activeId) ?? upcoming[0] ?? null
    : upcoming[0] ?? null

  const ticks = useMemo(() => {
    const midpoint = Math.round(rangeDays / 2)
    return [
      { label: t('gantt.today'), date: range.start },
      { label: t('nextView.plusDays', { days: 7 }), date: new Date(range.start.getTime() + Math.min(7, rangeDays) * DAY_MS) },
      { label: t('nextView.plusDays', { days: midpoint }), date: new Date(range.start.getTime() + midpoint * DAY_MS) },
      { label: t('nextView.plusDays', { days: rangeDays }), date: range.end },
    ]
  }, [range, rangeDays, t])

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
      <section className="bg-surface border border-line rounded-card p-10 text-center">
        <p className="text-sm font-medium text-ink-700">{t('nextView.emptyTitle', { days: rangeDays })}</p>
        <p className="text-xs text-ink-400 mt-1">{t('nextView.emptyHint')}</p>
        <div className="mt-5 flex justify-center">
          <RangeSwitch value={rangeDays} onChange={handleRangeChange} />
        </div>
      </section>
    )
  }

  return (
    <section className="bg-surface border border-line rounded-card p-5">
      <div className="flex items-end justify-between gap-4 mb-5 flex-wrap">
        <div>
          <h2 className="text-lg font-bold text-ink-900">{t('nextView.heading', { days: rangeDays })}</h2>
          <p className="text-xs text-ink-500 mt-1">{t('nextView.subheading')}</p>
        </div>
        <RangeSwitch value={rangeDays} onChange={handleRangeChange} />
      </div>

      <div className="overflow-x-auto pb-2">
        <div className="relative min-w-[900px] h-[320px] mx-2">
          <div className="absolute left-0 right-0 top-[150px] h-0.5 bg-line-strong" />

          {/* Fix 2/3 (left-end date truncation) + fix 3/3 (right-end "+N天"
              wrap): the middle two ticks stay centered (-translate-x-1/2,
              plenty of room on both sides), but the first tick (left: 0%)
              and last tick (left: 100%) used to share that same centered
              anchor — which pushes half the label's width past the
              container's own edge with nothing to hold it, clipping the
              date text at the left edge of the scroll area. Edge ticks now
              anchor flush to their own edge instead (`left-0`/`items-start`
              for the first, `right-0`/`items-end` for the last — no
              translate, so nothing overhangs). Every tick's two text lines
              get `flex-none whitespace-nowrap` so "+{rangeDays} 天" always
              renders on one line instead of wrapping ("+30" / "天") when
              squeezed near that edge. */}
          {ticks.map((tick, index) => {
            const isFirst = index === 0
            const isLast = index === ticks.length - 1
            const left = getTimelinePosition(tick.date.toISOString(), range)
            return (
              <div
                key={`${tick.label}-${tick.date.toISOString()}`}
                className={`absolute top-[160px] inline-flex flex-col ${
                  isFirst ? 'items-start text-left' : isLast ? 'items-end text-right' : '-translate-x-1/2 items-center text-center'
                }`}
                style={isFirst ? { left: 0 } : isLast ? { right: 0 } : { left: `${left}%` }}
              >
                <div className="mb-1 h-2 w-px flex-none bg-line-strong" />
                <p className="flex-none whitespace-nowrap text-[10px] font-medium text-ink-500">{tick.label}</p>
                <p className="flex-none whitespace-nowrap text-[10px] text-ink-400">{format(tick.date, 'MMM d')}</p>
              </div>
            )
          })}

          {placedGroups.map(({ group, above, layer }) => {
            const first = group.milestones[0]
            const visual = getTimelineVisual(first)
            const cls = TONE_CLASS[visual.tone]
            const isCluster = group.milestones.length > 1
            const selected = activeMilestone && group.milestones.some((m) => m.id === activeMilestone.id)

            // Fix 1/3 (overlapping cards): `layer > 0` only changes how far
            // the card sits from the axis — the dot's own position stays
            // fixed. For "above" (card, stem, dot in that DOM order), the
            // card is positioned directly by `wrapperTop`, so moving it away
            // from the axis means moving wrapperTop itself; the stem grows
            // by the same amount so the dot (wrapperTop + card + stem) lands
            // in the same place regardless of layer. For "below" (dot,
            // stem, card), the dot is first in flow — its position is just
            // wrapperTop, untouched by anything after it — so only the stem
            // needs to grow to push the card further down.
            const dx = layer * LAYER_STEP
            const wrapperTop = above ? ABOVE_TOP - dx : BELOW_TOP
            const stemHeight = (above ? ABOVE_STEM : BELOW_STEM) + dx

            return (
              <div
                key={group.id}
                className="absolute -translate-x-1/2"
                style={{ left: `${readableX(group.x)}%`, top: wrapperTop }}
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
                <div className={`mx-auto w-0.5 ${cls.stem}`} style={{ height: stemHeight }} />
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
  const t = useTranslations('timeline')
  return (
    <SegmentedControl
      label={t('nextView.rangeLabel')}
      items={RANGE_OPTIONS.map((days) => ({ value: String(days), label: t('nextView.rangeOption', { days }) }))}
      value={String(value)}
      onChange={(v) => onChange(Number(v) as RangeDays)}
    />
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
  const t = useTranslations('timeline')
  const visual = getTimelineVisual(milestone)
  const cls = TONE_CLASS[visual.tone]
  const title = isCluster
    ? `${t('nextView.clusterCount', { count })} · ${format(new Date(milestone.target_date), 'MMM d')}`
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
        className={`relative mx-auto block h-4 w-4 rounded-full transition-transform hover:scale-110 ${dotClass} ${selected ? 'scale-125' : ''}`}
      >
        <span className="absolute -mt-5 ml-2 rounded-full bg-ink-900 px-1.5 py-0.5 text-[10px] text-white">
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
      className={`mx-auto block h-4 w-4 rounded-full transition-transform hover:scale-110 ${dotClass} ${selected ? 'scale-125' : ''}`}
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
  const t = useTranslations('timeline')
  const visual = getTimelineVisual(milestone)
  const daysLeft = getDaysLeft(milestone.target_date)
  const cls = TONE_CLASS[visual.tone]
  const owner = (milestone.owner_agent as { name?: string } | null | undefined)?.name

  return (
    <Link
      href={`/timeline/${milestone.id}`}
      title={`${milestone.title} · ${t(`nextView.toneLabel.${visual.tone}`)}`}
      onClick={(event) => onPress(event, milestone.id)}
      className={`block w-44 rounded-field border px-3 py-2 shadow-card transition-all hover:-translate-y-0.5 hover:shadow-pop ${cls.card} ${selected ? 'ring-2 ring-primary-border' : ''}`}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-semibold text-ink-900 line-clamp-2">
          {isCluster ? t('nextView.clusterCount', { count }) : milestone.title}
        </p>
        <span className={`text-[10px] font-semibold whitespace-nowrap ${cls.text}`}>
          {daysLeft < 0 ? t('table.overdue', { days: Math.abs(daysLeft) }) : t('table.daysShort', { days: daysLeft })}
        </span>
      </div>
      <p className="text-[10px] text-ink-500 mt-1 truncate">
        {owner ?? t('nextView.ownerUnassigned')}
      </p>
      {isCluster && (
        <p className="text-[10px] text-ink-400 mt-1 truncate">
          {t('nextView.clusterHint')}
        </p>
      )}
    </Link>
  )
}

function FocusDetail({ milestone }: { milestone: Milestone }) {
  const t = useTranslations('timeline')
  const visual = getTimelineVisual(milestone)
  const daysLeft = getDaysLeft(milestone.target_date)
  const cls = TONE_CLASS[visual.tone]
  const owner = (milestone.owner_agent as { name?: string; role?: string } | null | undefined)

  return (
    <div className={`mt-4 rounded-field border px-4 py-3 ${cls.card}`}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <Link
            href={`/timeline/${milestone.id}`}
            className="text-sm font-semibold text-ink-900 hover:text-primary transition-colors"
          >
            {milestone.title}
          </Link>
          {milestone.description && (
            <p className="text-xs text-ink-700 mt-1 line-clamp-2">{milestone.description}</p>
          )}
          <div className="flex items-center gap-3 flex-wrap mt-2 text-xs text-ink-500">
            <span>{format(new Date(milestone.target_date), 'MMM d, yyyy')}</span>
            <span>{owner?.name ? `${owner.name}${owner.role ? ` (${owner.role})` : ''}` : t('nextView.ownerUnassigned')}</span>
            <span className={cls.text}>{t(`nextView.toneLabel.${visual.tone}`)}</span>
          </div>
        </div>
        <div className={`text-xs font-semibold whitespace-nowrap ${cls.text}`}>
          {daysLeft < 0 ? t('table.overdue', { days: Math.abs(daysLeft) }) : t('table.daysShort', { days: daysLeft })}
        </div>
      </div>
    </div>
  )
}
