# 忘记密码自助找回流程 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让未登录用户能在登录页通过邮件自助重置密码，补齐 `/auth/callback` 回调路由和 `/reset-password` 设置新密码页面，替换掉登录页"忘记密码"目前的 `alert()` 占位实现。

**Architecture:** 登录页"忘记密码"→ `supabase.auth.resetPasswordForEmail` 发邮件（`redirectTo` 指向 `/auth/callback`）→ 用户点邮件链接 → `/auth/callback` route handler 用 `@supabase/ssr` 的 `exchangeCodeForSession` 换取临时 session（cookie）→ 跳转到 `/reset-password` → 客户端 `supabase.auth.updateUser({password})` 设新密码 → 登出并跳回登录页。涉及的校验逻辑（密码强度/一致性、回调重定向白名单、`/auth` 路径绕过 next-intl 重写）全部抽成纯函数，配 `node:test` 单测；route handler / page 本身按项目现有惯例不做集成测试，最后走一遍真实浏览器手测。

**Tech Stack:** Next.js 14 App Router、`@supabase/ssr`、next-intl v4（locale: zh/en/ja，`localePrefix: 'always'`）、`node:test --experimental-strip-types`（无类型检查，靠 `tsc --noEmit` 补位）。

**关联 spec：** [docs/superpowers/specs/2026-08-25-forgot-password-flow-design.md](../specs/2026-08-25-forgot-password-flow-design.md)

**范围声明（对齐 spec）：** 只做未登录用户的"忘记密码"自助找回。不做已登录用户在个人资料页主动改密码的入口。

**代码之外、需要人工在 Supabase Dashboard 完成的配置（不在本计划任何 task 里，任何一步代码改动都替代不了）：**
- Authentication → URL Configuration → Site URL 改成 `https://mcn.agenova.chat`
- Redirect URLs 加入 `https://mcn.agenova.chat/auth/callback`（本地开发保留 `http://localhost:3000/**`）

---

## File Structure Overview

| 文件 | 改动 | 职责 |
|---|---|---|
| `src/lib/middleware-matcher.ts` | 修改 | 新增 `PUBLIC_PATHS`（原本在两个 middleware 文件里各写一份，现在统一到这里）和 `isAuthCallbackPath` 纯函数 |
| `src/lib/middleware-matcher.test.ts` | 修改 | 补上面两个新增导出的单测 |
| `src/middleware.ts` | 修改 | 用 `isAuthCallbackPath` 让 `/auth/*` 绕过 next-intl 重写；`PUBLIC_PATHS` 改成从 `middleware-matcher.ts` import |
| `src/lib/supabase/middleware.ts` | 修改 | `PUBLIC_PATHS` 改成从 `middleware-matcher.ts` import（多了 `/reset-password`） |
| `src/lib/auth/password-validation.ts` | 新增 | 新密码校验纯函数（长度/一致性） |
| `src/lib/auth/password-validation.test.ts` | 新增 | 对应单测 |
| `src/lib/auth/reset-redirect.ts` | 新增 | `/auth/callback` 成功后跳转目标的白名单校验（防 open redirect） |
| `src/lib/auth/reset-redirect.test.ts` | 新增 | 对应单测 |
| `src/app/auth/callback/route.ts` | 新增 | 服务端 code 交换 route handler，不带 locale 前缀 |
| `src/app/[locale]/reset-password/page.tsx` | 新增 | 设置新密码页面，客户端组件 |
| `src/app/[locale]/login/page.tsx` | 修改 | "忘记密码"接真实的 `resetPasswordForEmail`；读取 `resetError`/`resetSuccess` query 展示提示条 |
| `messages/zh.json` / `en.json` / `ja.json` | 修改 | `auth` 命名空间：删掉 `forgotPasswordAlert`，新增 15 个功能性文案 key（三个文件必须同步） |
| `package.json` | 修改 | `"test"` 脚本追加两个新测试文件路径 |

---

### Task 1: 抽取共享的 middleware 路径判断（`PUBLIC_PATHS` 去重 + `isAuthCallbackPath`）

**Files:**
- Modify: `src/lib/middleware-matcher.ts`
- Modify: `src/lib/middleware-matcher.test.ts`

