'use client'

import { useRef, useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import type { ApplicationFields, FieldError } from '@/lib/site/application'
import BlueprintFrame from './BlueprintFrame'
import SiteButton from './SiteButton'

const FIELD_CLS =
  'w-full border border-site-line-strong bg-transparent px-3 py-2.5 text-site-fg outline-none transition-colors focus:border-site-accent'

type Status = 'idle' | 'sending' | 'done'

export default function ApplicationForm() {
  const t = useTranslations('site.recruit.form')
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
    const payload = {
      name: data.get('name'),
      age: data.get('age'),
      residence: data.get('residence'),
      contact: data.get('contact'),
      experience: data.get('experience'),
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
          <input name="name" maxLength={60} className={FIELD_CLS} />
        </Field>
        <Field label={t('age')} error={fields.age} t={t}>
          <input name="age" inputMode="numeric" className={FIELD_CLS} />
        </Field>
        <Field label={t('residence')} error={fields.residence} t={t}>
          <input name="residence" maxLength={120} className={FIELD_CLS} />
        </Field>
        <Field label={t('contact')} hint={t('contactHint')} error={fields.contact} t={t}>
          <input name="contact" maxLength={200} className={FIELD_CLS} />
        </Field>
        <Field label={t('experience')} error={fields.experience} t={t}>
          <textarea name="experience" rows={4} className={`${FIELD_CLS} resize-none text-[14px]`} />
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
        <p className="text-[12px] leading-[1.7] text-site-fg/50">{t('lineNote')}</p>
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
