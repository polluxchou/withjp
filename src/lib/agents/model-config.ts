import type { ModelProvider, AgentRole } from '@/lib/types'

export interface ModelConfig {
  provider: ModelProvider
  model: string
}

const ROLE_DEFAULTS: Record<AgentRole, ModelConfig> = {
  bd:      { provider: 'anthropic', model: 'claude-sonnet-4-6' },
  ops:     { provider: 'anthropic', model: 'claude-sonnet-4-6' },
  finance: { provider: 'anthropic', model: 'claude-sonnet-4-6' },
  content: { provider: 'anthropic', model: 'claude-sonnet-4-6' },
  growth:  { provider: 'anthropic', model: 'claude-sonnet-4-6' },
  legal:   { provider: 'anthropic', model: 'claude-sonnet-4-6' },
  // AgentRole 补登 pmo/tech（design-system 角色体系补全）后 Record 必须
  // 穷举全部 8 值才能编译通过；两者复用同一套默认模型配置，与其余角色一致。
  pmo:     { provider: 'anthropic', model: 'claude-sonnet-4-6' },
  tech:    { provider: 'anthropic', model: 'claude-sonnet-4-6' },
}

export function resolveAgentModel(agent: {
  role: AgentRole
  model_provider: ModelProvider | null
  model_name: string | null
}): ModelConfig {
  // 1. DB values take priority
  if (agent.model_provider && agent.model_name) {
    return { provider: agent.model_provider, model: agent.model_name }
  }

  // 2. Code defaults by role
  const roleDefault = ROLE_DEFAULTS[agent.role]
  if (roleDefault) return roleDefault

  // 3. No config found — fail clearly
  throw new Error(`No model configuration found for agent role: ${agent.role}`)
}