**背景**：`src/middleware.ts:7` 和 `src/lib/supabase/middleware.ts:5` 各自硬编码了一份完全相同的 `const PUBLIC_PATHS = ['/login', '/_next', '/api']`。这次要给 `/reset-password` 开白名单（否则 `updateSession` 会在用户还没走完 `/auth/callback` 换 session 前就把它当未登录重定向回登录页），与其在两处各加一次容易漏改，不如提到 `middleware-matcher.ts` 统一维护。同时 `/auth/callback` 这种不带 locale 前缀的路由，如果不在 `src/middleware.ts` 最上面的短路判断里显式跳过，会被 `intlMiddleware` 当成"缺 locale 前缀"重定向到 `/zh/auth/callback`（一个不存在的路由，404），所以需要 `isAuthCallbackPath` 这个纯函数。

- [ ] **Step 1: 写失败的测试**

在 `src/lib/middleware-matcher.test.ts` 末尾（`matcher excludes Next internals...` 这个 test 之后）追加：

```ts
test('PUBLIC_PATHS includes the auth self-service pages', () => {
  assert.deepEqual(PUBLIC_PATHS, ['/login', '/reset-password', '/_next', '/api'])
})

test('isAuthCallbackPath matches the auth callback route and its subpaths', () => {
  assert.equal(isAuthCallbackPath('/auth/callback'), true)
  assert.equal(isAuthCallbackPath('/auth'), true)
  assert.equal(isAuthCallbackPath('/authors'), false)
  assert.equal(isAuthCallbackPath('/zh/login'), false)
})
```

并把文件顶部的 import 改成：

```ts
import {
  MIDDLEWARE_MATCHER,
  matchesAppMiddlewarePath,
  PUBLIC_PATHS,
  isAuthCallbackPath,
} from './middleware-matcher.ts'
```

- [ ] **Step 2: 跑测试确认失败**

Run: `node --test --experimental-strip-types src/lib/middleware-matcher.test.ts`
Expected: FAIL — `PUBLIC_PATHS`/`isAuthCallbackPath` is not exported / undefined

- [ ] **Step 3: 实现**

把 `src/lib/middleware-matcher.ts` 改成（全文）：

```ts
export const MIDDLEWARE_MATCHER =
  '/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'

const MIDDLEWARE_PATH_RE =
  /^\/(?!api(?:\/|$)|_next\/static|_next\/image|favicon\.ico$|.*\.(?:svg|png|jpg|jpeg|gif|webp)$).*/

export function matchesAppMiddlewarePath(pathname: string) {
  return MIDDLEWARE_PATH_RE.test(pathname)
}

// Paths that skip the Supabase session check in updateSession() — either
// because they're the login/reset-password flow itself (checking the
// session there would redirect a not-yet-authenticated user right back to
// login) or because they're framework/API routes with their own auth.
export const PUBLIC_PATHS = ['/login', '/reset-password', '/_next', '/api']

// /auth/* (e.g. /auth/callback) must never go through next-intl's rewrite —
// it has no locale prefix and isn't a locale-prefixed app route. Without this,
// intlMiddleware would redirect it to /zh/auth/callback, a 404.
export function isAuthCallbackPath(pathname: string) {
  return pathname === '/auth' || pathname.startsWith('/auth/')
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `node --test --experimental-strip-types src/lib/middleware-matcher.test.ts`
Expected: PASS，所有 test 绿

- [ ] **Step 5: 把两个 middleware 文件接到新的共享导出上**

`src/middleware.ts` 顶部 import 块（第 1–5 行）改成：

```ts
import { type NextRequest } from 'next/server'
import createIntlMiddleware from 'next-intl/middleware'
import { NextResponse } from 'next/server'
import { routing, isLocale } from '@/i18n/routing'
import { shouldBypassMiddlewareAsset } from '@/lib/middleware-assets'
import { isAuthCallbackPath, PUBLIC_PATHS } from '@/lib/middleware-matcher'
```

删掉第 7 行 `const PUBLIC_PATHS = ['/login', '/_next', '/api']`（现在从上面 import 了）。

第 19–25 行的短路判断加一个条件：

```ts
  if (
    pathname.startsWith('/api') ||
    pathname.startsWith('/_next') ||
    isAuthCallbackPath(pathname) ||
    shouldBypassMiddlewareAsset(pathname)
  ) {
    return NextResponse.next()
  }
