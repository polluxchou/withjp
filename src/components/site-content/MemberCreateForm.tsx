'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import Button from '@/components/ui/Button'
import { Field, Input } from '@/components/ui/Field'
import { MEMBER_FIELD_ERROR_CODES, fieldErrorMessage, formatFieldErrors, siteContentErrorMessage } from './form-errors'

const MEMBERS_ENDPOINT = '/api/site/members'

// 与 news 侧 news-service.ts 的 23505 → 409 映射对应，members 这里是新增卡位
// 时两个管理员几乎同时点"新增"、算出同一个 nextNo 撞上 unique(no) 约束——
// 只有这一个入口会命中，不需要 MEMBER_FIELD_ERROR_CODES 里再登记一份。
const MEMBER_KNOWN_ERROR_CODES = ['conflict']

// expected_reveal_on 的字段级错误单独展示在 Field 旁边（下面 Field 的 error
// 属性），不重复出现在底部的汇总文案里——同 MemberEditForm 的
// INLINE_FIELD_KEYS 理由（那边是 photo_url，这里是本表单唯一的字段）。
const INLINE_FIELD_KEYS = ['expected_reveal_on']

function omitInlineFields(fields: Record<string, string> | undefined): Record<string, string> | undefined {
  if (!fields) return fields
  const rest = Object.fromEntries(Object.entries(fields).filter(([k]) => !INLINE_FIELD_KEYS.includes(k)))
  return Object.keys(rest).length > 0 ? rest : undefined
}

/**
 * 新增卡位的最小表单：只有 expected_reveal_on 一个字段（与
 * members-service.ts 的 MemberCreateSchema 白名单一致——no 由服务端计算，
 * is_revealed 由服务端定死成 false，其余展示字段留给创建后的 PATCH
 * （MemberEditForm）去补，不在这一步一次性填完）。
 *
 * 渲染在 Modal 内部（同 MemberEditForm 的理由），不再套一层 SectionCard。
 */
export default function MemberCreateForm({
  onCancel,
  onCreated,
}: {
  onCancel: () => void
  onCreated: () => void
}) {
  const t = useTranslations('siteMembers')
  const tCommon = useTranslations('common')
  const tFieldErrors = useTranslations('siteMembers.fieldErrors')
  const [expectedRevealOn, setExpectedRevealOn] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string> | null>(null)

  function errorMessage(code: string): string {
    return siteContentErrorMessage(t, code, MEMBER_KNOWN_ERROR_CODES)
  }

  async function submit() {
    setSaving(true)
    setError(null)
    setFieldErrors(null)
    try {
      const res = await fetch(MEMBERS_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ expected_reveal_on: expectedRevealOn || null }),
      })
      const json = (await res.json()) as { error?: string; fields?: Record<string, string> }
      if (!res.ok) {
        setFieldErrors(json.fields ?? null)
        const detail = formatFieldErrors(tFieldErrors, MEMBER_FIELD_ERROR_CODES, omitInlineFields(json.fields))
        setError(detail ? `${errorMessage(json.error ?? 'unknown')}（${detail}）` : errorMessage(json.error ?? 'unknown'))
        return
      }
      onCreated()
    } catch {
      setError(t('errors.unknown'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-ink-500">{t('addFormSubtitle')}</p>

      <Field
        label={t('fieldExpectedRevealOn')}
        hint={t('fieldExpectedRevealOnHint')}
        required
        error={fieldErrors?.expected_reveal_on ? fieldErrorMessage(tFieldErrors, fieldErrors.expected_reveal_on, MEMBER_FIELD_ERROR_CODES) : undefined}
      >
        <Input
          type="date"
          value={expectedRevealOn}
          onChange={(e) => setExpectedRevealOn(e.target.value)}
        />
      </Field>

      {error && (
        <div className="text-sm text-danger-text bg-danger-soft border border-danger-border rounded-field px-3 py-2">
          {error}
        </div>
      )}

      <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-line-soft">
        <Button variant="secondary" onClick={onCancel} disabled={saving}>{tCommon('cancel')}</Button>
        <Button loading={saving} disabled={!expectedRevealOn} onClick={submit}>{tCommon('save')}</Button>
      </div>
    </div>
  )
}
