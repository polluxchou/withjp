import Header from '@/components/layout/Header'
import { CHANGELOG, type ChangeKind, type DailyChangelog } from '@/lib/changelog/entries'
import { getTranslations } from 'next-intl/server'
import { Sparkles, Bug, Wrench, ShieldCheck, Cog } from 'lucide-react'

const KIND_STYLES: Record<ChangeKind, { bg: string; text: string; ring: string; Icon: typeof Sparkles }> = {
  feat:     { bg: 'bg-indigo-50',  text: 'text-indigo-700',  ring: 'ring-indigo-100',  Icon: Sparkles },
  fix:      { bg: 'bg-rose-50',    text: 'text-rose-700',    ring: 'ring-rose-100',    Icon: Bug },
  improve:  { bg: 'bg-amber-50',   text: 'text-amber-700',   ring: 'ring-amber-100',   Icon: Wrench },
  security: { bg: 'bg-emerald-50', text: 'text-emerald-700', ring: 'ring-emerald-100', Icon: ShieldCheck },
  infra:    { bg: 'bg-slate-100',  text: 'text-slate-700',   ring: 'ring-slate-200',   Icon: Cog },
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
        <span className="px-2.5 py-1 rounded-full bg-slate-100 text-slate-600">
          {t('summaryDays', { count: days.length })}
        </span>
        <span className="px-2.5 py-1 rounded-full bg-indigo-50 text-indigo-700">
          {t('summaryFeat', { count: totalFeat })}
        </span>
        <span className="px-2.5 py-1 rounded-full bg-rose-50 text-rose-700">
          {t('summaryFix', { count: totalFix })}
        </span>
      </div>

      <div className="space-y-6">
        {days.map((day) => {
          const isToday = day.date === today
          return (
            <section
              key={day.date}
              className="bg-white border border-slate-200 rounded-xl overflow-hidden"
            >
              <header className="flex items-center justify-between gap-3 px-5 py-3 border-b border-slate-100 bg-slate-50/60">
                <div className="flex items-center gap-2 min-w-0">
                  <time
                    dateTime={day.date}
                    className="font-semibold text-sm text-slate-900 whitespace-nowrap"
                  >
                    {formatDate(day.date, params.locale)}
                  </time>
                  {isToday && (
                    <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-indigo-600 text-white">
                      {t('today')}
                    </span>
                  )}
                  {day.version && (
                    <code className="text-xs bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded">
                      v{day.version}
                    </code>
                  )}
                </div>
                <span className="text-xs text-slate-400 whitespace-nowrap">
                  {t('itemCount', { count: day.items.length })}
                </span>
              </header>

              <ul className="divide-y divide-slate-100">
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
                            <span className="text-xs text-slate-400">{item.scope}</span>
                          )}
                          <span className="text-sm text-slate-900">{item.title}</span>
                        </div>
                        {item.details && (
                          <p className="text-xs text-slate-500 mt-1 leading-relaxed">
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

      <p className="mt-6 text-xs text-slate-400">{t('footer')}</p>
    </div>
  )
}