```

`src/lib/supabase/middleware.ts` 第 1–5 行改成：

```ts
import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { defaultLocale, isLocale } from '@/i18n/routing'
import { PUBLIC_PATHS } from '@/lib/middleware-matcher'
```

（即删掉原第 5 行 `const PUBLIC_PATHS = ['/login', '/_next', '/api']`，其余代码不变。）

- [ ] **Step 6: 跑一次相关测试确认没改坏别的东西**

Run: `node --test --experimental-strip-types src/lib/middleware-matcher.test.ts src/lib/middleware-assets.test.ts`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/lib/middleware-matcher.ts src/lib/middleware-matcher.test.ts src/middleware.ts src/lib/supabase/middleware.ts
git commit -m "$(cat <<'EOF'
refactor(middleware): 统一 PUBLIC_PATHS,新增 /auth 回调路径白名单

为忘记密码流程铺路: /reset-password 加入公开路径,/auth/* 绕过
next-intl 重写(否则会被错误跳转到 /zh/auth/callback)。顺带把两个
middleware 文件里重复的 PUBLIC_PATHS 数组去重到一处。

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: 新密码校验纯函数

**Files:**
- Create: `src/lib/auth/password-validation.ts`
- Test: `src/lib/auth/password-validation.test.ts`

- [ ] **Step 1: 写失败的测试**

创建 `src/lib/auth/password-validation.test.ts`：

```ts
import test from 'node:test'
import assert from 'node:assert/strict'

import { validateNewPassword, MIN_PASSWORD_LENGTH } from './password-validation.ts'

test('validateNewPassword rejects passwords shorter than the minimum length', () => {
  assert.equal(validateNewPassword('abc12', 'abc12'), 'tooShort')
  assert.equal(MIN_PASSWORD_LENGTH, 6)
})

test('validateNewPassword rejects mismatched confirmation even when both are long enough', () => {
  assert.equal(validateNewPassword('abc123', 'abc124'), 'mismatch')
})

test('validateNewPassword accepts a long enough, matching password', () => {
  assert.equal(validateNewPassword('abc123', 'abc123'), null)
})

