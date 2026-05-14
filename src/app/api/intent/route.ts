import { NextRequest, NextResponse } from 'next/server'
import { authGuard } from '@/lib/auth/guard'
import { classifyEntity, parseExpenseIntent, parseWorkTaskIntent } from '@/lib/intent/parser'
import { executeIntent, executeWorkTaskIntent } from '@/lib/intent/executor'
import { logIntentViolation } from '@/lib/intent/audit'

const MAX_INPUT_CHARS = 1000
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\x00-\x08\x0B-\x1F\x7F-\x9F]/g

// POST /api/intent
export async function POST(req: NextRequest) {
  const user = await authGuard()
  if (user instanceof NextResponse) return user

  let body: { text?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ kind: 'error', code: 'bad_request', message: 'invalid JSON body' }, { status: 400 })
  }

  const rawText = (body.text ?? '').trim()
  if (!rawText) {
    return NextResponse.json({ kind: 'error', code: 'bad_request', message: 'text is required' }, { status: 400 })
  }
  if (rawText.length > MAX_INPUT_CHARS) {
    await logIntentViolation({
      userId:  user.id,
      stage:   'input_gate',
      reason:  `text length ${rawText.length} > ${MAX_INPUT_CHARS}`,
      rawText: rawText.slice(0, MAX_INPUT_CHARS),
    })
    return NextResponse.json(
      { kind: 'error', code: 'bad_request', message: `text 长度上限为 ${MAX_INPUT_CHARS} 字` },
      { status: 400 },
    )
  }

  const text = rawText.normalize('NFKC').replace(CONTROL_CHARS, ' ').trim()
  if (!text) {
    await logIntentViolation({
      userId:  user.id,
      stage:   'input_gate',
      reason:  'empty after normalization',
      rawText: rawText.slice(0, 200),
    })
    return NextResponse.json({ kind: 'error', code: 'bad_request', message: 'text is empty after sanitization' }, { status: 400 })
  }

  const todayISO = new Date().toISOString().slice(0, 10)
  const ctx = { userId: user.id, channel: 'web' as const, rawText: text }

  // Classify entity first, then route to the right parser.
  const entity = await classifyEntity(text)

  if (entity === 'work_task') {
    const parsed = await parseWorkTaskIntent(text, { todayISO })
    if (!parsed.ok) {
      await logIntentViolation({ userId: user.id, stage: 'parser', reason: parsed.reason, rawText: text })
      return NextResponse.json({ kind: 'error', code: 'parser_failed', message: parsed.reason }, { status: 200 })
    }
    const result = await executeWorkTaskIntent(parsed.intent, ctx)
    return NextResponse.json(result, { status: 200 })
  }

  // Default: expense (also handles 'unknown' — fall back to expense parser)
  const parsed = await parseExpenseIntent(text, { todayISO })
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
