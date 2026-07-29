// src/components/competitors/CompetitorCard.tsx
'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { ChevronDown, ChevronRight, Trash2, BadgeCheck, ExternalLink } from 'lucide-react'
import WeeklyFollowersCurve from './WeeklyFollowersCurve'
import ShotAlbum from './ShotAlbum'
import { formatCount } from '@/lib/competitors/metrics'
import type { CompetitorWithHistory } from '@/lib/competitors/types'

function Field({ label, value }: { label: string; value: string | null }) {
  if (!value) return null
  return (
    <div className="flex gap-2">
      <span className="w-16 shrink-0 text-neutral-500">{label}</span>
      <span className="text-neutral-700 dark:text-neutral-300">{value}</span>
    </div>
  )
}

export default function CompetitorCard({
  c, canEdit, onChanged, onDelete,
}: {
  c: CompetitorWithHistory
  canEdit: boolean
  onChanged: () => void
  onDelete: () => void
}) {
  const t = useTranslations('competitors')
  const [open, setOpen] = useState(false)
  const name = c.latest?.display_name ?? c.display_name ?? c.handle
  const statLine = [
    `${t('colVideos')} ${formatCount(c.latest?.videos ?? null)}`,
    c.composition ?? null,
    c.online_note ? `${t('fieldOnline')} ${c.online_note}` : null,
    c.latest ? t('latestOn', { date: c.latest.captured_on }) : null,
  ].filter(Boolean).join(' · ')

  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-950">
      <div className="mb-3 flex items-center gap-3">
        {c.avatar_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={c.avatar_url} alt="" className="h-10 w-10 rounded-full object-cover" />
        ) : (
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-sky-100 text-xs font-medium text-sky-700 dark:bg-sky-950 dark:text-sky-300">
            {name.slice(0, 2).toUpperCase()}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="truncate font-medium">{name}</span>
            {c.latest?.verified && <BadgeCheck size={15} className="shrink-0 text-sky-500" />}
            <span className="text-xs text-neutral-500">@{c.handle}</span>
            <span className="rounded-full bg-sky-50 px-1.5 py-0.5 text-[11px] text-sky-700 dark:bg-sky-950 dark:text-sky-300">{c.region}</span>
          </div>
          <div className="mt-0.5 truncate text-xs text-neutral-500">{statLine}</div>
        </div>
        <a href={c.profile_url} target="_blank" rel="noreferrer" aria-label={t('openProfile')} className="text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200">
          <ExternalLink size={16} />
        </a>
        <button onClick={() => setOpen((v) => !v)} aria-label={t('expandProfile')} className="text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200">
          {open ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
        </button>
        {canEdit && (
          <button onClick={onDelete} aria-label={t('delete')} className="text-neutral-400 hover:text-red-600">
            <Trash2 size={16} />
          </button>
        )}
      </div>

      <div className="grid grid-cols-[1fr_3fr] gap-3 max-md:grid-cols-1">
        <WeeklyFollowersCurve weekly={c.weekly} />
        <ShotAlbum competitorId={c.id} shots={c.shots} canEdit={canEdit} onChanged={onChanged} />
      </div>

      {open && (
        <div className="mt-3 space-y-2 border-t border-neutral-100 pt-3 text-xs dark:border-neutral-800">
          <Field label={t('fieldMembers')} value={c.member_count != null ? String(c.member_count) : null} />
          <Field label={t('fieldComposition')} value={c.composition} />
          <Field label={t('fieldLaunch')} value={[c.launch_city, c.launched_on].filter(Boolean).join(' · ') || null} />
          <Field label={t('fieldMc')} value={c.mc_note} />
          <Field label={t('fieldOnline')} value={c.online_note} />
          <Field label={t('region')} value={c.latest?.region ?? null} />
          <Field label={t('bio')} value={c.latest?.bio ?? null} />
          {c.latest_videos?.length ? (
            <div className="flex flex-wrap gap-2 text-sky-600 dark:text-sky-400">
              <span className="text-neutral-500">{t('fieldLatestVideos')}:</span>
              {c.latest_videos.map((v, i) => (
                <a key={i} href={v.url} target="_blank" rel="noreferrer" className="hover:underline">#{i + 1}</a>
              ))}
            </div>
          ) : null}

          {c.history.length > 0 && (
            <table className="mt-2 w-full max-w-xl text-xs" aria-label={t('history')}>
              <caption className="mb-1 text-left font-medium text-neutral-500">{t('history')}</caption>
              <thead className="text-neutral-500">
                <tr>
                  <th className="py-1 text-left font-normal">{t('colDate')}</th>
                  <th className="py-1 text-right font-normal">{t('colFollowers')}</th>
                  <th className="py-1 text-right font-normal">{t('colLikes')}</th>
                  <th className="py-1 text-right font-normal">{t('colVideos')}</th>
                </tr>
              </thead>
              <tbody>
                {c.history.slice().reverse().map((h) => (
                  <tr key={h.captured_on} className="border-t border-neutral-100 dark:border-neutral-800">
                    <td className="py-1">{h.captured_on}</td>
                    <td className="py-1 text-right">{formatCount(h.followers)}</td>
                    <td className="py-1 text-right">{formatCount(h.likes)}</td>
                    <td className="py-1 text-right">{formatCount(h.videos)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  )
}