test('validateNewPassword checks length before checking match', () => {
  // Both too short AND mismatched — length error should win so the user
  // fixes one problem at a time instead of seeing a confusing double error.
  assert.equal(validateNewPassword('a', 'b'), 'tooShort')
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `node --test --experimental-strip-types src/lib/auth/password-validation.test.ts`
Expected: FAIL — 找不到 `./password-validation.ts`

- [ ] **Step 3: 实现**

创建 `src/lib/auth/password-validation.ts`：

```ts
// Supabase's default GoTrue config requires a minimum of 6 characters —
// this mirrors that so the UI can reject too-short passwords before the
// updateUser() call round-trips to the server.
export const MIN_PASSWORD_LENGTH = 6

export type PasswordValidationError = 'tooShort' | 'mismatch'

export function validateNewPassword(
  password: string,
  confirmPassword: string
): PasswordValidationError | null {
  if (password.length < MIN_PASSWORD_LENGTH) return 'tooShort'
  if (password !== confirmPassword) return 'mismatch'
  return null
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `node --test --experimental-strip-types src/lib/auth/password-validation.test.ts`
Expected: PASS，4 个 test 全绿

- [ ] **Step 5: Commit**

```bash
git add src/lib/auth/password-validation.ts src/lib/auth/password-validation.test.ts
git commit -m "$(cat <<'EOF'
feat(auth): 新增密码强度/一致性校验纯函数

为 /reset-password 页面的表单校验铺路。

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: 回调重定向目标白名单（防 open redirect）

**Files:**
- Create: `src/lib/auth/reset-redirect.ts`
- Test: `src/lib/auth/reset-redirect.test.ts`

- [ ] **Step 1: 写失败的测试**

创建 `src/lib/auth/reset-redirect.test.ts`：

```ts
import test from 'node:test'
import assert from 'node:assert/strict'

import { resolveCallbackRedirect } from './reset-redirect.ts'

test('resolveCallbackRedirect accepts a same-site relative path', () => {
  assert.equal(resolveCallbackRedirect('/en/reset-password'), '/en/reset-password')
})

test('resolveCallbackRedirect falls back to the default locale reset page when next is missing', () => {
  assert.equal(resolveCallbackRedirect(null), '/zh/reset-password')
})

test('resolveCallbackRedirect rejects protocol-relative URLs to prevent open redirects', () => {
  assert.equal(resolveCallbackRedirect('//evil.example.com/phish'), '/zh/reset-password')
})

test('resolveCallbackRedirect rejects absolute URLs to prevent open redirects', () => {
  assert.equal(resolveCallbackRedirect('https://evil.example.com'), '/zh/reset-password')
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `node --test --experimental-strip-types src/lib/auth/reset-redirect.test.ts`
Expected: FAIL — 找不到 `./reset-redirect.ts`

- [ ] **Step 3: 实现**

创建 `src/lib/auth/reset-redirect.ts`：

```ts
import { defaultLocale } from '@/i18n/routing'

// /auth/callback redirects here after exchanging the recovery code. `next`
// comes from a query param an attacker could tamper with — only allow
// same-site relative paths (leading single slash, not "//..." which
// browsers treat as protocol-relative to an attacker's host).
export function resolveCallbackRedirect(next: string | null): string {
  if (next && next.startsWith('/') && !next.startsWith('//')) return next
  return `/${defaultLocale}/reset-password`
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `node --test --experimental-strip-types src/lib/auth/reset-redirect.test.ts`
Expected: PASS，4 个 test 全绿

- [ ] **Step 5: Commit**

```bash
git add src/lib/auth/reset-redirect.ts src/lib/auth/reset-redirect.test.ts
git commit -m "$(cat <<'EOF'
feat(auth): /auth/callback 重定向目标加白名单校验

防止 next query 参数被用来做 open redirect。

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: `/auth/callback` route handler

**Files:**
- Create: `src/app/auth/callback/route.ts`

没有集成测试（项目里所有测试都是纯函数级别，没有对 `route.ts` 做过集成测试的先例——见 Task 1-3 已经把可测的逻辑都抽出来了），这一步之后在 Task 8 里跑 `npm run build` 做静态检查，Task 9 里手测走一遍全流程。

- [ ] **Step 1: 实现**

创建 `src/app/auth/callback/route.ts`：

```ts
import { NextResponse } from 'next/server'
import { createAuthServerClient } from '@/lib/supabase/auth-server'
import { resolveCallbackRedirect } from '@/lib/auth/reset-redirect'
import { defaultLocale } from '@/i18n/routing'

export async function GET(request: Request) {
  const url = new URL(request.url)
  const code = url.searchParams.get('code')
  const next = url.searchParams.get('next')

  if (code) {
    const supabase = await createAuthServerClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      return NextResponse.redirect(new URL(resolveCallbackRedirect(next), url.origin))
    }
  }

  // Missing code, or exchange failed (e.g. otp_expired) — send the user
  // back to login with a flag so it can show "link expired, resend".
  return NextResponse.redirect(new URL(`/${defaultLocale}/login?resetError=1`, url.origin))
}
```

- [ ] **Step 2: 确认 TypeScript 编译没问题**

Run: `npx tsc --noEmit`
Expected: 没有新增的类型错误（`node --test` 不做类型检查，这一步是唯一能在提交前抓到类型问题的机会——参考此前 `strip-types 与 tsc 的缺口` 的教训）

- [ ] **Step 3: Commit**

```bash
git add src/app/auth/callback/route.ts
git commit -m "$(cat <<'EOF'
feat(auth): 新增 /auth/callback 路由处理密码重置回调

用 exchangeCodeForSession 把 Supabase 重置邮件里的 code 换成临时
session,再跳转到 /reset-password。

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: `/reset-password` 设置新密码页面

**Files:**
- Create: `src/app/[locale]/reset-password/page.tsx`

- [ ] **Step 1: 实现**

创建 `src/app/[locale]/reset-password/page.tsx`：

```tsx
'use client'

import { useState, useEffect } from 'react'
import { useRouter } from '@/i18n/navigation'
import { useTranslations } from 'next-intl'
import { Eye, EyeOff } from 'lucide-react'
import { validateNewPassword } from '@/lib/auth/password-validation'

export default function ResetPasswordPage() {
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [checkingSession, setCheckingSession] = useState(true)
  const [hasSession, setHasSession] = useState(false)
  const router = useRouter()
  const t = useTranslations('auth')
  const tCommon = useTranslations('common')

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const { supabase } = await import('@/lib/supabase/client')
      const { data: { user } } = await supabase.auth.getUser()
      if (!cancelled) {
        setHasSession(!!user)
        setCheckingSession(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    const validationError = validateNewPassword(password, confirmPassword)
    if (validationError === 'tooShort') {
      setError(t('resetPasswordTooShort'))
      return
    }
    if (validationError === 'mismatch') {
      setError(t('resetPasswordMismatch'))
      return
    }

    setLoading(true)
    try {
      const { supabase } = await import('@/lib/supabase/client')
      const { error: updateError } = await supabase.auth.updateUser({ password })
      if (updateError) throw updateError

      await supabase.auth.signOut()
      router.push('/login?resetSuccess=1')
    } catch (err) {
      setError(err instanceof Error ? err.message : t('resetPasswordFailed'))
    } finally {
      setLoading(false)
    }
  }

  if (checkingSession) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-stone-50">
        <div className="text-sm text-zinc-400">{tCommon('loading')}</div>
      </div>
    )
  }

  if (!hasSession) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-stone-50 px-5">
        <div className="max-w-md text-center space-y-4">
          <p className="text-sm text-zinc-600">{t('resetPasswordSessionMissing')}</p>
          <button
            type="button"
            onClick={() => router.push('/login')}
            className="text-sm text-zinc-900 underline underline-offset-2"
          >
            {t('signIn')}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-stone-50 px-5">
      <div className="w-full max-w-md">
        <h2 className="text-2xl font-bold text-zinc-900 tracking-tight">{t('resetPasswordTitle')}</h2>
        <p className="mt-2 text-sm text-zinc-600">{t('resetPasswordDesc')}</p>

        <form onSubmit={handleSubmit} className="mt-7 space-y-5">
          {error && (
            <div className="text-sm bg-rose-50 border border-rose-200 text-rose-700 rounded-xl px-3 py-2.5">
              {error}
            </div>
          )}

          <div>
            <label className="block text-[10px] tracking-[0.2em] text-zinc-500 font-semibold uppercase mb-2">
              {t('newPasswordLabel')}
            </label>
            <div className="relative">
              <input
                id="password"
                name="password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="new-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full px-4 py-3 pr-12 bg-white border border-zinc-300 rounded-xl text-base text-zinc-900 placeholder-zinc-300 focus:outline-none focus:border-zinc-900 focus:ring-2 focus:ring-zinc-900/10 transition"
              />
              <button
                type="button"
                onClick={() => setShowPassword((s) => !s)}
                className="absolute right-0 top-0 bottom-0 px-4 flex items-center text-zinc-400 hover:text-zinc-700 transition-colors"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff className="w-[18px] h-[18px]" /> : <Eye className="w-[18px] h-[18px]" />}
              </button>
            </div>
          </div>

          <div>
            <label className="block text-[10px] tracking-[0.2em] text-zinc-500 font-semibold uppercase mb-2">
              {t('confirmPasswordLabel')}
            </label>
            <input
              id="confirmPassword"
              name="confirmPassword"
              type={showPassword ? 'text' : 'password'}
              autoComplete="new-password"
              required
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full px-4 py-3 bg-white border border-zinc-300 rounded-xl text-base text-zinc-900 placeholder-zinc-300 focus:outline-none focus:border-zinc-900 focus:ring-2 focus:ring-zinc-900/10 transition"
            />
          </div>

          <button
            type="submit"
            disabled={loading || !password || !confirmPassword}
            className="w-full bg-zinc-900 hover:bg-zinc-800 disabled:bg-zinc-300 disabled:cursor-not-allowed text-white font-medium py-3.5 rounded-xl transition-colors"
          >
            {loading ? t('resetPasswordSubmitting') : t('resetPasswordSubmit')}
          </button>
        </form>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: 确认 TypeScript 编译没问题**

Run: `npx tsc --noEmit`
Expected: 没有新增的类型错误

- [ ] **Step 3: Commit**

```bash
git add "src/app/[locale]/reset-password/page.tsx"
git commit -m "$(cat <<'EOF'
feat(auth): 新增 /reset-password 设置新密码页面

裸访问(没有从 /auth/callback 带 session 过来)时提示引导回登录页,
不允许绕过邮件验证直接改密码。

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: 登录页接上真实的"忘记密码"逻辑 + 重置结果提示

**Files:**
- Modify: `src/app/[locale]/login/page.tsx`

- [ ] **Step 1: 加 imports 和新增 state**

第 1–6 行的 import 块改成：

```tsx
'use client'

import { useState, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import { useRouter } from '@/i18n/navigation'
import { useTranslations, useLocale } from 'next-intl'
import { Eye, EyeOff, Zap, ArrowRight, Check } from 'lucide-react'
```

第 27–37 行（组件顶部 state 声明）改成：

```tsx
export default function LoginPage() {
  const [email, setEmail]               = useState('')
  const [password, setPassword]         = useState('')
  const [remember, setRemember]         = useState(false)
  const [error, setError]               = useState('')
  const [notice, setNotice]             = useState('')
  const [loading, setLoading]           = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const router = useRouter()
  const searchParams = useSearchParams()
  const locale = useLocale()
  const t = useTranslations('auth')
  const tNav = useTranslations('nav')
  const time = useClock()
```

- [ ] **Step 2: 读取 `resetError` / `resetSuccess` query 参数**

在现有的"读 localStorage 记住的邮箱"那个 `useEffect`（第 39–45 行）后面新增一个 `useEffect`：

```tsx
  useEffect(() => {
    if (searchParams.get('resetError') === '1') setError(t('resetLinkExpired'))
    if (searchParams.get('resetSuccess') === '1') setNotice(t('resetPasswordSuccess'))
  }, [searchParams, t])
```

- [ ] **Step 3: 新增 `handleForgotPassword`**

在 `emailValid` 定义（原第 69 行 `const emailValid = ...`）后面新增：

```tsx
  const handleForgotPassword = async () => {
    setError('')
    setNotice('')
    if (!emailValid) {
      setError(t('resetEmailRequired'))
      return
    }
    try {
      const { supabase } = await import('@/lib/supabase/client')
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth/callback?next=/${locale}/reset-password`,
      })
      if (resetError) throw resetError
      setNotice(t('resetEmailSent'))
    } catch {
      setError(t('resetEmailFailed'))
    }
  }
