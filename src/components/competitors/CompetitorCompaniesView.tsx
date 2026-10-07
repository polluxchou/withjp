// src/components/competitors/CompetitorCompaniesView.tsx
// 竞品公司页主体。第一期只读、没有交互状态，保持为服务端组件。
import { useTranslations } from 'next-intl'
import { Building2, ExternalLink, HelpCircle } from 'lucide-react'
import { Link } from '@/i18n/navigation'
import SectionCard from '@/components/ui/SectionCard'
import Tag from '@/components/ui/Tag'
import EmptyState from '@/components/ui/EmptyState'
import { competitorAnchorId } from '@/lib/competitors/anchors'
import { formatCount } from '@/lib/competitors/metrics'
import type { CapitalBackground, CompanyAccountView, CompanyBoard, CompanyView, TrackedAccount } from '@/lib/competitors/companies'
import type { Tone } from '@/lib/ui/status-tone'

const CAPITAL_TONE: Record<CapitalBackground, Tone> = {
  confirmed: 'danger',
  suspected: 'warning',
  none_seen: 'neutral',
  unknown: 'neutral',
}

function tiktokUrl(handle: string): string {
  return `https://www.tiktok.com/@${handle}`
}

export default function CompetitorCompaniesView({ board }: { board: CompanyBoard }) {
  const t = useTranslations('competitorCompanies')
  const groups = board.companies.reduce((n, c) => n + c.accounts.length, 0)
  const tracked = board.companies.reduce((n, c) => n + c.accounts.filter((a) => a.tracked).length, 0)

  return (
    <div className="space-y-4">
      <p className="text-xs text-ink-500">
        {t('summary', {
          companies: board.companies.length,
          groups,
          tracked,
          unassigned: board.unassigned.length,
        })}
        <span className="text-ink-400"> · {t('readOnly')}</span>
      </p>

      {board.companies.length === 0 ? (
        <EmptyState title={t('empty')} />
      ) : (
        board.companies.map((co) => <CompanyCard key={co.id} company={co} />)
      )}

      <UnassignedCard accounts={board.unassigned} />
    </div>
  )
}

function CompanyCard({ company: co }: { company: CompanyView }) {
  const t = useTranslations('competitorCompanies')
  const capitalLabel: Record<CapitalBackground, string> = {
    confirmed: t('capitalConfirmed'),
    suspected: t('capitalSuspected'),
    none_seen: t('capitalNoneSeen'),
    unknown: t('capitalUnknown'),
  }
  const facts: { label: string; value: string }[] = [
    { label: t('format'), value: co.group_format },
    { label: t('scale'), value: co.scale },
    { label: t('capital'), value: co.capital_note },
    { label: t('recruit'), value: co.recruit_note },
    { label: t('note'), value: co.note },
  ].filter((f) => f.value.trim())

  return (
    <SectionCard
      icon={<Building2 />}
      title={co.name}
      accent="violet"
      actions={
        <>
          <Tag label={capitalLabel[co.capital_background]} tone={CAPITAL_TONE[co.capital_background]} size="sm" />
          {co.website && (
            <a
              href={co.website}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={t('website')}
              title={co.website}
              className="text-ink-400 hover:text-primary-hover"
            >
              <ExternalLink size={16} strokeWidth={1.5} />
            </a>
          )}
        </>
      }
      footer={<CompanyFooter company={co} />}
    >
      <p className="text-xs text-ink-500">
        {co.legal_name ?? t('legalUnknown')}
        {co.location && <> · {co.location}</>}
      </p>

      {facts.length > 0 && (
        <dl className="mt-3 grid gap-x-4 gap-y-2 text-sm sm:grid-cols-[6.5rem_minmax(0,1fr)]">
          {facts.map((f) => (
            <div key={f.label} className="contents">
              <dt className="text-xs text-ink-400 sm:pt-0.5">{f.label}</dt>
              <dd className="text-ink-700 break-words">{f.value}</dd>
            </div>
          ))}
        </dl>
      )}

      <div className="mt-4">
        <h3 className="text-xs font-semibold text-ink-500">
          {t('groups')} · {co.accounts.length}
        </h3>
        {co.accounts.length === 0 ? (
          <p className="mt-1.5 text-xs text-ink-400">{t('noGroups')}</p>
        ) : (
          <ul className="mt-1.5 divide-y divide-line-soft border-y border-line-soft text-sm">
            {co.accounts.map((a) => <AccountRow key={a.id} account={a} />)}
          </ul>
        )}
      </div>
    </SectionCard>
  )
}

