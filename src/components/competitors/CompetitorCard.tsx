// src/components/competitors/CompetitorCard.tsx
'use client'

import { useState, useEffect } from 'react'
import { useTranslations } from 'next-intl'
import { ChevronDown, ChevronRight, Trash2, BadgeCheck, ExternalLink, Pencil, Check, X } from 'lucide-react'
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
  c, canEdit, onChanged, onDeleteId, parentOptions, onAssignParent, onUpdateHandle,
  dateWindow, selectedDate, nested = false,
}: {
  c: CompetitorWithHistory
  canEdit: boolean
  onChanged: () => void
  onDeleteId: (id: string) => void
  parentOptions: { id: string; label: string }[]
  onAssignParent: (id: string, parentId: string | null) => void
  onUpdateHandle: (id: string, raw: string) => void
  dateWindow: string[]
  selectedDate: string | null
  nested?: boolean
}) {
  const t = useTranslations('competitors')
  const [open, setOpen] = useState(false)
  const [relOpen, setRelOpen] = useState(false)
  const [editingHandle, setEditingHandle] = useState(false)
  const [handleInput, setHandleInput] = useState('')
  // pendingStreamer: user clicked "主播" but hasn't picked a parent yet
  const [pendingStreamer, setPendingStreamer] = useState(false)
  useEffect(() => { setPendingStreamer(false) }, [c.parent_id])
  const isStreamer = !!c.parent_id
  const showAsStreamer = isStreamer || pendingStreamer
  const name = c.latest?.display_name ?? c.display_name ?? c.handle
  const statLine = [
    `${t('colVideos')} ${formatCount(c.latest?.videos ?? null)}`,
    c.composition ?? null,
    c.online_note ? `${t('fieldOnline')} ${c.online_note}` : null,
    c.latest ? t('latestOn', { date: c.latest.captured_on }) : null,
  ].filter(Boolean).join(' · ')

  const shell = nested
    // 子卡不能有自己的边框和横向内边距:那会让它的内容盒比父卡窄 26px,
    // 同比例的 1fr_3fr 落进去,列宽就对不上了。层级感改用 ring——
    // box-shadow 不参与盒模型,拿不走一个像素的宽度。
    ? 'rounded-lg bg-muted-soft py-3 ring-1 ring-inset ring-line'
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
            {editingHandle ? (
              <span className="flex items-center gap-1">
                <input
                  autoFocus
                  value={handleInput}
                  onChange={(e) => setHandleInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') { onUpdateHandle(c.id, handleInput); setEditingHandle(false) }
                    if (e.key === 'Escape') setEditingHandle(false)
                  }}
                  placeholder={t('handlePlaceholder')}
                  className="w-40 rounded border border-zinc-300 px-1.5 py-0.5 text-xs text-zinc-700"
                />
                <button onClick={() => { onUpdateHandle(c.id, handleInput); setEditingHandle(false) }} className="text-sky-600 hover:text-sky-800"><Check size={13} /></button>
                <button onClick={() => setEditingHandle(false)} className="text-zinc-400 hover:text-zinc-700"><X size={13} /></button>
              </span>
            ) : (
              <span className="flex items-center gap-0.5">
                <span className="text-xs text-zinc-500">@{c.handle}</span>
                {canEdit && (
                  <button
                    onClick={() => { setHandleInput(c.handle); setEditingHandle(true) }}
                    className="text-zinc-400 hover:text-zinc-700"
                    aria-label={t('editHandle')}
                  >
                    <Pencil size={13} />
                  </button>
                )}
              </span>
            )}
            <span className="rounded-full bg-sky-50 px-1.5 py-0.5 text-[11px] text-sky-700">{c.region}</span>
          </div>
          <div className="mt-0.5 truncate text-xs text-zinc-500">{statLine}</div>
        </div>
        {canEdit && c.related.length === 0 ? (
          <div className="flex items-center gap-1">
            <select
              value={showAsStreamer ? 'streamer' : 'group'}
              onChange={(e) => {
                if (e.target.value === 'group') {
                  setPendingStreamer(false)
                  onAssignParent(c.id, null)
                } else {
                  setPendingStreamer(true)
                }
              }}
              className="rounded border border-zinc-200 px-1.5 py-1 text-xs text-zinc-600"
            >
              <option value="group">{t('independent')}</option>
              <option value="streamer">{t('roleStreamer')}</option>
            </select>
            {showAsStreamer && (
              <select
                value={c.parent_id ?? ''}
                onChange={(e) => { if (e.target.value) onAssignParent(c.id, e.target.value) }}
                className="rounded border border-zinc-200 px-1.5 py-1 text-xs text-zinc-600"
              >
                <option value="">{t('selectGroup')}</option>
                {parentOptions.filter((p) => p.id !== c.id).map((p) => (
                  <option key={p.id} value={p.id}>{p.label}</option>
                ))}
              </select>
            )}
          </div>
        ) : c.related.length === 0 ? (
          <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-xs text-zinc-500">
            {c.parent_id ? t('roleStreamer') : t('independent')}
          </span>
        ) : null}
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

      {/* 必须 minmax(0,...):裸 1fr 的下限是 min-content,compact 曲线会把第一格撑开 */}
      <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,3fr)] gap-3 max-md:grid-cols-1">
        <WeeklyFollowersCurve weekly={c.weekly} compact={nested} />
        <ShotAlbum
          competitorId={c.id}
          shots={c.shots}
          canEdit={canEdit}
          onChanged={onChanged}
          dateWindow={dateWindow}
          selectedDate={selectedDate}
        />
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
            <div className="mt-2 space-y-2">
              {c.related.map((child) => (
                <CompetitorCard
                  key={child.id}
                  c={child}
                  canEdit={canEdit}
                  onChanged={onChanged}
                  onDeleteId={onDeleteId}
                  parentOptions={parentOptions}
                  onAssignParent={onAssignParent}
                  onUpdateHandle={onUpdateHandle}
                  dateWindow={dateWindow}
                  selectedDate={selectedDate}
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