```

- [ ] **Step 4: 把"忘记密码"按钮接上新函数，并展示 `notice`**

原第 232–240 行的按钮：

```tsx
                  <button
                    type="button"
                    /* px/py give a finger-sized tap target on mobile without
                       moving the visual baseline */
                    className="-mr-2 px-2 py-1 text-[10px] tracking-[0.15em] text-zinc-400 hover:text-zinc-700 transition-colors uppercase"
                    onClick={() => alert(t('forgotPasswordAlert'))}
                  >
                    {t('forgot')}
                  </button>
```

改成：

```tsx
                  <button
                    type="button"
                    /* px/py give a finger-sized tap target on mobile without
                       moving the visual baseline */
                    className="-mr-2 px-2 py-1 text-[10px] tracking-[0.15em] text-zinc-400 hover:text-zinc-700 transition-colors uppercase"
                    onClick={handleForgotPassword}
                  >
                    {t('forgot')}
                  </button>
```

原第 192–196 行的错误提示条：

```tsx
              {error && (
                <div className="text-sm bg-rose-50 border border-rose-200 text-rose-700 rounded-xl px-3 py-2.5">
                  {error}
                </div>
              )}
```

改成（新增一个绿色的成功提示条）：

```tsx
              {error && (
                <div className="text-sm bg-rose-50 border border-rose-200 text-rose-700 rounded-xl px-3 py-2.5">
                  {error}
                </div>
              )}

              {notice && (
                <div className="text-sm bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-xl px-3 py-2.5">
                  {notice}
                </div>
              )}
