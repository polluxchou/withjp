import { NextRequest, NextResponse } from 'next/server'
import { authGuard } from '@/lib/auth/guard'
import { parseExpenseIntent } from '@/lib/intent/parser'
import { executeIntent } from '@/lib/intent/executor'

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
    return NextResponse.json({ kind: 'error', message: 'invalid JSON body' }, { status: 400 })
  }

  const text = (body.text ?? '').trim()
  if (!text) {
    return NextResponse.json({ kind: 'error', message: 'text is required' }, { status: 400 })
  }

  const todayISO = new Date().toISOString().slice(0, 10)
  const parsed   = await parseExpenseIntent(text, { todayISO })
  if (!parsed.ok) {
    return NextResponse.json(
      { kind: 'error', message: `无法解析：${parsed.reason}` },
      { status: 200 },
    )
  }

  const result = await executeIntent(parsed.intent, {
    userId:  user.id,
    channel: 'web',
    rawText: text,
  })

  return NextResponse.json(result, { status: 200 })
}
