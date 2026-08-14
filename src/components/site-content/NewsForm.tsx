'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { ChevronDown, ChevronRight } from 'lucide-react'
import SectionCard from '@/components/ui/SectionCard'
import Button from '@/components/ui/Button'
import { Field, Input, Select, Textarea } from '@/components/ui/Field'
import ImageUploadField from '@/components/ui/ImageUploadField'
import type { NewsRow } from '@/lib/site/news-service.ts'

const NEWS_ENDPOINT = '/api/site/news'
const TAGS = ['RECRUIT', 'PROJECT', 'LIVE'] as const
const CATEGORIES = ['project', 'recruit'] as const

interface FormValue {
  slug: string
  tag: (typeof TAGS)[number]
  category: (typeof CATEGORIES)[number]
  published_on: string
  is_pinned: boolean
  is_published: boolean
  image_url: string | null
  title_ja: string; title_zh: string; title_en: string
  lead_ja: string; lead_zh: string; lead_en: string
  body_ja: string; body_zh: string; body_en: string
}

function toFormValue(row: NewsRow | null): FormValue {
  return {
    slug: row?.slug ?? '',
    tag: row?.tag ?? 'PROJECT',
    category: row?.category ?? 'project',
    published_on: row?.published_on ?? new Date().toISOString().slice(0, 10),
    is_pinned: row?.is_pinned ?? false,
    is_published: row?.is_published ?? true,
    image_url: row?.image_url ?? null,
    title_ja: row?.title_ja ?? '', title_zh: row?.title_zh ?? '', title_en: row?.title_en ?? '',
    lead_ja: row?.lead_ja ?? '', lead_zh: row?.lead_zh ?? '', lead_en: row?.lead_en ?? '',
    body_ja: row?.body_ja ?? '', body_zh: row?.body_zh ?? '', body_en: row?.body_en ?? '',
  }
}

/** 错误响应里的 fields 是稳定字段码（required/too_long/invalid_slug/...），
 * 不是自然语言——这里只是把它们平铺展示出来方便定位是哪个字段出的问题，
 * 不是最终用户文案。 */
function formatFieldErrors(fields: Record<string, string> | undefined): string | null {
  if (!fields) return null
  const entries = Object.entries(fields)
  if (entries.length === 0) return null
  return entries.map(([k, v]) => `${k}: ${v}`).join('；')
}

