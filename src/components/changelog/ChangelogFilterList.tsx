'use client'

import { useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Sparkles, Bug, Wrench, ShieldCheck, Cog, Search } from 'lucide-react'
import type { ChangeKind, DailyChangelog } from '@/lib/changelog/entries'

// kind → tone 三件套（design-system §1.3）：rose/amber/emerald/violet-100 是
// check-style-tokens.mjs 门禁盲区（只禁 slate/indigo/zinc/gray/stone/neutral
// 数字阶灰，不禁其余颜色族），但仍属离系裸色，统一走语义 token。
const KIND_STYLES: Record<ChangeKind, { bg: string; text: string; ring: string; Icon: typeof Sparkles }> = {
  feat:     { bg: 'bg-primary-soft', text: 'text-primary',      ring: 'ring-primary-border', Icon: Sparkles },
  fix:      { bg: 'bg-danger-soft',  text: 'text-danger-text',  ring: 'ring-danger-border',  Icon: Bug },
  improve:  { bg: 'bg-warning-soft', text: 'text-warning-text', ring: 'ring-warning-border', Icon: Wrench },
  security: { bg: 'bg-success-soft', text: 'text-success-text', ring: 'ring-success-border', Icon: ShieldCheck },
  infra:    { bg: 'bg-muted-soft',   text: 'text-muted-text',   ring: 'ring-line-strong',    Icon: Cog },
}

const ALL_KINDS: ChangeKind[] = ['feat', 'fix', 'improve', 'security', 'infra']

function formatDate(iso: string, locale: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  if (!y || !m || !d) return iso
  const date = new Date(Date.UTC(y, m - 1, d))
  try {
    return new Intl.DateTimeFormat(locale, {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      weekday: 'short',
      timeZone: 'UTC',
    }).format(date)
  } catch {
    return iso
  }
}

export default function ChangelogFilterList({
  days,
  locale,
  today,
}: {
  days: DailyChangelog[]
  locale: string
  today: string
}) {
  const t = useTranslations('config.changelog')
  const [activeKinds, setActiveKinds] = useState<Set<ChangeKind>>(new Set(ALL_KINDS))
  const [query, setQuery] = useState('')

  const allSelected = activeKinds.size === ALL_KINDS.length

  function toggleKind(kind: ChangeKind) {
    setActiveKinds((prev) => {
      const next = new Set(prev)
      if (next.has(kind)) next.delete(kind)
      else next.add(kind)
      return next.size === 0 ? new Set(ALL_KINDS) : next
    })
  }

  const normalizedQuery = query.trim().toLowerCase()

  const filteredDays = useMemo(() => {
    return days
      .map((day) => ({
        ...day,
        items: day.items.filter((item) => {
          if (!activeKinds.has(item.kind)) return false
          if (!normalizedQuery) return true
          const haystack = `${item.title} ${item.details ?? ''} ${item.scope ?? ''}`.toLowerCase()
          return haystack.includes(normalizedQuery)
        }),
      }))
      .filter((day) => day.items.length > 0)
  }, [days, activeKinds, normalizedQuery])

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 mb-5">
        <button
          type="button"
          onClick={() => setActiveKinds(new Set(ALL_KINDS))}
          className={`px-3 py-1.5 rounded-full text-xs font-medium ring-1 transition-colors ${
            allSelected
              ? 'bg-ink-900 text-white ring-ink-900'
              : 'bg-surface text-ink-500 ring-line hover:ring-line-strong'
          }`}
        >
          {t('filterAll')}
        </button>
        {ALL_KINDS.map((kind) => {
          const style = KIND_STYLES[kind]
          const Icon = style.Icon
          const active = activeKinds.has(kind)
          return (
            <button
              key={kind}
              type="button"
              onClick={() => toggleKind(kind)}
              className={`flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium ring-1 transition-colors ${
                active ? `${style.bg} ${style.text} ${style.ring}` : 'bg-surface text-ink-400 ring-line hover:ring-line-strong'
              }`}
            >
              <Icon className="w-3 h-3" />
              {t(`kinds.${kind}`)}
            </button>
          )
        })}

        <div className="relative w-full sm:w-64 sm:ml-auto">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-400 pointer-events-none" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('searchPlaceholder')}
            className="w-full pl-8 pr-3 py-1.5 rounded-full text-xs bg-surface ring-1 ring-line placeholder:text-ink-400 focus:outline-none focus:ring-line-strong"
          />
        </div>
      </div>

      {filteredDays.length === 0 ? (
        <p className="py-10 text-center text-sm text-ink-400">{t('noResults')}</p>
      ) : (
        <div className="space-y-6">
          {filteredDays.map((day) => {
            const isToday = day.date === today
            return (
              <section
                key={day.date}
                className="bg-surface border border-line rounded-card overflow-hidden"
              >
                <header className="flex items-center justify-between gap-3 px-5 py-3 border-b border-line-soft">
                  <div className="flex items-center gap-2 min-w-0">
                    <time
                      dateTime={day.date}
                      className="font-semibold text-sm text-ink-900 whitespace-nowrap"
                    >
                      {formatDate(day.date, locale)}
                    </time>
                    {isToday && (
                      <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-primary text-white">
                        {t('today')}
                      </span>
                    )}
                    {day.version && (
                      <code className="text-xs bg-muted-soft text-ink-500 px-1.5 py-0.5 rounded">
                        v{day.version}
                      </code>
                    )}
                  </div>
                  <span className="text-xs text-ink-400 whitespace-nowrap">
                    {t('itemCount', { count: day.items.length })}
                  </span>
                </header>

                <ul className="divide-y divide-line-soft">
                  {day.items.map((item, idx) => {
                    const style = KIND_STYLES[item.kind]
                    const Icon = style.Icon
                    return (
                      <li key={idx} className="px-5 py-3 flex items-start gap-3">
                        <span
                          className={`flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium ring-1 ${style.bg} ${style.text} ${style.ring} flex-shrink-0`}
                          title={t(`kinds.${item.kind}`)}
                        >
                          <Icon className="w-3 h-3" />
                          {t(`kinds.${item.kind}`)}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-baseline gap-2 flex-wrap">
                            {item.scope && (
                              <span className="text-xs text-ink-400">{item.scope}</span>
                            )}
                            <span className="text-sm text-ink-900">{item.title}</span>
                          </div>
                          {item.details && (
                            <p className="text-xs text-ink-500 mt-1 leading-relaxed">
                              {item.details}
                            </p>
                          )}
                        </div>
                      </li>
                    )
                  })}
                </ul>
              </section>
            )
          })}
        </div>
      )}
    </div>
  )
}
