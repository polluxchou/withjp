// src/components/competitors/live/LiveSummaries.tsx
'use client'

import { useId, useMemo, useRef } from 'react'
import { useTranslations } from 'next-intl'
import { FileText } from 'lucide-react'
import EmptyState from '@/components/ui/EmptyState'
import ErrorState from '@/components/ui/ErrorState'
import { pickSummary, sortSummaries, type LiveSummary } from '@/lib/competitors/liveSummaries'
import { parseMarkdown } from '@/lib/markdown/miniMarkdown'
import MarkdownBlocks from './MarkdownBlocks'
import { useLiveFormat } from './useLiveFormat'

/**
 * 来源小标签：自动 = 主色，手写 = 中性。
 * onSoft：放在选中项的主色浅底上时改用白底，否则浅紫叠浅紫看不出标签的边。
 */
function SourceChip({ source, onSoft = false, size = 'list' }: { source: LiveSummary['source']; onSoft?: boolean; size?: 'list' | 'header' }) {
  const t = useTranslations('competitors')
  const tone =
    source === 'auto'
      ? `${onSoft ? 'bg-surface' : 'bg-primary-soft'} text-primary-hover`
      : `${onSoft ? 'bg-surface' : 'bg-muted-soft'} text-muted-text`
  const pad = size === 'header' ? 'px-2 py-px' : 'px-1.5'
  return (
    <span className={`shrink-0 whitespace-nowrap rounded-btn text-micro leading-4 ${pad} ${tone}`}>
      {source === 'auto' ? t('liveSummarySourceAuto') : t('liveSummarySourceManual')}
    </span>
  )
}

/**
 * 「趋势总结」视图：左边按生成日期列出全部总结（最新在上），右边是选中那份的正文。
 * 宽屏左栏吸顶、栏内可滚；窄屏列表叠在正文上面、不吸顶（限高免得几十份总结把正文挤到很下面）。
 *
 * 选中哪份挂在 URL 上（?view=summary&day=YYYY-MM-DD），链接发给同事就是同一份；
 * 同一天另有手写那份时再带 sid=<id> 区分（取舍见 liveSummaries.pickSummary）。
 * 切换只改地址栏（父组件的 setQuery → replaceState），不回服务端：全部正文已随页面下发。
 *
 * summaries 为 null = 读库失败：只这个视图报错，另外三个视图不依赖它、照常可用。
 */
export default function LiveSummaries({
  summaries,
  day,
  sid,
  onPick,
}: {
  summaries: LiveSummary[] | null
  /** URL 上的原始值，可能缺失、写坏或已被删，由 pickSummary 收敛。 */
  day: string | null
  sid: string | null
  /** 选中一份：id 只在那天有不止一份时给，否则为 null（URL 上不写 sid）。 */
  onPick: (day: string, id: string | null) => void
}) {
  const t = useTranslations('competitors')
  const fmt = useLiveFormat()
  const captionId = useId()
  const articleRef = useRef<HTMLElement>(null)

  const sorted = useMemo(() => (summaries ? sortSummaries(summaries) : []), [summaries])
  const perDay = useMemo(() => {
    const counts = new Map<string, number>()
    for (const s of sorted) counts.set(s.generated_on, (counts.get(s.generated_on) ?? 0) + 1)
    return counts
  }, [sorted])
  const selected = pickSummary(sorted, day, sid)
  // pickSummary 返回的是 sorted 里的同一个对象，选中不变时引用不变，正文不会每次渲染重解析。
  const blocks = useMemo(() => (selected ? parseMarkdown(selected.body) : []), [selected])

  if (!summaries) return <ErrorState />
  if (!selected) {
    return <EmptyState icon={<FileText strokeWidth={1.5} />} title={t('liveSummaryEmpty')} hint={t('liveSummaryEmptyHint')} />
  }

  const pick = (s: LiveSummary) => {
    onPick(s.generated_on, (perDay.get(s.generated_on) ?? 0) > 1 ? s.id : null)
    // 宽屏左栏吸顶：读到长文中段再点另一份时，把正文的开头带回视口，不然新的一份是从半截开始看。
    const top = articleRef.current?.getBoundingClientRect().top
    if (top != null && top < 0) window.scrollBy({ top: top - 16 })
  }

  const titleOf = (s: LiveSummary) => s.title || t('liveSummaryUntitled')

  return (
    <div className="grid items-start gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
      <aside
        aria-labelledby={captionId}
        className="flex max-h-80 flex-col gap-1 overflow-y-auto rounded-card border border-line bg-surface p-2 scrollbar-thin lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)]"
      >
        <div id={captionId} className="px-2.5 pb-1 pt-1.5 text-xs text-ink-500">
          {t('liveSummaryListCaption')}
        </div>
        <ul className="flex flex-col gap-1">
          {sorted.map((s) => {
            const active = s.id === selected.id
            return (
              <li key={s.id}>
                {/* 栏是滚动容器，焦点环用内嵌那一款（recipes.ts 注释的第二配方），外扩会被裁掉。 */}
                <button
                  type="button"
                  aria-current={active ? 'true' : undefined}
                  data-summary-day={s.generated_on}
                  onClick={() => pick(s)}
                  className={`flex w-full flex-col gap-0.5 rounded-field px-3 py-2.5 text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary-ring ${
                    active ? 'bg-primary-soft' : 'hover:bg-row-hover'
                  }`}
                >
                  <span className="flex w-full items-baseline gap-1.5">
                    <strong className="text-md font-semibold text-ink-900 tabular-nums">{s.generated_on}</strong>
                    <span className="text-xs text-ink-500">{fmt.weekday(s.generated_on)}</span>
                    <span className="ml-auto">
                      <SourceChip source={s.source} onSoft={active} />
                    </span>
                  </span>
                  <span className={`text-sm font-medium ${active ? 'text-primary-hover' : 'text-ink-900'}`}>{titleOf(s)}</span>
                  {s.subtitle && <span className="text-micro text-ink-500 tabular-nums">{s.subtitle}</span>}
                </button>
              </li>
            )
          })}
        </ul>
      </aside>

      <article
        ref={articleRef}
        data-summary-id={selected.id}
        className="min-w-0 rounded-card border border-line bg-surface p-4 sm:px-7 sm:pb-7 sm:pt-6"
      >
        <header className="mb-[18px] flex flex-wrap items-center gap-2 border-b border-line pb-3.5">
          <h2 className="text-[18px] font-semibold leading-snug text-ink-900">{titleOf(selected)}</h2>
          <span className="text-xs text-ink-500 tabular-nums">
            {t('liveSummaryGenerated', { date: selected.generated_on, weekday: fmt.weekday(selected.generated_on) })}
          </span>
          <SourceChip source={selected.source} size="header" />
        </header>
        <MarkdownBlocks blocks={blocks} />
      </article>
    </div>
  )
}
