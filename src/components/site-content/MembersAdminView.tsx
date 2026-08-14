'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Pencil, ImageOff, ExternalLink, Users } from 'lucide-react'
import Header from '@/components/layout/Header'
import SectionCard from '@/components/ui/SectionCard'
import Button from '@/components/ui/Button'
import Tag from '@/components/ui/Tag'
import Modal from '@/components/ui/Modal'
import LoadingState from '@/components/ui/LoadingState'
import ErrorState from '@/components/ui/ErrorState'
import MemberEditForm from './MemberEditForm'
import type { MemberRow } from '@/lib/site/members-service.ts'
import { PUBLIC_SITE_HOST } from '@/lib/site/domain-routing.ts'

const MEMBERS_ENDPOINT = '/api/site/members'

// 官网直达链接：成员卡位展示在 vision 页（brief 指定的失效路径之一），
// 日文是默认语言，走无前缀路径（同 news 的 publicNewsUrl 理由）。
function publicVisionUrl(): string {
  return `https://${PUBLIC_SITE_HOST}/vision`
}

/**
 * 12 卡位网格：先用 SectionCard + 现有原语（Tag/Button/Modal/Field）拼，
 * 没有新建任何 ui/ 原语（brief Step 2 要求"拼不动再建"，这里拼得动）。
 * 点开单卡编辑用 Modal + MemberEditForm（内部是 Field 单列）。
 */
export default function MembersAdminView({ isAdmin }: { isAdmin: boolean }) {
  const t = useTranslations('siteMembers')
  const tCommon = useTranslations('common')

  const [rows, setRows] = useState<MemberRow[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [editing, setEditing] = useState<MemberRow | null>(null)

  async function load() {
    setLoading(true)
    setLoadError(false)
    try {
      const res = await fetch(MEMBERS_ENDPOINT)
      const json = (await res.json()) as { data?: MemberRow[]; error?: string }
      if (!res.ok) { setLoadError(true); return }
      setRows(json.data ?? [])
    } catch {
      setLoadError(true)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  async function handleSaved() {
    setEditing(null)
    await load()
  }

  return (
    <div>
      <Header
        title={t('title')}
        subtitle={t('subtitle')}
        actions={
          <Button
            variant="secondary"
            size="lg"
            onClick={() => window.open(publicVisionUrl(), '_blank', 'noopener,noreferrer')}
          >
            <ExternalLink className="w-4 h-4" /> {t('viewOnSite')}
          </Button>
        }
      />

      <SectionCard icon={<Users />} title={t('listTitle')}>
        {loading ? (
          <LoadingState variant="list" rows={12} />
        ) : loadError ? (
          <ErrorState detail={tCommon('loadFailed')} onRetry={load} />
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {rows.map((row) => (
              <div key={row.no} className="rounded-field border border-line p-3 flex flex-col gap-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-micro font-mono text-ink-400">{t('cardNo', { no: row.no })}</span>
                  <Tag
                    size="sm"
                    tone={row.is_revealed ? 'success' : 'neutral'}
                    label={row.is_revealed ? t('revealedTag') : t('unrevealedTag')}
                  />
                </div>

                {row.is_revealed && row.photo_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={row.photo_url}
                    alt=""
                    className="w-full aspect-square rounded-field object-cover border border-line"
                  />
                ) : (
                  <div
                    aria-hidden
                    className="w-full aspect-square rounded-field border border-dashed border-line-strong flex items-center justify-center text-ink-400"
                  >
                    <ImageOff className="w-6 h-6" strokeWidth={1.5} />
                  </div>
                )}

                <div className="text-sm font-semibold text-ink-900 truncate">
                  {row.name || t('unnamedCard')}
                </div>

                {row.is_revealed ? (
                  <div className="text-xs text-ink-500 truncate min-h-[1.25rem]">{row.specialty_ja}</div>
                ) : (
                  <div className="text-xs text-ink-500 min-h-[1.25rem]">
                    {row.expected_reveal_on
                      ? t('expectedReveal', { date: row.expected_reveal_on })
                      : t('expectedRevealUnset')}
                  </div>
                )}

                {isAdmin && (
                  <Button variant="secondary" size="sm" onClick={() => setEditing(row)}>
                    <Pencil className="w-3.5 h-3.5" /> {t('edit')}
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      <Modal
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing ? t('editTitle', { name: editing.name || t('unnamedCard') }) : ''}
      >
        {editing && (
          <MemberEditForm row={editing} onCancel={() => setEditing(null)} onSaved={handleSaved} />
        )}
      </Modal>
    </div>
  )
}