```

- [ ] **Step 5: 确认 TypeScript 编译没问题**

Run: `npx tsc --noEmit`
Expected: 没有新增的类型错误

- [ ] **Step 6: Commit**

```bash
git add "src/app/[locale]/login/page.tsx"
git commit -m "$(cat <<'EOF'
feat(auth): 登录页"忘记密码"接上真实的重置邮件发送

替换掉之前只会弹 alert 的占位实现;同时读取 /auth/callback 跳回来的
query 参数展示"链接已失效"或"密码已更新"提示。

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: i18n 文案(zh/en/ja 三份必须同步)

**Files:**
- Modify: `messages/zh.json`
- Modify: `messages/en.json`
- Modify: `messages/ja.json`

**约束**：`npm run test:i18n` 强制三个文件的 key 集合完全一致，少一个都会报错退出——三个文件必须在同一个 task 里一起改完再跑测试，不要分开提交。

- [ ] **Step 1: 改 `messages/zh.json`**

第 311–313 行（`"forgot": "忘记密码？",` 到 `"stepLabel": "登录 · STEP 01 / 01"`）改成：

```json
    "forgot": "忘记密码？",
    "resetEmailRequired": "请先输入邮箱",
    "resetEmailSent": "重置邮件已发送，请查收邮箱",
    "resetEmailFailed": "邮件发送失败，请稍后重试",
    "resetLinkExpired": "链接已失效，请重新发送重置邮件",
    "resetPasswordTitle": "设置新密码",
    "resetPasswordDesc": "请输入你的新密码",
    "newPasswordLabel": "新密码",
    "confirmPasswordLabel": "确认新密码",
    "resetPasswordSubmit": "更新密码",
    "resetPasswordSubmitting": "更新中...",
    "resetPasswordSuccess": "密码已更新，请用新密码重新登录",
    "resetPasswordMismatch": "两次输入的密码不一致",
    "resetPasswordTooShort": "密码至少需要 6 位",
    "resetPasswordSessionMissing": "请先通过邮件里的重置链接进入此页面",
    "resetPasswordFailed": "密码更新失败，请稍后重试",
    "stepLabel": "登录 · STEP 01 / 01"
```

