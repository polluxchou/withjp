'use client'

import { useState, useEffect } from 'react'
import { useTranslations } from 'next-intl'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import type { AgentRole, UserProfile } from '@/lib/types'

interface ProfileEditorProps {
  open: boolean
  onClose: () => void
  onSuccess?: () => void
}

const ROLES: AgentRole[] = ['bd', 'ops', 'finance', 'content', 'growth', 'legal']

export default function ProfileEditor({ open, onClose, onSuccess }: ProfileEditorProps) {
  const t = useTranslations('profile')
  const tCommon = useTranslations('common')
  const tRoles = useTranslations('roles')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [name, setName] = useState('')
  const [role, setRole] = useState<AgentRole>('bd')
  const [error, setError] = useState('')

  useEffect(() => {
    if (open) {
      loadProfile()
    }
  }, [open])

  async function loadProfile() {
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/profile')
      const json = await res.json()
      if (json.error) {
        setError(json.error)
      } else if (json.data) {
        setProfile(json.data)
        setName(json.data.name)
        setRole(json.data.role)
      }
    } catch (err) {
      setError(t('loadFailed'))
    } finally {
      setLoading(false)
    }
  }

  async function handleSave() {
    if (!name.trim()) {
      setError(t('nameRequired'))
      return
    }

    if (name.length > 30) {
      setError(t('nameTooLong'))
      return
    }

    setSaving(true)
    setError('')
    try {
      const res = await fetch('/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), role }),
      })
      const json = await res.json()
      if (json.error) {
        setError(json.error)
      } else {
        onSuccess?.()
        onClose()
      }
    } catch (err) {
      setError(t('saveFailed'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={t('title')}>
      {loading ? (
        <div className="text-center py-8 text-sm text-slate-400">{tCommon('loading')}</div>
      ) : (
        <div className="space-y-4">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
              {error}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              {t('name')}
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('namePlaceholder')}
              maxLength={30}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <div className="text-xs text-slate-400 mt-1">
              {name.length}/30
            </div>
          </div>

          {profile && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  {t('userCode')}
                </label>
                <div className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-600 bg-slate-50">
                  {profile.user_code}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  {t('email')}
                </label>
                <div className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-600 bg-slate-50 truncate">
                  {profile.email ?? '—'}
                </div>
              </div>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              {t('role')}
            </label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as AgentRole)}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {tRoles(r)}
                </option>
              ))}
            </select>
          </div>

          <div className="flex gap-2 justify-end pt-4">
            <Button variant="secondary" onClick={onClose}>
              {tCommon('cancel')}
            </Button>
            <Button onClick={handleSave} loading={saving}>
              {tCommon('save')}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  )
}
