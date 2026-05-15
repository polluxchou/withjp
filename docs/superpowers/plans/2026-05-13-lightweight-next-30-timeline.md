# Lightweight Next 30 Timeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a lightweight horizontal `接下来 30 天` view to `/timeline` for quickly seeing upcoming strategic milestones.

**Architecture:** Extract date filtering, positioning, clustering, and visual-state logic into a pure helper module with Node tests. Add a focused `NextTimelineView` React component and wire it into the existing `/timeline` view switch without changing the existing list, Gantt, or curve views.

**Tech Stack:** Next.js 14 App Router, React 18 client components, TypeScript, date-fns, Tailwind CSS, Node built-in test runner.

---

## File Map

- Create `src/lib/milestones/next-timeline.ts`
  - Pure helper functions for range filtering, x-position, clustering, and visual category mapping.
  - No `@/` imports so `node --test --experimental-strip-types` can run it directly.
- Create `src/lib/milestones/next-timeline.test.ts`
  - Focused tests for the helper module.
- Create `src/components/milestones/NextTimelineView.tsx`
  - Lightweight horizontal timeline UI, range selector, empty state, tooltip/focus detail, and cluster popover.
- Modify `src/app/[locale]/(app)/timeline/page.tsx`
  - Add the `next` view tab and render `NextTimelineView`.
- Modify `package.json`
  - Add the new milestone helper test to the `npm test` script.

## Task 1: Pure Timeline Helper

**Files:**
- Create: `src/lib/milestones/next-timeline.ts`
- Create: `src/lib/milestones/next-timeline.test.ts`
- Modify: `package.json`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/milestones/next-timeline.test.ts`:

```ts
import test from 'node:test'
import assert from 'node:assert/strict'

import {
  DAY_MS,
  buildUpcomingRange,
  filterUpcomingMilestones,
  getTimelinePosition,
  getTimelineVisual,
  groupTimelineItems,
  type TimelineMilestone,
} from './next-timeline.ts'

const TODAY = new Date('2026-05-13T12:00:00.000Z')

function localIso(year: number, monthIndex: number, day: number, hour = 0): string {
  return new Date(year, monthIndex, day, hour).toISOString()
}

function ms(overrides: Partial<TimelineMilestone>): TimelineMilestone {
  return {
    id: overrides.id ?? 'm1',
    title: overrides.title ?? 'Milestone',
    target_date: overrides.target_date ?? '2026-05-20T00:00:00.000Z',
    status: overrides.status ?? 'planned',
    priority: overrides.priority ?? 'medium',
    risk_level: overrides.risk_level ?? 'low',
    owner_agent_id: overrides.owner_agent_id ?? 'owner-1',
  }
}

test('buildUpcomingRange starts at local day boundary and spans selected days', () => {
  const range = buildUpcomingRange(TODAY, 30)
  assert.equal(range.days, 30)
  assert.equal(range.start.getHours(), 0)
  assert.equal(range.start.getMinutes(), 0)
  assert.equal(range.end.getTime() - range.start.getTime(), 30 * DAY_MS)
})

test('filterUpcomingMilestones includes today through the selected range end', () => {
  const milestones = [
    ms({ id: 'past', target_date: localIso(2026, 4, 12, 23) }),
    ms({ id: 'today', target_date: localIso(2026, 4, 13, 8) }),
    ms({ id: 'inside', target_date: localIso(2026, 5, 1) }),
    ms({ id: 'edge', target_date: localIso(2026, 5, 12) }),
    ms({ id: 'future', target_date: localIso(2026, 5, 13) }),
  ]

  const result = filterUpcomingMilestones(milestones, buildUpcomingRange(TODAY, 30))
  assert.deepEqual(result.map((m) => m.id), ['today', 'inside', 'edge'])
})

test('getTimelinePosition maps dates to percentages across the range', () => {
  const range = buildUpcomingRange(TODAY, 30)

  assert.equal(getTimelinePosition('2026-05-13T00:00:00.000Z', range), 0)
  assert.equal(getTimelinePosition(localIso(2026, 4, 28), range), 50)
  assert.equal(getTimelinePosition(localIso(2026, 5, 12), range), 100)
})