（即删掉原来的 `"forgotPasswordAlert": "请联系管理员重置密码",` 这一行，换成上面 15 个新 key。）

- [ ] **Step 2: 改 `messages/en.json`**

对应第 311–313 行改成：

```json
    "forgot": "Forgot?",
    "resetEmailRequired": "Please enter your email first.",
    "resetEmailSent": "Reset email sent — please check your inbox.",
    "resetEmailFailed": "Failed to send the reset email. Please try again.",
    "resetLinkExpired": "This reset link is no longer valid. Please request a new one.",
    "resetPasswordTitle": "Set a new password",
    "resetPasswordDesc": "Enter your new password below.",
    "newPasswordLabel": "New password",
    "confirmPasswordLabel": "Confirm new password",
    "resetPasswordSubmit": "Update password",
    "resetPasswordSubmitting": "Updating...",
    "resetPasswordSuccess": "Password updated. Please sign in again.",
    "resetPasswordMismatch": "Passwords do not match.",
    "resetPasswordTooShort": "Password must be at least 6 characters.",
    "resetPasswordSessionMissing": "Please open this page from the reset link in your email.",
    "resetPasswordFailed": "Failed to update password. Please try again.",
    "stepLabel": "Sign-in · Step 01 / 01"
```

- [ ] **Step 3: 改 `messages/ja.json`**

对应第 311–313 行改成：

```json
    "forgot": "パスワードをお忘れですか？",
    "resetEmailRequired": "先にメールアドレスを入力してください",
    "resetEmailSent": "パスワードリセットメールを送信しました。ご確認ください",
    "resetEmailFailed": "メールの送信に失敗しました。しばらくしてから再試行してください",
    "resetLinkExpired": "このリンクは無効です。もう一度リセットメールをリクエストしてください",
    "resetPasswordTitle": "新しいパスワードを設定",
    "resetPasswordDesc": "新しいパスワードを入力してください",
    "newPasswordLabel": "新しいパスワード",
    "confirmPasswordLabel": "新しいパスワード（確認）",
    "resetPasswordSubmit": "パスワードを更新",
    "resetPasswordSubmitting": "更新中...",
    "resetPasswordSuccess": "パスワードを更新しました。再度ログインしてください",
    "resetPasswordMismatch": "パスワードが一致しません",
    "resetPasswordTooShort": "パスワードは6文字以上で入力してください",
    "resetPasswordSessionMissing": "メール内のリセットリンクからこのページを開いてください",
    "resetPasswordFailed": "パスワードの更新に失敗しました。しばらくしてから再試行してください",
    "stepLabel": "ログイン · STEP 01 / 01"
```

- [ ] **Step 4: 跑 i18n 校验**

Run: `npm run test:copy`
Expected: 输出 `i18n key parity OK for zh, en, ja`，且 `check-no-bare-han.mjs` 那部分也不报错（这次改动全部走 `t(...)`，JSX 里没有硬编码中文）

- [ ] **Step 5: Commit**

```bash
git add messages/zh.json messages/en.json messages/ja.json
git commit -m "$(cat <<'EOF'
feat(i18n): 补齐忘记密码流程的三语文案

删掉不再使用的 forgotPasswordAlert,新增邮件发送/重置页/结果提示相关
的 15 个 key,zh/en/ja 三份同步。

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: 登记新测试文件 + 全量校验

**Files:**
- Modify: `package.json`

- [ ] **Step 1: 把两个新测试文件加进 `"test"` 脚本**

`package.json` 第 13 行 `"test"` 脚本的字符串末尾（`...src/lib/work-tasks/org-link.test.ts"` 之前的空格后）追加两个新路径，改成：

