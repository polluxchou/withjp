// src/components/competitors/LiveSessionImport.tsx
'use client'

import { useMemo, useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import Button from '@/components/ui/Button'
import { Field, Select, Textarea } from '@/components/ui/Field'
import { diffAgainstExisting, parseLiveHistory } from '@/lib/competitors/liveHistory'
import { formatCount } from '@/lib/competitors/metrics'
import type { CompetitorLiveSession } from '@/lib/competitors/types'
import { timeZoneForLocale } from '@/lib/time/localeZone'
import { zonedHm, zonedYmd } from '@/lib/time/zonedTime'
import { FOCUS_RING } from '@/lib/ui/recipes'

/** 本机时区之外再给几个常用的：日区团播、国内、北美两岸。 */
const ZONE_PRESETS = ['Asia/Tokyo', 'Asia/Shanghai', 'America/Los_Angeles', 'America/New_York']

/** 浏览器所在时区。极老的环境可能拿不到，回落到调用方给的时区。 */
function browserTimeZone(fallback: string): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || fallback
  } catch {
    return fallback
  }
}

/**
 * 竞品卡展开区的「开播记录」一行：摘要 + 入口。
 *
 * 摘要与弹窗吃同一份场次（导入 ∪ 截图推断，见 lib/competitors/liveSessions.ts），
 * 所以只有截图、没导入过的号这里也有数。弹窗本身挂在卡片上：指标行的「近 30 天 N 场」
 * 和这一行是同一个弹窗的两个入口，状态只能有一份。
 */
export default function LiveSessionsRow({
  count,
  from,
  to,
  canEdit,
  onOpen,
}: {
  /** 合并后的场次数（含截图推断）。 */
  count: number
  /** 最早一场的当地日期 MM-DD（账号地区时区）。count 为 0 时不读。 */
  from: string
  /** 最近一场的当地日期 MM-DD。 */
  to: string
  canEdit: boolean
  onOpen: (view: 'records' | 'import') => void
}) {
  const t = useTranslations('competitors')
  return (
    <div className="flex items-center gap-2">
      <span className="w-16 shrink-0 text-ink-500">{t('fieldLiveSessions')}</span>
      <span className="text-ink-700 tabular-nums">
        {count > 0 ? t('liveSessionsValue', { count, from, to }) : t('liveSessionsEmpty')}
      </span>
      {count > 0 ? (
        <button
          type="button"
          onClick={() => onOpen('records')}
          className={`rounded-field text-primary hover:text-primary-hover ${FOCUS_RING}`}
        >
          {t('liveRecordsView')}
        </button>
      ) : canEdit ? (
        // 一场都没有时，记录视图里没东西可看，直接进导入视图。
        <button
          type="button"
          onClick={() => onOpen('import')}
          className={`rounded-field text-primary hover:text-primary-hover ${FOCUS_RING}`}
        >
          {t('liveImportOpen')}
        </button>
      ) : null}
    </div>
  )
}

/**
 * 粘贴导入的正文 + 操作按钮行。不自己套 Modal：它是开播记录弹窗里的一个视图，
 * 导入成功后由弹窗切回记录视图（不关弹窗），取消也交给弹窗决定回哪儿。
 */