test('getTimelineVisual prioritizes overdue, risk, attention, completed, and missing owner state', () => {
  assert.equal(getTimelineVisual(ms({ status: 'missed' }), TODAY).tone, 'danger')
  assert.equal(getTimelineVisual(ms({ risk_level: 'high' }), TODAY).tone, 'danger')
  assert.equal(getTimelineVisual(ms({ priority: 'high' }), TODAY).tone, 'warning')
  assert.equal(getTimelineVisual(ms({ status: 'completed' }), TODAY).tone, 'success')
  assert.equal(getTimelineVisual(ms({ owner_agent_id: null }), TODAY).hollow, true)
})

test('groupTimelineItems clusters items that are close together', () => {
  const range = buildUpcomingRange(TODAY, 30)
  const items = filterUpcomingMilestones([
    ms({ id: 'a', target_date: localIso(2026, 4, 18) }),
    ms({ id: 'b', target_date: localIso(2026, 4, 18, 12) }),
    ms({ id: 'c', target_date: localIso(2026, 5, 5) }),
  ], range)

  const groups = groupTimelineItems(items, range, 3)
  assert.equal(groups.length, 2)
  assert.deepEqual(groups[0].milestones.map((m) => m.id), ['a', 'b'])
  assert.deepEqual(groups[1].milestones.map((m) => m.id), ['c'])
})
```

- [ ] **Step 2: Run the new test to verify it fails**

Run:

```bash
node --test --experimental-strip-types src/lib/milestones/next-timeline.test.ts
```

Expected: FAIL with a module-not-found error for `./next-timeline.ts`.

- [ ] **Step 3: Implement the helper**

Create `src/lib/milestones/next-timeline.ts`:

```ts
export const DAY_MS = 86_400_000

export type TimelineStatus = 'planned' | 'active' | 'at_risk' | 'completed' | 'missed'
export type TimelinePriority = 'high' | 'medium' | 'low'
export type TimelineRisk = 'low' | 'medium' | 'high'
export type TimelineTone = 'danger' | 'warning' | 'success' | 'neutral'

export interface TimelineMilestone {
  id: string
  title: string
  target_date: string
  status: TimelineStatus
  priority: TimelinePriority
  risk_level: TimelineRisk
  owner_agent_id: string | null
}

export interface UpcomingRange {
  start: Date
  end: Date
  days: number
}

export interface TimelineVisual {
  tone: TimelineTone
  hollow: boolean
  label: string
}

export interface TimelineGroup<T extends TimelineMilestone = TimelineMilestone> {
  id: string
  x: number
  milestones: T[]
}

export function startOfLocalDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

export function buildUpcomingRange(now: Date = new Date(), days = 30): UpcomingRange {
  const start = startOfLocalDay(now)
  return { start, end: new Date(start.getTime() + days * DAY_MS), days }
}

export function filterUpcomingMilestones<T extends TimelineMilestone>(
  milestones: T[],
  range: UpcomingRange,
): T[] {
  return milestones
    .filter((m) => {
      const time = new Date(m.target_date).getTime()
      return Number.isFinite(time) && time >= range.start.getTime() && time <= range.end.getTime()
    })
    .sort((a, b) => new Date(a.target_date).getTime() - new Date(b.target_date).getTime())
}

export function getTimelinePosition(targetDate: string, range: UpcomingRange): number {
  const total = range.end.getTime() - range.start.getTime()
  if (total <= 0) return 0
  const raw = ((new Date(targetDate).getTime() - range.start.getTime()) / total) * 100
  return Math.max(0, Math.min(100, Math.round(raw * 100) / 100))
}

export function getDaysLeft(targetDate: string, now: Date = new Date()): number {
  const today = startOfLocalDay(now).getTime()
  const target = startOfLocalDay(new Date(targetDate)).getTime()
  return Math.ceil((target - today) / DAY_MS)
}

export function getTimelineVisual(milestone: TimelineMilestone, now: Date = new Date()): TimelineVisual {
  const daysLeft = getDaysLeft(milestone.target_date, now)
  const hollow = !milestone.owner_agent_id
  if (milestone.status === 'missed' || daysLeft < 0 || milestone.status === 'at_risk' || milestone.risk_level === 'high') {
    return { tone: 'danger', hollow, label: '高风险' }
  }
  if (milestone.priority === 'high' || milestone.risk_level === 'medium' || daysLeft <= 7) {
    return { tone: 'warning', hollow, label: '需注意' }
  }
  if (milestone.status === 'completed') {
    return { tone: 'success', hollow, label: '已完成' }
  }
  return { tone: 'neutral', hollow, label: '计划中' }
}

