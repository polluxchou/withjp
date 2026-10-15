'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import {
  DndContext, DragOverlay, MeasuringStrategy, MouseSensor, TouchSensor,
  pointerWithin, rectIntersection, useSensor, useSensors,
} from '@dnd-kit/core'
import type { Announcements, CollisionDetection, DragEndEvent, DragStartEvent, Over } from '@dnd-kit/core'
import { Stat, StatBand } from '@/components/ui/Stat'
import ItemDetailPanel from './ItemDetailPanel'
import OwnerFilter from './OwnerFilter'
import OwnerAvatar from './OwnerAvatar'
import DueDatePrompt from './DueDatePrompt'
import DropNotice from './DropNotice'
import {
  DragPreview, DraggableButton, DropDock, DropZone, ZoneKeyboardSensor, centerOverlayOnPointer, dropAnimationFor,
  prefersReducedMotion, zoneKeyboardCoordinates,
} from './QuadrantDnd'
import { writeSearchParams } from './searchParams'
import { isStationaryTouchDrop, pointerOf } from '@/lib/org/dragZones'
import { LANDED_MS, LEAVE_MS, dropAnimationKind, dropOutcomeOf, withLeaving } from '@/lib/org/dropMotion'
import type { DropAnimationKind } from '@/lib/org/dropMotion'
import {
  QUADRANTS, URGENT_WITHIN_DAYS, bucketOf, dropNoticeKind, dueBadge, flattenItems, groupItems, ownerOptions,
  parseLevel, parseOwnerFilter, planDrop, quadrantStats,
} from '@/lib/org/quadrant'
import { pickItemFields } from '@/lib/org/tree'
import type { Bucket, DueBadge, ItemPatch, OwnerFilter as OwnerFilterValue, Quadrant, QuadrantRow } from '@/lib/org/quadrant'
import type { OrgSnapshot } from '@/lib/types'

// 四格色调：① danger ② info ③ warning ④ muted（spec 6.2）。整串类名写死，Tailwind 才扫得到。
const TONE: Record<Quadrant, { dot: string; text: string; tile: string }> = {
  q1: { dot: 'bg-danger-dot', text: 'text-danger-text', tile: 'border-danger-border bg-danger-soft' },
  q2: { dot: 'bg-info-dot', text: 'text-info-text', tile: 'border-info-border bg-info-soft' },
  q3: { dot: 'bg-warning-dot', text: 'text-warning-text', tile: 'border-warning-border bg-surface' },
  q4: { dot: 'bg-muted-dot', text: 'text-muted-text', tile: 'border-line bg-surface' },
}
const BADGE_TONE: Record<DueBadge['tone'], string> = {
  danger: 'bg-danger-soft text-danger-text',
  warning: 'bg-warning-soft text-warning-text',
  muted: 'bg-muted-soft text-muted-text',
}
const FOCUS = 'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-ring'
const MOBILE_CARD = 'flex w-full flex-col gap-2 rounded-card border border-line bg-surface p-3.5 text-left shadow-card'

// 鼠标 / 触控：只看指针落在哪个区（落在区外 = 不放）；键盘没有指针坐标，退回矩形相交（覆盖层被方向键移到区中心）。
const collision: CollisionDetection = (args) =>
  args.pointerCoordinates ? pointerWithin(args) : rectIntersection(args)

interface Props {
  snapshot: OrgSnapshot
  today: string
  /** resolve 写入是否成功；失败时界面已回滚。 */
  onUpdateItem: (itemId: string, fields: ItemPatch) => Promise<boolean>
  onPickOwner: (itemId: string) => void
}

