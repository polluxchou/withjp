'use client'

import { useRef, useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { COMMUTE_MODES, type ApplicationFields, type CommuteMode, type FieldError } from '@/lib/site/application'
import { checkStaffRequiredChoices } from './staff-application-form'
import BlueprintFrame from './BlueprintFrame'
import SiteButton from './SiteButton'

// 其他招募三条线：摄影师／化妆师／团播运营。creator（主播）走 ApplicationForm，
// 不出现在这里 —— 两个表单分别映射到 kind 的不同子集，互不覆盖。
const STAFF_KINDS = ['photographer', 'makeup', 'group_live_ops'] as const
type StaffKind = (typeof STAFF_KINDS)[number]

const FIELD_CLS =
  'w-full border border-site-line-strong bg-transparent px-3 py-2.5 text-site-fg outline-none transition-colors focus:border-site-accent'

type Status = 'idle' | 'sending' | 'done'

/**
 * 其他招募（摄影师／化妆师／团播运营）的投递表单。结构照抄 ApplicationForm：
 * 同一套 honeypot + elapsedMs 反垃圾、同一个 /api/site/applications、同一套
 * 按 FieldError 码映射文案。区别只在字段——用 kind/email/commuteMode 换掉
 * age/experience，提交体带上 kind 让后端分流落库。
 */
export default function StaffApplicationForm() {
  const t = useTranslations('site.recruitStaff.form')
  const locale = useLocale()
  const [status, setStatus] = useState<Status>('idle')
  const [fields, setFields] = useState<ApplicationFields>({})
  const [formError, setFormError] = useState<'rateLimited' | 'network' | null>(null)
  // 表单挂载时刻：提交时算出填写用了多久，太快的是脚本（服务端复核）
  const mountedAt = useRef(Date.now())

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setStatus('sending')
    setFields({})
    setFormError(null)

    const data = new FormData(event.currentTarget)

    // kind 决定投递走哪条招募线，两个 radio 组都不预选（见
    // staff-application-form.ts 顶部注释）：不选就提交要在这里当场拦下并把
    // 错误画出来，不能指望服务端——服务端把「没传 kind」静默按 creator 处理，
    // 而这个表单没有 age 字段，会以用户看不见的 fields.age = 'required' 失败。
    const requiredChoiceErrors = checkStaffRequiredChoices({
      kind: data.get('kind'),
      commuteMode: data.get('commuteMode'),
    })
    if (Object.keys(requiredChoiceErrors).length > 0) {
      setFields(requiredChoiceErrors)
      setStatus('idle')
      return
    }

    const payload = {
      kind: data.get('kind') as StaffKind,
      name: data.get('name'),
      contact: data.get('contact'),
      email: data.get('email'),
      residence: data.get('residence'),
      commuteMode: data.get('commuteMode') as CommuteMode,
      consent: data.get('consent') === 'on',
      locale,
      hp: data.get('hp'),
      elapsedMs: Date.now() - mountedAt.current,
    }

    try {
      const res = await fetch('/api/site/applications', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const json = (await res.json()) as { error: string | null; fields?: ApplicationFields }

      if (res.status === 201) {
        setStatus('done')
        return
      }
      if (json.error === 'validation' && json.fields) {
        setFields(json.fields)
      } else if (json.error === 'rate_limited') {
        setFormError('rateLimited')
      } else {
        setFormError('network')
      }
      setStatus('idle')
    } catch {
      setFormError('network')
      setStatus('idle')
    }
  }

  if (status === 'done') {
    return (
      <BlueprintFrame className="bg-site-panel px-8 py-10">
        <div className="font-condensed text-[13px] tracking-[0.22em] text-site-accent">
          {t('eyebrow')}
        </div>
        <div className="mb-3 mt-3.5 font-serif-jp text-[24px]">{t('successTitle')}</div>
        <p className="text-[14px] leading-[1.9] text-site-fg/72">{t('successBody')}</p>
      </BlueprintFrame>
    )
  }

  return (
    <BlueprintFrame className="bg-site-panel px-8 py-9">
      <div className="mb-5 font-condensed text-[13px] tracking-[0.22em] text-site-accent">
        {t('eyebrow')}
      </div>
      <form onSubmit={onSubmit} noValidate className="grid gap-4">
        <Field label={t('name')} error={fields.name} t={t}>
          <input name="name" maxLength={30} className={FIELD_CLS} />
        </Field>
        <Field label={t('contact')} hint={t('contactHint')} error={fields.contact} t={t}>
          <input name="contact" maxLength={120} className={FIELD_CLS} />
        </Field>
        <Field label={t('email')} error={fields.email} t={t}>
          <input name="email" type="email" maxLength={254} className={FIELD_CLS} />
        </Field>

        <Field label={t('kind')} error={fields.kind} t={t}>
          <div className="flex flex-wrap gap-x-6 gap-y-2">
            {STAFF_KINDS.map((kind) => (
              <label
                key={kind}
                className="flex cursor-pointer items-center gap-2 text-[14px] text-site-fg/86"
              >
                <input type="radio" name="kind" value={kind} className="accent-site-accent" />
                {t(`kindOptions.${kind}`)}
              </label>
            ))}
          </div>
        </Field>

        <Field label={t('residence')} error={fields.residence} t={t}>
          <input name="residence" maxLength={120} className={FIELD_CLS} />
        </Field>

        <Field label={t('commuteMode')} error={fields.commuteMode} t={t}>
          <div className="flex flex-wrap gap-x-6 gap-y-2">
            {COMMUTE_MODES.map((mode) => (
              <label
                key={mode}
                className="flex cursor-pointer items-center gap-2 text-[14px] text-site-fg/86"
              >
                <input type="radio" name="commuteMode" value={mode} className="accent-site-accent" />
                {t(`commuteModeOptions.${mode}`)}
              </label>
            ))}
          </div>
        </Field>

        {/* honeypot：真人看不见所以永远是空的。用 absolute 移出视口而不是
            display:none —— 后者会被一些爬虫识别并跳过。 */}
        <input
          name="hp"
          tabIndex={-1}
          autoComplete="off"
          aria-hidden
          className="pointer-events-none absolute -left-[9999px] h-0 w-0 opacity-0"
        />

        <label className="flex cursor-pointer items-start gap-2.5 text-[13px] leading-[1.7] text-site-fg/72">
          <input type="checkbox" name="consent" className="mt-0.5 accent-site-accent" />
          <span>
            {t('consent')}
            {fields.consent && (
              <span className="ml-2 text-site-hot">{t(`errors.${fields.consent}`)}</span>
            )}
          </span>
        </label>

        <SiteButton type="submit" variant="hot" size="md" disabled={status === 'sending'}>
          {status === 'sending' ? t('submitting') : t('submit')}
        </SiteButton>

        {formError && <p className="text-[13px] text-site-hot">{t(`errors.${formError}`)}</p>}
      </form>
    </BlueprintFrame>
  )
}

function Field({
  label,
  hint,
  error,
  t,
  children,
}: {
  label: string
  hint?: string
  error?: FieldError
  t: (key: string) => string
  children: React.ReactNode
}) {
  return (
    <div>
      <div className="mb-1.5 flex flex-wrap items-baseline gap-2">
        <span className="text-[13px] tracking-[0.06em] text-site-fg/60">{label}</span>
        {hint && <span className="text-[12px] text-site-fg/40">{hint}</span>}
        {error && <span className="text-[12px] text-site-hot">{t(`errors.${error}`)}</span>}
      </div>
      {children}
    </div>
  )
}