export function groupTimelineItems<T extends TimelineMilestone>(
  milestones: T[],
  range: UpcomingRange,
  thresholdPct = 3,
): TimelineGroup<T>[] {
  const groups: TimelineGroup<T>[] = []
  for (const milestone of milestones) {
    const x = getTimelinePosition(milestone.target_date, range)
    const last = groups[groups.length - 1]
    if (last && Math.abs(last.x - x) <= thresholdPct) {
      last.milestones.push(milestone)
      last.x = Math.round(((last.x + x) / 2) * 100) / 100
    } else {
      groups.push({ id: milestone.id, x, milestones: [milestone] })
    }
  }
  return groups
}
```

- [ ] **Step 4: Add the test to `package.json`**

Update the `test` script so it includes:

```json
"src/lib/milestones/next-timeline.test.ts"
```

- [ ] **Step 5: Run helper tests**

Run:

```bash
node --test --experimental-strip-types src/lib/milestones/next-timeline.test.ts
```

Expected: all 5 tests pass.

## Task 2: React Timeline View

**Files:**
- Create: `src/components/milestones/NextTimelineView.tsx`
- Modify: `src/app/[locale]/(app)/timeline/page.tsx`

- [ ] **Step 1: Create `NextTimelineView`**

Create a client component that accepts the already-loaded milestone list:

```tsx
'use client'

import { useMemo, useState } from 'react'
import { Link } from '@/i18n/navigation'
import { format } from 'date-fns/format'
import type { Milestone } from '@/lib/types'
import {
  buildUpcomingRange,
  filterUpcomingMilestones,
  getDaysLeft,
  getTimelinePosition,
  getTimelineVisual,
  groupTimelineItems,
} from '@/lib/milestones/next-timeline'

const RANGE_OPTIONS = [14, 30, 90] as const
type RangeDays = (typeof RANGE_OPTIONS)[number]

const TONE_CLASS = {
  danger:  {
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
    dot: 'bg-slate-400 ring-slate-100',
    hollow: 'border-slate-400 bg-white ring-slate-100',
    card: 'border-slate-200 bg-white',
    text: 'text-slate-500',
    stem: 'bg-slate-300',
  },
} as const

