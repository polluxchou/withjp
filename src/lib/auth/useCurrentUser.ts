'use client'

import { useState, useEffect } from 'react'
import { scopedWriteAllowed } from './access-scope'

export interface CurrentUser {
  id: string
  is_admin: boolean
  /** 受限帐号的范围（见 access-scope.ts）；null = 普通成员。 */
  access_scope: string | null
}

let cache: CurrentUser | null = null
let pending: Promise<CurrentUser | null> | null = null

async function fetchCurrentUser(): Promise<CurrentUser | null> {
  if (cache) return cache
  if (!pending) {
    pending = fetch('/api/profile')
      .then((r) => r.json())
      .then((json) => {
        if (json.data) {
          cache = {
            id: json.data.id,
            is_admin: json.data.is_admin ?? false,
            access_scope: json.data.access_scope ?? null,
          }
        }
        return cache
      })
      .catch(() => null)
      .finally(() => { pending = null })
  }
  return pending
}

export function useCurrentUser() {
  const [user, setUser] = useState<CurrentUser | null>(null)

  useEffect(() => {
    fetchCurrentUser().then(setUser)
  }, [])

  return user
}

// 受限帐号（见 access-scope.ts）没有删除权，删除入口直接不显示；接口那边也会 403。
// 资料没取回前按普通成员显示，与原先一致。
export function useCanDelete(): boolean {
  return !useCurrentUser()?.access_scope
}

// 带 owner 的版本：受限帐号在 SCOPED_SELF_DELETE_TABLES 里能删自己的记录（目前只有截图）。
export function useCanDeleteOwned(table: string, ownerId: string | null): boolean {
  const user = useCurrentUser()
  if (!user) return true
  return scopedWriteAllowed(user, 'delete', ownerId, table)
}

export function canEdit(
  currentUser: CurrentUser | null,
  recordOwnerId: string | null,
): boolean {
  if (!currentUser) return false
  if (currentUser.is_admin) return true
  if (!recordOwnerId) return false
  return currentUser.id === recordOwnerId
}
