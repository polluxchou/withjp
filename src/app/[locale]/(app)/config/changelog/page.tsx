import Header from '@/components/layout/Header'
import { CHANGELOG, type ChangeKind, type DailyChangelog } from '@/lib/changelog/entries'
import { getTranslations } from 'next-intl/server'
import { Sparkles, Bug, Wrench, ShieldCheck, Cog } from 'lucide-react'

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

// Today is also "today" for the user — flag any entry whose date is today so
// the most recent day stands out. We compute in the user's locale calendar
// using the server's clock; close enough for a changelog timeline.
function isoToday(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

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

export default async function ChangelogPage({ params }: { params: { locale: string } }) {
  const t = await getTranslations('config.changelog')
  const today = isoToday()
  const days: DailyChangelog[] = [...CHANGELOG].sort((a, b) => b.date.localeCompare(a.date))

  const totalFeat = days.reduce((n, d) => n + d.items.filter((i) => i.kind === 'feat').length, 0)
  const totalFix  = days.reduce((n, d) => n + d.items.filter((i) => i.kind === 'fix').length, 0)

  return (
    <div>
      <Header title={t('title')} subtitle={t('subtitle')} />

      <div className="flex flex-wrap gap-2 mb-5 text-xs">
        <span className="px-2.5 py-1 rounded-full bg-muted-soft text-muted-text">
          {t('summaryDays', { count: days.length })}
        </span>
        <span className="px-2.5 py-1 rounded-full bg-primary-soft text-primary">
          {t('summaryFeat', { count: totalFeat })}
        </span>
        <span className="px-2.5 py-1 rounded-full bg-danger-soft text-danger-text">
          {t('summaryFix', { count: totalFix })}
        </span>
      </div>

      <div className="space-y-6">
        {days.map((day) => {
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
                    {formatDate(day.date, params.locale)}
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

      <p className="mt-6 text-xs text-ink-400">{t('footer')}</p>
    </div>
  )
}
