// src/components/competitors/CompetitorCompaniesView.tsx
// 竞品公司页主体：每家公司一张卡，旗下团排成头像方块墙，公司字段全文铺在方块下面。
// 第一期只读、没有交互状态，保持为服务端组件。
import { useTranslations } from 'next-intl'
import { ExternalLink, Globe } from 'lucide-react'
import { Link } from '@/i18n/navigation'
import Tag from '@/components/ui/Tag'
import EmptyState from '@/components/ui/EmptyState'
import { competitorAnchorId } from '@/lib/competitors/anchors'
import { daysSince, freshnessOf, isoDateInTimeZone } from '@/lib/competitors/cadence'
import { formatCount } from '@/lib/competitors/metrics'
import { websiteLabel } from '@/lib/competitors/companies'
import type { AccountSnapshot, CapitalBackground, CompanyAccountView, CompanyBoard, CompanyView, TrackedAccount } from '@/lib/competitors/companies'
import type { Tone } from '@/lib/ui/status-tone'

const CAPITAL_TONE: Record<CapitalBackground, Tone> = {
  confirmed: 'danger',
  suspected: 'warning',
  none_seen: 'neutral',
  unknown: 'neutral',
}

/**
 * 方块墙：手机两列，宽屏按 180px 自动排。不设 align-items（默认 stretch）：同一行的方块
 * 拉齐到行内最高的那块，「查看档案」靠 mt-auto 贴底。备注要全文显示，所以不同行之间
 * 仍可能不等高 —— 统一固定高度就只能截断备注。
 */
const GRID = 'grid grid-cols-2 gap-2.5 sm:grid-cols-[repeat(auto-fill,minmax(180px,1fr))] sm:gap-3.5'

function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean)
  return (words.length > 1 ? words.slice(0, 2).map((w) => w[0]).join('') : name.trim().slice(0, 2)).toUpperCase()
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
  const trackedCount = co.accounts.filter((a) => a.tracked).length

  return (
    <section className="overflow-hidden rounded-card border border-line bg-surface shadow-card">
      <header className="flex flex-wrap items-center gap-3.5 px-5 pt-4">
        <AvatarStack company={co} />
        <div className="min-w-[200px] flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-semibold tracking-section text-ink-900">{co.name}</h2>
            {co.website ? (
              <a
                href={co.website}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={t('websiteAria', { name: co.name })}
                title={co.website}
                className="inline-flex items-center gap-1 rounded-btn bg-primary-soft px-2.5 py-0.5 text-xs font-medium text-primary hover:bg-primary-soft-hover"
              >
                <Globe size={12} strokeWidth={1.75} aria-hidden />
                {websiteLabel(co.website)}
                <ExternalLink size={11} strokeWidth={1.75} aria-hidden />
              </a>
            ) : (
              <span className="rounded-btn bg-muted-soft px-2.5 py-0.5 text-xs text-muted-text">{t('noWebsite')}</span>
            )}
            <Tag label={capitalLabel[co.capital_background]} tone={CAPITAL_TONE[co.capital_background]} size="sm" />
          </div>
          <p className="mt-1 text-xs text-ink-500">
            {co.legal_name ?? t('legalUnknown')}
            {co.location && <> · {co.location}</>}
          </p>
        </div>
        <dl className="flex gap-5 max-sm:w-full max-sm:justify-between">
          <Kpi label={t('kpiGroups')} value={String(co.accounts.length)} />
          <Kpi label={t('kpiTracked')} value={String(trackedCount)} />
          <Kpi label={t('kpiFollowers')} value={formatCount(co.follower_total)} />
        </dl>
      </header>

      <div className="px-5 py-4">
        {co.accounts.length === 0 ? (
          <p className="text-xs text-ink-400">{t('noGroups')}</p>
        ) : (
          <ul className={GRID}>
            {co.accounts.map((a) => (
              <li key={a.id}><GroupTile account={a} /></li>
            ))}
          </ul>
        )}
      </div>

      {facts.length > 0 && (
        <dl className="grid gap-x-4 gap-y-2 border-t border-line-soft px-5 py-4 text-sm sm:grid-cols-[5.5rem_minmax(0,1fr)]">
          {facts.map((f) => (
            <div key={f.label} className="contents">
              <dt className="text-xs text-ink-400 sm:pt-0.5">{f.label}</dt>
              <dd className="break-words text-ink-700 max-sm:mb-1.5">{f.value}</dd>
            </div>
          ))}
        </dl>
      )}

      <CompanyFooter company={co} />
    </section>
  )
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="sm:text-right">
      <dd className="text-lg font-semibold tabular-nums tracking-kpi text-ink-900">{value}</dd>
      <dt className="text-micro text-ink-400">{label}</dt>
    </div>
  )
}

