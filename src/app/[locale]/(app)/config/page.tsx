'use client'

import { useState, useEffect } from 'react'
import Header from '@/components/layout/Header'
import Button from '@/components/ui/Button'
import SectionCard from '@/components/ui/SectionCard'
import LoadingState from '@/components/ui/LoadingState'
import { Textarea } from '@/components/ui/Field'
import { Save, Settings } from 'lucide-react'
import type { Config } from '@/lib/types'

export default function ConfigPage() {
  const [configs,  setConfigs]  = useState<Config[]>([])
  const [loading,  setLoading]  = useState(true)
  const [saving,   setSaving]   = useState<string | null>(null)
  const [edits,    setEdits]    = useState<Record<string, string>>({})
  const [saved,    setSaved]    = useState<Record<string, boolean>>({})

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
    await fetch('/api/config', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: config.key, value, description: config.description }),
    })
    setSaving(null)
    setSaved((s) => ({ ...s, [config.key]: true }))
    setTimeout(() => setSaved((s) => ({ ...s, [config.key]: false })), 2000)
  }

  const CONFIG_META: Record<string, { label: string; description: string }> = {
    revenue_split: {
      label: 'Revenue Split Rules',
      description: 'How revenue is divided between creator and guild (%). Edit the JSON values.',
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
      description: 'Required live sessions per month for guild membership.',
    },
  }

  return (
    <div>
      <Header
        title="Config"
        subtitle="Rule engine — controls revenue splits, ROI thresholds, agent behavior, and automation triggers"
      />

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
                actions={
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
                }
              >
                <div className="flex items-center gap-2 mb-1">
                  <code className="text-xs bg-muted-soft text-ink-500 px-1.5 py-0.5 rounded">{config.key}</code>
                </div>
                <p className="text-xs text-ink-400 mb-3">
                  {meta?.description ?? config.description}
                </p>
                {/* Textarea's contract fixes resize-none (no per-instance
                    override without an unsupported class conflict) — the
                    dynamic `rows` below already sizes the box to the JSON
                    payload, so the lost manual resize handle is a minor,
                    accepted tradeoff of adopting the shared control. */}
                <Textarea
                  value={edits[config.key] ?? ''}
                  onChange={(e) => setEdits((prev) => ({ ...prev, [config.key]: e.target.value }))}
                  rows={Object.keys(config.value).length + 2}
                  aria-label={meta?.label ?? config.key}
                  className="font-mono"
                />
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