function AccountRow({ account: a }: { account: CompanyAccountView }) {
  const t = useTranslations('competitorCompanies')
  return (
    <li className="flex flex-col gap-1 py-2 sm:flex-row sm:items-center sm:gap-3">
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1">
        <span className="font-medium text-ink-900">{a.group_name}</span>
        {a.handle ? (
          <a
            href={tiktokUrl(a.handle)}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-ink-500 hover:text-primary-hover"
          >
            @{a.handle}
          </a>
        ) : (
          <span className="text-xs text-ink-400">{t('noHandle')}</span>
        )}
        <Tag label={a.tracked ? t('tracked') : t('untracked')} tone={a.tracked ? 'success' : 'neutral'} variant="dot" size="sm" />
        {a.note && <span className="w-full text-xs text-ink-400 sm:w-auto">{a.note}</span>}
      </div>
      {a.tracked && <TrackedMeta account={a.tracked} />}
    </li>
  )
}

function TrackedMeta({ account }: { account: TrackedAccount }) {
  const t = useTranslations('competitorCompanies')
  return (
    <div className="flex flex-none items-center gap-3 text-xs">
      <span className="tabular-nums text-ink-700" title={account.followers_on ? t('followersOn', { date: account.followers_on }) : undefined}>
        {account.followers === null ? t('noFollowers') : t('followers', { count: formatCount(account.followers) })}
      </span>
      <Link href={`/competitors#${competitorAnchorId(account.competitor_id)}`} className="text-primary hover:text-primary-hover">
        {t('openDossier')}
      </Link>
    </div>
  )
}

function CompanyFooter({ company: co }: { company: CompanyView }) {
  const t = useTranslations('competitorCompanies')
  if (co.sources.length === 0 && !co.info_as_of) return null
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      {co.sources.length > 0 && (
        <>
          <span>{t('sources')}</span>
          {co.sources.map((s) => (
            <a key={s.url} href={s.url} target="_blank" rel="noopener noreferrer" className="text-ink-500 hover:text-primary-hover">
              {s.label}
            </a>
          ))}
        </>
      )}
      {co.info_as_of && <span className="sm:ml-auto">{t('infoAsOf', { date: co.info_as_of })}</span>}
    </div>
  )
}

function UnassignedCard({ accounts }: { accounts: TrackedAccount[] }) {
  const t = useTranslations('competitorCompanies')
  return (
    <SectionCard icon={<HelpCircle />} title={`${t('unassignedTitle')} · ${accounts.length}`} accent="amber">
      <p className="text-xs text-ink-500">{t('unassignedHint')}</p>
      {accounts.length === 0 ? (
        <p className="mt-2 text-xs text-ink-400">{t('unassignedEmpty')}</p>
      ) : (
        <ul className="mt-2 divide-y divide-line-soft border-y border-line-soft text-sm">
          {accounts.map((a) => (
            <li key={a.competitor_id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
              <span className="font-medium text-ink-900">{a.display_name ?? a.handle}</span>
              <a
                href={tiktokUrl(a.handle)}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-ink-500 hover:text-primary-hover"
              >
                @{a.handle}
              </a>
              <span className="ml-auto">
                <TrackedMeta account={a} />
              </span>
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  )
}
