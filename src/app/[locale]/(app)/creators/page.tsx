'use client'

import { useState, useEffect, useCallback } from 'react'
import Header from '@/components/layout/Header'
import LifecycleBadge from '@/components/creators/LifecycleBadge'
import CreatorForm from '@/components/creators/CreatorForm'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import { Plus, Search, Users, ExternalLink } from 'lucide-react'
import { Link } from '@/i18n/navigation'
import { useTranslations } from 'next-intl'
import type { Creator, CreatorStatus } from '@/lib/types'
import { ALL_STATUSES } from '@/lib/state-machine/creator-lifecycle'
import { getPlatformUrl } from '@/lib/creators/platforms'

export default function CreatorsPage() {
  const [creators, setCreators] = useState<Creator[]>([])
  const [loading,  setLoading]  = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [search,   setSearch]   = useState('')
  const [filter,   setFilter]   = useState<CreatorStatus | 'all'>('all')
  const [showForm, setShowForm] = useState(false)
  const t = useTranslations('creators')
  const tCommon = useTranslations('common')
  const tStatus = useTranslations('status')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const url = filter === 'all' ? '/api/creators' : `/api/creators?status=${filter}`
      const res = await fetch(url)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json = await res.json()
      setLoadError(json.error ?? null)
      setCreators(json.data ?? [])
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : tCommon('loadFailed'))
      setCreators([])
    } finally {
      setLoading(false)
    }
  }, [filter])

  useEffect(() => { load() }, [load])

  const filtered = creators.filter((c) =>
    !search || c.name.toLowerCase().includes(search.toLowerCase()) ||
    c.platform.toLowerCase().includes(search.toLowerCase()) ||
    (c.profile?.niche ?? '').toLowerCase().includes(search.toLowerCase()) ||
    (c.broadcast_account?.name ?? '').toLowerCase().includes(search.toLowerCase()) ||
    (c.operator_user?.name ?? '').toLowerCase().includes(search.toLowerCase()) ||
    (c.operator_user?.user_code ?? '').toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div>
      <Header
        title={t('title')}
        subtitle={t('subtitle', { count: creators.length })}
        actions={
          <Button onClick={() => setShowForm(true)}>
            <Plus className="w-4 h-4" /> {t('addCreator')}
          </Button>
        }
      />

      {/* Filters */}
      <div className="flex items-center gap-3 mb-5">
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -tranzinc-y-1/2 text-zinc-400" />
          <input
            value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder={t('searchCreators')}
            className="pl-9 pr-4 py-2 text-sm border border-zinc-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500 w-60"
          />
        </div>
        <div className="flex items-center gap-1.5">
          {(['all', ...ALL_STATUSES] as const).map((s) => (
            <button
              key={s}
              onClick={() => setFilter(s)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                filter === s
                  ? 'bg-primary text-white'
                  : 'bg-white border border-zinc-200 text-zinc-600 hover:bg-zinc-50'
              }`}
            >
              {s === 'all' ? tCommon('all') : tStatus(s)}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="bg-white border border-zinc-200 rounded-xl overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-sm text-zinc-400">{tCommon('loading')}</div>
        ) : loadError ? (
          <div className="p-6">
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              {loadError}
            </div>
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center">
            <Users className="w-10 h-10 text-zinc-300 mx-auto mb-3" />
            <p className="text-sm text-zinc-500">{t('noCreatorsFound')}</p>
            <button onClick={() => setShowForm(true)} className="mt-3 text-sm text-primary font-medium hover:underline">{t('addFirstCreator')}</button>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-100 bg-zinc-50">
                <th className="text-left px-5 py-3 text-xs font-medium text-zinc-500">{t('creator')}</th>
                <th className="text-left px-5 py-3 text-xs font-medium text-zinc-500">{t('platform')}</th>
                <th className="text-left px-5 py-3 text-xs font-medium text-zinc-500">{t('status')}</th>
                <th className="text-left px-5 py-3 text-xs font-medium text-zinc-500">{t('broadcastAccount')}</th>
                <th className="text-left px-5 py-3 text-xs font-medium text-zinc-500">{t('operator')}</th>
                <th className="text-left px-5 py-3 text-xs font-medium text-zinc-500">{t('niche')}</th>
                <th className="text-left px-5 py-3 text-xs font-medium text-zinc-500">{t('location')}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => {
                const platformUrl = getPlatformUrl(c.platform, c.profile?.platform_id)
                return (
                  <tr key={c.id} className="border-b border-zinc-50 hover:bg-zinc-50 transition-colors">
                    <td className="px-5 py-3 font-medium text-zinc-900">{c.name}</td>
                    <td className="px-5 py-3 text-zinc-500">
                      {platformUrl ? (
                        <a
                          href={platformUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary hover:text-violet-800 inline-flex items-center gap-1"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {c.platform}
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      ) : (
                        c.platform
                      )}
                    </td>
                    <td className="px-5 py-3"><LifecycleBadge status={c.status} size="sm" /></td>
                    <td className="px-5 py-3 text-zinc-500">
                      {c.broadcast_account ? (
                        <div>
                          <div className="font-medium text-zinc-700 truncate">{c.broadcast_account.name}</div>
                          <div className="text-xs text-zinc-400 truncate">{c.broadcast_account.account_handle}</div>
                        </div>
                      ) : '—'}
                    </td>
                    <td className="px-5 py-3 text-zinc-500">
                      {c.operator_user ? (
                        <div>
                          <div className="font-medium text-zinc-700 truncate">{c.operator_user.name}</div>
                          <div className="text-xs text-zinc-400 truncate">{c.operator_user.user_code}</div>
                        </div>
                      ) : '—'}
                    </td>
                    <td className="px-5 py-3 text-zinc-400">{c.profile?.niche ?? '—'}</td>
                    <td className="px-5 py-3 text-zinc-400">{c.profile?.location ?? '—'}</td>
                    <td className="px-5 py-3 text-right">
                      <Link
                        href={`/creators/${c.id}`}
                        className="text-xs text-primary font-medium hover:text-violet-800"
                      >
                        {t('view')} →
                      </Link>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {showForm && (
        <Modal open={showForm} onClose={() => setShowForm(false)} title={t('addCreator')} width="max-w-2xl">
          <CreatorForm onSuccess={() => { setShowForm(false); load() }} onCancel={() => setShowForm(false)} />
        </Modal>
      )}
    </div>
  )
}
