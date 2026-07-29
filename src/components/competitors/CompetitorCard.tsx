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
      <span className="w-16 shrink-0 text-zinc-500">{label}</span>
      <span className="text-zinc-700">{value}</span>
    </div>
  )
}

export default function CompetitorCard({
  c, canEdit, onChanged, onDeleteId, parentOptions, onAssignParent, nested = false,
}: {
  c: CompetitorWithHistory
  canEdit: boolean
  onChanged: () => void
  onDeleteId: (id: string) => void
  parentOptions: { id: string; label: string }[]
  onAssignParent: (id: string, parentId: string | null) => void
  nested?: boolean
}) {
  const t = useTranslations('competitors')
  const [open, setOpen] = useState(false)
  const [relOpen, setRelOpen] = useState(false)
  const name = c.latest?.display_name ?? c.display_name ?? c.handle
  const statLine = [
    `${t('colVideos')} ${formatCount(c.latest?.videos ?? null)}`,
    c.composition ?? null,
    c.online_note ? `${t('fieldOnline')} ${c.online_note}` : null,
    c.latest ? t('latestOn', { date: c.latest.captured_on }) : null,
  ].filter(Boolean).join(' · ')

  const shell = nested
    ? 'rounded-lg border border-zinc-100 bg-zinc-50 p-3'
    : 'rounded-xl border border-zinc-200 bg-white p-4'

  return (
    <div className={shell}>
      <div className="mb-3 flex items-center gap-3">
        {c.avatar_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={c.avatar_url} alt="" className="h-10 w-10 rounded-full object-cover" />
        ) : (
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-sky-100 text-xs font-medium text-sky-700">
            {name.slice(0, 2).toUpperCase()}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="truncate font-medium">{name}</span>
            {c.latest?.verified && <BadgeCheck size={15} className="shrink-0 text-sky-500" />}
            <span className="text-xs text-zinc-500">@{c.handle}</span>
            <span className="rounded-full bg-sky-50 px-1.5 py-0.5 text-[11px] text-sky-700">{c.region}</span>
          </div>
          <div className="mt-0.5 truncate text-xs text-zinc-500">{statLine}</div>
        </div>
        {canEdit && c.related.length === 0 && (
          <select
            value={c.parent_id ?? ''}
            onChange={(e) => onAssignParent(c.id, e.target.value || null)}
            aria-label={t('belongsTo')}
            className="max-w-[9rem] rounded border border-zinc-200 px-1.5 py-1 text-xs text-zinc-600"
          >
            <option value="">{t('independent')}</option>
            {parentOptions.filter((p) => p.id !== c.id).map((p) => (
              <option key={p.id} value={p.id}>{p.label}</option>
            ))}
          </select>
        )}
        <a href={c.profile_url} target="_blank" rel="noreferrer" aria-label={t('openProfile')} className="text-zinc-400 hover:text-zinc-700">
          <ExternalLink size={16} />
        </a>
        <button onClick={() => setOpen((v) => !v)} aria-label={t('expandProfile')} className="text-zinc-400 hover:text-zinc-700">
          {open ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
        </button>
        {canEdit && (
          <button onClick={() => onDeleteId(c.id)} aria-label={t('delete')} className="text-zinc-400 hover:text-red-600">
            <Trash2 size={16} />
          </button>
        )}
      </div>

      <div className="grid grid-cols-[1fr_3fr] gap-3 max-md:grid-cols-1">
        <WeeklyFollowersCurve weekly={c.weekly} />
        <ShotAlbum competitorId={c.id} shots={c.shots} canEdit={canEdit} onChanged={onChanged} />
      </div>

      {c.related.length > 0 && (
        <div className="mt-3 border-t border-zinc-100 pt-3">
          <button
            type="button"
            onClick={() => setRelOpen((v) => !v)}
            className="flex items-center gap-1 text-xs text-zinc-600 hover:text-zinc-900"
          >
            {relOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            {t('related')} ({c.related.length})
          </button>
          {relOpen && (
            <div className="mt-2 space-y-2 border-l-2 border-zinc-100 pl-3">
              {c.related.map((child) => (
                <CompetitorCard
                  key={child.id}
                  c={child}
                  canEdit={canEdit}
                  onChanged={onChanged}
                  onDeleteId={onDeleteId}
                  parentOptions={parentOptions}
                  onAssignParent={onAssignParent}
                  nested
                />
              ))}
            </div>
          )}
        </div>
      )}

      {open && (
        <div className="mt-3 space-y-2 border-t border-zinc-100 pt-3 text-xs">
          <Field label={t('fieldMembers')} value={c.member_count != null ? String(c.member_count) : null} />
          <Field label={t('fieldComposition')} value={c.composition} />
          <Field label={t('fieldLaunch')} value={[c.launch_city, c.launched_on].filter(Boolean).join(' · ') || null} />
          <Field label={t('fieldMc')} value={c.mc_note} />
          <Field label={t('fieldOnline')} value={c.online_note} />
          <Field label={t('region')} value={c.latest?.region ?? null} />
          <Field label={t('bio')} value={c.latest?.bio ?? null} />
          {c.latest_videos?.length ? (
            <div className="flex flex-wrap gap-2 text-sky-600">
              <span className="text-zinc-500">{t('fieldLatestVideos')}:</span>
              {c.latest_videos.map((v, i) => (
                <a key={i} href={v.url} target="_blank" rel="noreferrer" className="hover:underline">#{i + 1}</a>
              ))}
            </div>
          ) : null}

          {c.history.length > 0 && (
            <table className="mt-2 w-full max-w-xl text-xs" aria-label={t('history')}>
              <caption className="mb-1 text-left font-medium text-zinc-500">{t('history')}</caption>
              <thead className="text-zinc-500">
                <tr>
                  <th className="py-1 text-left font-normal">{t('colDate')}</th>
                  <th className="py-1 text-right font-normal">{t('colFollowers')}</th>
                  <th className="py-1 text-right font-normal">{t('colLikes')}</th>
                  <th className="py-1 text-right font-normal">{t('colVideos')}</th>
                </tr>
              </thead>
              <tbody>
                {c.history.slice().reverse().map((h) => (
                  <tr key={h.captured_on} className="border-t border-zinc-100">
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
