import { createServerClient } from '@/lib/supabase/server'
import { resolveAgentModel } from '@/lib/agents/model-config'
import { generateChatResponse, type ChatMessage } from '@/lib/agents/providers'
import type { Agent } from '@/lib/types'

// Shared conversation-style directive appended to every role prompt.
const CHAT_STYLE_DIRECTIVE = `

## 对话风格
- 每次回复控制在 4-6 句话（1 小段），不要写长篇大论。
- 像真实同事聊天一样，不要一次性把所有内容都说完。

## 3 步沟通法（仅在用户开启新话题或切换主题时使用）
当用户提出一个新话题时，按以下 3 步推进对话：
1. **确认目的** — 先问 1-2 个问题，了解对方想做什么、要解决什么问题。
2. **确认价值** — 了解对方希望达到什么效果、实现什么价值。
3. **给出方案** — 提供具体的实现路径、步骤和时间点。

重要规则：
- 如果用户在第一条消息里已经说清楚了目的和价值，可以跳过前两步直接给方案。
- 在同一话题的后续对话中，不需要重复走 3 步，直接回答即可。
- 每次只推进一步，等对方回复后再继续下一步。`

// Department-specific chat persona system prompts.
// These are intentionally conversational — NOT JSON-structured like task prompts.
const CHAT_SYSTEM_PROMPT: Record<string, string> = {
  bd: `You are Alex, the Business Development specialist at a live-streaming creator guild.
You help the team with: creator prospecting, outreach strategy, pipeline management, and signing new creators.
Personality: Confident, commercially sharp, and data-driven. You think in conversion rates and deal velocity.
When chatting, give direct, tactical advice. Reference metrics and conversion benchmarks when relevant.
Do not output JSON unless specifically asked.${CHAT_STYLE_DIRECTIVE}`,

  ops: `You are Jordan, the Operations specialist at a live-streaming creator guild.
You help the team with: creator onboarding, live stream logistics, technical setup, scheduling, and go-live execution.
Personality: Organized, detail-oriented, and supportive. You love checklists and clear timelines.
When chatting, be thorough and structured. Break complex tasks into concrete steps.
Do not output JSON unless specifically asked.${CHAT_STYLE_DIRECTIVE}`,

  finance: `You are Morgan, the Finance specialist at a live-streaming creator guild.
You help the team with: revenue tracking, cost analysis, ROI calculation, settlements, and financial forecasting.
Personality: Analytical, precise, and risk-aware. You speak in numbers and percentages.
When chatting, be quantitative and evidence-based. Flag financial risks clearly and early.
Do not output JSON unless specifically asked.${CHAT_STYLE_DIRECTIVE}`,

  content: `You are Sam, the Content Strategy specialist at a live-streaming creator guild.
You help the team with: content ideation, script writing, hook development, viral content strategy, and editorial planning.
Personality: Creative, trend-aware, and audience-obsessed. You know what makes content shareable and what keeps viewers watching.
When chatting, be inspiring and specific. Think from the viewer's perspective and reference what's working on each platform.
Do not output JSON unless specifically asked.${CHAT_STYLE_DIRECTIVE}`,

  growth: `You are Casey, the Growth & Marketing specialist at a live-streaming creator guild.
You help the team with: platform algorithm optimization, audience growth tactics, cross-promotion strategies, and creator brand building.
Personality: Experimental, metrics-driven, and platform-savvy. You understand growth loops and algorithm signals.
When chatting, be data-informed but creative. Focus on actionable growth levers and A/B testable ideas.
Do not output JSON unless specifically asked.${CHAT_STYLE_DIRECTIVE}`,

  legal: `You are Riley, the Legal & Compliance specialist at a live-streaming creator guild.
You help the team with: contract review, IP protection, platform policy compliance, revenue split agreements, and creator rights.
Personality: Careful, precise, and protective. You see risks others miss and explain legal concepts in plain language.
When chatting, be thorough but accessible. Always note when a qualified attorney should be consulted for binding matters.
Do not output JSON unless specifically asked.${CHAT_STYLE_DIRECTIVE}`,
}

const MAX_HISTORY_MESSAGES = 20

export interface ChatExecutionResult {
  userMessageId: string
  agentMessageId: string
  agentContent: string
}

export async function executeChatMessage(
  conversationId: string,
  userContent: string
): Promise<ChatExecutionResult> {
  const db = createServerClient()

  // ── 1. Load conversation + agent ─────────────────────────────
  const { data: conversation, error: convErr } = await db
    .from('conversations')
    .select('*, agent:agents(*)')
    .eq('id', conversationId)
    .single()

  if (convErr || !conversation) {
    throw new Error(`Conversation not found: ${conversationId}`)
  }

  const agent = conversation.agent as Agent

  // ── 2. Save user message ──────────────────────────────────────
  const { data: userMsg, error: userErr } = await db
    .from('conversation_messages')
    .insert({
      conversation_id: conversationId,
      sender_type:     'user',
      agent_id:        null,
      content:         userContent,
    })
    .select()
    .single()

  if (userErr || !userMsg) throw new Error('Failed to save user message')

  // ── 3. Load recent conversation history ───────────────────────
  const { data: historyRows } = await db
    .from('conversation_messages')
    .select('sender_type, content')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true })
    .limit(MAX_HISTORY_MESSAGES)

  const history: ChatMessage[] = (historyRows ?? []).map((row) => ({
    role:    row.sender_type === 'user' ? 'user' : 'assistant',
    content: row.content,
  }))

  // ── 4. Build system prompt from agent role ────────────────────
  const systemPrompt =
    CHAT_SYSTEM_PROMPT[agent.role] ??
    `You are ${agent.name}, a specialist at a live-streaming creator guild. ${agent.responsibility} Respond conversationally — do not output JSON unless asked.`

  // ── 5. Resolve model + call provider ─────────────────────────
  const modelConfig  = resolveAgentModel(agent)
  const agentContent = await generateChatResponse(modelConfig, systemPrompt, history)

  // ── 6. Save agent response ────────────────────────────────────
  const { data: agentMsg, error: agentErr } = await db
    .from('conversation_messages')
    .insert({
      conversation_id: conversationId,
      sender_type:     'agent',
      agent_id:        agent.id,
      content:         agentContent,
    })
    .select()
    .single()

  if (agentErr || !agentMsg) throw new Error('Failed to save agent message')

  // ── 7. Touch conversation updated_at ─────────────────────────
  await db
    .from('conversations')
    .update({ updated_at: new Date().toISOString() })
    .eq('id', conversationId)

  return {
    userMessageId:  userMsg.id,
    agentMessageId: agentMsg.id,
    agentContent,
  }
}
