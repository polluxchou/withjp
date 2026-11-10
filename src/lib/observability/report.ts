import type { RequestErrorRecord } from './request-error'

/** 浏览器端错误边界（error.tsx / global-error.tsx）上报的记录。 */
export interface ClientErrorRecord {
  event: 'client_error'
  level: 'error'
  /** 哪个边界接住的：admin / site / global */
  boundary: string
  digest: string | null
  name: string
  message: string
}

export type ErrorRecord = RequestErrorRecord | ClientErrorRecord

type Sink = (line: string) => void

/**
 * 全站错误上报的唯一出口。
 *
 * 服务端的 onRequestError（src/instrumentation.ts）与浏览器端的错误边界都只调这一个
 * 函数。现在只做一件事：输出一行 JSON（服务端进平台日志，浏览器端进 console）。
 *
 * 将来接错误追踪服务（选哪家待定）只改这里：在下面那行之后把 record 交给它的 SDK。
 * 调用方、记录的字段、脱敏规则都不用动。
 */
export function reportError(record: ErrorRecord, sink: Sink = console.error): void {
  sink(JSON.stringify(record))
}

export function buildClientErrorRecord(boundary: string, error: unknown): ClientErrorRecord {
  const err = (typeof error === 'object' && error !== null ? error : {}) as {
    name?: unknown
    message?: unknown
    digest?: unknown
  }
  const pick = (value: unknown) => (typeof value === 'string' && value ? value : null)
  return {
    event: 'client_error',
    level: 'error',
    boundary,
    digest: pick(err.digest),
    name: pick(err.name) ?? 'Error',
    message: (pick(err.message) ?? '').slice(0, 500),
  }
}
