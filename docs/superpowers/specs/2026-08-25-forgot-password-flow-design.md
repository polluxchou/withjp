# 忘记密码自助找回流程 — 设计

- 日期：2026-08-25
- 状态：已实现（含实现期间发现并修复的安全缺口，见文末「实现偏差」）
- 关联：内部管理后台（newWith），Next.js + Supabase Auth

## 背景

内部后台目前只有 `signInWithPassword` 登录，没有任何密码重置能力：

- 登录页（[src/app/[locale]/login/page.tsx](../../../src/app/%5Blocale%5D/login/page.tsx)）的"忘记密码"链接只弹一个 `alert`，文案是"请联系管理员重置密码"。
- 仓库里没有 `/auth/callback` 之类的路由，没有任何代码调用 `resetPasswordForEmail` 或处理 recovery/magic link 的 token。
- Supabase 项目的 Auth Site URL 目前配的是 `localhost:3000`，导致从 Dashboard 手动发的重置邮件点开后跳到本地开发地址并报 `otp_expired`。

即使把 Site URL 改成生产域名，代码侧依然没有地方接住 token、没有设置新密码的页面，流程还是走不通。这份设计补齐这条自助找回链路。

## 范围

只做"忘记密码"自助找回（未登录状态）。**不包含**已登录用户在个人资料页主动改密码的入口——那是另一个独立功能，不在这次范围内。

## 方案选择

| 方案 | 说明 | 取舍 |
|---|---|---|
| **服务端 code 交换（采用）** | 新增 `/auth/callback` 路由，用项目已有的 `@supabase/ssr` 模式做 `exchangeCodeForSession`，和 [src/lib/supabase/middleware.ts](../../../src/lib/supabase/middleware.ts) 现有的 SSR session 机制保持一致 | 和现有架构一致，是 Supabase 官方给 Next.js SSR 项目的标准做法 |
| 纯客户端 hash token 处理 | 不建服务端路由，页面直接解析 URL fragment 里的 `access_token` 建 session | 实现更简单，但绕开项目现有的 cookie session 模式，容易和 middleware 的登录态判断冲突，更脆弱 |
| 维持现状 | 不做自助流程，只修 Site URL，继续走"联系管理员在 Dashboard 手动改密码" | 最省事，但没解决自助找回的诉求 |

采用服务端 code 交换方案。

## 架构与数据流

```
登录页「忘记密码」
  → 用户在邮箱输入框填好邮箱，点击链接
  → 客户端调用 supabase.auth.resetPasswordForEmail(email, { redirectTo: `${origin}/auth/callback?next=/reset-password` })
  → 用户收到邮件，点击其中的重置链接
  → Supabase 校验后跳转到 /auth/callback?code=xxx&next=/reset-password
  → 服务端路由用 @supabase/ssr 的 exchangeCodeForSession(code) 换取临时 session（写入 cookie）
  → 302 跳转到 /reset-password
  → 用户在 /reset-password 页面输入两次新密码
  → 客户端调用 supabase.auth.updateUser({ password })（此时靠临时 session 认证）
  → 成功后 supabase.auth.signOut()，跳转回 /login 并带成功提示
```

## 新增/修改文件

- **`src/app/auth/callback/route.ts`**（新增，不带 `[locale]` 前缀）
  - GET handler，读取 query 里的 `code` 和 `next`
  - 用服务端 supabase client 调 `exchangeCodeForSession(code)`
  - 成功：302 跳转到 `next`（默认 `/reset-password`，需要做 open-redirect 防护，只允许站内相对路径）
  - 失败（code 缺失/交换报错，包括 `otp_expired` 这类过期场景）：302 跳转到 `/login`，带上一个错误 query 参数，登录页据此弹出"链接已失效，请重新发送"的提示

- **`src/app/[locale]/reset-password/page.tsx`**（新增，客户端组件）
  - 两个密码输入框（新密码 / 确认新密码）
  - 前端校验：两次一致、非空、长度符合 Supabase 默认最小长度（6 位）
  - 提交时调用 `supabase.auth.updateUser({ password })`
  - 成功：提示"密码已更新"，`signOut()` 后跳转 `/login`
  - 失败（比如 session 已过期，用户在这个页面停留太久）：内联报错，提示重新发起找回流程
  - 未携带有效 session 直接访问这个页面时：提示"请先通过邮件里的重置链接进入此页面"，不允许裸改密码

- **修改 [src/app/[locale]/login/page.tsx](../../../src/app/%5Blocale%5D/login/page.tsx)**（约第 237 行附近）
  - 把"忘记密码"的 `onClick={() => alert(...)}` 换成真正调用：读取页面上邮箱输入框当前值，为空则内联报错"请先输入邮箱"；非空则调用 `resetPasswordForEmail`，成功后提示"重置邮件已发送，请查收"
  - 移除 `messages/*.json` 里不再使用的 `forgotPasswordAlert` 文案键，新增"邮件已发送"/"请先输入邮箱"对应文案（沿用现有 locale 结构，zh/en/ja 都要补）

