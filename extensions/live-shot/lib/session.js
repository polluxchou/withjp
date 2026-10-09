// Supabase 登录 / 续期返回体 → 扩展本地存的会话。密码从不进这里。
export function sessionFromAuth(json, nowMs) {
  if (!json || typeof json.access_token !== 'string' || typeof json.refresh_token !== 'string') return null
  const expiresAt = Number.isFinite(json.expires_at)
    ? json.expires_at * 1000
    : nowMs + (Number(json.expires_in) || 3600) * 1000
  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token,
    expiresAt,
    email: json.user && json.user.email ? json.user.email : null,
  }
}

// 提前 60 秒续期，免得请求在路上过期。
export function needsRefresh(session, nowMs) {
  return !session || session.expiresAt - nowMs < 60_000
}
