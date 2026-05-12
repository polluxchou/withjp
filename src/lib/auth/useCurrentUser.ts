'use client'

import { useState, useEffect } from 'react'

export interface CurrentUser {
  id: string
  is_admin: boolean
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
          cache = { id: json.data.id, is_admin: json.data.is_admin ?? false }
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

export function canEdit(
  currentUser: CurrentUser | null,
  recordOwnerId: string | null,
): boolean {
  if (!currentUser) return false
  if (currentUser.is_admin) return true
  if (!recordOwnerId) return false
  return currentUser.id === recordOwnerId
}