## 错误处理

- 重置链接过期/无效（`otp_expired` 等）→ 回调路由统一跳回登录页并带错误提示，提示用户重新发送
- open-redirect 防护：`/auth/callback` 的 `next` 参数只接受以 `/` 开头的相对路径，不是则忽略并默认跳 `/reset-password`
- `/reset-password` 页面裸访问（没有从回调路由带 session 过来）→ 提示引导回登录页重新发起

## 不在这次范围内的配置改动

Supabase Dashboard → Authentication → URL Configuration（这部分是项目方在 Dashboard 手动配置，不在代码仓库里，本次不代为操作）：

- Site URL 改成 `https://mcn.agenova.chat`
- Redirect URLs 加入 `https://mcn.agenova.chat/auth/callback`（本地开发保留 `http://localhost:3000/**`）

这两步需要项目方自行在 Supabase Dashboard 完成，代码侧的改动即使全部实现，配置不改的话邮件链接依然会跳去 localhost。

## 测试计划

- 单测：`/auth/callback` 路由对 code 交换成功/失败两种情况的跳转行为（mock supabase server client）
- 单测：`/reset-password` 页面表单校验（两次密码不一致、长度不足时不允许提交）
- 手动验证（配置改好后）：完整走一遍"忘记密码 → 收邮件 → 点链接 → 设新密码 → 用新密码登录"全链路

## 实现偏差：recovery-proof 机制（原设计没有，落地时补的安全修复）

原设计（上面的架构与数据流）里，`/reset-password` 判断"能不能改密码"只看`supabase.auth.getUser()` 是否返回一个 session。实现完、走完整分支复审后发现这条判断有个真实缺口：**它没有区分"这个 session 是不是通过邮件重置链接建立的"**。只要用户当前有任何有效 session（包括后台平时登录用的 session、或者在共享设备上被劫持的 session），都能不提供旧密码、不走邮件验证，直接访问 `/reset-password` 改掉密码——相当于把"临时拿到一个会话"升级成了"永久改密码锁死原账号"，而这正是「范围」一节明确排除在外的"已登录改密码"功能，被意外做成了一个没有任何入口 UI、没有防护的暗门。

**为什么不能直接用 Supabase 官方的 `PASSWORD_RECOVERY` 事件或 JWT `amr` 字段**：逐行读了 `@supabase/auth-js` 源码后确认，这两种官方推荐的检测方式都要求浏览器端 `auth-js` 客户端自己解析出 URL 里的 `type=recovery` 标记（老式的隐式授权/hash fragment 流程）。本项目走的是**服务端** `exchangeCodeForSession`（`/auth/callback` route handler 里做，写 cookie），浏览器端客户端在 `/reset-password` 页面加载时只是从 cookie 发现"已经有个 session"，并不会经历"解析 recovery URL"这一步，所以这两个官方信号在这套架构下都不会触发。

**实际采用的修复**：`/auth/callback` 在 `exchangeCodeForSession` 成功、且确认跳转目标就是 `/reset-password` 页面时（`isResetPasswordPath`，避免 token 跟着任意同站 `next` 泄露到无关页面），签发一个 2 分钟有效期、HMAC-SHA256 签名的一次性 "recovery proof" token（`src/lib/auth/recovery-proof.ts`，密钥复用了项目里已有的 `SUPABASE_SERVICE_ROLE_KEY`），附在跳转 URL 的 `?proof=` 参数上；新增一个无状态校验接口 `src/app/api/auth/verify-recovery-proof/route.ts`；`/reset-password` 页面必须同时满足"session 有效"和"`proof` 校验通过"两个条件才放行改密码表单，否则一律按"没有有效重置会话"处理。

**涉及文件**（原「新增/修改文件」清单之外新增的）：
- `src/lib/auth/recovery-proof.ts` + `recovery-proof.test.ts`（HMAC 签发/校验纯函数）
- `src/app/api/auth/verify-recovery-proof/route.ts`（无状态校验 endpoint）
- `src/lib/auth/reset-redirect.ts` 新增 `isResetPasswordPath`（判断跳转目标是否确实是 reset-password 页，决定要不要挂 `proof`）
- `src/app/auth/callback/route.ts`、`src/app/[locale]/reset-password/page.tsx` 相应改动

**这段对「不在这次范围内的配置改动」一节没有影响**：`proof` 参数挂在项目自己签发的内部跳转 URL 上，不经过 Supabase 的 Redirect URL 校验，不需要在 Supabase Dashboard 额外配置。
