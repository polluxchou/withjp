// src/components/competitors/live/LiveSessionsModal.tsx
'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { ChevronLeft } from 'lucide-react'
import Modal from '@/components/ui/Modal'
import { LiveImportPanel } from '../LiveSessionImport'
import { accountSpans } from '@/lib/competitors/liveBoard'
import type { CompetitorWithHistory } from '@/lib/competitors/types'
import { FOCUS_RING } from '@/lib/ui/recipes'
import LiveRecordsPanel from './LiveRecordsPanel'
import { useRegionZone } from './useRegionZone'

/**
 * 单个竞品的开播记录弹窗：记录视图（指标 / 日历 / 时段分布 / 点赞 / 清单）与粘贴导入视图共用一个弹窗。
 *
 * 导入并进来而不是另开一个弹窗：导完要立刻看到新数据落在哪儿，所以导入成功只切回记录视图、不关弹窗；
 * 卡片重新取数后 competitor 换成新对象，记录视图跟着重算。
 * 因此要等重新取数结束再切回去，否则一落地看到的还是导入前的旧数据；取数失败也照样切回去，
 * 但在记录视图顶部明说「数据可能不是最新」，不让旧数据悄悄冒充新的。
 */
export default function LiveSessionsModal({
  competitor,
  canEdit,
  today,
  patrolDays,
  initialView,
  onClose,
  onChanged,
}: {
  competitor: CompetitorWithHistory
  canEdit: boolean
  /**
   * 账号地区时区的今天（YYYY-MM-DD），由卡片取好传进来：卡片上「近 30 天 N 场」与弹窗的场次
   * 必须按同一天算，弹窗不再自己读一次时钟。开着弹窗跨过午夜也不跳。
   */
  today: string
  /** 巡检日（全库截图的 shot_on），判断「无数据」用，见 liveCoverage.ts。 */
  patrolDays: ReadonlySet<string>
  initialView: 'records' | 'import'
  onClose: () => void
  /** 导入成功后重新取数；返回的 Promise 结束（或 reject）前弹窗留在导入视图。 */
  onChanged: () => void | Promise<void>
}) {
  const t = useTranslations('competitors')
  // 没有编辑权限就没有导入视图，哪怕调用方传了 import。
  const [view, setView] = useState<'records' | 'import'>(canEdit ? initialView : 'records')
  // 导入成功后的刷新：进行中 / 失败（失败时记录视图顶部提示数据可能是旧的）。
  const [refreshing, setRefreshing] = useState(false)
  const [refreshFailed, setRefreshFailed] = useState(false)

  // 竞品的开播时刻按账号所在地区的时区显示，地区没填才回落到界面语言时区；口径见 useRegionZone。
  const { timeZone, zoneLabel } = useRegionZone(competitor.region)

  const spans = useMemo(() => accountSpans(competitor), [competitor])

  // 切换视图会卸载刚点的那颗按钮，焦点掉回 <body>，跑出弹窗的 Tab 圈定范围。
  // 切换后把焦点放进新视图：导入视图给输入框，记录视图给第一颗按钮（统计范围）。
  // 只在视图真的变了时才挪（比对上一次的视图）：首次挂载由 Modal 自己把焦点放到面板上。
  const bodyRef = useRef<HTMLDivElement>(null)
  const shownView = useRef(view)
  useEffect(() => {
    if (shownView.current === view) return
    shownView.current = view
    bodyRef.current?.querySelector<HTMLElement>(view === 'import' ? 'textarea' : 'button')?.focus()
  }, [view])

  // 不往外抛：LiveImportPanel 把 onImported 的异常当「导入失败」报，而此时导入已经成功。
  const afterImport = async () => {
    setRefreshing(true)
    setRefreshFailed(false)
    let failed = false
    try {
      await onChanged()
    } catch {
      failed = true
    }
    setRefreshing(false)
    setRefreshFailed(failed)
    setView('records')
  }

  const name = competitor.latest?.display_name ?? competitor.display_name ?? competitor.handle

  return (
    <Modal
      open
      onClose={onClose}
      title={view === 'import' ? t('liveImportTitle', { name }) : t('liveRecordsTitle', { name })}
      width="max-w-5xl"
    >
      <div ref={bodyRef}>
        {refreshing && (
          <p role="status" className="mb-3 text-xs text-ink-500">{t('liveRefreshing')}</p>
        )}
        {refreshFailed && !refreshing && view === 'records' && (
          <p role="alert" className="mb-3 text-xs text-danger-text">{t('liveRefreshFailed')}</p>
        )}
        {view === 'import' ? (
          <div className="space-y-3">
            <button
              type="button"
              onClick={() => setView('records')}
              className={`-ml-1 inline-flex min-h-8 items-center gap-0.5 rounded-field pr-2 text-xs text-ink-500 hover:text-ink-700 ${FOCUS_RING}`}
            >
              <ChevronLeft size={16} strokeWidth={1.5} aria-hidden />
              {t('liveRecordsBack')}
            </button>
            <LiveImportPanel
              competitorId={competitor.id}
              existing={competitor.live_sessions}
              onImported={afterImport}
              // 一场都没有时回记录视图也是空的，取消就直接关掉。
              onCancel={() => (spans.length > 0 ? setView('records') : onClose())}
            />
          </div>
        ) : (
          <LiveRecordsPanel
            spans={spans}
            timeZone={timeZone}
            zoneLabel={zoneLabel}
            today={today}
            patrolDays={patrolDays}
            canEdit={canEdit}
            onImport={() => setView('import')}
          />
        )}
      </div>
    </Modal>
  )
}
