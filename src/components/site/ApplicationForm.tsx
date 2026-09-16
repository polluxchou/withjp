'use client'

import { useId, useRef, useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { DANCE_SKILL_LEVELS, type ApplicationFields, type FieldError } from '@/lib/site/application'
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
  // label htmlFor ↔ input id 的关联前缀（SSR/客户端一致）
  const uid = useId()

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
      danceSkillLevel: data.get('danceSkillLevel'),
      danceYears: data.get('danceYears'),
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
        <Field label={t('name')} error={fields.name} htmlFor={`${uid}-name`} t={t}>
          <input id={`${uid}-name`} name="name" maxLength={60} className={FIELD_CLS} />
        </Field>
        <Field label={t('age')} error={fields.age} htmlFor={`${uid}-age`} t={t}>
          <input id={`${uid}-age`} name="age" inputMode="numeric" className={FIELD_CLS} />
        </Field>
        <Field label={t('residence')} error={fields.residence} htmlFor={`${uid}-residence`} t={t}>
          <input id={`${uid}-residence`} name="residence" maxLength={120} className={FIELD_CLS} />
        </Field>
        <Field label={t('contact')} hint={t('contactHint')} error={fields.contact} htmlFor={`${uid}-contact`} t={t}>
          <input id={`${uid}-contact`} name="contact" maxLength={200} className={FIELD_CLS} />
        </Field>
        <Field label={t('experience')} error={fields.experience} htmlFor={`${uid}-experience`} t={t}>
          <textarea
            id={`${uid}-experience`}
            name="experience"
            rows={4}
            className={`${FIELD_CLS} resize-none text-[14px]`}
          />
        </Field>

        <Field
          label={t('danceSkillLevel')}
          error={fields.danceSkillLevel}
          labelId={`${uid}-dance-skill-label`}
          t={t}
        >
          <div
            role="radiogroup"
            aria-labelledby={`${uid}-dance-skill-label`}
            className="flex flex-wrap gap-x-6 gap-y-2"
          >
            {DANCE_SKILL_LEVELS.map((level) => (
              <label
                key={level}
                className="flex cursor-pointer items-center gap-2 text-[14px] text-site-fg/86"
              >
                <input type="radio" name="danceSkillLevel" value={level} className="accent-site-accent" />
                {t(`danceSkillLevelOptions.${level}`)}
              </label>
            ))}
          </div>
        </Field>

        <Field label={t('danceYears')} error={fields.danceYears} htmlFor={`${uid}-dance-years`} t={t}>
          <select id={`${uid}-dance-years`} name="danceYears" defaultValue="" className={FIELD_CLS}>
            <option value="" disabled hidden>{t('danceYears')}</option>
            {Array.from({ length: 37 }, (_, n) => n).map((n) => (
              <option key={n} value={n}>{n === 0 ? t('danceYearsOptions.none') : n}</option>
            ))}
          </select>
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

/**
 * 视觉标签必须是真 <label htmlFor>，不能用 span：span 关联不到输入框
 * （input.labels 为空），屏幕阅读器读不出字段名、点标签也不会聚焦。
 * radio group 例外——它没有单个控件可以让 htmlFor 指过去，改用 labelId
 * 由外层 role="radiogroup" + aria-labelledby 指回来。
 */
function Field({
  label,
  hint,
  error,
  htmlFor,
  labelId,
  t,
  children,
}: {
  label: string
  hint?: string
  error?: FieldError
  htmlFor?: string
  labelId?: string
  t: (key: string) => string
  children: React.ReactNode
}) {
  return (
    <div>
      <div className="mb-1.5 flex flex-wrap items-baseline gap-2">
        {htmlFor ? (
          <label htmlFor={htmlFor} className="text-[13px] tracking-[0.06em] text-site-fg/60">
            {label}
          </label>
        ) : (
          <span id={labelId} className="text-[13px] tracking-[0.06em] text-site-fg/60">
            {label}
          </span>
        )}
        {hint && <span className="text-[12px] text-site-fg/40">{hint}</span>}
        {error && <span className="text-[12px] text-site-hot">{t(`errors.${error}`)}</span>}
      </div>
      {children}
    </div>
  )
}
