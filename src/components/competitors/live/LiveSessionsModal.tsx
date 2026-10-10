// src/components/competitors/live/LiveSessionsModal.tsx
'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { ChevronLeft } from 'lucide-react'
import Modal from '@/components/ui/Modal'
import { LiveImportPanel } from '../LiveSessionImport'
import { liveSpansOf, regionTimeZone } from '@/lib/competitors/liveSessions'
import { normalizeRegion } from '@/lib/competitors/regions'
import type { CompetitorWithHistory } from '@/lib/competitors/types'
import { timeZoneForLocale } from '@/lib/time/localeZone'
import { zonedYmd } from '@/lib/time/zonedTime'
import { FOCUS_RING } from '@/lib/ui/recipes'
import LiveRecordsPanel from './LiveRecordsPanel'

/**
 * 单个竞品的开播记录弹窗：记录视图（指标 / 日历 / 时段分布 / 点赞 / 清单）与粘贴导入视图共用一个弹窗。
 *
 * 导入并进来而不是另开一个弹窗：导完要立刻看到新数据落在哪儿，所以导入成功只切回记录视图、不关弹窗；
 * 卡片重新取数后 competitor 换成新对象，记录视图跟着重算。
 */
export default function LiveSessionsModal({
  competitor,
  canEdit,
  initialView,
  onClose,
  onChanged,
}: {
  competitor: CompetitorWithHistory
  canEdit: boolean
  initialView: 'records' | 'import'
  onClose: () => void
  onChanged: () => void
}) {
  const t = useTranslations('competitors')
  const locale = useLocale()
  // 没有编辑权限就没有导入视图，哪怕调用方传了 import。
  const [view, setView] = useState<'records' | 'import'>(canEdit ? initialView : 'records')

  // 竞品的开播时刻按账号所在地区的时区显示（看的是对方当地作息，三地同事读到同一个数）；
  // 地区没填才回落到界面语言时区。时区名只在地区在清单里时才有，宁可不写也不写错。
  const timeZone = regionTimeZone(competitor.region, timeZoneForLocale(locale))
  const zoneCode = normalizeRegion(competitor.region)
  const zoneLabel = zoneCode ? t(`zoneName.${zoneCode}`) : null

  // 「今天」读时钟：只在弹窗挂载时取一次（弹窗只在点击后挂载，不进服务端渲染）。
  // 开着弹窗跨过午夜也不跳，免得看着看着「近 30 天」的数自己变了。
  const [today] = useState(() => zonedYmd(Date.now(), timeZone) ?? '')

  const spans = useMemo(() => liveSpansOf(competitor), [competitor])

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

  const name = competitor.latest?.display_name ?? competitor.display_name ?? competitor.handle

  return (
    <Modal
      open
      onClose={onClose}
      title={view === 'import' ? t('liveImportTitle', { name }) : t('liveRecordsTitle', { name })}
      width="max-w-5xl"
    >
      <div ref={bodyRef}>
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
              onImported={() => {
                onChanged()
                setView('records')
              }}
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
            canEdit={canEdit}
            onImport={() => setView('import')}
          />
        )}
      </div>
    </Modal>
  )
}
