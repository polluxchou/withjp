'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import {
  applyAddTask, applyDeleteTask, applyAddItem, applyDeleteItem,
  applySetBusinessOwner, applySetItemOwner,
  applyAddMember, applyRemoveMember, applySetTaskPositions, applyUpdateItemFields,
} from '@/lib/org/tree'
import type { ItemPatch } from '@/lib/org/quadrant'
import type { OrgSnapshot, PersonOption } from '@/lib/types'

function refOf(person: PersonOption | null) {
  if (!person) return null
  return {
    member_type: person.member_type,
    user_id: person.member_type === 'user' ? person.id : null,
    creator_id: person.member_type === 'creator' ? person.id : null,
  }
}

export interface OrgActions {
  addTask: (businessId: string) => Promise<void>
  deleteTask: (taskId: string) => Promise<void>
  addItem: (taskId: string) => Promise<void>
  deleteItem: (itemId: string) => Promise<void>
  setBusinessOwner: (businessId: string, person: PersonOption | null) => Promise<void>
  setItemOwner: (itemId: string, person: PersonOption | null) => Promise<void>
  editTaskPositions: (taskId: string, currentIds: string[]) => void
  addMember: (positionId: string, person: PersonOption) => Promise<void>
  removeMember: (positionId: string, memberId: string) => Promise<void>
  updateItemFields: (itemId: string, fields: ItemPatch) => Promise<void>
}

/** 业务分工页的共享快照与写入封装：「结构」「四象限」两个视图共用，任一视图改完另一个立即可见。 */
export function useOrgSnapshot(initial: OrgSnapshot): { snapshot: OrgSnapshot; actions: OrgActions } {
  const t = useTranslations('team')
  const [snapshot, setSnapshot] = useState<OrgSnapshot>(initial)

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
  const updateItemFields = async (itemId: string, fields: ItemPatch) => {
    if (await api(`/items/${itemId}`, 'PATCH', fields)) setSnapshot((s) => applyUpdateItemFields(s, itemId, fields))
  }

  return {
    snapshot,
    actions: {
      addTask, deleteTask, addItem, deleteItem, setBusinessOwner, setItemOwner,
      editTaskPositions, addMember, removeMember, updateItemFields,
    },
  }
}
