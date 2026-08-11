'use client'

import { useState, useEffect, useCallback } from 'react'
import Header from '@/components/layout/Header'
import LifecycleBadge from '@/components/creators/LifecycleBadge'
import CreatorForm from '@/components/creators/CreatorForm'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import SectionCard from '@/components/ui/SectionCard'
import RecordRow from '@/components/ui/RecordRow'
import EmptyState from '@/components/ui/EmptyState'
import ErrorState from '@/components/ui/ErrorState'
import LoadingState from '@/components/ui/LoadingState'
import { SearchInput } from '@/components/ui/Field'
import { CountChip } from '@/components/ui/FilterChip'
import { toneOf } from '@/lib/ui/status-tone'
import { Plus, Users } from 'lucide-react'
import { useTranslations } from 'next-intl'
import type { Creator, CreatorStatus } from '@/lib/types'
import { ALL_STATUSES } from '@/lib/state-machine/creator-lifecycle'

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
      if (!res.ok) {
        console.error('Failed to load creators:', res.status)
        throw new Error(tCommon('loadFailed'))
      }
      const json = await res.json()
      setLoadError(json.error ?? null)
      setCreators(json.data ?? [])
    } catch (err) {
      console.error('Failed to load creators:', err)
      setLoadError(err instanceof Error ? err.message : tCommon('loadFailed'))
      setCreators([])
    } finally {
      setLoading(false)
    }
  }, [filter, tCommon])

  useEffect(() => { load() }, [load])

  const filtered = creators.filter((c) =>
    !search || c.name.toLowerCase().includes(search.toLowerCase()) ||
    c.platform.toLowerCase().includes(search.toLowerCase()) ||
    (c.profile?.niche ?? '').toLowerCase().includes(search.toLowerCase()) ||
    (c.broadcast_account?.name ?? '').toLowerCase().includes(search.toLowerCase()) ||
    (c.operator_user?.name ?? '').toLowerCase().includes(search.toLowerCase()) ||
    (c.operator_user?.user_code ?? '').toLowerCase().includes(search.toLowerCase())
  )

  // Same "count from the currently-loaded slice" idiom as expenses/page.tsx's
  // paid/pending CountChips: `filter` drives the server fetch (see load()
  // above), so `creators`/`filtered` only ever holds the active slice — a
  // chip's count reflects the loaded data, not a true cross-status total.
  // That's an existing characteristic of the reference pattern, not a
  // regression introduced here.
  const threeState = loading ? (
    <LoadingState variant="list" />
  ) : loadError ? (
    <ErrorState title={tCommon('errorTitle')} detail={loadError} onRetry={load} />
  ) : filtered.length === 0 ? (
    <EmptyState
      title={t('noCreatorsFound')}
      action={<Button variant="secondary" size="sm" onClick={() => setShowForm(true)}>{t('addFirstCreator')}</Button>}
    />
  ) : null

  return (
    <div>
      <Header
        title={t('title')}
        subtitle={t('subtitle', { count: creators.length })}
        search={
          <div className="w-60">
            <SearchInput
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('searchCreators')}
            />
          </div>
        }
        actions={
          <Button onClick={() => setShowForm(true)}>
            <Plus className="w-4 h-4" /> {t('addCreator')}
          </Button>
        }
      />

      {/* Status summary / filter — replaces the old pill button group with the
          same CountChip idiom as expenses/page.tsx's status row. */}
      <div className="flex items-center gap-2 mb-5 flex-wrap">
        <CountChip
          label={tCommon('all')}
          count={filtered.length}
          tone="neutral"
          active={filter === 'all'}
          onClick={() => setFilter('all')}
        />
        {ALL_STATUSES.map((s) => (
          <CountChip
            key={s}
            label={tStatus(s)}
            count={filtered.filter((c) => c.status === s).length}
            tone={toneOf('creator', s)}
            active={filter === s}
            onClick={() => setFilter(s)}
          />
        ))}
      </div>

      <SectionCard padding="none" icon={<Users />} title={t('listTitle')} accent="violet">
        {threeState ?? (
          <div>
            {filtered.map((c) => (
              <RecordRow
                key={c.id}
                href={`/creators/${c.id}`}
                status={toneOf('creator', c.status)}
                title={c.name}
                meta={[
                  { text: c.platform },
                  ...(c.profile?.niche ? [{ text: c.profile.niche }] : []),
                ]}
                who={c.operator_user?.name ?? '—'}
                tags={
                  <div className="flex items-center gap-1.5 flex-none">
                    <LifecycleBadge status={c.status} size="sm" />
                  </div>
                }
              />
            ))}
          </div>
        )}
      </SectionCard>

      {showForm && (
        <Modal open={showForm} onClose={() => setShowForm(false)} title={t('addCreator')} width="max-w-2xl">
          <CreatorForm onSuccess={() => { setShowForm(false); load() }} onCancel={() => setShowForm(false)} />
        </Modal>
      )}
    </div>
  )
}
