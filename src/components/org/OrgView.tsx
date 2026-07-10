'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import Badge from '@/components/ui/Badge'
import type { OrgSnapshot } from '@/lib/types'

async function api(path: string, method: string, body?: unknown) {
  const res = await fetch(`/api/org${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
  return res.ok
}

export default function OrgView({ initial }: { initial: OrgSnapshot }) {
  const t = useTranslations('team')
  const [snapshot, setSnapshot] = useState<OrgSnapshot>(initial)
  const canEdit = snapshot.canEdit
  const posName = (id: string) => snapshot.positions.find((p) => p.id === id)?.name ?? id

  const reload = async () => {
    const res = await fetch('/api/org', { cache: 'no-store' })
    const json = await res.json()
    if (json.data) setSnapshot(json.data as OrgSnapshot)
  }

  const addTask = async (businessId: string) => {
    const name = window.prompt(t('org.addTask'))
    if (!name?.trim()) return
    if (await api(`/businesses/${businessId}/tasks`, 'POST', { name })) reload()
  }
  const deleteTask = async (taskId: string) => {
    if (!window.confirm(t('org.confirmDelete'))) return
    if (await api(`/tasks/${taskId}`, 'DELETE')) reload()
  }
  const addItem = async (taskId: string) => {
    const name = window.prompt(t('org.addItem'))
    if (!name?.trim()) return
    if (await api(`/tasks/${taskId}/items`, 'POST', { name })) reload()
  }
  const deleteItem = async (itemId: string) => {
    if (!window.confirm(t('org.confirmDelete'))) return
    if (await api(`/items/${itemId}`, 'DELETE')) reload()
  }

  return (
    <div className="space-y-5">
      {!canEdit && <p className="text-xs text-zinc-400">{t('org.readonlyHint')}</p>}

      <div className="space-y-4">
        {snapshot.businesses.map((b) => (
          <div key={b.id} className="bg-white border border-zinc-200 rounded-xl p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="font-semibold text-zinc-900">{b.name}</div>
              <div className="text-xs text-zinc-500">
                {t('org.owner')}：{b.owner_name ?? t('org.noOwner')}
              </div>
            </div>

            <div className="space-y-3">
              {b.tasks.map((task) => (
                <div key={task.id} className="border border-zinc-100 rounded-lg p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="font-medium text-sm text-zinc-800">{task.name}</div>
                    {canEdit && (
                      <div className="flex gap-2 text-xs">
                        <button className="text-zinc-400 hover:text-rose-600" onClick={() => deleteTask(task.id)}>{t('org.delete')}</button>
                      </div>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {task.position_ids.length === 0
                      ? <span className="text-xs text-zinc-400">{t('org.empty')}</span>
                      : task.position_ids.map((pid) => <Badge key={pid} label={posName(pid)} color="indigo" size="sm" />)}
                  </div>
                  <ul className="mt-3 space-y-1.5">
                    {task.items.map((it) => (
                      <li key={it.id} className="flex items-center justify-between text-sm border border-zinc-100 rounded-md px-2.5 py-1.5">
                        <span className="text-zinc-700">{it.name}</span>
                        <span className="flex items-center gap-2">
                          <span className="text-[11px] text-zinc-400">{it.owner_name ?? t('org.noOwner')}</span>
                          {canEdit && <button className="text-[11px] text-zinc-400 hover:text-rose-600" onClick={() => deleteItem(it.id)}>{t('org.delete')}</button>}
                        </span>
                      </li>
                    ))}
                  </ul>
                  {canEdit && (
                    <button className="mt-2 text-xs text-primary hover:underline" onClick={() => addItem(task.id)}>+ {t('org.addItem')}</button>
                  )}
                </div>
              ))}
            </div>

            {canEdit && (
              <button className="mt-3 text-xs text-primary hover:underline" onClick={() => addTask(b.id)}>+ {t('org.addTask')}</button>
            )}
          </div>
        ))}
      </div>

      <div className="bg-white border border-zinc-200 rounded-xl p-5">
        <p className="text-xs font-medium text-zinc-500 mb-3">{t('org.positionsTitle')}</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {snapshot.positions.map((p) => (
            <div key={p.id} className="border border-zinc-100 rounded-lg p-3">
              <div className="font-medium text-sm text-zinc-800">{p.name}</div>
              {p.description && <div className="text-[11px] text-zinc-400 mb-1">{p.description}</div>}
              <div className="flex flex-wrap gap-1.5 mt-1">
                {p.members.length === 0
                  ? <span className="text-xs text-zinc-400">{t('org.empty')}</span>
                  : p.members.map((m) => (
                      <Badge key={m.id} label={m.display_name || (m.member_type === 'creator' ? t('org.sourceCreator') : t('org.sourceUser'))} color={m.member_type === 'creator' ? 'amber' : 'teal'} size="sm" />
                    ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
