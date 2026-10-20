'use client'

import { useState, useEffect } from 'react'
import { useTranslations } from 'next-intl'
import Header from '@/components/layout/Header'
import Button from '@/components/ui/Button'
import SectionCard from '@/components/ui/SectionCard'
import LoadingState from '@/components/ui/LoadingState'
import { Textarea } from '@/components/ui/Field'
import { Save, Settings } from 'lucide-react'
import { useCurrentUser } from '@/lib/auth/useCurrentUser'
import { isAdmin, writeFailureMessage } from '@/lib/auth/admin-gate'
import type { Config } from '@/lib/types'

export default function ConfigPage() {
  const [configs,  setConfigs]  = useState<Config[]>([])
  const [loading,  setLoading]  = useState(true)
  const [saving,   setSaving]   = useState<string | null>(null)
  const [edits,    setEdits]    = useState<Record<string, string>>({})
  const [saved,    setSaved]    = useState<Record<string, boolean>>({})
  const [errors,   setErrors]   = useState<Record<string, string | null>>({})
  const t = useTranslations('config.rules')
  const tCommon = useTranslations('common')
  // PATCH /api/config 仅管理员；身份没确认前也按只读渲染，不先露出保存按钮。
  const me = useCurrentUser()
  const canWrite = isAdmin(me)

  useEffect(() => {
    fetch('/api/config')
      .then((r) => r.json())
      .then((j) => {
        setConfigs(j.data ?? [])
        const initial: Record<string, string> = {}
        for (const c of (j.data ?? [])) {
          initial[c.key] = JSON.stringify(c.value, null, 2)
        }
        setEdits(initial)
      })
      .catch((err) => console.error('Failed to load config:', err))
      .finally(() => setLoading(false))
  }, [])

  async function save(config: Config) {
    setSaving(config.key)
    let value: unknown
    try {
      value = JSON.parse(edits[config.key] ?? '{}')
    } catch {
      alert('Invalid JSON')
      setSaving(null)
      return
    }
    setErrors((e) => ({ ...e, [config.key]: null }))
    try {
      const res = await fetch('/api/config', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: config.key, value, description: config.description }),
      })
      if (!res.ok) {
        const json = await res.json().catch(() => null)
        const message = writeFailureMessage(res.status, json?.error, {
          forbidden: tCommon('adminOnlyAction'),
          fallback: tCommon('saveFailed'),
        })
        setErrors((e) => ({ ...e, [config.key]: message }))
        return
      }
    } catch {
      setErrors((e) => ({ ...e, [config.key]: tCommon('saveFailed') }))
      return
    } finally {
      setSaving(null)
    }
    setSaved((s) => ({ ...s, [config.key]: true }))
    setTimeout(() => setSaved((s) => ({ ...s, [config.key]: false })), 2000)
  }

  const CONFIG_META: Record<string, { label: string; description: string }> = {
    revenue_split: {
      label: 'Revenue Split Rules',
      description: 'How revenue is divided between creator and agency (%). Edit the JSON values.',
    },
    roi_thresholds: {
      label: 'ROI Thresholds',
      description: 'Percentage thresholds for classifying creator profitability.',
    },
    agent_tone: {
      label: 'Agent Tone & Style',
      description: 'Personality guidelines injected into each agent\'s context.',
    },
    automation_triggers: {
      label: 'Automation Triggers',
      description: 'Which tasks are auto-created when a creator transitions to a new status.',
    },
    minimum_live_sessions: {
      label: 'Minimum Live Sessions',
      description: 'Required live sessions per month for agency membership.',
    },
  }

  return (
    <div>
      <Header
        title="Config"
        subtitle="Rule engine — controls revenue splits, ROI thresholds, agent behavior, and automation triggers"
      />

      {me && !canWrite && (
        <p className="mb-4 text-xs text-ink-500">{t('readOnlyNotice')}</p>
      )}

      {loading ? (
        <LoadingState variant="plain" />
      ) : (
        <div className="space-y-4">
          {configs.map((config) => {
            const meta = CONFIG_META[config.key]
            return (
              <SectionCard
                key={config.id}
                icon={<Settings />}
                title={meta?.label ?? config.key}
                actions={canWrite && (
                  <Button
                    size="sm"
                    variant={saved[config.key] ? 'secondary' : 'primary'}
                    loading={saving === config.key}
                    onClick={() => save(config)}
                  >
                    {saved[config.key] ? (
                      '✓ Saved'
                    ) : (
                      <><Save className="w-3 h-3" /> Save</>
                    )}
                  </Button>
                )}
              >
                <div className="flex items-center gap-2 mb-1">
                  <code className="text-xs bg-muted-soft text-ink-500 px-1.5 py-0.5 rounded">{config.key}</code>
                </div>
                <p className="text-xs text-ink-400 mb-3">
                  {meta?.description ?? config.description}
                </p>
                {/* Textarea's contract fixes resize-none (no per-instance
                    override without an unsupported class conflict) — rows is
                    derived from the actual edited text (same string the
                    textarea's `value` binds to), not from
                    Object.keys(config.value).length: that formula only
                    counted top-level keys, so a nested structure like
                    automation_triggers (arrays of strings under each key)
                    rendered far more lines than the box sized for, leaving no
                    resize handle to compensate. Splitting on the live text
                    keeps the box sized to what's actually on screen,
                    including edits the user is mid-typing. */}
                <Textarea
                  value={edits[config.key] ?? ''}
                  onChange={(e) => setEdits((prev) => ({ ...prev, [config.key]: e.target.value }))}
                  rows={Math.max(4, (edits[config.key] ?? '').split('\n').length)}
                  aria-label={meta?.label ?? config.key}
                  className="font-mono"
                  readOnly={!canWrite}
                />
                {errors[config.key] && (
                  <p className="text-xs text-danger-text mt-1.5" role="alert">{errors[config.key]}</p>
                )}
              </SectionCard>
            )
          })}
        </div>
      )}

      <div className="mt-6 bg-warning-soft border border-warning-border rounded-card p-4">
        <p className="text-xs font-medium text-warning-text mb-1">How Config drives the system</p>
        <ul className="text-xs text-warning-text space-y-1">
          <li>• <strong>revenue_split</strong> — injected into Finance Agent prompts for accurate ROI calculation</li>
          <li>• <strong>roi_thresholds</strong> — used to classify creators as profitable / at-risk / loss</li>
          <li>• <strong>agent_tone</strong> — controls how each agent communicates in its prompts</li>
          <li>• <strong>automation_triggers</strong> — defines which task titles are auto-created per state transition</li>
          <li>• <strong>minimum_live_sessions</strong> — referenced by Ops Agent when building live plans</li>
        </ul>
      </div>
    </div>
  )
}
