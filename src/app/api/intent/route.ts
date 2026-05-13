import { NextRequest, NextResponse } from 'next/server'
import { authGuard } from '@/lib/auth/guard'
import { parseExpenseIntent } from '@/lib/intent/parser'
import { executeIntent } from '@/lib/intent/executor'
import { logIntentViolation } from '@/lib/intent/audit'

// P1-E — Hard ceiling on user input. Anything longer than this is either a
// prompt-injection payload or a copy/paste accident; legitimate single-message
// intents fit easily in 1000 chars.
const MAX_INPUT_CHARS = 1000

// C0/C1 control chars except TAB (\x09) and LF (\x0A). Some terminals/LLMs
// treat these as boundary markers that can trick the model into "exiting"
// the user-input region of the prompt.
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\x00-\x08\x0B-\x1F\x7F-\x9F]/g

// POST /api/intent
// Body: { text: string }
// Response: see ExecuteResult — { kind: 'pending' | 'query_result' | 'clarification' | 'error', ... }
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
    // Audit and reject — long inputs are usually injection payloads.
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

  // P1-E — Unicode NFKC collapses homoglyphs and compatibility forms so e.g.
  // full-width digits or Cyrillic 'а' can't disguise themselves as ASCII to
  // defeat downstream string checks; then strip control characters.
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
  const parsed   = await parseExpenseIntent(text, { todayISO })
  if (!parsed.ok) {
    await logIntentViolation({
      userId:  user.id,
      stage:   'parser',
      reason:  parsed.reason,
      rawText: text,
    })
    return NextResponse.json(
      { kind: 'error', code: 'parser_failed', message: parsed.reason },
      { status: 200 },
    )
  }

  const result = await executeIntent(parsed.intent, {
    userId:       user.id,
    channel:      'web',
    rawText:      text,
    classifiedAs: parsed.classifiedAs,
  })

  return NextResponse.json(result, { status: 200 })
}