/** 公司名左边那串叠在一起的头像：最多 5 个已追踪团；一个头像都没有就给公司名缩写。 */
function AvatarStack({ company: co }: { company: CompanyView }) {
  // 追踪中的头像在前；停更 / 未追踪但有存档头像的团排在后面。
  const avatars = [
    ...co.accounts.flatMap((a) => (a.tracked?.avatar_url ? [a.tracked.avatar_url] : [])),
    ...co.accounts.flatMap((a) => (a.snapshot?.avatar_url ? [a.snapshot.avatar_url] : [])),
  ].slice(0, 5)
  if (avatars.length === 0) {
    return (
      <span aria-hidden className="flex h-10 w-10 flex-none items-center justify-center rounded-field bg-primary-soft text-xs font-semibold text-primary">
        {initials(co.name)}
      </span>
    )
  }
  return (
    <span aria-hidden className="flex flex-none">
      {avatars.map((src, i) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img key={src} src={src} alt="" className={`h-10 w-10 rounded-field border-2 border-surface object-cover ${i > 0 ? '-ml-2.5' : ''}`} />
      ))}
    </span>
  )
}

type TileState = 'tracked' | 'untracked' | 'inactive'

function TileImage({ name, avatarUrl, highlight, state }: {
  name: string
  avatarUrl: string | null
  highlight: string | null
  state: TileState
}) {
  const t = useTranslations('competitorCompanies')
  return (
    <div className="relative flex aspect-square flex-none items-center justify-center bg-primary-soft">
      {avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={avatarUrl}
          alt={t('avatarAlt', { name })}
          loading="lazy"
          className={`h-full w-full object-cover ${state === 'inactive' ? 'opacity-60 grayscale' : ''}`}
        />
      ) : (
        <span aria-hidden className="text-2xl font-semibold text-primary">{initials(name)}</span>
      )}
      {highlight && (
        <span className="absolute left-2 top-2 rounded-btn bg-ink-900/70 px-2 py-0.5 text-micro font-medium text-surface">
          {highlight}
        </span>
      )}
      <span className="absolute bottom-2 right-2 rounded-btn bg-surface px-2 py-0.5">
        {state === 'tracked' ? (
          <Tag label={t('tracked')} tone="success" variant="dot" size="sm" />
        ) : state === 'inactive' ? (
          <Tag label={t('inactive')} tone="warning" variant="dot" size="sm" />
        ) : (
          <Tag label={t('untracked')} tone="neutral" variant="dot" size="sm" />
        )}
      </span>
    </div>
  )
}

function TrackedStats({ account }: { account: TrackedAccount }) {
  const t = useTranslations('competitorCompanies')
  if (account.followers === null) return <p className="mt-2 text-xs text-ink-400">{t('noFollowers')}</p>
  // 固定两栏（数字在上、标签在下）：粉丝和获赞同字号，并排写在一行时宽数字
  // （如 112.3K）会把获赞挤到第二行，同一排方块的数据就对不齐了。
  return (
    <>
      <dl className="mt-2 grid grid-cols-2 gap-x-2">
        <Stat label={t('followers')} value={formatCount(account.followers)} />
        <Stat label={t('likes')} value={formatCount(account.likes)} />
      </dl>
      {account.followers_on && <CapturedOn date={account.followers_on} />}
    </>
  )
}

/**
 * 采集日期按新鲜度分档：7 天内灰字写日期；8–14 天琥珀色「N 天前采集」；再久加「待更新」。
 * 这里是服务端组件、每次请求现算，「今天」取日本时间（captured_on 是日本业务日）。
 */
function CapturedOn({ date }: { date: string }) {
  const t = useTranslations('competitorCompanies')
  const days = daysSince(date, isoDateInTimeZone(new Date(), 'Asia/Tokyo'))
  const level = days === null ? 'fresh' : freshnessOf(days)
  if (level === 'fresh' || days === null) {
    return <p className="mt-1 text-micro text-ink-400">{t('followersOn', { date })}</p>
  }
  return (
    <p className="mt-1 flex flex-wrap items-center gap-1" title={t('followersOn', { date })}>
      <span className="rounded-btn bg-warning-soft px-2 py-0.5 text-micro text-warning-text">
        {t('capturedDaysAgo', { days })}
      </span>
      {level === 'stale' && (
        <span className="rounded-btn bg-warning-dot px-1.5 py-0.5 text-micro font-semibold text-surface">
          {t('needsUpdate')}
        </span>
      )}
    </p>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-w-0 flex-col-reverse">
      <dt className="text-micro text-ink-400">{label}</dt>
      {/* 手机两列时一栏只有 ~56px，15px 的「112.3K」正好贴边，小一号留余量 */}
      <dd className="truncate text-md font-semibold tabular-nums text-ink-900 sm:text-lg">{value}</dd>
    </div>
  )
}