export default function QuadrantView({ snapshot, today, onUpdateItem, onPickOwner }: Props) {
  const t = useTranslations('team')
  const params = useSearchParams()
  const rows = useMemo(() => flattenItems(snapshot), [snapshot])
  const owner = parseOwnerFilter(params.get('owner'), rows)
  const level = parseLevel(params.get('q'))
  const groups = useMemo(() => groupItems(rows, today, owner), [rows, today, owner])
  const stats = quadrantStats(groups, today)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [doneOpen, setDoneOpen] = useState(false)
  // 本页内从首层点进来的才用 history.back()；直接打开带 ?q= 的链接时，返回要留在本页。
  const pushedLevel = useRef(false)
  // 稳定引用：面板的 Escape 监听以它为依赖，每次渲染换新函数会反复重绑监听。
  const closePanel = useCallback(() => setSelectedId(null), [])
  // 换层（含系统返回手势）就关掉详情面板：它是挂在 body 上的 portal，不随列表层卸载，
  // 不关会连同滚动锁一起盖在首层上。
  useEffect(() => { setSelectedId(null) }, [level])
  // 按 id 找、不按格内位置找：改完重要/截止日后事项会换格，面板跟着这个事项走。
  const selected = selectedId ? rows.find((r) => r.id === selectedId) ?? null : null
  const positionName = (id: string) => snapshot.positions.find((p) => p.id === id)?.name ?? id
  const canEdit = snapshot.canEdit
  // byPointer：鼠标 / 触控拖（跟手卡片对准指针）还是键盘拖（卡片随方向键跳区）。
  const [dragging, setDragging] = useState<{ row: QuadrantRow; from: Bucket; byPointer: boolean } | null>(null)
  const [ask, setAsk] = useState<{ row: QuadrantRow; target: Bucket; base: ItemPatch; minDate: string } | null>(null)
  const [notice, setNotice] = useState<{ key: number; message: string; itemId: string; undo: ItemPatch | null } | null>(null)
  // 单调递增的序号当 key：同一毫秒内连续两次拖放也要重挂提示条，5 秒计时才会重新开始。
  const noticeSeq = useRef(0)
  const dismissNotice = useCallback(() => setNotice(null), [])
  // 落地动效：放下时跟手卡片怎么收场；哪张卡片刚落地要高亮；手机列表层哪张卡片正被拖走（播收起动画）。
  const [dropKind, setDropKind] = useState<DropAnimationKind>('back')
  const [landed, setLanded] = useState<{ id: string; key: number } | null>(null)
  const [leaving, setLeaving] = useState<{ row: QuadrantRow; from: Bucket; index: number } | null>(null)
  const landedSeq = useRef(0)
  // 高亮播完就摘掉类名：同一事项紧接着再落地时类名重新加上，动画才会重播。
  useEffect(() => {
    if (!landed) return
    const timer = window.setTimeout(() => setLanded(null), LANDED_MS)
    return () => window.clearTimeout(timer)
  }, [landed])
  useEffect(() => {
    if (!leaving) return
    const timer = window.setTimeout(() => setLeaving(null), LEAVE_MS)
    return () => window.clearTimeout(timer)
  }, [leaving])
  const markLanded = (itemId: string) => {
    landedSeq.current += 1
    setLanded({ id: itemId, key: landedSeq.current })
  }
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 5 } }),
    // 没在拖时 Enter 留给「打开详情」，只用 Space 拿起（spec 3.4）；拖起后 Space / Enter 都算放下，
    // 否则拖到一半按 Enter 会既不放下、又掉进按钮的点击去打开详情。
    useSensor(ZoneKeyboardSensor, {
      coordinateGetter: zoneKeyboardCoordinates,
      keyboardCodes: { start: ['Space'], cancel: ['Escape'], end: ['Space', 'Enter'] },
    }),
  )

  const setOwner = (v: OwnerFilterValue) => writeSearchParams({ owner: v === 'all' ? null : v }, 'replace')
  const openLevel = (b: Bucket) => { pushedLevel.current = true; writeSearchParams({ q: b }, 'push') }
  const backHome = () => {
    if (pushedLevel.current) { pushedLevel.current = false; window.history.back() }
    else writeSearchParams({ q: null }, 'replace')
  }

  const title = (b: Bucket) =>
    b === 'q1' ? t('org.q1Title') : b === 'q2' ? t('org.q2Title') : b === 'q3' ? t('org.q3Title')
      : b === 'q4' ? t('org.q4Title') : b === 'unrated' ? t('org.unratedTitle') : t('org.doneTitle')
  const sub = (q: Quadrant) =>
    q === 'q1' ? t('org.q1Sub') : q === 'q2' ? t('org.q2Sub') : q === 'q3' ? t('org.q3Sub') : t('org.q4Sub')
  const dueText = (b: DueBadge) =>
    b.kind === 'overdue' ? t('org.dueOverdue', { days: b.days })
      : b.kind === 'today' ? t('org.dueToday')
        : b.kind === 'soon' ? t('org.dueSoon', { date: b.date, days: b.days })
          : b.date
  const ownerLabel = (row: QuadrantRow) => row.ownerName ?? t('org.statUnassigned')

  const rowOf = (itemId: unknown) => rows.find((r) => r.id === itemId) ?? null
  const targetOf = (over: Over | null): Bucket | null =>
    (over?.data.current as { target?: Bucket } | undefined)?.target ?? null

  // 写入 + 提示条。撤销用的旧值在写入前从当前快照取。
  const commitDrop = (row: QuadrantRow, target: Bucket, patch: ItemPatch, autoDue: string | null) => {
    const undo = pickItemFields(snapshot, row.id, Object.keys(patch) as (keyof ItemPatch)[])
    const zone = title(target)
    const kind = dropNoticeKind(target, row.status === 'done', autoDue)
    const message = kind.key === 'dropDone' ? t('org.dropDone')
      : 'date' in kind
        ? (kind.key === 'dropReopenedDue'
          ? t('org.dropReopenedDue', { zone, date: kind.date })
          : t('org.dropMovedDue', { zone, date: kind.date }))
        : kind.key === 'dropReopened' ? t('org.dropReopened', { zone })
          : t('org.dropMoved', { zone })
    noticeSeq.current += 1
    const key = noticeSeq.current
    setNotice({ key, message, itemId: row.id, undo })
    markLanded(row.id)
    // 手机列表层：卡片离开当前列表时收起而不是瞬间消失。减少动效偏好下直接移除。
    const from = bucketOf(row, today)
    if (!prefersReducedMotion()) setLeaving({ row, from, index: groups[from].findIndex((r) => r.id === row.id) })
    // 写入失败（界面已回滚）时收起这条「已移到…」：它已不成立，撤销也只会再发一次注定失败的请求。
    // 只收起自己这一条：期间若又有新的拖放，key 已变，不动它。
    onUpdateItem(row.id, patch).then((ok) => {
      if (!ok) setNotice((n) => (n && n.key === key ? null : n))
    })
  }

  const onDragStart = ({ active, activatorEvent }: DragStartEvent) => {
    const row = rowOf(active.data.current?.itemId)
    setDragging(row ? { row, from: bucketOf(row, today), byPointer: pointerOf(activatorEvent) !== null } : null)
  }
  const onDragEnd = ({ active, over }: DragEndEvent) => {
    setDragging(null)
    const row = rowOf(active.data.current?.itemId)
    const target = targetOf(over)
    const plan = row && target ? planDrop(row, target, today) : null
    // 写入了就让跟手卡片原地淡出（事项已在新格），没写入才飞回原位；与 dnd-kit 的结束状态同批生效。
    setDropKind(dropAnimationKind(dropOutcomeOf(plan?.kind ?? null), prefersReducedMotion()))
    if (!row || !target || !plan || plan.kind === 'noop') return
    if (plan.kind === 'askDate') {
      setAsk({ row, target, base: plan.base, minDate: plan.minDate })
      return
    }
    commitDrop(row, target, plan.patch, plan.autoDue)
  }
  const onUndo = () => {
    if (notice?.undo) {
      onUpdateItem(notice.itemId, notice.undo)
      markLanded(notice.itemId)
    }
    setNotice(null)
  }

  const announcements: Announcements = {
    onDragStart: ({ active }) => t('org.dragAnnouncePick', { name: rowOf(active.data.current?.itemId)?.name ?? '' }),
    onDragOver: ({ over }) => {
      const target = targetOf(over)
      return target ? t('org.dragAnnounceOver', { zone: title(target) }) : undefined
    },
    // 放进某区后要么出提示条（下面常驻的 live region 播报「已移到…」，含自动设的日期），要么弹询问框
    // （对话框自己会被读出），这里不再播「已放进…」，免得读屏连听两遍；只有没放进任何区时播「已取消」。
    onDragEnd: ({ over }) => (targetOf(over) ? undefined : t('org.dragAnnounceCancel')),
    onDragCancel: () => t('org.dragAnnounceCancel'),
  }

  const badges = (row: QuadrantRow) => {
    const due = dueBadge(row, today)
    return (
      <span className="inline-flex flex-none items-center gap-1">
        {row.status === 'blocked' && (
          <span className="rounded-btn bg-danger-soft px-1.5 py-px text-micro font-semibold text-danger-text">{t('org.statusBlocked')}</span>
        )}
        {due && (
          <span className={`whitespace-nowrap rounded-btn px-1.5 py-px text-micro font-semibold tabular-nums ${BADGE_TONE[due.tone]}`}>{dueText(due)}</span>
        )}
      </span>
    )
  }

  // ── 桌面 ────────────────────────────────────────────────
  const desktopRow = (row: QuadrantRow) => (
    <li key={row.id}>
      <DraggableButton
        dragId={`d:${row.id}`}
        itemId={row.id}
        disabled={!canEdit}
        landed={landed?.id === row.id}
        onClick={() => setSelectedId(row.id)}
        title={`${row.businessName} › ${row.taskName}`}
        className={`flex w-full items-center gap-2.5 rounded-field px-2 py-2 text-left text-sm hover:bg-row-hover ${FOCUS}`}
      >
        <span className={`min-w-0 flex-1 truncate ${row.status === 'done' ? 'text-ink-500 line-through' : 'text-ink-900'}`}>{row.name}</span>
        <span className={`max-w-[7rem] flex-none truncate text-xs ${row.ownerKey === 'none' ? 'font-semibold text-warning-text' : 'text-ink-500'}`}>{ownerLabel(row)}</span>
        {badges(row)}
      </DraggableButton>
    </li>
  )

  const quadrantCard = (q: Quadrant) => (
    <DropZone
      key={q}
      id={`zone:${q}`}
      target={q}
      current={dragging?.from ?? null}
      label={title(q)}
      className="flex h-[420px] min-h-0 flex-col rounded-card border border-line bg-surface shadow-card"
    >
      <header className="flex items-center gap-2 border-b border-line-soft px-4 py-3">
        <span aria-hidden className={`h-2 w-2 rounded-full ${TONE[q].dot}`} />
        <h3 className={`text-md font-semibold ${TONE[q].text}`}>{title(q)}</h3>
        <span className="text-xs text-ink-500">{sub(q)}</span>
        <span className="ml-auto rounded-btn bg-line-soft px-2 py-px text-xs font-semibold tabular-nums text-ink-700">{groups[q].length}</span>
      </header>
      {groups[q].length === 0
        ? <p className="m-auto text-xs text-ink-400">{t('org.emptyQuadrant')}</p>
        : <ul className="min-h-0 flex-1 overflow-y-auto p-2">{groups[q].map(desktopRow)}</ul>}
    </DropZone>
  )

  const desktop = (
    <div className="hidden flex-col gap-4 md:flex">
      <StatBand>
        <Stat label={t('org.statOpen')} value={stats.open} />
        <Stat label={t('org.statOverdue')} value={stats.overdue} tone={stats.overdue ? 'danger' : 'default'} />
        <Stat label={t('org.statBlocked')} value={stats.blocked} tone={stats.blocked ? 'danger' : 'default'} />
        <Stat label={t('org.unratedTitle')} value={stats.unrated} />
        <Stat label={t('org.statUnassigned')} value={stats.unassigned} />
      </StatBand>

      <div className="flex flex-wrap items-center gap-3 rounded-card border border-line bg-surface px-4 py-3">
        <span className="text-xs text-ink-500">{t('org.owner')}</span>
        <OwnerFilter options={ownerOptions(rows, today, 'open')} value={owner} onChange={setOwner} />
        <span className="ml-auto text-xs text-ink-400">{t('org.filterCountHint')}</span>
      </div>

      {/* 不画坐标轴文字：每格标题旁的「重要 · 紧急」已经说明了（pollux 定）。 */}
      <div className="grid grid-cols-2 gap-3">
        {QUADRANTS.map(quadrantCard)}
      </div>

      <DropZone id="zone:unrated" target="unrated" current={dragging?.from ?? null} label={t('org.unratedTitle')} className="rounded-card border border-dashed border-line-strong bg-surface p-4">
        <div className="flex flex-wrap items-baseline gap-2">
          <h3 className="text-sm font-semibold text-ink-900">{t('org.unratedTitle')} <span className="tabular-nums">{groups.unrated.length}</span></h3>
          <span className="text-xs text-ink-500">{t('org.unratedHint')}</span>
        </div>
        {groups.unrated.length > 0 && (
          <ul className="mt-3 flex flex-wrap gap-2">
            {groups.unrated.map((row) => (
              <li key={row.id}>
                <DraggableButton
                  dragId={`d:${row.id}`}
                  itemId={row.id}
                  disabled={!canEdit}
                  landed={landed?.id === row.id}
                  onClick={() => setSelectedId(row.id)}
                  className={`inline-flex h-8 items-center gap-1.5 rounded-btn bg-line-soft px-3 text-xs text-ink-900 hover:bg-row-hover ${FOCUS}`}
                >
                  <span className="max-w-[16rem] truncate">{row.name}</span>
                  <span className={row.ownerKey === 'none' ? 'font-semibold text-warning-text' : 'text-ink-500'}>{ownerLabel(row)}</span>
                </DraggableButton>
              </li>
            ))}
          </ul>
        )}
      </DropZone>

      <DropZone id="zone:done" target="done" current={dragging?.from ?? null} label={t('org.doneTitle')} className="rounded-card border border-line bg-surface">
        <button
          type="button"
          aria-expanded={doneOpen}
          onClick={() => setDoneOpen((v) => !v)}
          className={`flex w-full items-center gap-2 rounded-card px-4 py-3 text-left text-sm ${FOCUS}`}
        >
          <span aria-hidden className="h-2 w-2 rounded-full bg-success-dot" />
          <span className="font-semibold text-ink-900">{t('org.doneTitle')}</span>
          <span className="font-semibold tabular-nums text-success-text">{groups.done.length}</span>
          <span className="ml-auto text-xs text-primary">{doneOpen ? t('org.hide') : t('org.show')}</span>
        </button>
        {doneOpen && groups.done.length > 0 && <ul className="px-2 pb-2">{groups.done.map(desktopRow)}</ul>}
      </DropZone>
    </div>
  )

  // ── 手机 ────────────────────────────────────────────────
  const tile = (q: Quadrant) => {
    const list = groups[q]
    const late = list.filter((r) => dueBadge(r, today)?.kind === 'overdue').length
    const blocked = list.filter((r) => r.status === 'blocked').length
    const alerts = [
      late ? t('org.alertOverdue', { count: late }) : null,
      blocked ? t('org.alertBlocked', { count: blocked }) : null,
    ].filter(Boolean).join(' · ')
    return (
      <button
        key={q}
        type="button"
        onClick={() => openLevel(q)}
        aria-label={`${title(q)} ${sub(q)} ${t('org.countItems', { count: list.length })}`}
        className={`flex min-h-[168px] flex-col items-start gap-1.5 rounded-card border p-3.5 text-left ${TONE[q].tile} ${FOCUS}`}
      >
        <span className="flex w-full items-center gap-1.5">
          <span aria-hidden className={`h-2 w-2 rounded-full ${TONE[q].dot}`} />
          <span className={`text-lg font-bold ${TONE[q].text}`}>{title(q)}</span>
          <ChevronRight aria-hidden className="ml-auto h-3.5 w-3.5 text-ink-400" strokeWidth={1.5} />
        </span>
        <span className="text-xs text-ink-500">{sub(q)}</span>
        <span className={`mt-auto text-[40px] font-semibold leading-none tabular-nums ${TONE[q].text}`}>{list.length}</span>
        <span className={`text-xs ${alerts ? 'font-semibold text-danger-text' : 'text-ink-500'}`}>{alerts || t('org.noOverdue')}</span>
      </button>
    )
  }

  const mobileCardBody = (row: QuadrantRow) => (
    <>
      <span className="w-full truncate text-xs text-ink-500">{row.businessName} › {row.taskName}</span>
      <span className={`text-md font-medium leading-snug ${row.status === 'done' ? 'text-ink-500 line-through' : 'text-ink-900'}`}>{row.name}</span>
      <span className="flex w-full items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-1.5">
          <OwnerAvatar ownerKey={row.ownerKey} name={row.ownerName} size="sm" />
          <span className={`truncate text-xs ${row.ownerKey === 'none' ? 'font-semibold text-warning-text' : 'text-ink-700'}`}>{ownerLabel(row)}</span>
        </span>
        {badges(row)}
      </span>
    </>
  )

  const mobileCard = (row: QuadrantRow) => (
    <li key={row.id}>
      <DraggableButton
        dragId={`m:${row.id}`}
        itemId={row.id}
        disabled={!canEdit}
        landed={landed?.id === row.id}
        onClick={() => setSelectedId(row.id)}
        className={`${MOBILE_CARD} ${FOCUS}`}
      >
        {mobileCardBody(row)}
      </DraggableButton>
    </li>
  )

  // 刚被拖走的卡片：原位置留一张不可交互的副本，收起高度并淡出后移除（不是可拖元素，dnd-kit 的 id 不重复）。
  const leavingCard = (row: QuadrantRow) => (
    <li key={`leaving:${row.id}`} aria-hidden className="pointer-events-none grid animate-org-leave">
      <div className="min-h-0 overflow-hidden">
        <div className={MOBILE_CARD}>{mobileCardBody(row)}</div>
      </div>
    </li>
  )

  const mobileHome = (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-ink-500">{t('org.mobileSummary', { open: stats.open, overdue: stats.overdue, blocked: stats.blocked })}</p>
      <OwnerFilter options={ownerOptions(rows, today, 'open')} value={owner} onChange={setOwner} scroll />
      <div className="grid grid-cols-2 gap-2.5">
        <span className="text-center text-xs font-semibold text-ink-700">{t('org.axisUrgent')}</span>
        <span className="text-center text-xs font-semibold text-ink-500">{t('org.axisNotUrgent')}</span>
        {QUADRANTS.map(tile)}
      </div>
      <button
        type="button"
        onClick={() => openLevel('unrated')}
        className={`flex min-h-[56px] items-center gap-2.5 rounded-card border border-dashed border-line-strong bg-surface px-3.5 text-left ${FOCUS}`}
      >
        <span aria-hidden className="h-2 w-2 rounded-full bg-muted-dot" />
        <span className="flex flex-col">
          <span className="text-md font-semibold text-ink-900">{t('org.unratedTitle')}</span>
          <span className="text-xs text-ink-500">{t('org.unratedHint')}</span>
        </span>
        <span className="ml-auto text-xl font-semibold tabular-nums text-ink-700">{groups.unrated.length}</span>
        <ChevronRight aria-hidden className="h-3.5 w-3.5 text-ink-400" strokeWidth={1.5} />
      </button>
      <button
        type="button"
        onClick={() => openLevel('done')}
        className={`flex min-h-[48px] items-center gap-2.5 rounded-card px-3.5 text-left ${FOCUS}`}
      >
        <span aria-hidden className="h-2 w-2 rounded-full bg-success-dot" />
        <span className="text-md text-ink-700">{t('org.doneTitle')}</span>
        <span className="ml-auto text-md font-semibold tabular-nums text-success-text">{groups.done.length}</span>
        <ChevronRight aria-hidden className="h-3.5 w-3.5 text-ink-400" strokeWidth={1.5} />
      </button>
      <p className="text-xs leading-relaxed text-ink-500">{t('org.urgencyRule', { days: URGENT_WITHIN_DAYS })}</p>
    </div>
  )

  const listed = level ? withLeaving(groups[level], leaving && leaving.from === level ? leaving : null) : []
  const mobileList = level && (
    <div className="flex flex-col gap-3">
      <button
        type="button"
        onClick={backHome}
        className={`-ml-2 inline-flex h-11 items-center gap-0.5 self-start rounded-field px-2 text-md text-primary hover:bg-primary-soft ${FOCUS}`}
      >
        <ChevronLeft aria-hidden className="h-4 w-4" strokeWidth={1.5} />
        {t('org.viewQuadrant')}
      </button>
      <div className="flex items-center gap-2">
        <h2 className={`text-xl font-semibold ${level === 'unrated' ? 'text-ink-900' : level === 'done' ? 'text-success-text' : TONE[level].text}`}>
          {title(level)}
        </h2>
        {level !== 'unrated' && level !== 'done' && <span className="text-sm text-ink-500">{sub(level)}</span>}
        <span className="ml-auto rounded-btn bg-line-soft px-2.5 py-0.5 text-sm font-semibold tabular-nums text-ink-700">
          {t('org.countItems', { count: groups[level].length })}
        </span>
      </div>
      <OwnerFilter options={ownerOptions(rows, today, level)} value={owner} onChange={setOwner} scroll />
      {listed.length === 0
        ? <p className="py-10 text-center text-sm text-ink-500">{t('org.emptyQuadrant')}</p>
        : <ul className="flex flex-col gap-2.5">{listed.map(({ row, leaving: out }) => (out ? leavingCard(row) : mobileCard(row)))}</ul>}
    </div>
  )

  return (
    <DndContext
      id="org-quadrant-dnd"
      sensors={sensors}
      collisionDetection={collision}
      measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragCancel={() => {
        setDragging(null)
        setDropKind(dropAnimationKind('cancel', prefersReducedMotion()))
      }}
      // 触控长按拿起后手指几乎没动就松开 = 取消：放置区可能正好出现在手指下方，原地松手不能算放下。
      // 取消的落放会走 onDragCancel（上面已清掉 dragging）。TouchEvent 在桌面 Safari 上不存在，先判类型。
      cancelDrop={({ activatorEvent, delta }) =>
        isStationaryTouchDrop(typeof TouchEvent !== 'undefined' && activatorEvent instanceof TouchEvent, delta)}
      accessibility={{ announcements, screenReaderInstructions: { draggable: t('org.dragInstructions') } }}
    >
      <div>
        {desktop}
        <div className="md:hidden">{level ? mobileList : mobileHome}</div>
      </div>
      {dragging && <DropDock current={dragging.from} titleOf={title} tone={TONE} />}
      <DragOverlay modifiers={[centerOverlayOnPointer]} dropAnimation={dropAnimationFor(dropKind)}>
        {dragging ? <DragPreview row={dragging.row} ownerLabel={ownerLabel(dragging.row)} centered={dragging.byPointer} /> : null}
      </DragOverlay>
      {selected && (
        <ItemDetailPanel
          row={selected}
          today={today}
          canEdit={snapshot.canEdit}
          positionName={positionName}
          onClose={closePanel}
          onUpdate={(fields) => onUpdateItem(selected.id, fields)}
          onPickOwner={() => onPickOwner(selected.id)}
        />
      )}
      {ask && (
        <DueDatePrompt
          plan={ask}
          onCancel={() => setAsk(null)}
          onConfirm={(patch) => {
            commitDrop(ask.row, ask.target, patch, null)
            setAsk(null)
          }}
        />
      )}
      {/* 拖放结果的唯一播报：常驻的 live region（先在页面上、再放内容，读屏才稳定播报）。每条提示换一个带 key 的
          节点插入，同样文案的两次拖放也各播一次；拖动期间提示条被冻结时内容不变，取消拖动后不会重播旧消息。 */}
      <div role="status" className="sr-only">
        {notice && <span key={notice.key}>{notice.message}</span>}
      </div>
      {/* 拖动中提示条隐藏并冻结计时（它会挡住手机的放置区），取消后按剩余时间继续；放下则被新提示替换。 */}
      {notice && (
        <DropNotice
          key={notice.key}
          message={notice.message}
          canUndo={notice.undo !== null}
          suspended={dragging !== null}
          shortcut={ask === null && selected === null}
          onUndo={onUndo}
          onDismiss={dismissNotice}
        />
      )}
    </DndContext>
  )
}
