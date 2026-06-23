'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
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

  const testLabel: Record<TestStatus, string> = {
    idle:    t('test'),
    testing: t('testing'),
    ok:      t('testOk'),
    fail:    t('testFail'),
  }

  const testColor: Record<TestStatus, string> = {
    idle:    'bg-zinc-100 text-zinc-600 hover:bg-zinc-200',
    testing: 'bg-zinc-100 text-zinc-400',
    ok:      'bg-green-100 text-green-700',
    fail:    'bg-red-100 text-red-600',
  }

  const modelOptions = PROVIDER_MODELS[provider] ?? []

  return (
    <div className="mt-3 pt-3 border-t border-zinc-100">
      <p className="text-xs font-medium text-zinc-500 mb-2">{t('modelConfig')}</p>

      <div className="flex gap-2 items-end">
        {/* Provider */}
        <div className="flex-1">
          <label className="text-xs text-zinc-400 block mb-1">{t('provider')}</label>
          <select
            value={provider}
            onChange={(e) => handleProviderChange(e.target.value as ModelProvider)}
            className="w-full text-xs border border-zinc-200 rounded-md px-2 py-1.5 bg-white text-zinc-700 focus:outline-none focus:ring-1 focus:ring-violet-400"
          >
            {PROVIDERS.map((p) => (
              <option key={p.value} value={p.value}>{p.label}</option>
            ))}
          </select>
        </div>

        {/* Model */}
        <div className="flex-1">
          <label className="text-xs text-zinc-400 block mb-1">{t('model')}</label>
          <select
            value={resolvedModel}
            onChange={(e) => handleModelChange(e.target.value)}
            className="w-full text-xs border border-zinc-200 rounded-md px-2 py-1.5 bg-white text-zinc-700 focus:outline-none focus:ring-1 focus:ring-violet-400"
          >
            {modelOptions.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        </div>

        {/* Test button */}
        <button
          onClick={handleTest}
          disabled={testStatus === 'testing'}
          title={t('testTooltip')}
          className={`text-xs px-2.5 py-1.5 rounded-md whitespace-nowrap transition-colors disabled:opacity-50 ${testColor[testStatus]}`}
        >
          {testLabel[testStatus]}
        </button>

        {/* Save button */}
        <button
          onClick={handleSave}
          disabled={saving}
          className="text-xs px-3 py-1.5 rounded-md bg-primary text-white hover:bg-primary-hover disabled:opacity-50 whitespace-nowrap"
        >
          {saving ? t('saving') : saved ? t('saved') : t('save')}
        </button>
      </div>

      {testError && (
        <p className="text-xs text-red-500 mt-1.5">{testError}</p>
      )}
      {error && (
        <p className="text-xs text-red-500 mt-1.5">{error}</p>
      )}
    </div>
  )
}
