'use client'

import { useState, useEffect } from 'react'
import { useTranslations } from 'next-intl'
import { LogOut } from 'lucide-react'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import { FOCUS_RING } from '@/lib/ui/recipes'
import { useRouter } from '@/i18n/navigation'
import type { AgentRole, UserProfile } from '@/lib/types'

interface ProfileEditorProps {
  open: boolean
  onClose: () => void
  onSuccess?: () => void
}

// 真人可选角色下拉：AgentRole 8 值里的 6 部门 + 'tech'（真人技术岗，
// migration 016 新增）。'pmo' 刻意不进这个数组——它是 AI 代理专属角色
// （PMO Agent 自身的 role），不该出现在真人用户可选的角色列表里。
const ROLES: AgentRole[] = ['bd', 'ops', 'finance', 'content', 'growth', 'legal', 'tech']

export default function ProfileEditor({ open, onClose, onSuccess }: ProfileEditorProps) {
  const t = useTranslations('profile')
  const tCommon = useTranslations('common')
  const tNav = useTranslations('nav')
  const tRoles = useTranslations('roles')
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [signingOut, setSigningOut] = useState(false)
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [name, setName] = useState('')
  const [role, setRole] = useState<AgentRole>('bd')
  const [error, setError] = useState('')

  async function handleLogout() {
    // Two-step confirmation: opening the modal already filters out
    // accidental sidebar clicks; the confirm prompt is the final guard.
    if (!window.confirm(t('logoutConfirm'))) return
    setSigningOut(true)
    try {
      const { supabase } = await import('@/lib/supabase/client')
      await supabase.auth.signOut()
      onClose()
      router.push('/login')
      router.refresh()
    } catch {
      setSigningOut(false)
    }
  }

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

  const INPUT  = `w-full px-3 py-2 border border-line-strong rounded-field text-sm text-ink-900 ${FOCUS_RING}`
  const RO     = 'w-full px-3 py-2 border border-line-strong rounded-field text-sm text-ink-700 bg-canvas'
  const LABEL  = 'block text-xs font-medium text-ink-700 mb-1.5'

  return (
    <Modal open={open} onClose={onClose} title={t('title')} width="max-w-2xl">
      {loading ? (
        <div className="text-center py-8 text-sm text-ink-400">{tCommon('loading')}</div>
      ) : (
        <div className="space-y-4">
          {error && (
            <div className="bg-danger-soft border border-danger-border text-danger-text px-4 py-3 rounded-field text-sm">
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
              <div className="text-xs text-ink-400 mt-1">{name.length}/30</div>
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
                <label className={LABEL}>{t('accountType')}</label>
                <div className="flex items-center gap-2 flex-wrap">
                  {profile.is_admin ? (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-primary-soft text-primary">
                      <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 1a4.5 4.5 0 00-4.5 4.5V9H5a2 2 0 00-2 2v6a2 2 0 002 2h10a2 2 0 002-2v-6a2 2 0 00-2-2h-.5V5.5A4.5 4.5 0 0010 1zm3 8V5.5a3 3 0 10-6 0V9h6z" clipRule="evenodd" />
                      </svg>
                      {t('roleAdmin')}
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-muted-soft text-muted-text">
                      <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
                      </svg>
                      {t('roleUser')}
                    </span>
                  )}
                  <span className="text-xs text-ink-400">
                    {profile.is_admin ? t('adminScope') : t('userScope')}
                  </span>
                </div>
              </div>
            </>
          )}

          <div className="flex items-center justify-between gap-2 pt-2 border-t border-line-soft mt-2">
            <button
              type="button"
              onClick={handleLogout}
              disabled={signingOut}
              className={`flex items-center gap-1.5 text-sm text-danger-text hover:bg-danger-soft px-3 py-1.5 rounded-field transition-colors disabled:opacity-50 ${FOCUS_RING}`}
            >
              <LogOut className="w-4 h-4" strokeWidth={1.5} />
              {signingOut ? tCommon('loading') : tNav('logout')}
            </button>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={onClose}>{tCommon('cancel')}</Button>
              <Button onClick={handleSave} loading={saving}>{tCommon('save')}</Button>
            </div>
          </div>
        </div>
      )}
    </Modal>
  )
}
