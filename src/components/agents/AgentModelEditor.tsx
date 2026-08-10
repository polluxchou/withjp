'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import Button from '@/components/ui/Button'
import { Field, Select } from '@/components/ui/Field'
import Tag from '@/components/ui/Tag'
import type { ModelProvider } from '@/lib/types'

const PROVIDERS: { value: ModelProvider; label: string }[] = [
  { value: 'anthropic', label: 'Anthropic' },
  { value: 'openai',    label: 'OpenAI' },
  { value: 'gemini',    label: 'Gemini' },
]

const PROVIDER_MODELS: Record<ModelProvider, string[]> = {
  anthropic: ['claude-sonnet-4-6', 'claude-opus-4-7', 'claude-haiku-4-5-20251001'],
  openai:    ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo'],
  gemini:    ['gemini-2.5-flash-lite-preview', 'gemini-2.5-flash-lite', 'gemini-2.5-pro', 'gemini-3.0-flash-preview'],
}

type TestStatus = 'idle' | 'testing' | 'ok' | 'fail'

interface Props {
  agentId: string
  initialProvider: ModelProvider | null
  initialModel: string | null
}

export default function AgentModelEditor({ agentId, initialProvider, initialModel }: Props) {
  const t = useTranslations('agents')
  const [provider, setProvider]     = useState<ModelProvider>(initialProvider ?? 'anthropic')
  const [modelName, setModelName]   = useState<string>(initialModel ?? 'claude-sonnet-4-6')
  const [saving, setSaving]         = useState(false)
  const [saved, setSaved]           = useState(false)
  const [testStatus, setTestStatus] = useState<TestStatus>('idle')
  const [testError, setTestError]   = useState<string | null>(null)
  const [error, setError]           = useState<string | null>(null)

  const resolvedModel = PROVIDER_MODELS[provider]?.includes(modelName)
    ? modelName
    : PROVIDER_MODELS[provider]?.[0] ?? modelName

  const handleProviderChange = (newProvider: ModelProvider) => {
    setProvider(newProvider)
    setModelName(PROVIDER_MODELS[newProvider][0])
    setSaved(false)
    setTestStatus('idle')
    setTestError(null)
    setError(null)
  }

  const handleModelChange = (newModel: string) => {
    setModelName(newModel)
    setSaved(false)
    setTestStatus('idle')
    setTestError(null)
    setError(null)
  }

  const handleSave = async () => {
    setSaving(true)
    setSaved(false)
    setError(null)
    try {
      const res  = await fetch(`/api/agents/${agentId}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ model_provider: provider, model_name: resolvedModel }),
      })
      const json = await res.json()
      if (!res.ok || json.error) {
        setError(json.error ?? 'Save failed')
      } else {
        setSaved(true)
        setTimeout(() => setSaved(false), 2500)
      }
    } catch (e) {
      setError(String(e))
    } finally {
      setSaving(false)
    }
  }

  const handleTest = async () => {
    setTestStatus('testing')
    setTestError(null)
    try {
      const res  = await fetch('/api/agents/test-connection', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ provider, model_name: resolvedModel }),
      })
      const json = await res.json()
      if (!res.ok || json.error) {
        setTestStatus('fail')
        setTestError(json.error ?? 'Test failed')
      } else {
        setTestStatus('ok')
        setTimeout(() => setTestStatus('idle'), 4000)
      }
    } catch (e) {
      setTestStatus('fail')
      setTestError(String(e))
    }
  }

  const modelOptions = PROVIDER_MODELS[provider] ?? []

  return (
    <div className="mt-3 pt-3 border-t border-line-soft">
      <p className="text-xs font-medium text-ink-500 mb-2">{t('modelConfig')}</p>

      <div className="flex flex-wrap gap-2 items-end">
        {/* Provider */}
        <div className="flex-1 min-w-[6.5rem]">
          <Field label={t('provider')}>
            <Select
              size="sm"
              value={provider}
              onChange={(e) => handleProviderChange(e.target.value as ModelProvider)}
            >
              {PROVIDERS.map((p) => (
                <option key={p.value} value={p.value}>{p.label}</option>
              ))}
            </Select>
          </Field>
        </div>

        {/* Model */}
        <div className="flex-1 min-w-[6.5rem]">
          <Field label={t('model')}>
            <Select
              size="sm"
              value={resolvedModel}
              onChange={(e) => handleModelChange(e.target.value)}
            >
              {modelOptions.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </Select>
          </Field>
        </div>

        {/* Test button */}
        <Button
          variant="secondary"
          size="sm"
          loading={testStatus === 'testing'}
          onClick={handleTest}
          title={t('testTooltip')}
        >
          {testStatus === 'testing' ? t('testing') : t('test')}
        </Button>

        {/* Save button */}
        <Button
          variant="primary"
          size="sm"
          loading={saving}
          onClick={handleSave}
        >
          {saving ? t('saving') : saved ? t('saved') : t('save')}
        </Button>
      </div>

      {(testStatus === 'ok' || testStatus === 'fail') && (
        <div className="mt-1.5">
          <Tag size="sm" tone={testStatus === 'ok' ? 'success' : 'danger'} label={testStatus === 'ok' ? t('testOk') : t('testFail')} />
        </div>
      )}
      {testError && (
        <p className="text-xs text-danger-text mt-1.5">{testError}</p>
      )}
      {error && (
        <p className="text-xs text-danger-text mt-1.5">{error}</p>
      )}
    </div>
  )
}
