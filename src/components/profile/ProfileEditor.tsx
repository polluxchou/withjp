'use client'

import { useState, useEffect } from 'react'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import type { AgentRole, UserProfile } from '@/lib/types'

interface ProfileEditorProps {
  open: boolean
  onClose: () => void
  onSuccess?: () => void
}

const ROLE_LABELS: Record<AgentRole, { zh: string; en: string; ja: string }> = {
  bd: { zh: '商务拓展', en: 'Business Development', ja: 'ビジネス開発' },
  ops: { zh: '运营', en: 'Operations', ja: 'オペレーション' },
  finance: { zh: '财务', en: 'Finance', ja: '財務' },
  content: { zh: '内容', en: 'Content', ja: 'コンテンツ' },
  growth: { zh: '增长', en: 'Growth', ja: 'グロース' },
  legal: { zh: '法务', en: 'Legal', ja: '法務' },
}

export default function ProfileEditor({ open, onClose, onSuccess }: ProfileEditorProps) {
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [name, setName] = useState('')
  const [role, setRole] = useState<AgentRole>('bd')
  const [error, setError] = useState('')
  const [lang, setLang] = useState('zh')

  useEffect(() => {
    const stored = localStorage.getItem('language') || 'zh'
    setLang(stored)
  }, [])

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
      setError('Failed to load profile')
    } finally {
      setLoading(false)
    }
  }

  async function handleSave() {
    if (!name.trim()) {
      setError(lang === 'zh' ? '姓名不能为空' : lang === 'ja' ? '名前は必須です' : 'Name is required')
      return
    }

    if (name.length > 30) {
      setError(lang === 'zh' ? '姓名不能超过30个字符' : lang === 'ja' ? '名前は30文字以内です' : 'Name must not exceed 30 characters')
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
      setError(lang === 'zh' ? '保存失败' : lang === 'ja' ? '保存に失敗しました' : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  const TRANSLATIONS = {
    zh: {
      title: '编辑个人信息',
      name: '姓名',
      namePlaceholder: '请输入姓名（最多30个字符）',
      userCode: '用户ID',
      email: '邮箱',
      role: '角色',
      selectRole: '选择角色',
      cancel: '取消',
      save: '保存',
      loading: '加载中...',
    },
    en: {
      title: 'Edit Profile',
      name: 'Name',
      namePlaceholder: 'Enter name (max 30 characters)',
      userCode: 'User ID',
      email: 'Email',
      role: 'Role',
      selectRole: 'Select role',
      cancel: 'Cancel',
      save: 'Save',
      loading: 'Loading...',
    },
    ja: {
      title: 'プロフィール編集',
      name: '名前',
      namePlaceholder: '名前を入力（最大30文字）',
      userCode: 'ユーザーID',
      email: 'メール',
      role: '役割',
      selectRole: '役割を選択',
      cancel: 'キャンセル',
      save: '保存',
      loading: '読み込み中...',
    },
  }
  const t = TRANSLATIONS[lang as keyof typeof TRANSLATIONS] ?? TRANSLATIONS.zh

  return (
    <Modal open={open} onClose={onClose} title={t.title}>
      {loading ? (
        <div className="text-center py-8 text-sm text-slate-400">{t.loading}</div>
      ) : (
        <div className="space-y-4">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
              {error}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              {t.name}
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t.namePlaceholder}
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
                  {t.userCode}
                </label>
                <div className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-600 bg-slate-50">
                  {profile.user_code}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  {t.email}
                </label>
                <div className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-600 bg-slate-50 truncate">
                  {profile.email ?? '—'}
                </div>
              </div>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              {t.role}
            </label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as AgentRole)}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              {(Object.keys(ROLE_LABELS) as AgentRole[]).map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABELS[r][lang as 'zh' | 'en' | 'ja']}
                </option>
              ))}
            </select>
          </div>

          <div className="flex gap-2 justify-end pt-4">
            <Button variant="secondary" onClick={onClose}>
              {t.cancel}
            </Button>
            <Button onClick={handleSave} loading={saving}>
              {t.save}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  )
}
