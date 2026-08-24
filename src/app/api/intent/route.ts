import { NextRequest, NextResponse } from 'next/server'
import { authGuard } from '@/lib/auth/guard'
import { classifyEntity, parseExpenseIntent, parseWorkTaskIntent } from '@/lib/intent/parser'
import { executeIntent, executeWorkTaskIntent } from '@/lib/intent/executor'
import { logIntentViolation } from '@/lib/intent/audit'
import { parseVenueIntent, type VenueParseItem } from '@/lib/venue/venue-intent'
import { VENUE_ITEM_TYPE_OPTIONS } from '@/venue/layoutData'
import { MAX_INPUT_CHARS, sanitizeIntentText } from '@/lib/intent/input-gate'
import { MAX_PRIOR_OUTCOME_CHARS, type PriorContext } from '@/lib/intent/conversation'
import { runAskConversation } from '@/lib/competitors/ask-service'

const VENUE_TYPE_SET = new Set(VENUE_ITEM_TYPE_OPTIONS.map((o) => o.value as string))

// POST /api/intent
export async function POST(req: NextRequest) {
  const user = await authGuard()
  if (user instanceof NextResponse) return user

  let body: {
    text?: string
    scope?: string
    venueItems?: { id: string; name: string; type: string }[]
    prior?: { text?: string; outcome?: string }
    // 竞品问答分支专用：完整对话历史与界面语言。两者都是不可信输入，服务端
    // 不在这里做任何形状/内容校验——runAskConversation 内部的 parseAskBody
    // 才是唯一的校验点（role 白名单、内容长度上限、locale 白名单），本路由
    // 只负责把它们原样递过去。见下方 competitor 分支的注释。
    history?: { role: string; content: string }[]
    locale?: string
  }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ kind: 'error', code: 'bad_request', message: 'invalid JSON body' }, { status: 400 })
  }

  const gated = sanitizeIntentText(body.text ?? '', MAX_INPUT_CHARS)
  if (!gated.ok) {
    const rawText = (body.text ?? '').trim()
    if (gated.reason === 'empty') {
      return NextResponse.json({ kind: 'error', code: 'bad_request', message: 'text is required' }, { status: 400 })
    }
    if (gated.reason === 'too_long') {
      await logIntentViolation({
        userId:  user.id,
        stage:   'input_gate',
        reason:  `text length ${gated.length} > ${MAX_INPUT_CHARS}`,
        rawText: rawText.slice(0, MAX_INPUT_CHARS),
      })
      return NextResponse.json(
        { kind: 'error', code: 'bad_request', message: `text 长度上限为 ${MAX_INPUT_CHARS} 字` },
        { status: 400 },
      )
    }
    await logIntentViolation({
      userId:  user.id,
      stage:   'input_gate',
      reason:  'empty after normalization',
      rawText: rawText.slice(0, 200),
    })
    return NextResponse.json({ kind: 'error', code: 'bad_request', message: 'text is empty after sanitization' }, { status: 400 })
  }
  const text = gated.text

  // prior 走与 text 完全相同的清洗；任一段不合法就整体丢弃 prior（降级成
  // 单轮），不因为上下文脏了就让整次请求失败——上下文是增强项，不是必需项。
  let priorTurn: PriorContext | undefined
  if (body.prior?.text && body.prior?.outcome) {
    const pText    = sanitizeIntentText(body.prior.text, MAX_INPUT_CHARS)
    const pOutcome = sanitizeIntentText(body.prior.outcome, MAX_PRIOR_OUTCOME_CHARS)
    if (pText.ok && pOutcome.ok) {
      priorTurn = { text: pText.text, outcome: pOutcome.text }
    } else {
      await logIntentViolation({
        userId:  user.id,
        stage:   'input_gate',
        reason:  `prior discarded: text=${pText.ok ? 'ok' : pText.reason}, outcome=${pOutcome.ok ? 'ok' : pOutcome.reason}`,
        rawText: text.slice(0, 200),
      })
    }
  }

  const todayISO = new Date().toISOString().slice(0, 10)
  const ctx = { userId: user.id, channel: 'web' as const, rawText: text }

  // Venue scope: parse-only (the client applies the action to the current
  // canvas after preview). Hard-gated so it never spills into other domains.
  if (body.scope === 'venue') {
    const items = Array.isArray(body.venueItems)
      ? body.venueItems.filter((i) => !!i && typeof i.id === 'string' && typeof i.name === 'string' && VENUE_TYPE_SET.has(i.type)) as VenueParseItem[]
      : []
    const parsed = await parseVenueIntent(text, items)
    if (!parsed.ok) {
      await logIntentViolation({ userId: user.id, stage: 'parser', reason: parsed.reason, rawText: text })
      return NextResponse.json({ kind: 'error', code: 'parser_failed', message: parsed.reason }, { status: 200 })
    }
    return NextResponse.json({ kind: 'venue_preview', action: parsed.action }, { status: 200 })
  }

  // Classify entity first, then route to the right parser.
  const entity = await classifyEntity(text, priorTurn)

  if (entity === 'competitor') {
    // history 是竞品问答的多轮上下文（客户端用 askHistoryOf 派生），与上面
    // 的 prior 是两套独立机制：prior 只带「上一轮」给支出/工时任务解析器
    // 消解指代，history 带的是完整的竞品问答轮次给 runAskConversation。
    //
    // 这里只做「是不是数组」这一层防御——防的是 [...history] 在 history
    // 不是数组时（例如客户端发了个数字/对象）直接抛 TypeError 把整个请求
    // 拖成 500；这不是在校验消息形状。数组内每条消息的 role/content 是否
    // 合法，一律留给 runAskConversation 内部的 parseAskBody 去挡——那是
    // 唯一允许对这份数据做校验判断的地方，本路由不重复一份更弱的校验。
    const history = Array.isArray(body.history) ? body.history : []
    const messages = [...history, { role: 'user', content: text }]
    const result = await runAskConversation(user.id, { messages, locale: body.locale })
    if (!result.ok) {
      return NextResponse.json({ kind: 'error', code: result.code, message: result.message }, { status: 200 })
    }
    return NextResponse.json({ kind: 'competitor_answer', answer: result.answer }, { status: 200 })
  }

  if (entity === 'work_task') {
    const parsed = await parseWorkTaskIntent(text, { todayISO, priorTurn })
    if (!parsed.ok) {
      await logIntentViolation({ userId: user.id, stage: 'parser', reason: parsed.reason, rawText: text })
      return NextResponse.json({ kind: 'error', code: 'parser_failed', message: parsed.reason }, { status: 200 })
    }
    const result = await executeWorkTaskIntent(parsed.intent, ctx)
    return NextResponse.json(result, { status: 200 })
  }

  // Default: expense (also handles 'unknown' — fall back to expense parser)
  const parsed = await parseExpenseIntent(text, { todayISO, priorTurn })
  if (!parsed.ok) {
    await logIntentViolation({ userId: user.id, stage: 'parser', reason: parsed.reason, rawText: text })
    return NextResponse.json({ kind: 'error', code: 'parser_failed', message: parsed.reason }, { status: 200 })
  }

  const result = await executeIntent(parsed.intent, {
    ...ctx,
    classifiedAs: parsed.classifiedAs,
  })
  return NextResponse.json(result, { status: 200 })
}
