'use client'

import { useState, useEffect, useCallback } from 'react'
import Header from '@/components/layout/Header'
import LifecycleBadge from '@/components/creators/LifecycleBadge'
import CreatorForm from '@/components/creators/CreatorForm'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import { Plus, Search, Users, ExternalLink } from 'lucide-react'
import { Link } from '@/i18n/navigation'
import type { Creator, CreatorStatus } from '@/lib/types'
import { ALL_STATUSES, STATUS_LABEL } from '@/lib/state-machine/creator-lifecycle'
import { getPlatformUrl } from '@/lib/creators/platforms'

export default function CreatorsPage() {
  const [creators, setCreators] = useState<Creator[]>([])
  const [loading,  setLoading]  = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [search,   setSearch]   = useState('')
  const [filter,   setFilter]   = useState<CreatorStatus | 'all'>('all')
  const [showForm, setShowForm] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const url = filter === 'all' ? '/api/creators' : `/api/creators?status=${filter}`
    const res = await fetch(url)
    const json = await res.json()
    setLoadError(json.error ?? null)
    setCreators(json.data ?? [])
    setLoading(false)
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
        title="Creators"
        subtitle={`${creators.length} creators in the guild`}
        actions={
          <Button onClick={() => setShowForm(true)}>
            <Plus className="w-4 h-4" /> Add Creator
          </Button>
        }
      />

      {/* Filters */}
      <div className="flex items-center gap-3 mb-5">
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Search creators..."
            className="pl-9 pr-4 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 w-60"
          />
        </div>
        <div className="flex items-center gap-1.5">
          {(['all', ...ALL_STATUSES] as const).map((s) => (
            <button
              key={s}
              onClick={() => setFilter(s)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                filter === s
                  ? 'bg-indigo-600 text-white'
                  : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
              }`}
            >
              {s === 'all' ? 'All' : STATUS_LABEL[s]}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-sm text-slate-400">Loading...</div>
        ) : loadError ? (
          <div className="p-6">
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              {loadError}
            </div>
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center">
            <Users className="w-10 h-10 text-slate-300 mx-auto mb-3" />
            <p className="text-sm text-slate-500">No creators found.</p>
            <button onClick={() => setShowForm(true)} className="mt-3 text-sm text-indigo-600 font-medium hover:underline">Add your first creator</button>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50">
                <th className="text-left px-5 py-3 text-xs font-medium text-slate-500">Creator</th>
                <th className="text-left px-5 py-3 text-xs font-medium text-slate-500">Platform</th>
                <th className="text-left px-5 py-3 text-xs font-medium text-slate-500">Status</th>
                <th className="text-left px-5 py-3 text-xs font-medium text-slate-500">Broadcast</th>
                <th className="text-left px-5 py-3 text-xs font-medium text-slate-500">Operator</th>
                <th className="text-left px-5 py-3 text-xs font-medium text-slate-500">Niche</th>
                <th className="text-left px-5 py-3 text-xs font-medium text-slate-500">Location</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => {
                const platformUrl = getPlatformUrl(c.platform, c.profile?.platform_id)
                return (
                  <tr key={c.id} className="border-b border-slate-50 hover:bg-slate-50 transition-colors">
                    <td className="px-5 py-3 font-medium text-slate-900">{c.name}</td>
                    <td className="px-5 py-3 text-slate-500">
                      {platformUrl ? (
                        <a
                          href={platformUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-indigo-600 hover:text-indigo-800 inline-flex items-center gap-1"
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
                    <td className="px-5 py-3 text-slate-500">
                      {c.broadcast_account ? (
                        <div>
                          <div className="font-medium text-slate-700 truncate">{c.broadcast_account.name}</div>
                          <div className="text-xs text-slate-400 truncate">{c.broadcast_account.account_handle}</div>
                        </div>
                      ) : '—'}
                    </td>
                    <td className="px-5 py-3 text-slate-500">
                      {c.operator_user ? (
                        <div>
                          <div className="font-medium text-slate-700 truncate">{c.operator_user.name}</div>
                          <div className="text-xs text-slate-400 truncate">{c.operator_user.user_code}</div>
                        </div>
                      ) : '—'}
                    </td>
                    <td className="px-5 py-3 text-slate-400">{c.profile?.niche ?? '—'}</td>
                    <td className="px-5 py-3 text-slate-400">{c.profile?.location ?? '—'}</td>
                    <td className="px-5 py-3 text-right">
                      <Link
                        href={`/creators/${c.id}`}
                        className="text-xs text-indigo-600 font-medium hover:text-indigo-800"
                      >
                        View →
                      </Link>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      <Modal open={showForm} onClose={() => setShowForm(false)} title="Add New Creator" width="max-w-2xl">
        <CreatorForm onSuccess={() => { setShowForm(false); load() }} onCancel={() => setShowForm(false)} />
      </Modal>
    </div>
  )
}
