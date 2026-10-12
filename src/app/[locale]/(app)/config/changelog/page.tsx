import Header from '@/components/layout/Header'
import { CHANGELOG, type DailyChangelog } from '@/lib/changelog/entries'
import { getTranslations } from 'next-intl/server'
import ChangelogFilterList from '@/components/changelog/ChangelogFilterList'

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

      <ChangelogFilterList days={days} locale={params.locale} today={today} />

      <p className="mt-6 text-xs text-ink-400">{t('footer')}</p>
    </div>
  )
}