/**
 * 不追踪的团存档的那一次主页数据。不走新鲜度分档：停更的号本来就不会再采，
 * 标「待更新」没有意义，只写清楚是哪天存的。
 */
function SnapshotStats({ snapshot }: { snapshot: AccountSnapshot }) {
  const t = useTranslations('competitorCompanies')
  return (
    <>
      <dl className="mt-2 grid grid-cols-2 gap-x-2">
        <Stat label={t('followers')} value={formatCount(snapshot.followers)} />
        <Stat label={t('likes')} value={formatCount(snapshot.likes)} />
      </dl>
      <p className="mt-1 text-micro text-ink-400">{t('archivedOn', { date: snapshot.captured_on })}</p>
    </>
  )
}

/** 旗下一个团。已追踪的整块可点，跳回账号看板对应的卡；没追踪的是虚线框、不可点。 */
function GroupTile({ account: a }: { account: CompanyAccountView }) {
  const t = useTranslations('competitorCompanies')
  const body = (
    <>
      <TileImage
        name={a.group_name}
        avatarUrl={a.tracked?.avatar_url ?? a.snapshot?.avatar_url ?? null}
        highlight={a.highlight}
        state={a.tracked ? 'tracked' : a.status === 'inactive' ? 'inactive' : 'untracked'}
      />
      <div className="flex flex-1 flex-col px-3 pb-3 pt-2.5">
        <p className="font-semibold text-ink-900">{a.group_name}</p>
        <p className="text-xs text-ink-400">{a.handle ? `@${a.handle}` : t('noHandle')}</p>
        {a.tracked ? (
          <TrackedStats account={a.tracked} />
        ) : a.snapshot ? (
          <SnapshotStats snapshot={a.snapshot} />
        ) : (
          <p className="mt-2 text-xs text-ink-400">{t('noFollowers')}</p>
        )}
        {a.note && (
          <p className="mt-2 border-t border-dashed border-line pt-2 text-xs leading-relaxed text-ink-500">{a.note}</p>
        )}
        {a.tracked && <p className="mt-auto pt-2 text-xs text-primary">{t('openDossier')} →</p>}
      </div>
    </>
  )
  if (!a.tracked) {
    return <div className="flex h-full flex-col overflow-hidden rounded-card border border-dashed border-line-strong bg-canvas text-sm">{body}</div>
  }
  return (
    <Link
      href={`/competitors#${competitorAnchorId(a.tracked.competitor_id)}`}
      className="flex h-full flex-col overflow-hidden rounded-card border border-line bg-surface text-sm transition hover:-translate-y-0.5 hover:border-primary-border focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-ring"
    >
      {body}
    </Link>
  )
}

function CompanyFooter({ company: co }: { company: CompanyView }) {
  const t = useTranslations('competitorCompanies')
  if (co.sources.length === 0 && !co.info_as_of) return null
  return (
    <footer className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-line-soft bg-canvas px-5 py-3 text-xs text-ink-400">
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
    </footer>
  )
}

function UnassignedCard({ accounts }: { accounts: TrackedAccount[] }) {
  const t = useTranslations('competitorCompanies')
  return (
    <section className="overflow-hidden rounded-card border border-line bg-surface shadow-card">
      <header className="px-5 pt-4">
        <h2 className="text-lg font-semibold tracking-section text-ink-900">
          {t('unassignedTitle')} · {accounts.length}
        </h2>
        <p className="mt-1 text-xs text-ink-500">{t('unassignedHint')}</p>
      </header>
      <div className="px-5 py-4">
        {accounts.length === 0 ? (
          <p className="text-xs text-ink-400">{t('unassignedEmpty')}</p>
        ) : (
          <ul className={GRID}>
            {accounts.map((a) => (
              <li key={a.competitor_id}>
                <GroupTile
                  account={{
                    id: a.competitor_id,
                    group_name: a.display_name ?? a.handle,
                    handle: a.handle,
                    highlight: null,
                    note: '',
                    status: 'active',
                    tracked: a,
                    snapshot: null,
                  }}
                />
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}
