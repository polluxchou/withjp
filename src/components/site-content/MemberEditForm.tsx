'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { ChevronDown, ChevronRight } from 'lucide-react'
import Button from '@/components/ui/Button'
import { Field, Input } from '@/components/ui/Field'
import ImageUploadField from '@/components/ui/ImageUploadField'
import type { MemberRow } from '@/lib/site/members-service.ts'
import { MEMBER_FIELD_ERROR_CODES, fieldErrorMessage, formatFieldErrors, siteContentErrorMessage } from './form-errors'

// photo_url 的字段级错误单独展示在 ImageUploadField 旁边（下面
// fieldMessage()），不重复出现在底部的汇总文案里——同 NewsForm 的
// INLINE_FIELD_KEYS 理由。
const INLINE_FIELD_KEYS = ['photo_url']

function omitInlineFields(fields: Record<string, string> | undefined): Record<string, string> | undefined {
  if (!fields) return fields
  const rest = Object.fromEntries(Object.entries(fields).filter(([k]) => !INLINE_FIELD_KEYS.includes(k)))
  return Object.keys(rest).length > 0 ? rest : undefined
}

const MEMBERS_ENDPOINT = '/api/site/members'

interface FormValue {
  is_revealed: boolean
  expected_reveal_on: string
  name: string
  photo_url: string | null
  name_ja: string
  name_zh: string
  name_en: string
  specialty_ja: string
  specialty_zh: string
  specialty_en: string
}

function toFormValue(row: MemberRow): FormValue {
  return {
    is_revealed: row.is_revealed,
    expected_reveal_on: row.expected_reveal_on ?? '',
    name: row.name ?? '',
    photo_url: row.photo_url,
    name_ja: row.name_ja ?? '',
    name_zh: row.name_zh ?? '',
    name_en: row.name_en ?? '',
    specialty_ja: row.specialty_ja ?? '',
    specialty_zh: row.specialty_zh ?? '',
    specialty_en: row.specialty_en ?? '',
  }
}

/**
 * 单个成员卡位的编辑表单。渲染在 Modal 内部（design-system §6.1"阻断式
 * 编辑"用 Modal），所以这里不再套一层 SectionCard——Modal 本身已经提供了
 * 卡片外框，双层卡片会显得多余。
 *
 * 已公开/未公开两种状态下必填字段不同（与 members-service.ts 的跨字段业务
 * 校验对应）：已公开需要 name/photo_url/specialty_ja；未公开需要
 * expected_reveal_on。这里的 required 星号只是提前提示，不做客户端阻断——
 * 真正的校验（含跨字段规则）由服务端 400 兜底，同 NewsForm 的既有约定。
 */
export default function MemberEditForm({
  row,
  onCancel,
  onSaved,
}: {
  row: MemberRow
  onCancel: () => void
  onSaved: () => void
}) {
  const t = useTranslations('siteMembers')
  const tCommon = useTranslations('common')
  const tFieldErrors = useTranslations('siteMembers.fieldErrors')
  const [value, setValue] = useState<FormValue>(() => toFormValue(row))
  const [zhOpen, setZhOpen] = useState(false)
  const [enOpen, setEnOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string> | null>(null)

  function errorMessage(code: string): string {
    return siteContentErrorMessage(t, code, ['invalid_no'])
  }

  /** photo_url 的 Field 旁边展示的字段级错误——已翻译，不是原始码。 */
  function fieldMessage(key: string): string | undefined {
    const code = fieldErrors?.[key]
    return code ? fieldErrorMessage(tFieldErrors, code, MEMBER_FIELD_ERROR_CODES) : undefined
  }

  async function submit() {
    setSaving(true)
    setError(null)
    setFieldErrors(null)
    const payload: Record<string, unknown> = {
      is_revealed: value.is_revealed,
      expected_reveal_on: value.expected_reveal_on || null,
      name: value.name || null,
      photo_url: value.photo_url || null,
      name_ja: value.name_ja || null,
      name_zh: value.name_zh || null,
      name_en: value.name_en || null,
      specialty_ja: value.specialty_ja || null,
      specialty_zh: value.specialty_zh || null,
      specialty_en: value.specialty_en || null,
    }

    try {
      const res = await fetch(`${MEMBERS_ENDPOINT}/${row.no}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const json = (await res.json()) as { error?: string; fields?: Record<string, string> }
      if (!res.ok) {
        setFieldErrors(json.fields ?? null)
        const detail = formatFieldErrors(tFieldErrors, MEMBER_FIELD_ERROR_CODES, omitInlineFields(json.fields))
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
    <div className="space-y-3">
      <p className="text-xs text-ink-500">{t('formSubtitle')}</p>

      <label className="inline-flex items-center gap-2 text-sm text-ink-700 cursor-pointer">
        <input
          type="checkbox"
          checked={value.is_revealed}
          onChange={(e) => setValue({ ...value, is_revealed: e.target.checked })}
          className="rounded accent-primary"
        />
        {t('fieldRevealedOn')}
      </label>

      <Field label={t('fieldExpectedRevealOn')} hint={t('fieldExpectedRevealOnHint')} required={!value.is_revealed}>
        <Input
          type="date"
          value={value.expected_reveal_on}
          onChange={(e) => setValue({ ...value, expected_reveal_on: e.target.value })}
        />
      </Field>

      <div className="pt-2 border-t border-line-soft">
        <div className="text-xs font-semibold text-ink-700 mb-2">{t('sectionBasic')}</div>
        <div className="space-y-3">
          <Field label={t('fieldName')} hint={t('fieldNameHint')} required={value.is_revealed}>
            <Input value={value.name} onChange={(e) => setValue({ ...value, name: e.target.value })} />
          </Field>
          <ImageUploadField
            label={t('fieldPhoto')}
            hint={t('fieldPhotoHint')}
            value={value.photo_url}
            error={fieldMessage('photo_url')}
            onChange={(url) => setValue({ ...value, photo_url: url || null })}
          />
          <Field label={t('fieldNameJa')}>
            <Input value={value.name_ja} onChange={(e) => setValue({ ...value, name_ja: e.target.value })} />
          </Field>
          <Field label={t('fieldSpecialtyJa')} hint={t('fieldSpecialtyJaHint')} required={value.is_revealed}>
            <Input value={value.specialty_ja} onChange={(e) => setValue({ ...value, specialty_ja: e.target.value })} />
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
            <Field label={t('fieldNameZh')}>
              <Input value={value.name_zh} onChange={(e) => setValue({ ...value, name_zh: e.target.value })} />
            </Field>
            <Field label={t('fieldSpecialtyZh')}>
              <Input value={value.specialty_zh} onChange={(e) => setValue({ ...value, specialty_zh: e.target.value })} />
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
            <Field label={t('fieldNameEn')}>
              <Input value={value.name_en} onChange={(e) => setValue({ ...value, name_en: e.target.value })} />
            </Field>
            <Field label={t('fieldSpecialtyEn')}>
              <Input value={value.specialty_en} onChange={(e) => setValue({ ...value, specialty_en: e.target.value })} />
            </Field>
          </div>
        )}
      </div>

      {error && (
        <div className="text-sm text-danger-text bg-danger-soft border border-danger-border rounded-field px-3 py-2">
          {error}
        </div>
      )}

      <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-line-soft">
        <Button variant="secondary" onClick={onCancel} disabled={saving}>{tCommon('cancel')}</Button>
        <Button loading={saving} onClick={submit}>{tCommon('save')}</Button>
      </div>
    </div>
  )
}