```json
    "test": "node --test --experimental-strip-types src/lib/supabase/errors.test.ts src/lib/creators/platforms.test.ts src/lib/users/user-code.test.ts src/lib/devices/costs.test.ts src/lib/views/session.test.ts src/lib/activity/activity-events.test.ts src/lib/expenses/category-filter.test.ts src/lib/expenses/costs.test.ts src/lib/intent/events.test.ts src/lib/finance-forecast/calculations.test.ts src/lib/finance-forecast/save-queue.test.ts src/lib/finance-forecast/year.test.ts src/lib/finance-forecast/views.test.ts src/lib/finance-forecast/lifecycle-apply.test.ts src/lib/middleware-assets.test.ts src/lib/middleware-matcher.test.ts src/lib/milestones/next-timeline.test.ts src/lib/discussions/subject.test.ts src/lib/discussions/permissions.test.ts src/lib/currency/server-boundary.test.ts src/lib/notifications/service.test.ts src/venue/layoutData.test.ts src/lib/venue/layout-sync.test.ts src/lib/items/validation.test.ts src/lib/venue/translate.test.ts src/lib/org/tree.test.ts src/lib/work-tasks/org-link.test.ts src/lib/auth/password-validation.test.ts src/lib/auth/reset-redirect.test.ts"
```

- [ ] **Step 2: 跑完整测试套件**

Run: `npm test`
Expected: 全部 PASS，包括新加的 `password-validation.test.ts` 和 `reset-redirect.test.ts`

- [ ] **Step 3: 跑 i18n/文案校验**

Run: `npm run test:copy`
Expected: PASS

- [ ] **Step 4: TypeScript 全量类型检查**

Run: `npx tsc --noEmit`
Expected: 无错误（这一步专门用来堵 `node --test` 不做类型检查这个已知缺口）

- [ ] **Step 5: 生产构建检查**

Run: `npm run build`
Expected: 构建成功，重点确认没有关于 `/auth/callback` 路由或 `useSearchParams`（登录页新增的用法）的构建期报错——项目里 `src/app/[locale]/(app)/expenses/page.tsx` 已经在不包 `Suspense` 的情况下用了 `useSearchParams`，预期这次也一样能过，但必须实际跑一遍构建确认，不能只凭这个先例推断

- [ ] **Step 6: Commit**

```bash
git add package.json
git commit -m "$(cat <<'EOF'
test(auth): 把新增的密码校验/重定向测试登记进 npm test

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 9: 手动端到端验证（无法自动化，必须真人过一遍）

**Files:** 无代码改动。

**前置条件**：这一步之前，你（或项目方）需要已经在 Supabase Dashboard 完成本计划开头列的两项配置（Site URL 改成生产域名、Redirect URLs 加上 `/auth/callback`）。本地开发环境用 `http://localhost:3001`（`package.json` 里 `dev` 脚本跑的端口，不是 3000）对应的 Redirect URL。

- [ ] **Step 1**: 启动开发服务器（`npm run dev`，端口 3001），打开登录页，在邮箱框填一个真实能收信的账号邮箱，点"忘记密码"，确认页面出现绿色的"重置邮件已发送"提示（而不是白屏或报错）。

- [ ] **Step 2**: 去邮箱找到 Supabase 发的重置邮件，点里面的链接，确认浏览器落地在 `/reset-password` 页面（不是报错页、不是跳回登录页）。

- [ ] **Step 3**: 在 `/reset-password` 页面：
  - 先试"两次密码不一致"，确认出现"两次输入的密码不一致"的内联报错，且不会提交。
  - 再试少于 6 位的密码，确认出现"密码至少需要 6 位"的报错。
  - 最后填一个合法的新密码并提交，确认跳回登录页并出现绿色的"密码已更新"提示。

- [ ] **Step 4**: 用刚设置的新密码在登录页登录，确认能正常登录进后台。

- [ ] **Step 5**: 直接访问 `/reset-password`（不通过邮件链接，没有 recovery session）,确认看到"请先通过邮件里的重置链接进入此页面"的提示，而不是能直接改密码。

- [ ] **Step 6**: 用一个已经用过的重置链接再点一次（或者等链接自然过期后再点），确认落回登录页并显示"链接已失效，请重新发送重置邮件"。

这一轮手测通过后，这个功能才算真正闭环——Task 1-8 的自动化测试只覆盖了纯函数逻辑，route handler 和两个页面本身的真实行为只能靠这一步验证。
