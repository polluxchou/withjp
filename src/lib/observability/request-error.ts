// 服务端请求错误的结构化记录。纯函数：instrumentation.ts 在 Node 与 Edge 两个运行时
// 都会加载它，这里不能引用任何 Node 专属模块。
//
// 记什么：路由、方法、digest、错误名与消息。
// 不记什么：请求头（含 cookie、authorization）、请求体、查询串。查询串里会带一次性
// 凭据（找回密码的 proof、OAuth code），所以路径只留 pathname。

export interface RequestErrorRecord {
  event: 'request_error'
  level: 'error'
  ts: string
  /** 请求路径，只含 pathname */
  path: string
  method: string
  /** 命中的路由文件模式，如 /[locale]/creators/[id] */
  route: string | null
  /** page / route / proxy / action */
  routeType: string | null
  /** 与错误页上展示给用户的编号是同一个，用它把用户反馈对回日志 */
  digest: string | null
  name: string
  message: string
}

export interface RequestErrorInput {
  error: unknown
  request: { path?: unknown; method?: unknown }
  context?: { routePath?: unknown; routeType?: unknown }
  now?: Date
}

const MAX_MESSAGE = 500
const MAX_PATH = 300

const str = (value: unknown): string | null =>
  typeof value === 'string' && value.length > 0 ? value : null

function clip(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max)}…` : value
}

/** 去掉查询串与 hash，只留 pathname。 */
export function pathnameOnly(path: string): string {
  const cut = path.search(/[?#]/)
  return clip(cut < 0 ? path : path.slice(0, cut), MAX_PATH) || '/'
}

export function buildRequestErrorRecord(input: RequestErrorInput): RequestErrorRecord {
  const { error, request, context } = input
  const err = (typeof error === 'object' && error !== null ? error : {}) as {
    name?: unknown
    message?: unknown
    digest?: unknown
  }
  // 抛出来的不一定是 Error（throw 'x'、throw null 都合法），兜成字符串。
  const message = str(err.message) ?? (typeof error === 'string' ? error : '')

  return {
    event: 'request_error',
    level: 'error',
    ts: (input.now ?? new Date()).toISOString(),
    path: pathnameOnly(str(request.path) ?? '/'),
    method: (str(request.method) ?? 'GET').toUpperCase(),
    route: str(context?.routePath),
    routeType: str(context?.routeType),
    digest: str(err.digest),
    name: str(err.name) ?? 'Error',
    message: clip(message, MAX_MESSAGE),
  }
}
