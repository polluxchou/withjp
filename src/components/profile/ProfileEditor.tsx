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

  const INPUT  = 'w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500'
  const RO     = 'w-full px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-600 bg-slate-50'
  const LABEL  = 'block text-xs font-medium text-slate-700 mb-1.5'

  return (
    <Modal open={open} onClose={onClose} title={t('title')} width="max-w-2xl">
      {loading ? (
        <div className="text-center py-8 text-sm text-slate-400">{tCommon('loading')}</div>
      ) : (
        <div className="space-y-4">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
              {error}
            </div>
          )}

          {/* Row 1: Name (left) · Role (right) — stacks on mobile */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className={LABEL}>{t('name')}</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t('namePlaceholder')}
                maxLength={30}
                className={INPUT}
              />
              <div className="text-xs text-slate-400 mt-1">{name.length}/30</div>
            </div>
            <div>
              <label className={LABEL}>{t('role')}</label>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value as AgentRole)}
                className={INPUT}
              >
                {ROLES.map((r) => (
                  <option key={r} value={r}>{tRoles(r)}</option>
                ))}
              </select>
            </div>
          </div>

          {profile && (
            <>
              {/* Row 2: User code · Email — stacks on mobile */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className={LABEL}>{t('userCode')}</label>
                  <div className={RO}>{profile.user_code}</div>
                </div>
                <div>
                  <label className={LABEL}>{t('email')}</label>
                  <div className={`${RO} truncate`}>{profile.email ?? '—'}</div>
                </div>
              </div>

              {/* Row 3: Account type — always full width */}
              <div>
                <label className={LABEL}>账号类型</label>
                <div className="flex items-center gap-2 flex-wrap">
                  {profile.is_admin ? (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-indigo-100 text-indigo-700">
                      <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 1a4.5 4.5 0 00-4.5 4.5V9H5a2 2 0 00-2 2v6a2 2 0 002 2h10a2 2 0 002-2v-6a2 2 0 00-2-2h-.5V5.5A4.5 4.5 0 0010 1zm3 8V5.5a3 3 0 10-6 0V9h6z" clipRule="evenodd" />
                      </svg>
                      管理员
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-600">
                      <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
                      </svg>
                      普通用户
                    </span>
                  )}
                  <span className="text-xs text-slate-400">
                    {profile.is_admin ? '可管理所有条目' : '仅可管理自己创建的条目'}
                  </span>
                </div>
              </div>
            </>
          )}

          <div className="flex gap-2 justify-end pt-2">
            <Button variant="secondary" onClick={onClose}>{tCommon('cancel')}</Button>
            <Button onClick={handleSave} loading={saving}>{tCommon('save')}</Button>
          </div>
        </div>
      )}
    </Modal>
  )
}
