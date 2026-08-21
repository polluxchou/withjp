import { NextRequest, NextResponse } from 'next/server'
import { authGuard } from '@/lib/auth/guard'
import { getCompetitorBoard, httpStatusForError } from '@/lib/competitors/service'
import { buildAskContext } from '@/lib/competitors/ask-context'
import { buildSystemPrompt } from '@/lib/competitors/ask-prompt'
import { deepseekChat } from '@/lib/llm/deepseek'
import { parseAskBody, trimHistory } from '@/lib/competitors/ask-validate'

// 历史上限：超出丢最早的一轮。数据包本身约 15k token，再让历史无限增长会顶穿
// 上下文窗口，也会让每轮成本随对话长度线性上涨。见 ask-validate.ts 的
// trimHistory：裁剪时会继续丢掉窗口开头悬空的 assistant 消息，保证送进模型
// 的窗口以 user 开头。
const MAX_TURNS = 20

// POST /api/competitors/ask — 无状态问答：body { messages: {role,content}[], locale?: string }
// 每轮由前端把完整对话历史发上来，这里重新拼一份数据包 + system prompt，
// 调一次模型，返回纯文本答案。不落库、不持有会话状态。
export async function POST(req: NextRequest) {
  const user = await authGuard()
  if (user instanceof NextResponse) return user

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'bad_request', message: 'Invalid JSON body' }, { status: 400 })
  }

  const parsed = parseAskBody(body)
  if (!parsed.ok) {
    return NextResponse.json({ error: 'bad_request', message: parsed.message }, { status: 400 })
  }
  const turns = trimHistory(parsed.turns, MAX_TURNS)

  const boardRes = await getCompetitorBoard(user.id)
  if (boardRes.error) {
    return NextResponse.json(
      { error: 'board', message: boardRes.error.message },
      { status: httpStatusForError(boardRes.error.code) },
    )
  }

  // now 由这里注入（唯一允许读时钟的地方）——buildAskContext 的日期口径
  // 依赖 Asia/Tokyo，不能用 todayLocal()（读运行环境时区，在 Vercel 上是
  // UTC），见 ask-context.ts 顶部注释与设计文档 §7。
  const ctx = buildAskContext(boardRes.data, new Date(), parsed.locale)
  const result = await deepseekChat(buildSystemPrompt(ctx, parsed.locale), turns)

  // 上游失败按 200 + error code 返回，而不是非 2xx：面板要据此区分"未配置"
  // 和"上游报错"两种不同的可操作提示，非 2xx 会被前端 fetch 的 !res.ok
  // 分支吞成一句笼统的网络错误。deepseekChat 内部已经对 message 做过凭据
  // 脱敏（见 deepseek.ts 的 redactCredentials），这里原样透传即可。
  if (!result.ok) {
    return NextResponse.json({ error: result.code, message: result.message }, { status: 200 })
  }
  return NextResponse.json({ answer: result.answer })
}