export default function NewsForm({
  row,
  onCancel,
  onSaved,
}: {
  row: NewsRow | null
  onCancel: () => void
  onSaved: () => void
}) {
  const t = useTranslations('siteNews')
  const tCommon = useTranslations('common')
  const [value, setValue] = useState<FormValue>(() => toFormValue(row))
  const [zhOpen, setZhOpen] = useState(false)
  const [enOpen, setEnOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function errorMessage(code: string): string {
    const known = ['forbidden', 'forbidden_field', 'validation', 'invalid_json', 'not_found', 'db_error']
    return known.includes(code) ? t(`errors.${code}`) : t('errors.unknown')
  }

  async function submit() {
    setSaving(true)
    setError(null)
    const payload: Record<string, unknown> = {
      tag: value.tag,
      category: value.category,
      published_on: value.published_on,
      is_pinned: value.is_pinned,
      is_published: value.is_published,
      image_url: value.image_url || null,
      title_ja: value.title_ja,
      title_zh: value.title_zh || null,
      title_en: value.title_en || null,
      lead_ja: value.lead_ja,
      lead_zh: value.lead_zh || null,
      lead_en: value.lead_en || null,
      body_ja: value.body_ja,
      body_zh: value.body_zh || null,
      body_en: value.body_en || null,
    }
    if (!row) payload.slug = value.slug

    try {
      const res = await fetch(row ? `${NEWS_ENDPOINT}/${row.id}` : NEWS_ENDPOINT, {
        method: row ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const json = (await res.json()) as { error?: string; fields?: Record<string, string> }
      if (!res.ok) {
        const detail = formatFieldErrors(json.fields)
        setError(detail ? `${errorMessage(json.error ?? 'unknown')}（${detail}）` : errorMessage(json.error ?? 'unknown'))
        return
      }
      onSaved()
    } catch {
      setError(t('errors.unknown'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <SectionCard>
      <div className="max-w-xl space-y-3">
        <Field label={t('fieldSlug')} hint={row ? t('fieldSlugImmutable') : undefined} required={!row}>
          <Input
            value={value.slug}
            disabled={Boolean(row)}
            onChange={(e) => setValue({ ...value, slug: e.target.value })}
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label={t('fieldCategory')} hint={t('fieldCategoryHint')} required>
            <Select value={value.category} onChange={(e) => setValue({ ...value, category: e.target.value as FormValue['category'] })}>
              {CATEGORIES.map((c) => <option key={c} value={c}>{t(`category.${c}`)}</option>)}
            </Select>
          </Field>
          <Field label={t('fieldTag')} required>
            <Select value={value.tag} onChange={(e) => setValue({ ...value, tag: e.target.value as FormValue['tag'] })}>
              {TAGS.map((tg) => <option key={tg} value={tg}>{t(`tag.${tg}`)}</option>)}
            </Select>
          </Field>
        </div>

        <Field label={t('fieldPublishedOn')} required>
          <Input
            type="date"
            value={value.published_on}
            onChange={(e) => setValue({ ...value, published_on: e.target.value })}
          />
        </Field>

        <div className="flex items-center gap-5">
          <label className="inline-flex items-center gap-2 text-sm text-ink-700 cursor-pointer">
            <input
              type="checkbox"
              checked={value.is_pinned}
              onChange={(e) => setValue({ ...value, is_pinned: e.target.checked })}
              className="rounded accent-primary"
            />
            {t('fieldPinned')}
          </label>
          <label className="inline-flex items-center gap-2 text-sm text-ink-700 cursor-pointer">
            <input
              type="checkbox"
              checked={value.is_published}
              onChange={(e) => setValue({ ...value, is_published: e.target.checked })}
              className="rounded accent-primary"
            />
            {t('fieldPublished')}
          </label>
        </div>

        <ImageUploadField
          label={t('fieldImage')}
          hint={t('fieldImageHint')}
          value={value.image_url}
          onChange={(url) => setValue({ ...value, image_url: url || null })}
        />

        <div className="pt-2 border-t border-line-soft">
          <div className="text-xs font-semibold text-ink-700 mb-2">{t('sectionJa')}</div>
          <div className="space-y-3">
            <Field label={t('fieldTitle')} required>
              <Input value={value.title_ja} onChange={(e) => setValue({ ...value, title_ja: e.target.value })} />
            </Field>
            <Field label={t('fieldLead')} required>
              <Textarea rows={2} value={value.lead_ja} onChange={(e) => setValue({ ...value, lead_ja: e.target.value })} />
            </Field>
            <Field label={t('fieldBody')} required>
              <Textarea rows={5} value={value.body_ja} onChange={(e) => setValue({ ...value, body_ja: e.target.value })} />
            </Field>
          </div>
        </div>

        <div className="pt-2 border-t border-line-soft">
          <button
            type="button"
            className="flex items-center gap-1.5 text-xs font-semibold text-ink-700"
            onClick={() => setZhOpen((v) => !v)}
          >
            {zhOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
            {t('sectionZh')}
          </button>
          {zhOpen && (
            <div className="space-y-3 mt-2">
              <Field label={t('fieldTitle')}>
                <Input value={value.title_zh} onChange={(e) => setValue({ ...value, title_zh: e.target.value })} />
              </Field>
              <Field label={t('fieldLead')}>
                <Textarea rows={2} value={value.lead_zh} onChange={(e) => setValue({ ...value, lead_zh: e.target.value })} />
              </Field>
              <Field label={t('fieldBody')}>
                <Textarea rows={5} value={value.body_zh} onChange={(e) => setValue({ ...value, body_zh: e.target.value })} />
              </Field>
            </div>
          )}
        </div>

        <div className="pt-2 border-t border-line-soft">
          <button
            type="button"
            className="flex items-center gap-1.5 text-xs font-semibold text-ink-700"
            onClick={() => setEnOpen((v) => !v)}
          >
            {enOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
            {t('sectionEn')}
          </button>
          {enOpen && (
            <div className="space-y-3 mt-2">
              <Field label={t('fieldTitle')}>
                <Input value={value.title_en} onChange={(e) => setValue({ ...value, title_en: e.target.value })} />
              </Field>
              <Field label={t('fieldLead')}>
                <Textarea rows={2} value={value.lead_en} onChange={(e) => setValue({ ...value, lead_en: e.target.value })} />
              </Field>
              <Field label={t('fieldBody')}>
                <Textarea rows={5} value={value.body_en} onChange={(e) => setValue({ ...value, body_en: e.target.value })} />
              </Field>
            </div>
          )}
        </div>

        {error && (
          <div className="text-sm text-danger-text bg-danger-soft border border-danger-border rounded-field px-3 py-2">
            {error}
          </div>
        )}

        <div className="flex items-center justify-end gap-2.5 pt-2">
          <Button variant="secondary" onClick={onCancel} disabled={saving}>{tCommon('cancel')}</Button>
          <Button loading={saving} onClick={submit}>{tCommon('save')}</Button>
        </div>
      </div>
    </SectionCard>
  )
}