export function LiveImportPanel({
  competitorId,
  existing,
  onImported,
  onCancel,
}: {
  competitorId: string
  existing: CompetitorLiveSession[]
  /** 导入成功后调用；返回 Promise 时等它结束再放开「导入」按钮（弹窗在这段时间里刷新数据）。 */
  onImported: () => void | Promise<void>
  onCancel: () => void
}) {
  const t = useTranslations('competitors')
  const tCommon = useTranslations('common')
  const locale = useLocale()

  // 解析时区默认取浏览器时区，而站内展示按账号所在地区的时区 —— 两者不矛盾：
  // 展示是「谁看都是同一个数字」，这里是还原原始数据。TikTok 网页按浏览器
  // 本地时区渲染 History 里的时刻，粘贴原文的人在哪台电脑上复制，原文就是哪个时区的
  // 墙上时间；按任何别的时区去读，北美同事贴进来的每一场都会错开十五六个小时。
  // 只在面板挂载时取一次（它只在弹窗切到导入视图后才挂载），不进服务端渲染。
  const [localZone] = useState(() => browserTimeZone(timeZoneForLocale(locale)))
  const [zone, setZone] = useState(localZone)
  const [text, setText] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const zoneOptions = useMemo(() => Array.from(new Set([localZone, ...ZONE_PRESETS])), [localZone])

  // 预览与提交共用同一份解析结果：预览里看到的就是将要入库的。
  // 「今天」取解析时区的今天（年份推断以它为锚），读时钟所以只在客户端这里取。
  const parsed = useMemo(() => {
    if (!text.trim()) return null
    const today = zonedYmd(Date.now(), zone)
    return today ? parseLiveHistory(text, { timeZone: zone, today }) : null
  }, [text, zone])
  const diff = useMemo(
    () => (parsed ? diffAgainstExisting(parsed.sessions, existing) : null),
    [parsed, existing],
  )

  const weekdayFmt = useMemo(
    // local_date 是日历日，按 UTC 零点取星期，避免再被任何时区挪一天。
    () => new Intl.DateTimeFormat(locale, { weekday: 'short', timeZone: 'UTC' }),
    [locale],
  )

  const count = parsed?.sessions.length ?? 0
  const dates = parsed?.sessions.map((s) => s.local_date).sort() ?? []

  const submit = async () => {
    if (!parsed || count === 0) return
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch(`/api/competitors/${competitorId}/live-sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessions: parsed.sessions.map(({ started_at, ended_at, title, likes }) => ({ started_at, ended_at, title, likes })),
        }),
      })
      const json = (await res.json().catch(() => null)) as { error?: string | null } | null
      if (!res.ok || json?.error) {
        // 服务端的校验信息是英文技术描述，原样带上：比一句「失败」更能看出是哪一行出的问题。
        setError(json?.error ? t('liveImportFailedDetail', { message: json.error }) : t('liveImportFailed'))
        return
      }
      await onImported()
    } catch {
      setError(t('liveImportFailed'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-3">
      <Field label={t('liveImportTextLabel')}>
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={t('liveImportPlaceholder')}
          rows={8}
          spellCheck={false}
          className="text-xs"
        />
      </Field>
      <div className="max-w-xs">
        <Field label={t('liveImportZoneLabel')} hint={t('liveImportZoneHint')}>
          <Select size="sm" value={zone} onChange={(e) => setZone(e.target.value)}>
            {zoneOptions.map((z) => (
              <option key={z} value={z}>{z === localZone ? t('liveImportZoneLocal', { zone: z }) : z}</option>
            ))}
          </Select>
        </Field>
      </div>

      {parsed && diff && (
        <section aria-live="polite" className="space-y-2 text-xs">
          <p className="font-medium text-ink-700 tabular-nums">
            {count > 0
              ? t('liveImportSummary', {
                  count, from: dates[0], to: dates[dates.length - 1], added: diff.added, updated: diff.updated,
                })
              : t('liveImportNone')}
          </p>

          {parsed.issues.length > 0 && (
            <div className="rounded-field bg-warning-soft px-3 py-2 text-warning-text">
              <p className="font-medium">{t('liveImportIssuesTitle', { count: parsed.issues.length })}</p>
              <ul className="mt-1 max-h-32 space-y-0.5 overflow-y-auto">
                {parsed.issues.map((issue, i) => (
                  <li key={`${issue.line}-${i}`} className="flex gap-2">
                    <span className="shrink-0 tabular-nums">{t('liveImportIssueLine', { line: issue.line })}</span>
                    <span className="min-w-0 truncate" title={issue.text}>{issue.text}</span>
                    <span className="shrink-0">· {t(`liveImportIssue.${issue.reason}`)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {count > 0 && (
            // 预览表的时刻按**解析时区**显示，与贴进来的原文逐字对得上，方便人工核对；
            // 入库后在卡片与开播记录弹窗里才换算成账号所在地区的时区。
            <div className="max-h-72 overflow-y-auto rounded-field border border-line-soft">
              <table className="w-full" aria-label={t('liveImportPreview')}>
                <thead className="sticky top-0 bg-surface text-ink-400">
                  <tr>
                    <th className="px-2 py-1 text-left font-normal">{t('liveImportColDate')}</th>
                    <th className="px-2 py-1 text-left font-normal">{t('liveImportColTime')}</th>
                    <th className="px-2 py-1 text-right font-normal">{t('liveImportColDuration')}</th>
                    <th className="px-2 py-1 text-right font-normal">{t('liveImportColLikes')}</th>
                    <th className="px-2 py-1 text-left font-normal">{t('liveImportColTitle')}</th>
                  </tr>
                </thead>
                <tbody>
                  {parsed.sessions.map((s) => {
                    const minutes = Math.round((Date.parse(s.ended_at) - Date.parse(s.started_at)) / 60_000)
                    const crossesMidnight = zonedYmd(s.ended_at, zone) !== s.local_date
                    return (
                      <tr key={s.started_at} className="border-t border-line-soft">
                        <td className="whitespace-nowrap px-2 py-1 text-ink-700 tabular-nums">
                          {s.local_date}{' '}
                          <span className="text-ink-400">{weekdayFmt.format(new Date(`${s.local_date}T00:00:00Z`))}</span>
                        </td>
                        <td className="whitespace-nowrap px-2 py-1 text-ink-700 tabular-nums">
                          {zonedHm(s.started_at, zone)}–{zonedHm(s.ended_at, zone)}
                          {crossesMidnight && <span className="ml-0.5 text-ink-400">+1</span>}
                        </td>
                        <td className="whitespace-nowrap px-2 py-1 text-right text-ink-700 tabular-nums">
                          {/* 不满一小时只报分钟：「0时49分」读起来像漏了什么。 */}
                          {minutes < 60
                            ? t('liveImportDurationMin', { m: minutes })
                            : t('liveImportDuration', { h: Math.floor(minutes / 60), m: minutes % 60 })}
                        </td>
                        <td
                          className="whitespace-nowrap px-2 py-1 text-right font-medium text-ink-900 tabular-nums"
                          title={s.likes_text ?? undefined}
                        >
                          {formatCount(s.likes)}
                        </td>
                        {/* max-w-0 + w-full：标题列吃掉剩余宽度并截断，不把前四列挤换行。 */}
                        <td className="w-full max-w-0 truncate px-2 py-1 text-ink-700" title={s.title}>
                          {s.title || <span className="text-ink-400">—</span>}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {/* 操作行紧跟在预览表后面（预览表自带 max-h 滚动，不会把它推出视野）；
          错误提示贴着「导入」按钮，点完就在眼前。 */}
      <div className="flex items-center justify-end gap-2 border-t border-line-soft pt-3">
        {error && <p role="alert" className="mr-auto min-w-0 text-xs text-danger-text">{error}</p>}
        <Button variant="ghost" onClick={onCancel}>{tCommon('cancel')}</Button>
        <Button onClick={submit} loading={submitting} disabled={count === 0}>
          {t('liveImportSubmit', { count })}
        </Button>
      </div>
    </div>
  )
}
