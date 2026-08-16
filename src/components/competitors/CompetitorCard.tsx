// src/components/competitors/CompetitorCard.tsx
'use client'

import { useState, useEffect } from 'react'
import type { ReactNode } from 'react'
import { useTranslations } from 'next-intl'
import { ChevronDown, ChevronRight, Trash2, BadgeCheck, ExternalLink, Pencil, Check, X } from 'lucide-react'
import WeeklyFollowersCurve from './WeeklyFollowersCurve'
import ShotAlbum from './ShotAlbum'
import { competitorAnchorId } from '@/lib/competitors/anchors'
import { formatCount } from '@/lib/competitors/metrics'
import type { CompetitorWithHistory } from '@/lib/competitors/types'
import { FOCUS_RING } from '@/lib/ui/recipes'
import Tag from '@/components/ui/Tag'

function Field({ label, value }: { label: string; value: string | null }) {
  if (!value) return null
  return (
    <div className="flex gap-2">
      <span className="w-16 shrink-0 text-ink-500">{label}</span>
      <span className="text-ink-700 tabular-nums">{value}</span>
    </div>
  )
}

export default function CompetitorCard({
  c, canEdit, onChanged, onDeleteId, parentOptions, onAssignParent, onUpdateHandle,
  dateWindow, selectedDate, nested = false, highlighted = false,
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
  /** 刚被导航条定位到:短暂描边,告诉用户滚动停在了哪张卡。 */
  highlighted?: boolean
}) {
  const t = useTranslations('competitors')
  const tCommon = useTranslations('common')
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
  // 视频数是本行唯一的"指标"，单独包一层 tabular-nums；其余分段是纯文本，
  // 不需要数字对齐，继续走字符串拼接（design-system §2 数字规则）。
  const statParts: ReactNode[] = [
    <span key="videos">{t('colVideos')} <span className="tabular-nums">{formatCount(c.latest?.videos ?? null)}</span></span>,
    c.composition ?? null,
    c.online_note ? `${t('fieldOnline')} ${c.online_note}` : null,
    c.latest ? t('latestOn', { date: c.latest.captured_on }) : null,
  ].filter((part) => part != null && part !== '')

  const shell = nested
    // 子卡不能有自己的边框和横向内边距:那会让它的内容盒比父卡窄 26px,
    // 同比例的 1fr_3fr 落进去,列宽就对不上了(实测第 5 列偏 21px)。
    // 层级感改用 ring —— box-shadow 不参与盒模型,拿不走一个像素的宽度。
    ? 'rounded-field bg-muted-soft py-3 ring-1 ring-inset ring-line'
    // 高亮 ring 只出现在顶层卡这一支:子卡那支已经有自己的 ring-1,同一属性
    // 挂两个候选类时谁生效由 Tailwind 生成顺序决定、不看书写顺序(见
    // FilterChip 的同款教训)。互斥分支从结构上避免这个问题。
    // scroll-mt-4:scrollIntoView 落点留一点余量,不让卡片贴死视口顶。
    : `rounded-card border border-line bg-surface p-4 scroll-mt-4 transition-shadow ${
        highlighted ? 'ring-2 ring-primary-ring' : ''
      }`

  return (
    // 子卡不挂锚点:导航条只定位顶层竞品,子主播通过父卡的"关联主播"下钻。
    <div id={nested ? undefined : competitorAnchorId(c.id)} className={shell}>
      <div className="mb-3 flex items-center gap-3">
        {c.avatar_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={c.avatar_url} alt="" className="h-10 w-10 rounded-full object-cover" />
        ) : (
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary-soft text-xs font-medium text-primary-hover">
            {name.slice(0, 2).toUpperCase()}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="truncate font-medium">{name}</span>
            {c.latest?.verified && (
              <BadgeCheck size={15} strokeWidth={1.5} role="img" aria-label={t('verified')} className="shrink-0 text-primary" />
            )}
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
                  className={`w-40 rounded-field border border-line-strong px-1.5 py-0.5 text-xs text-ink-700 ${FOCUS_RING}`}
                />
                <button
                  onClick={() => { onUpdateHandle(c.id, handleInput); setEditingHandle(false) }}
                  aria-label={tCommon('save')}
                  className={`rounded-field text-primary hover:text-primary-hover ${FOCUS_RING}`}
                >
                  <Check size={13} strokeWidth={1.5} />
                </button>
                <button
                  onClick={() => setEditingHandle(false)}
                  aria-label={tCommon('cancel')}
                  className={`rounded-field text-ink-400 hover:text-ink-700 ${FOCUS_RING}`}
                >
                  <X size={13} strokeWidth={1.5} />
                </button>
              </span>
            ) : (
              <span className="flex items-center gap-0.5">
                <span className="text-xs text-ink-500">@{c.handle}</span>
                {canEdit && (
                  <button
                    onClick={() => { setHandleInput(c.handle); setEditingHandle(true) }}
                    className={`rounded-field text-ink-400 hover:text-ink-700 ${FOCUS_RING}`}
                    aria-label={t('editHandle')}
                  >
                    <Pencil size={13} strokeWidth={1.5} />
                  </button>
                )}
              </span>
            )}
            <Tag label={c.region} tone="violet" size="sm" />
          </div>
          <div className="mt-0.5 truncate text-xs text-ink-500">
            {statParts.map((part, i) => (
              <span key={i}>{i > 0 ? ' · ' : ''}{part}</span>
            ))}
          </div>
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
              className={`rounded-field border border-line-strong px-1.5 py-1 text-xs text-ink-700 ${FOCUS_RING}`}
            >
              <option value="group">{t('independent')}</option>
              <option value="streamer">{t('roleStreamer')}</option>
            </select>
            {showAsStreamer && (
              <select
                value={c.parent_id ?? ''}
                onChange={(e) => { if (e.target.value) onAssignParent(c.id, e.target.value) }}
                className={`rounded-field border border-line-strong px-1.5 py-1 text-xs text-ink-700 ${FOCUS_RING}`}
              >
                <option value="">{t('selectGroup')}</option>
                {parentOptions.filter((p) => p.id !== c.id).map((p) => (
                  <option key={p.id} value={p.id}>{p.label}</option>
                ))}
              </select>
            )}
          </div>
        ) : c.related.length === 0 ? (
          <Tag label={c.parent_id ? t('roleStreamer') : t('independent')} tone="neutral" size="sm" />
        ) : null}
        <a href={c.profile_url} target="_blank" rel="noreferrer" aria-label={t('openProfile')} className={`rounded-field text-ink-400 hover:text-ink-700 ${FOCUS_RING}`}>
          <ExternalLink size={16} strokeWidth={1.5} />
        </a>
        <button onClick={() => setOpen((v) => !v)} aria-label={t('expandProfile')} className={`rounded-field text-ink-400 hover:text-ink-700 ${FOCUS_RING}`}>
          {open ? <ChevronDown size={18} strokeWidth={1.5} /> : <ChevronRight size={18} strokeWidth={1.5} />}
        </button>
        {canEdit && (
          <button onClick={() => onDeleteId(c.id)} aria-label={t('delete')} className={`rounded-field text-ink-400 hover:text-danger-text ${FOCUS_RING}`}>
            <Trash2 size={16} strokeWidth={1.5} />
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
        <div className="mt-3 border-t border-line-soft pt-3">
          <button
            type="button"
            onClick={() => setRelOpen((v) => !v)}
            className={`flex items-center gap-1 rounded-field text-xs text-ink-700 hover:text-ink-900 ${FOCUS_RING}`}
          >
            {relOpen ? <ChevronDown size={14} strokeWidth={1.5} /> : <ChevronRight size={14} strokeWidth={1.5} />}
            {t('related')} (<span className="tabular-nums">{c.related.length}</span>)
          </button>
          {/* 子卡容器不能有 pl-3:横向平移会让子卡的列对不上父卡的列 */}
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
        <div className="mt-3 space-y-2 border-t border-line-soft pt-3 text-xs">
          <Field label={t('fieldMembers')} value={c.member_count != null ? String(c.member_count) : null} />
          <Field label={t('fieldComposition')} value={c.composition} />
          <Field label={t('fieldLaunch')} value={[c.launch_city, c.launched_on].filter(Boolean).join(' · ') || null} />
          <Field label={t('fieldMc')} value={c.mc_note} />
          <Field label={t('fieldOnline')} value={c.online_note} />
          <Field label={t('region')} value={c.latest?.region ?? null} />
          <Field label={t('bio')} value={c.latest?.bio ?? null} />
          {c.latest_videos?.length ? (
            <div className="flex flex-wrap gap-2 text-primary">
              <span className="text-ink-500">{t('fieldLatestVideos')}:</span>
              {c.latest_videos.map((v, i) => (
                <a key={i} href={v.url} target="_blank" rel="noreferrer" className={`rounded-field hover:text-primary-hover hover:underline ${FOCUS_RING}`}>#{i + 1}</a>
              ))}
            </div>
          ) : null}

          {c.history.length > 0 && (
            <table className="mt-2 w-full max-w-xl text-xs" aria-label={t('history')}>
              <caption className="mb-1 text-left font-medium text-ink-500">{t('history')}</caption>
              <thead className="text-ink-400">
                <tr>
                  <th className="py-1 text-left font-normal">{t('colDate')}</th>
                  <th className="py-1 text-right font-normal">{t('colFollowers')}</th>
                  <th className="py-1 text-right font-normal">{t('colLikes')}</th>
                  <th className="py-1 text-right font-normal">{t('colVideos')}</th>
                </tr>
              </thead>
              <tbody>
                {c.history.slice().reverse().map((h) => (
                  <tr key={h.captured_on} className="border-t border-line-soft">
                    <td className="py-1 text-ink-700">{h.captured_on}</td>
                    <td className="py-1 text-right tabular-nums font-medium text-ink-900">{formatCount(h.followers)}</td>
                    <td className="py-1 text-right tabular-nums font-medium text-ink-900">{formatCount(h.likes)}</td>
                    <td className="py-1 text-right tabular-nums font-medium text-ink-900">{formatCount(h.videos)}</td>
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
