// src/components/competitors/live/CompetitorLiveView.tsx
'use client'

import { useCallback, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import SegmentedControl from '@/components/ui/SegmentedControl'
// next-intl 的 usePathname / useRouter：路径不带 locale 前缀，replace 时自动补上（同 tasks/page.tsx）。
import { usePathname, useRouter } from '@/i18n/navigation'
import { findCompetitor, flattenAccounts } from '@/lib/competitors/liveBoard'
import { patrolDaysOf } from '@/lib/competitors/liveCoverage'
import { UNDATED_KEY, collectShotDates } from '@/lib/competitors/shotGrid'
import type { CompetitorBoard, CompetitorWithHistory } from '@/lib/competitors/types'
import { zonedYmd } from '@/lib/time/zonedTime'
import LiveCountryMonth from './LiveCountryMonth'
import LiveSessionsModal from './LiveSessionsModal'
import { useRegionZone } from './useRegionZone'

type LiveView = 'month' | 'room' | 'timetable'

/** 分段顺序照评审过的 mock：时段对比 · 国家月历 · 单个直播间。默认视图是国家月历。 */
const VIEWS: LiveView[] = ['timetable', 'month', 'room']
const DEFAULT_VIEW: LiveView = 'month'

const parseView = (raw: string | null): LiveView =>
  (VIEWS as string[]).includes(raw ?? '') ? (raw as LiveView) : DEFAULT_VIEW

/**
 * 「开播时段」页的客户端壳：三个视图的切换、URL 查询参数、开播记录弹窗。
 *
 * 状态全挂在 URL 上（?view=month|room|timetable&country=JP&month=YYYY-MM&acc=<竞品 id>）：
 * 链接发给同事打开就是同一个画面，刷新也不丢。必须从 URL 派生而不是 useState + 初始值——
 * 在本页再点一次侧栏或 tab，URL 变了但组件没卸载，初始值不会重跑（同 tasks/page.tsx 的教训）。
 * 改参数用 router.replace：翻月、换国家不该在浏览器历史里堆一长串，后退一次就该离开本页。
 * 这里只认 view；其余参数原样交给各视图，合不合法、越不越界由视图自己收敛（各视图的范围不同）。
 *
 * 看板数据由服务端页面给初值；弹窗里导入开播记录后在客户端重新取一遍（同 CompetitorDossierView）。
 */
export default function CompetitorLiveView({
  board: initial,
  companyOf,
  today,
}: {
  board: CompetitorBoard
  /** 竞品 id → 公司名（getCompanyOfCompetitor）。 */
  companyOf: Record<string, string>
  /** 页面级「今天」：日区业务日 YYYY-MM-DD，服务端按请求时刻取好（见 page.tsx）。默认月份、可翻范围都按它。 */
  today: string
}) {
  const t = useTranslations('competitors')
  const searchParams = useSearchParams()
  const pathname = usePathname()
  const router = useRouter()
  const [board, setBoard] = useState<CompetitorBoard>(initial)

  const view = parseView(searchParams.get('view'))

  /** 合并改写查询参数（null = 删掉该参数），其余参数原样保留。 */
  const setQuery = useCallback(
    (patch: Record<string, string | null>) => {
      const next = new URLSearchParams(searchParams.toString())
      for (const [key, value] of Object.entries(patch)) {
        if (value == null) next.delete(key)
        else next.set(key, value)
      }
      const qs = next.toString()
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
    },
    [searchParams, pathname, router],
  )

  const accounts = useMemo(() => flattenAccounts(board.competitors, companyOf), [board.competitors, companyOf])
  // 巡检日 = 全库（含子主播）任意截图的 shot_on，与竞品看板同一个来源；判断「无数据」用，口径见 liveCoverage.ts。
  const patrolDays = useMemo(
    () => patrolDaysOf(collectShotDates(board.competitors).filter((d) => d !== UNDATED_KEY)),
    [board.competitors],
  )

  // 重新取一遍看板，失败就抛：弹窗导入后要据此提示「数据可能不是最新」（同 CompetitorDossierView.loadBoard）。
  const loadBoard = useCallback(async () => {
    const res = await fetch('/api/competitors', { cache: 'no-store' })
    if (!res.ok) throw new Error('load failed')
    const json = await res.json()
    if (json.data) setBoard(json.data as CompetitorBoard)
  }, [])

  // 开播记录弹窗：只记 id 与打开那一刻，竞品本身每次渲染从当前看板里找——
  // 导入后看板换成新对象，弹窗里的记录跟着换；号被删了就找不到，弹窗随之关闭。
  const [records, setRecords] = useState<{ id: string; openedAt: number } | null>(null)
  const openRecords = useCallback((id: string) => setRecords({ id, openedAt: Date.now() }), [])
  const recordsOf = records ? findCompetitor(board.competitors, records.id) : null

  return (
    <div className="space-y-4">
      <SegmentedControl
        label={t('liveViewLabel')}
        value={view}
        onChange={(v) => setQuery({ view: v })}
        items={VIEWS.map((v) => ({ value: v, label: t(`liveView.${v}`) }))}
      />

      {view === 'month' ? (
        <LiveCountryMonth
          accounts={accounts}
          patrolDays={patrolDays}
          today={today}
          country={searchParams.get('country')}
          month={searchParams.get('month')}
          onCountryChange={(code) => setQuery({ country: code })}
          onMonthChange={(month) => setQuery({ month })}
          onOpenRecords={openRecords}
        />
      ) : (
        <p className="rounded-card border border-line bg-surface p-6 text-sm text-ink-500">{t('liveViewPending')}</p>
      )}

      {records && recordsOf && (
        <PageRecordsModal
          competitor={recordsOf}
          openedAt={records.openedAt}
          canEdit={board.canEdit}
          patrolDays={patrolDays}
          onClose={() => setRecords(null)}
          onChanged={loadBoard}
        />
      )}
    </div>
  )
}

/**
 * 弹窗的「今天」按账号地区时区、取点开那一刻：弹窗里的近 30 天与卡片上一样按对方当地日期算。
 * 拆成子组件是为了用 useRegionZone（Hook 不能在点击回调里调），与弹窗内部的时区推导同一份。
 */
function PageRecordsModal({
  competitor,
  openedAt,
  canEdit,
  patrolDays,
  onClose,
  onChanged,
}: {
  competitor: CompetitorWithHistory
  openedAt: number
  canEdit: boolean
  patrolDays: ReadonlySet<string>
  onClose: () => void
  onChanged: () => Promise<void>
}) {
  const { timeZone } = useRegionZone(competitor.region)
  // openedAt 是合法时刻，zonedYmd 不会返回 null。
  const today = zonedYmd(openedAt, timeZone) as string
  return (
    <LiveSessionsModal
      competitor={competitor}
      canEdit={canEdit}
      today={today}
      patrolDays={patrolDays}
      initialView="records"
      onClose={onClose}
      onChanged={onChanged}
    />
  )
}