export default function NextTimelineView({ milestones }: { milestones: Milestone[] }) {
  const [rangeDays, setRangeDays] = useState<RangeDays>(30)
  const [activeId, setActiveId] = useState<string | null>(null)

  const range = useMemo(() => buildUpcomingRange(new Date(), rangeDays), [rangeDays])
  const upcoming = useMemo(() => filterUpcomingMilestones(milestones, range), [milestones, range])
  const groups = useMemo(() => groupTimelineItems(upcoming, range, rangeDays === 90 ? 2 : 3), [upcoming, range, rangeDays])

  const activeMilestone = activeId
    ? upcoming.find((m) => m.id === activeId) ?? null
    : upcoming[0] ?? null

  const ticks = [
    { label: '今天', date: range.start },
    { label: '+7 天', date: new Date(range.start.getTime() + 7 * 86_400_000) },
    { label: `+${Math.round(rangeDays / 2)} 天`, date: new Date(range.start.getTime() + Math.round(rangeDays / 2) * 86_400_000) },
    { label: `+${rangeDays} 天`, date: range.end },
  ]

  if (upcoming.length === 0) {
    return (
      <section className="bg-white border border-slate-200 rounded-xl p-10 text-center">
        <p className="text-sm font-medium text-slate-600">未来 {rangeDays} 天暂无战略节点</p>
        <p className="text-xs text-slate-400 mt-1">可以切换到 90 天查看更远的规划。</p>
        <RangeSwitch value={rangeDays} onChange={setRangeDays} />
      </section>
    )
  }

  return (
    <section className="bg-white border border-slate-200 rounded-xl p-5">
      <div className="flex items-end justify-between gap-4 mb-5">
        <div>
          <h2 className="text-lg font-bold text-slate-900">接下来 {rangeDays} 天</h2>
          <p className="text-xs text-slate-500 mt-1">按日期查看即将到来的战略节点</p>
        </div>
        <RangeSwitch value={rangeDays} onChange={setRangeDays} />
      </div>

      <div className="overflow-x-auto pb-2">
        <div className="relative min-w-[860px] h-[300px] px-8">
          <div className="absolute left-8 right-8 top-[142px] h-0.5 bg-slate-200" />

          {ticks.map((tick) => {
            const left = getTimelinePosition(tick.date.toISOString(), range)
            return (
              <div key={tick.label} className="absolute top-[151px] -translate-x-1/2 text-center" style={{ left: `calc(2rem + ${left}% * (100% - 4rem) / 100)` }}>
                <div className="mx-auto mb-1 h-2 w-px bg-slate-300" />
                <p className="text-[10px] font-medium text-slate-500">{tick.label}</p>
                <p className="text-[10px] text-slate-400">{format(tick.date, 'MMM d')}</p>
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
              <div key={group.id} className="absolute -translate-x-1/2" style={{ left: `calc(2rem + ${group.x}% * (100% - 4rem) / 100)`, top: above ? 24 : 146 }}>
                {above && <TimelineCard milestone={first} isCluster={isCluster} count={group.milestones.length} selected={!!selected} onFocus={() => setActiveId(first.id)} />}
                <div className={`mx-auto w-0.5 ${above ? 'h-10' : 'h-8'} ${cls.stem}`} />
                <button
                  type="button"
                  onClick={() => setActiveId(first.id)}
                  title={isCluster ? `${group.milestones.length} 个节点` : first.title}
                  className={`mx-auto block h-4 w-4 rounded-full ring-4 transition-transform hover:scale-110 ${visual.hollow ? `border-2 ${cls.hollow}` : cls.dot} ${selected ? 'scale-125' : ''}`}
                >
                  {isCluster && <span className="absolute -mt-5 ml-2 rounded-full bg-slate-900 px-1.5 py-0.5 text-[10px] text-white">{group.milestones.length}</span>}
                </button>
                {!above && <TimelineCard milestone={first} isCluster={isCluster} count={group.milestones.length} selected={!!selected} onFocus={() => setActiveId(first.id)} />}
              </div>
            )
          })}
        </div>
      </div>

      {activeMilestone && <FocusDetail milestone={activeMilestone} />}
    </section>
  )
}
```

- [ ] **Step 2: Add supporting local components**

In the same file, add `RangeSwitch`, `TimelineCard`, and `FocusDetail` below `NextTimelineView`. Use the helper functions to render days left and visual state. `TimelineCard` should wrap the title in `Link href={`/timeline/${milestone.id}`}`.

- [ ] **Step 3: Wire the tab into `/timeline`**

Modify `src/app/[locale]/(app)/timeline/page.tsx`:

```tsx
import NextTimelineView from '@/components/milestones/NextTimelineView'
import { Plus, List, BarChart2, TrendingUp, Target, AlertTriangle, CalendarDays } from 'lucide-react'
```

Change the view state:

```tsx
const [view, setView] = useState<'next' | 'list' | 'gantt' | 'curve'>('next')
```

Add a tab button before List:

```tsx
<button onClick={() => setView('next')}
  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${view === 'next' ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500 hover:text-slate-700'}`}>
  <CalendarDays className="w-3.5 h-3.5" /> 接下来 30 天
</button>
```

Change the render branch:

```tsx
{loading ? (
  <div className="p-12 text-center text-sm text-slate-400">Loading milestones…</div>
) : milestones.length === 0 ? (
  ...
) : view === 'next' ? (
  <NextTimelineView milestones={milestones} />
) : view === 'list' ? (
  <ListView milestones={milestones} onUpdated={load} />
) : view === 'gantt' ? (
  <GanttView milestones={milestones} />
) : (
  <CurveView milestones={milestones} />
)}
```

- [ ] **Step 4: Build verification**

Run:

```bash
npm run build
```

Expected: production build completes successfully.

## Task 3: Browser Verification

**Files:**
- No new files expected unless visual bugs require code fixes.

- [ ] **Step 1: Start the dev server**

Run:

```bash
npm run dev
```

Expected: local Next dev server starts on port 3001.

- [ ] **Step 2: Open `/zh/timeline` in Browser**

Use the Browser plugin to open:

```text
http://127.0.0.1:3001/zh/timeline
```

Expected: `/timeline` loads and the default view is the lightweight horizontal `接下来 30 天` timeline.

- [ ] **Step 3: Verify responsive and interaction behavior**

Check:

- The timeline is not visually dominated by statistic cards.
- Range switch supports 14, 30, and 90 days.
- Empty state appears when no milestones match the selected range.
- Clicking a node/card navigates to the milestone detail page.
- Dense nodes show cluster count or remain readable.

- [ ] **Step 4: Final verification**

Run:

```bash
node --test --experimental-strip-types src/lib/milestones/next-timeline.test.ts
npm run build
```

Expected: helper tests pass and build completes.
