// src/components/competitors/live/LiveSessionTable.tsx
'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import Tag from '@/components/ui/Tag'
import { formatCount } from '@/lib/competitors/metrics'
import type { LocatedSpan } from '@/lib/competitors/liveStats'
import { zonedHm, zonedYmd } from '@/lib/time/zonedTime'
import { FOCUS_RING } from '@/lib/ui/recipes'
import { useLiveFormat } from './useLiveFormat'

/** 默认只列这么多场：一屏看得完最近一两周，再多就点开。 */
const DEFAULT_ROWS = 8

/**
 * 场次清单：统计区间内的场次，最近在上。图看规律，这里给每一场的原始时刻作证据。
 * 跨午夜的场次在下播时刻后标 +1；截图推断的场次下播时刻只是最后一张截图的时刻（下限），前面标「约」，
 * 由它推出的时长同样只是下限，时长列也标「约」。
 */
export default function LiveSessionTable({
  sessions,
  timeZone,
}: {
  /** 区间内的场次，已按开播时刻降序。 */
  sessions: LocatedSpan[]
  timeZone: string
}) {
  const t = useTranslations('competitors')
  const fmt = useLiveFormat()
  const [showAll, setShowAll] = useState(false)
  const rows = showAll ? sessions : sessions.slice(0, DEFAULT_ROWS)
  // 表头不折行：整列都是「—」时（只有截图的号的点赞列）列宽只剩一个字符，「点赞」会被挤成两行。
  const th = 'whitespace-nowrap border-b border-line px-3 py-1.5 font-medium'
  const td = 'border-b border-line-soft px-3 py-1.5'

  return (
    <section className="min-w-0 overflow-hidden rounded-field border border-line bg-surface">
      <header className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 px-3 pb-2 pt-3">
        <h3 className="text-sm font-semibold text-ink-900">{t('liveTableTitle')}</h3>
        <span className="text-xs text-ink-500">{t('liveTableHint')}</span>
      </header>

      {sessions.length === 0 ? (
        <p className="px-3 pb-3 text-xs text-ink-500">{t('liveRangeEmpty')}</p>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-xs" aria-label={t('liveTableTitle')}>
              <thead className="text-left text-ink-500">
                <tr>
                  <th scope="col" className={th}>{t('liveImportColDate')}</th>
                  <th scope="col" className={th}>{t('liveImportColTime')}</th>
                  <th scope="col" className={`${th} text-right`}>{t('liveImportColDuration')}</th>
                  <th scope="col" className={`${th} text-right`}>{t('liveImportColLikes')}</th>
                  <th scope="col" className={th}>{t('liveImportColTitle')}</th>
                  <th scope="col" className={th}>{t('liveTableColSource')}</th>
                </tr>
              </thead>
              <tbody className="text-ink-700">
                {rows.map((s) => {
                  // 下播的当地日期晚于开播日就标 +1：时段列只写钟点，不标会被读成当天早上下播。
                  const endDay = zonedYmd(s.endedAt, timeZone)
                  const crossesMidnight = endDay != null && endDay > s.date
                  return (
                    <tr key={s.startedAt}>
                      <td className={`${td} whitespace-nowrap tabular-nums`}>
                        {s.date.slice(5)} <span className="text-ink-400">{fmt.weekday(s.date)}</span>
                      </td>
                      <td className={`${td} whitespace-nowrap tabular-nums`}>
                        {zonedHm(s.startedAt, timeZone)}–{s.approxEnd ? t('liveApproxPrefix') : ''}{zonedHm(s.endedAt, timeZone)}
                        {crossesMidnight && <span className="ml-0.5 text-micro text-primary-hover">+1</span>}
                      </td>
                      <td className={`${td} whitespace-nowrap text-right tabular-nums`}>
                        {s.approxEnd ? t('liveApproxPrefix') : ''}{fmt.duration(s.end - s.start)}
                      </td>
                      <td className={`${td} whitespace-nowrap text-right tabular-nums`}>{formatCount(s.likes)}</td>
                      {/* max-w-0 + w-full：标题列吃掉剩余宽度并截断，不把前几列挤换行。 */}
                      <td className={`${td} w-full max-w-0 truncate text-ink-500`} title={s.title || undefined}>
                        {s.title || '—'}
                      </td>
                      <td className={`${td} whitespace-nowrap`}>
                        {s.source === 'shot' && <Tag label={t('liveSourceShot')} tone="neutral" size="sm" />}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          {sessions.length > DEFAULT_ROWS && (
            <div className="px-3 py-1.5">
              <button
                type="button"
                onClick={() => setShowAll((v) => !v)}
                className={`min-h-8 rounded-field text-xs text-primary hover:text-primary-hover tabular-nums ${FOCUS_RING}`}
              >
                {showAll ? t('liveTableCollapse') : t('liveTableShowAll', { count: sessions.length })}
              </button>
            </div>
          )}
        </>
      )}
    </section>
  )
}
