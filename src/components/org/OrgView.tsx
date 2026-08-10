'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { Briefcase, Plus, Users, X } from 'lucide-react'
import SectionCard from '@/components/ui/SectionCard'
import Tag from '@/components/ui/Tag'
import Modal from '@/components/ui/Modal'
import {
  applyAddTask, applyDeleteTask, applyAddItem, applyDeleteItem,
  applySetBusinessOwner, applySetItemOwner,
  applyAddMember, applyRemoveMember, applySetTaskPositions,
} from '@/lib/org/tree'
import type { OrgSnapshot, PersonOption } from '@/lib/types'

interface PickerState {
  title: string
  allowClear: boolean
  onSelect: (person: PersonOption | null) => void
}

function refOf(person: PersonOption | null) {
  if (!person) return null
  return {
    member_type: person.member_type,
    user_id: person.member_type === 'user' ? person.id : null,
    creator_id: person.member_type === 'creator' ? person.id : null,
  }
}

// Small "+ label" text-link idiom shared by every add-affordance in this
// view (add task / add item / add member) — same visual weight as the
// edit/delete row actions next to it, no Button chrome.
const ADD_LINK_CLASS = 'mt-2 inline-flex items-center gap-1 text-xs text-primary hover:text-primary-hover'

export default function OrgView({ initial }: { initial: OrgSnapshot }) {
  const t = useTranslations('team')
  const [snapshot, setSnapshot] = useState<OrgSnapshot>(initial)
  const canEdit = snapshot.canEdit
  const posName = (id: string) => snapshot.positions.find((p) => p.id === id)?.name ?? id
  const [picker, setPicker] = useState<PickerState | null>(null)

  // 写 /api/org/*：成功返回受影响行 { id }；失败（网络异常 / 非 2xx）弹出服务端
  // 原因并返回 null —— 拒绝的写入不会被静默吞掉。调用方拿返回的 id 直接就地更新
  // 本地快照，不再依赖一次可能失败的整表 GET /api/org，从而做到「改完即时可见」。
  const api = async (path: string, method: string, body?: unknown): Promise<{ id: string } | null> => {
    try {
      const res = await fetch(`/api/org${path}`, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
      })
      const json = await res.json().catch(() => null)
      if (!res.ok) {
        console.error('Org write failed:', path, method, res.status, json?.error)
        window.alert(t('org.saveFailed') + (json?.error ? `: ${json.error}` : ` (${res.status})`))
        return null
      }
      return (json?.data as { id: string }) ?? null
    } catch (e) {
      console.error('Org write failed:', path, method, e)
      window.alert(t('org.saveFailed') + `: ${e instanceof Error ? e.message : String(e)}`)
      return null
    }
  }

  const addTask = async (businessId: string) => {
    const name = window.prompt(t('org.addTask'))
    if (!name?.trim()) return
    const res = await api(`/businesses/${businessId}/tasks`, 'POST', { name })
    if (res) setSnapshot((s) => applyAddTask(s, businessId, res.id, name.trim()))
  }
  const deleteTask = async (taskId: string) => {
    if (!window.confirm(t('org.confirmDelete'))) return
    if (await api(`/tasks/${taskId}`, 'DELETE')) setSnapshot((s) => applyDeleteTask(s, taskId))
  }
  const addItem = async (taskId: string) => {
    const name = window.prompt(t('org.addItem'))
    if (!name?.trim()) return
    const res = await api(`/tasks/${taskId}/items`, 'POST', { name })
    if (res) setSnapshot((s) => applyAddItem(s, taskId, res.id, name.trim()))
  }
  const deleteItem = async (itemId: string) => {
    if (!window.confirm(t('org.confirmDelete'))) return
    if (await api(`/items/${itemId}`, 'DELETE')) setSnapshot((s) => applyDeleteItem(s, itemId))
  }
  const setBusinessOwner = async (businessId: string, person: PersonOption | null) => {
    if (await api(`/businesses/${businessId}`, 'PATCH', { owner: refOf(person) })) setSnapshot((s) => applySetBusinessOwner(s, businessId, person))
  }
  const setItemOwner = async (itemId: string, person: PersonOption | null) => {
    if (await api(`/items/${itemId}`, 'PATCH', { owner: refOf(person) })) setSnapshot((s) => applySetItemOwner(s, itemId, person))
  }
  const setTaskPositions = async (taskId: string, positionIds: string[]) => {
    if (await api(`/tasks/${taskId}/positions`, 'PUT', { positionIds })) setSnapshot((s) => applySetTaskPositions(s, taskId, positionIds))
  }
  const editTaskPositions = (taskId: string, currentIds: string[]) => {
    const lines = snapshot.positions.map((p, i) => `${i + 1}. ${p.name}`).join('\n')
    const current = currentIds
      .map((pid) => snapshot.positions.findIndex((p) => p.id === pid) + 1)
      .filter((n) => n > 0)
      .join(',')
    const raw = window.prompt(`${t('org.editPositions')}\n${lines}`, current)
    if (raw === null) return
    const ids = raw
      .split(',')
      .map((s) => Number(s.trim()))
      .filter((n) => n >= 1 && n <= snapshot.positions.length)
      .map((n) => snapshot.positions[n - 1].id)
    setTaskPositions(taskId, ids)
  }
  const addMember = async (positionId: string, person: PersonOption) => {
    const body = refOf(person)
    if (!body) return
    const res = await api(`/positions/${positionId}/members`, 'POST', body)
    if (res) setSnapshot((s) => applyAddMember(s, positionId, res.id, person))
  }
  const removeMember = async (positionId: string, memberId: string) => {
    if (!window.confirm(t('org.confirmDelete'))) return
    if (await api(`/positions/${positionId}/members/${memberId}`, 'DELETE')) setSnapshot((s) => applyRemoveMember(s, positionId, memberId))
  }

  return (
    <div className="space-y-5">
      {!canEdit && <p className="text-xs text-ink-400">{t('org.readonlyHint')}</p>}

      <div className="space-y-4">
        {snapshot.businesses.map((b) => (
          <SectionCard
            key={b.id}
            icon={<Briefcase />}
            title={b.name}
            actions={
              <button
                type="button"
                disabled={!canEdit}
                onClick={() => setPicker({ title: t('org.setOwner'), allowClear: true, onSelect: (p) => setBusinessOwner(b.id, p) })}
                className={`text-xs ${canEdit ? 'text-primary hover:text-primary-hover' : 'text-ink-500 cursor-default'}`}
              >
                {t('org.owner')}：{b.owner_name ?? t('org.noOwner')}
              </button>
            }
          >
            {/* Task groups separated by hairlines rather than nested cards —
                flattens what used to be card-in-card-in-card (business → task
                box → item box) down to one SectionCard per business. */}
            <div className="divide-y divide-line-soft">
              {b.tasks.map((task) => (
                <div key={task.id} className="py-3 first:pt-0 last:pb-0">
                  <div className="flex items-center justify-between gap-2">
                    <div className="font-medium text-sm text-ink-900 min-w-0 truncate">{task.name}</div>
                    {canEdit && (
                      <div className="flex gap-3 text-xs flex-none">
                        <button className="text-primary hover:text-primary-hover" onClick={() => editTaskPositions(task.id, task.position_ids)}>{t('org.editPositions')}</button>
                        <button className="text-ink-400 hover:text-danger-text" onClick={() => deleteTask(task.id)}>{t('org.delete')}</button>
                      </div>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {task.position_ids.length === 0
                      ? <span className="text-xs text-ink-400">{t('org.empty')}</span>
                      : task.position_ids.map((pid) => <Tag key={pid} size="sm" tone="neutral" label={posName(pid)} />)}
                  </div>
                  <ul className="mt-3 divide-y divide-line-soft">
                    {task.items.map((it) => (
                      <li key={it.id} className="flex items-center justify-between gap-2 text-sm py-1.5">
                        <span className="min-w-0 truncate text-ink-700">{it.name}</span>
                        <span className="flex items-center gap-2 flex-none">
                          <button
                            type="button"
                            disabled={!canEdit}
                            onClick={() => setPicker({ title: t('org.setOwner'), allowClear: true, onSelect: (p) => setItemOwner(it.id, p) })}
                            className={`text-xs ${canEdit ? 'text-primary hover:text-primary-hover' : 'text-ink-500 cursor-default'}`}
                          >
                            {it.owner_name ?? t('org.noOwner')}
                          </button>
                          {canEdit && <button className="text-xs text-ink-400 hover:text-danger-text" onClick={() => deleteItem(it.id)}>{t('org.delete')}</button>}
                        </span>
                      </li>
                    ))}
                  </ul>
                  {canEdit && (
                    <button className={ADD_LINK_CLASS} onClick={() => addItem(task.id)}>
                      <Plus className="w-3 h-3" strokeWidth={1.5} />{t('org.addItem')}
                    </button>
                  )}
                </div>
              ))}
            </div>

            {canEdit && (
              <button className={ADD_LINK_CLASS} onClick={() => addTask(b.id)}>
                <Plus className="w-3 h-3" strokeWidth={1.5} />{t('org.addTask')}
              </button>
            )}
          </SectionCard>
        ))}
      </div>

      <SectionCard icon={<Users />} title={t('org.positionsTitle')}>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {snapshot.positions.map((p) => (
            <div key={p.id} className="border border-line rounded-field p-3">
              <div className="font-medium text-sm text-ink-900">{p.name}</div>
              {p.description && <div className="text-micro text-ink-400 mb-1">{p.description}</div>}
              <div className="flex flex-wrap items-center gap-1.5 mt-1">
                {p.members.length === 0 && <span className="text-xs text-ink-400">{t('org.empty')}</span>}
                {p.members.map((m) => {
                  const memberLabel = m.display_name || (m.member_type === 'creator' ? t('org.sourceCreator') : t('org.sourceUser'))
                  return (
                    <span key={m.id} className="inline-flex items-center gap-1">
                      <Tag size="sm" tone={m.member_type === 'creator' ? 'violet' : 'neutral'} label={memberLabel} />
                      {canEdit && (
                        <button
                          type="button"
                          aria-label={t('org.removeMemberNamed', { name: memberLabel })}
                          onClick={() => removeMember(p.id, m.id)}
                          // p-1.5 -m-1.5 grows the click target to the §4 ≥32×32
                          // minimum without shifting the icon's visual position
                          // (negative margin cancels the added padding's layout footprint).
                          className="p-1.5 -m-1.5 text-ink-400 hover:text-danger-text rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-ring focus-visible:ring-offset-1"
                        >
                          <X className="w-[13px] h-[13px]" strokeWidth={1.5} />
                        </button>
                      )}
                    </span>
                  )
                })}
              </div>
              {canEdit && (
                <button className={ADD_LINK_CLASS} onClick={() => setPicker({ title: t('org.addMember'), allowClear: false, onSelect: (person) => { if (person) addMember(p.id, person) } })}>
                  <Plus className="w-3 h-3" strokeWidth={1.5} />{t('org.addMember')}
                </button>
              )}
            </div>
          ))}
        </div>
      </SectionCard>

      {picker && (
        <Modal open onClose={() => setPicker(null)} title={picker.title}>
          <div className="space-y-1.5">
            {picker.allowClear && (
              <button
                type="button"
                onClick={() => { picker.onSelect(null); setPicker(null) }}
                className="w-full text-left flex items-center px-3 py-2.5 rounded-field border border-line text-sm text-ink-500 hover:bg-line-soft hover:border-line-strong transition-colors"
              >
                {t('org.clearOwner')}
              </button>
            )}
            {snapshot.people.map((p) => (
              <button
                key={`${p.member_type}:${p.id}`}
                type="button"
                onClick={() => { picker.onSelect(p); setPicker(null) }}
                className="w-full text-left flex items-center gap-2 px-3 py-2.5 rounded-field border border-line text-sm text-ink-700 hover:bg-line-soft hover:border-line-strong transition-colors"
              >
                <Tag
                  size="sm"
                  tone={p.member_type === 'creator' ? 'violet' : 'neutral'}
                  label={p.member_type === 'creator' ? t('org.sourceCreator') : t('org.sourceUser')}
                />
                <span className="font-medium text-ink-900">{p.name}</span>
              </button>
            ))}
            {snapshot.people.length === 0 && (
              <p className="py-6 text-center text-sm text-ink-400">{t('org.empty')}</p>
            )}
          </div>
        </Modal>
      )}
    </div>
  )
}
