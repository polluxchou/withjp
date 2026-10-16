'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import Button from '@/components/ui/Button'
import { SearchInput } from '@/components/ui/Field'
import Modal from '@/components/ui/Modal'
import { filterCollaborators } from '@/lib/venue/floor-items'

type UserOption = { id: string; name: string; email: string | null }

// Owner / admin tool: pick which system users may co-edit this venue. The list
// is every WithJP profile (by name + email); current editors come pre-checked.
export default function CollaboratorsModal({ venueId, onClose }: { venueId: string; onClose: () => void }) {
  const t = useTranslations('venue')
  const [users, setUsers] = useState<UserOption[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(false)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const [usersRes, editorsRes] = await Promise.all([
          fetch('/api/users'),
          fetch(`/api/venue/collaborators?id=${encodeURIComponent(venueId)}`),
        ])
        const usersJson = (await usersRes.json()) as { data: UserOption[] | null }
        const editorsJson = (await editorsRes.json()) as { data: { userIds: string[] } | null }
        if (cancelled) return
        if (usersJson.data) setUsers(usersJson.data)
        if (editorsJson.data?.userIds) setSelected(new Set(editorsJson.data.userIds))
      } catch {
        if (!cancelled) setError(true)
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [venueId])

  const filtered = filterCollaborators(users, query)

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function save() {
    setSaving(true)
    setError(false)
    try {
      const res = await fetch('/api/venue/collaborators', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ venueId, userIds: Array.from(selected) }),
      })
      if (!res.ok) throw new Error(`status ${res.status}`)
      onClose()
    } catch {
      setError(true)
      setSaving(false)
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={t('collaboratorsTitle')}
      width="max-w-md"
      footer={
        <>
          {/* mr-auto 把计数/错误推到左端——Modal footer 本身是 justify-end。 */}
          <span className="mr-auto text-xs text-ink-400">
            {error ? (
              <span className="text-danger-text">{t('collaboratorsError')}</span>
            ) : (
              t('collaboratorsCount', { count: selected.size })
            )}
          </span>
          <Button variant="ghost" onClick={onClose}>
            {t('collaboratorsCancel')}
          </Button>
          <Button onClick={save} disabled={saving || loading} loading={saving}>
            {t('collaboratorsSave')}
          </Button>
        </>
      }
    >
      <p className="text-xs text-ink-500">{t('collaboratorsDesc')}</p>

      <div className="mt-3">
        <SearchInput
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t('collaboratorsSearch')}
          aria-label={t('collaboratorsSearch')}
        />
      </div>

      <div className="min-h-40 mt-3">
        {loading ? (
          <p className="px-2 py-6 text-center text-sm text-ink-400">{t('collaboratorsLoading')}</p>
        ) : filtered.length === 0 ? (
          <p className="px-2 py-6 text-center text-sm text-ink-400">{t('collaboratorsEmpty')}</p>
        ) : (
          filtered.map((user) => (
            <label
              key={user.id}
              className="flex cursor-pointer items-center gap-3 rounded-field px-2.5 py-2 hover:bg-line-soft transition-colors"
            >
              <input
                type="checkbox"
                checked={selected.has(user.id)}
                onChange={() => toggle(user.id)}
                className="accent-primary"
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-ink-700">{user.name}</span>
                {user.email && <span className="block truncate text-xs text-ink-400">{user.email}</span>}
              </span>
            </label>
          ))
        )}
      </div>
    </Modal>
  )
}
