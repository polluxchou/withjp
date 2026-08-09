'use client'

import { useEffect, useId, useState } from 'react'
import { useTranslations } from 'next-intl'
import Button from '@/components/ui/Button'
import { Field, Input, Select, Textarea } from '@/components/ui/Field'
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
  const t = useTranslations('creatorForm')
  const tCommon = useTranslations('common')
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
  // Hand-rolled label/control pair below (see comment there) needs its own
  // id — useId() rather than a literal string so two CreatorForm instances
  // (unlikely today, but cheap to make safe) never collide.
  const broadcastAccountId = useId()

  useEffect(() => {
    async function loadRelations() {
      try {
        const [broadcastRes, usersRes] = await Promise.all([
          fetch('/api/broadcast-accounts'),
          fetch('/api/users'),
        ])
        if (!broadcastRes.ok || !usersRes.ok) {
          setError(t('relationsLoadFailed'))
        }
        if (broadcastRes.ok) {
          const j = await broadcastRes.json()
          setBroadcastAccounts(j.data ?? [])
        }
        if (usersRes.ok) {
          const j = await usersRes.json()
          setOperators(j.data ?? [])
        }
      } catch {
        setError(t('relationsLoadFailed'))
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
      setError(t('broadcastRequired'))
      return
    }

    setCreatingBroadcast(true)
    setError(null)
    try {
      const res = await fetch('/api/broadcast-accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newBroadcast),
      })
      const json = await res.json()
      if (!res.ok || json.error) {
        setError(json.error ?? `HTTP ${res.status}`)
        return
      }
      setBroadcastAccounts((accounts) => [json.data, ...accounts])
      setForm((f) => ({ ...f, broadcast_account_id: json.data.id }))
      setNewBroadcast({ name: '', platform: form.platform, account_handle: '', account_url: '', notes: '' })
      setShowNewBroadcast(false)
    } catch {
      setError(t('relationsLoadFailed'))
    } finally {
      setCreatingBroadcast(false)
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name || !form.platform) { setError(t('nameRequired')); return }
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
    if (!res.ok || json.error) { setError(json.error ?? `HTTP ${res.status}`); return }
    onSuccess()
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      {error && (
        <div role="alert" className="text-sm text-danger-text bg-danger-soft border border-danger-border rounded-field px-3 py-2">
          {error}
        </div>
      )}

      {/* Neither field carries a native `required` attribute here (nor did
          the original raw <input>/<select> pair) — submit() enforces name +
          platform via its own JS check and a red error banner instead of
          browser-native validation, so Field's `required` prop (which would
          inject a real `required` attribute, not just the asterisk) is
          deliberately omitted to avoid changing that validation behavior.
          The literal " *" already baked into the copy (t('name')/t('platform'))
          carries the visual required-marker instead. */}
      <div className="grid grid-cols-2 gap-4">
        <Field label={t('name')}>
          <Input value={form.name} onChange={set('name')} placeholder={t('namePlaceholder')} />
        </Field>
        <Field label={t('platform')}>
          <Select value={form.platform} onChange={set('platform')}>
            <option value="">{t('selectPlatform')}</option>
            {CREATOR_PLATFORMS.map((p) => <option key={p} value={p}>{p}</option>)}
          </Select>
        </Field>
      </div>

      <Field label={t('platformId')} hint={t('platformIdHint')}>
        <Input value={form.platform_id} onChange={set('platform_id')} placeholder={t('platformIdPlaceholder')} />
      </Field>

      <div className="grid grid-cols-2 gap-4">
        {/* Composite control (select + inline "new" button) — Field's id
            cloning only reaches a single direct child element, so wrapping
            the select+button row in Field would clone the id onto that
            wrapper div instead of the <select>, breaking the label/control
            association. Label + hint are hand-rolled here, matching Field's
            own markup (see components/ui/Field.tsx), for exactly this one
            composite field. */}
        <div className="min-w-0">
          <label htmlFor={broadcastAccountId} className="block text-xs font-medium text-ink-700 mb-1.5">
            {t('broadcastAccount')}
          </label>
          <div className="flex gap-2">
            <div className="min-w-0 flex-1">
              <Select
                id={broadcastAccountId}
                className="w-full"
                value={form.broadcast_account_id}
                onChange={set('broadcast_account_id')}
              >
                <option value="">{t('unassigned')}</option>
                {broadcastAccounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.name} · {account.platform} · {account.account_handle}
                  </option>
                ))}
              </Select>
            </div>
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                if (!showNewBroadcast) {
                  setNewBroadcast((account) => ({ ...account, platform: form.platform }))
                }
                setShowNewBroadcast((show) => !show)
              }}
            >
              {t('new')}
            </Button>
          </div>
          <span className="block text-micro mt-1 text-ink-400">{t('broadcastHint')}</span>
        </div>
        <Field label={t('operator')}>
          <Select value={form.operator_user_id} onChange={set('operator_user_id')}>
            <option value="">{t('unassigned')}</option>
            {operators.map((operator) => (
              <option key={operator.id} value={operator.id}>
                {operator.name} · {operator.user_code}{operator.email ? ` · ${operator.email}` : ''}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      {showNewBroadcast && (
        <div className="border border-line rounded-field p-3 space-y-3">
          {/* Same rationale as the top name/platform Field pair above — no
              native `required` on this trio originally (createBroadcastAccount()
              does its own JS check + setError), so Field's `required` prop is
              omitted here too; the copy's own " *" carries the marker. */}
          <div className="grid grid-cols-3 gap-3">
            <Field label={t('accountName')}>
              <Input value={newBroadcast.name} onChange={setBroadcast('name')} placeholder={t('accountNamePlaceholder')} />
            </Field>
            <Field label={t('platform')}>
              <Select value={newBroadcast.platform} onChange={setBroadcast('platform')}>
                <option value="">{t('selectPlatform')}</option>
                {CREATOR_PLATFORMS.map((p) => <option key={p} value={p}>{p}</option>)}
              </Select>
            </Field>
            <Field label={t('handle')}>
              <Input value={newBroadcast.account_handle} onChange={setBroadcast('account_handle')} placeholder={t('handlePlaceholder')} />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t('url')}>
              <Input value={newBroadcast.account_url} onChange={setBroadcast('account_url')} placeholder={t('urlPlaceholder')} />
            </Field>
            <Field label={t('notes')}>
              <Input value={newBroadcast.notes} onChange={setBroadcast('notes')} placeholder={tCommon('none')} />
            </Field>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setShowNewBroadcast(false)}>{tCommon('cancel')}</Button>
            <Button type="button" loading={creatingBroadcast} onClick={createBroadcastAccount}>{t('createAccount')}</Button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-3 gap-4">
        <Field label={t('niche')}>
          <Input value={form.niche} onChange={set('niche')} placeholder={t('nichePlaceholder')} />
        </Field>
        <Field label={t('followers')}>
          <Input type="number" min="0" value={form.followers} onChange={set('followers')} placeholder="200000" />
        </Field>
        <Field label={t('avgViews')}>
          <Input type="number" min="0" value={form.avg_views} onChange={set('avg_views')} placeholder="50000" />
        </Field>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <Field label={t('location')}>
          <Input value={form.location} onChange={set('location')} placeholder={t('locationPlaceholder')} />
        </Field>
        <Field label={t('email')}>
          <Input type="email" value={form.email} onChange={set('email')} placeholder={t('emailPlaceholder')} />
        </Field>
        <Field label={t('wechat')}>
          <Input value={form.wechat} onChange={set('wechat')} placeholder={t('wechatPlaceholder')} />
        </Field>
      </div>

      <Field label={t('notes')}>
        <Textarea value={form.notes} onChange={set('notes')} rows={2} placeholder={t('notesPlaceholder')} />
      </Field>

      <div className="flex justify-end gap-2 pt-2">
        <Button variant="secondary" type="button" onClick={onCancel}>{tCommon('cancel')}</Button>
        <Button type="submit" loading={loading}>
          {isEditing ? t('saveCreator') : t('addCreator')}
        </Button>
      </div>
    </form>
  )
}
