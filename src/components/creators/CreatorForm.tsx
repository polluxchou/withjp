'use client'

import { useEffect, useState } from 'react'
import Button from '@/components/ui/Button'
import { CREATOR_PLATFORMS } from '@/lib/creators/platforms'
import type { BroadcastAccount, Creator, UserProfile } from '@/lib/types'

interface FormData {
  name: string
  platform: string
  platform_id: string
  niche: string
  followers: string
  avg_views: string
  location: string
  broadcast_account_id: string
  operator_user_id: string
  email: string
  wechat: string
  notes: string
}

interface Props {
  creator?: Creator
  onSuccess: () => void
  onCancel: () => void
}

export default function CreatorForm({ creator, onSuccess, onCancel }: Props) {
  const [form, setForm] = useState<FormData>({
    name: creator?.name || '',
    platform: creator?.platform || '',
    platform_id: creator?.profile?.platform_id || '',
    niche: creator?.profile?.niche || '',
    followers: creator?.profile?.followers?.toString() || '',
    avg_views: creator?.profile?.avg_views?.toString() || '',
    location: creator?.profile?.location || '',
    broadcast_account_id: creator?.broadcast_account_id || '',
    operator_user_id: creator?.operator_user_id || '',
    email: creator?.contact_info?.email || '',
    wechat: creator?.contact_info?.wechat || '',
    notes: creator?.notes || '',
  })
  const [showNewBroadcast, setShowNewBroadcast] = useState(false)
  const [creatingBroadcast, setCreatingBroadcast] = useState(false)
  const [newBroadcast, setNewBroadcast] = useState({
    name: '',
    platform: creator?.platform || '',
    account_handle: '',
    account_url: '',
    notes: '',
  })
  const [broadcastAccounts, setBroadcastAccounts] = useState<BroadcastAccount[]>([])
  const [operators, setOperators] = useState<Pick<UserProfile, 'id' | 'name' | 'email' | 'user_code' | 'role'>[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const isEditing = !!creator

  useEffect(() => {
    async function loadRelations() {
      try {
        const [broadcastRes, usersRes] = await Promise.all([
          fetch('/api/broadcast-accounts'),
          fetch('/api/users'),
        ])
        const [broadcastJson, usersJson] = await Promise.all([
          broadcastRes.json(),
          usersRes.json(),
        ])
        setBroadcastAccounts(broadcastJson.data ?? [])
        setOperators(usersJson.data ?? [])
      } catch {
        setError('Failed to load broadcast accounts or operators')
      }
    }

    loadRelations()
  }, [])

  const set = (k: keyof FormData) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }))

  const setBroadcast = (k: keyof typeof newBroadcast) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setNewBroadcast((f) => ({ ...f, [k]: e.target.value }))

  async function createBroadcastAccount() {
    if (!newBroadcast.name || !newBroadcast.platform || !newBroadcast.account_handle) {
      setError('Broadcast account name, platform, and handle are required')
      return
    }

    setCreatingBroadcast(true)
    setError(null)
    const res = await fetch('/api/broadcast-accounts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newBroadcast),
    })
    const json = await res.json()
    setCreatingBroadcast(false)

    if (json.error) {
      setError(json.error)
      return
    }

    setBroadcastAccounts((accounts) => [json.data, ...accounts])
    setForm((f) => ({ ...f, broadcast_account_id: json.data.id }))
    setNewBroadcast({ name: '', platform: form.platform, account_handle: '', account_url: '', notes: '' })
    setShowNewBroadcast(false)
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name || !form.platform) { setError('Name and platform are required'); return }
    setLoading(true)
    setError(null)

    const payload = {
      name:     form.name,
      platform: form.platform,
      broadcast_account_id: form.broadcast_account_id || null,
      operator_user_id: form.operator_user_id || null,
      contact_info: { email: form.email, wechat: form.wechat },
      profile: {
        platform_id: form.platform_id || undefined,
        niche:     form.niche || undefined,
        followers: form.followers ? Number(form.followers) : undefined,
        avg_views: form.avg_views ? Number(form.avg_views) : undefined,
        location:  form.location || undefined,
      },
      notes: form.notes || undefined,
    }

    const url = isEditing ? `/api/creators/${creator.id}` : '/api/creators'
    const method = isEditing ? 'PATCH' : 'POST'

    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })

    const json = await res.json()
    setLoading(false)
    if (json.error) { setError(json.error); return }
    onSuccess()
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      {error && (
        <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
          {error}
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1">Name *</label>
          <input value={form.name} onChange={set('name')} placeholder="Creator name"
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1">Platform *</label>
          <select value={form.platform} onChange={set('platform')}
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
            <option value="">Select platform</option>
            {CREATOR_PLATFORMS.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
      </div>

      <div>
        <label className="block text-xs font-medium text-slate-700 mb-1">Platform ID / Username</label>
        <input value={form.platform_id} onChange={set('platform_id')} placeholder="e.g. @username or channel ID"
          className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
        <p className="text-xs text-slate-400 mt-1">用于生成平台主页链接（TikTok, Instagram, YouTube, Twitch）</p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1">Broadcast Account</label>
          <div className="flex gap-2">
            <select value={form.broadcast_account_id} onChange={set('broadcast_account_id')}
              className="min-w-0 flex-1 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
              <option value="">Unassigned</option>
              {broadcastAccounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name} · {account.platform} · {account.account_handle}
                </option>
              ))}
            </select>
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setNewBroadcast((account) => ({ ...account, platform: account.platform || form.platform }))
                setShowNewBroadcast((show) => !show)
              }}
            >
              New
            </Button>
          </div>
          <p className="text-xs text-slate-400 mt-1">一个团播账号只能绑定一个 Creator</p>
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1">Operator</label>
          <select value={form.operator_user_id} onChange={set('operator_user_id')}
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
            <option value="">Unassigned</option>
            {operators.map((operator) => (
              <option key={operator.id} value={operator.id}>
                {operator.name} · {operator.user_code}{operator.email ? ` · ${operator.email}` : ''}
              </option>
            ))}
          </select>
        </div>
      </div>

      {showNewBroadcast && (
        <div className="border border-slate-200 rounded-lg p-3 space-y-3">
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Account Name *</label>
              <input value={newBroadcast.name} onChange={setBroadcast('name')} placeholder="Team live account"
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Platform *</label>
              <select value={newBroadcast.platform} onChange={setBroadcast('platform')}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
                <option value="">Select platform</option>
                {CREATOR_PLATFORMS.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Handle *</label>
              <input value={newBroadcast.account_handle} onChange={setBroadcast('account_handle')} placeholder="@account"
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">URL</label>
              <input value={newBroadcast.account_url} onChange={setBroadcast('account_url')} placeholder="https://..."
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Notes</label>
              <input value={newBroadcast.notes} onChange={setBroadcast('notes')} placeholder="Optional"
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setShowNewBroadcast(false)}>Cancel</Button>
            <Button type="button" loading={creatingBroadcast} onClick={createBroadcastAccount}>Create Account</Button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-3 gap-4">
        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1">Niche</label>
          <input value={form.niche} onChange={set('niche')} placeholder="e.g. Gaming"
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1">Followers</label>
          <input type="number" value={form.followers} onChange={set('followers')} placeholder="200000"
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1">Avg Views</label>
          <input type="number" value={form.avg_views} onChange={set('avg_views')} placeholder="50000"
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1">Location</label>
          <input value={form.location} onChange={set('location')} placeholder="Shanghai"
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1">Email</label>
          <input type="email" value={form.email} onChange={set('email')} placeholder="creator@email.com"
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1">WeChat</label>
          <input value={form.wechat} onChange={set('wechat')} placeholder="wechat_id"
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
        </div>
      </div>

      <div>
        <label className="block text-xs font-medium text-slate-700 mb-1">Notes</label>
        <textarea value={form.notes} onChange={set('notes')} rows={2} placeholder="Any additional context..."
          className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none" />
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <Button variant="secondary" type="button" onClick={onCancel}>Cancel</Button>
        <Button type="submit" loading={loading}>
          {isEditing ? 'Save Changes' : 'Add Creator'}
        </Button>
      </div>
    </form>
  )
}
