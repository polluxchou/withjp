# 内部后台轻量化改版 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 Creator Guild OS 内部后台从「深蓝企业风」换成风格 B(轻盈 SaaS + 点阵纹理),并完成中/英/日三语文案体系。

**Architecture:** 设计 token 先行(Tailwind theme + CSS 工具类)→ 5 个共享组件吃 token 全站生效 → 页面机械清扫 + 文案重写。分两个 PR:PR 1 = token + 组件(可整体回滚),PR 2 = 页面清扫 + 三语文案 + ja locale。

**Tech Stack:** Next.js 14 + Tailwind CSS 3 + next-intl 4。无组件测试设施,验证靠 `npm run test`(lib 单测)、`npm run test:copy`(i18n key 同步 + 裸汉字检查)、`npm run build` 和人工核对。

**Spec:** `docs/superpowers/specs/2026-06-09-internal-backend-restyle-design.md`

---

## 文件地图

| 文件 | 动作 | 职责 |
|------|------|------|
| `tailwind.config.ts` | 改 | 设计 token(色/圆角/阴影) |
| `src/app/globals.css` | 改 | body 底色、`.bg-texture` / `.sidebar-frosted` 工具类 |
| `src/components/ui/Button.tsx` | 改 | indigo→primary token |
| `src/components/ui/Badge.tsx` | 改 | indigo 色值→violet |
| `src/components/ui/Modal.tsx` | 改 | slate→zinc、圆角 token |
| `src/components/layout/Sidebar.tsx` | 改 | 深色→浅色磨砂 |
| `src/components/layout/LanguageSwitcher.tsx` | 改 | 暗色 hover 类→浅色;加 ja 选项(PR 2) |
| `src/components/dashboard/StatsCard.tsx` | 改 | KPI 卡片 token 化 |
| `src/components/ui/PageGreeting.tsx` | 建 | 按时段问候组件 |
| `src/components/ui/EmptyState.tsx` | 建 | 友好空态组件 |
| `src/app/[locale]/(app)/layout.tsx` | 改 | main 加 `.bg-texture` |
| `src/i18n/routing.ts` | 改 | locales 加 `ja`(PR 2) |
| `scripts/check-i18n.mjs` | 改 | locales 加 `ja`(PR 2) |
| `messages/ja.json` | 建 | 日文文案(PR 2) |
| `messages/zh.json` / `messages/en.json` | 改 | greeting/空态 key(PR 1);语气重写(PR 2) |
| 全部 `src/**/*.tsx` 页面/组件 | 改 | indigo-/slate- 清扫(PR 2) |

---

# PR 1:token + 共享组件

分支:`git checkout -b feat/restyle-pr1-tokens`

### Task 1: 设计 Token 层

**Files:**
- Modify: `tailwind.config.ts`
- Modify: `src/app/globals.css`

- [ ] **Step 1: 确认旧 `sidebar` token 无人使用**

Run: `grep -rn "bg-sidebar\|text-sidebar\|border-sidebar" src`
Expected: 无输出(Sidebar.tsx 用的是硬编码 `bg-slate-900`)。若有输出,记下文件,在 Task 4 一并替换。

- [ ] **Step 2: 重写 `tailwind.config.ts`**

```ts
import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        canvas: '#fafafa',
        primary: {
          DEFAULT: '#7c3aed',
          hover: '#6d28d9',
          soft: '#ede9fe',
        },
      },
      borderRadius: {
        card: '12px',
        btn: '8px',
      },
      boxShadow: {
        card: '0 1px 2px rgba(0,0,0,0.03)',
        'card-hover': '0 1px 3px rgba(0,0,0,0.07), 0 4px 10px -6px rgba(0,0,0,0.08)',
      },
    },
  },
  plugins: [],
}

export default config
```

(删除了 `sidebar: '#0f172a'`。)

- [ ] **Step 3: 改 `src/app/globals.css`**

body 一行:`@apply bg-slate-50 text-slate-900 antialiased;` → `@apply bg-canvas text-zinc-900 antialiased;`

`@layer utilities` 里(`.scrollbar-thin` 旁)追加:

```css
/* 风格 B 纹理:顶部主色光晕(不重复) + 极淡点阵网格(平铺)。
   两层 background-image 必须合并在一个类里,拆成两个类会互相覆盖。 */
.bg-texture {
  background-image:
    radial-gradient(ellipse 600px 240px at 50% -60px, rgba(124, 58, 237, 0.12), transparent 70%),
    radial-gradient(#d4d4d8 0.8px, transparent 0.8px);
  background-size: 100% 100%, 14px 14px;
  background-repeat: no-repeat, repeat;
}

.sidebar-frosted {
  background-color: rgba(255, 255, 255, 0.72);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
}
```

- [ ] **Step 4: 验证构建**

Run: `npm run build`
Expected: 编译通过(此时页面仍是旧样子,token 只是可用了)。

- [ ] **Step 5: Commit**

```bash
git add tailwind.config.ts src/app/globals.css
git commit -m "feat(restyle): 设计 token + 纹理工具类"
```

### Task 2: Button / Badge / Modal token 化

**Files:**
- Modify: `src/components/ui/Button.tsx:11-20,34`
- Modify: `src/components/ui/Badge.tsx:7-15`
- Modify: `src/components/ui/Modal.tsx:39-48`

- [ ] **Step 1: Button.tsx 替换 VARIANTS 与圆角**

```ts
const VARIANTS = {
  primary:   'bg-primary hover:bg-primary-hover text-white border-transparent',
  secondary: 'bg-white hover:bg-zinc-50 text-zinc-700 border-zinc-200',
  ghost:     'bg-transparent hover:bg-zinc-100 text-zinc-600 border-transparent',
  danger:    'bg-red-600 hover:bg-red-700 text-white border-transparent',
}
```

className 模板里 `rounded-lg` → `rounded-btn`。

- [ ] **Step 2: Badge.tsx 把 indigo 色值换成 violet(保留 `indigo` key 不破调用方)**

```ts
const COLORS = {
  slate:  'bg-zinc-100 text-zinc-700',
  blue:   'bg-blue-100 text-blue-700',
  green:  'bg-green-100 text-green-700',
  red:    'bg-red-100 text-red-700',
  amber:  'bg-amber-100 text-amber-700',
  purple: 'bg-purple-100 text-purple-700',
  indigo: 'bg-violet-100 text-violet-700',
}
```

(`slate` key 同理保留,值换 zinc。Badge 本来就是 `rounded-full` pill,无需改形状。)

- [ ] **Step 3: Modal.tsx 替换容器与头部类**

- 容器(39 行):`rounded-t-xl sm:rounded-xl` → `rounded-t-card sm:rounded-card`
- 头部分隔线(42 行):`border-slate-100` → `border-zinc-100`;标题 `text-slate-900` → `text-zinc-900`
- 关闭按钮(48 行):`text-slate-400 hover:text-slate-600 hover:bg-slate-100` → `text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100`

- [ ] **Step 4: 验证**

Run: `npm run build`
Expected: 通过。`npm run dev` 后任意页面按钮应已变紫色。

- [ ] **Step 5: Commit**

```bash
git add src/components/ui/Button.tsx src/components/ui/Badge.tsx src/components/ui/Modal.tsx
git commit -m "feat(restyle): Button/Badge/Modal 吃设计 token"
```

### Task 3: Sidebar 浅色磨砂改造

**Files:**
- Modify: `src/components/layout/Sidebar.tsx`
- Modify: `src/components/layout/LanguageSwitcher.tsx`

- [ ] **Step 1: Sidebar.tsx 按下表逐处替换(行号为当前参考,以 grep 实际为准)**

| 位置 | 旧 | 新 |
|------|-----|-----|
| 160 容器 | `bg-slate-900` | `sidebar-frosted border-r border-zinc-200` |
| 175 头部 | `border-b border-slate-800` | `border-b border-zinc-200` |
| 188 汉堡钮 | `text-slate-400 hover:text-white hover:bg-slate-800` | `text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100` |
| 201 折叠钮 | `bg-slate-900 border border-slate-700 text-slate-300 hover:text-white hover:bg-slate-800` | `bg-white border border-zinc-200 text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100` |
| 213 关闭钮 | `text-slate-300 hover:text-white hover:bg-slate-800` | `text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100` |
| 233 激活项 | `bg-indigo-600 text-white` | `bg-primary-soft text-primary font-semibold` |
| 233 非激活 | `text-slate-400 hover:text-white hover:bg-slate-800` | `text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100` |
| 257 底部钮 | `text-slate-300 hover:text-white hover:bg-slate-800` | `text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100` |
| 290 底部线 | `border-t border-slate-800` | `border-t border-zinc-200` |

- [ ] **Step 2: 清掉 Sidebar 内剩余深色残留**

Run: `grep -n "slate-[789]\|text-white\|slate-300\|slate-400" src/components/layout/Sidebar.tsx`
对每条命中按同样的明暗反转规则替换(`text-white`→`text-zinc-900`,Logo 文字同理)。
Expected(替换后再跑): 无输出。

- [ ] **Step 3: LanguageSwitcher.tsx 同样反转**

`text-slate-400 hover:text-white hover:bg-slate-800` → `text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100`;下拉菜单内如有 `bg-slate-800/900` 改 `bg-white border border-zinc-200 shadow-card-hover`,选项文字 `text-slate-300`→`text-zinc-700`。

- [ ] **Step 4: 人工验证**

Run: `npm run dev` 打开 `http://localhost:3001/zh`
Expected: 浅色磨砂侧栏、紫色 soft 选中块;折叠/展开、移动端抽屉(缩窗到 <1024px)都正常、文字可读。

- [ ] **Step 5: Commit**

```bash
git add src/components/layout/Sidebar.tsx src/components/layout/LanguageSwitcher.tsx
git commit -m "feat(restyle): 侧栏深色改浅色磨砂"
```

### Task 4: 纹理上墙 + StatsCard token 化

**Files:**
- Modify: `src/app/[locale]/(app)/layout.tsx:11-13`
- Modify: `src/components/dashboard/StatsCard.tsx`

- [ ] **Step 1: (app) layout 的 `<main>` 加纹理类**

`className="main-content min-h-screen px-4 pb-4 sm:p-6 md:p-8 transition-[margin-left] duration-200"` → 头部追加 `bg-texture `:

```tsx
className="bg-texture main-content min-h-screen px-4 pb-4 sm:p-6 md:p-8 transition-[margin-left] duration-200"
```

- [ ] **Step 2: StatsCard.tsx 全量替换**

```tsx
import { LucideIcon } from 'lucide-react'

interface StatsCardProps {
  label: string
  value: string | number
  icon: LucideIcon
  sub?: string
  accent?: string
}

export default function StatsCard({ label, value, icon: Icon, sub, accent = 'bg-primary-soft text-primary' }: StatsCardProps) {
  return (
    <div className="bg-white rounded-card border border-zinc-200 shadow-card p-4 sm:p-5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[10px] sm:text-xs text-zinc-500 font-medium uppercase tracking-wide truncate">{label}</p>
          <p className="text-xl sm:text-2xl font-bold text-zinc-900 mt-1">{value}</p>
          {sub && <p className="text-[10px] sm:text-xs text-zinc-400 mt-1 truncate">{sub}</p>}
        </div>
        <div className={`w-8 h-8 sm:w-10 sm:h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${accent}`}>
          <Icon className="w-4 h-4 sm:w-5 sm:h-5" />
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: 找 StatsCard 调用方传旧 accent 的地方**

Run: `grep -rn "accent=" src --include="*.tsx"`
把传入值里的 `indigo` 系换成 `bg-primary-soft text-primary` 或留给 PR 2 清扫(命中文件记入 PR 2 清单)。

- [ ] **Step 4: 验证 + Commit**

Run: `npm run dev` → dashboard 应有点阵底纹 + 顶部紫晕 + 新 KPI 卡。

```bash
git add "src/app/[locale]/(app)/layout.tsx" src/components/dashboard/StatsCard.tsx
git commit -m "feat(restyle): 主区纹理 + KPI 卡片 token 化"
```

### Task 5: PageGreeting + EmptyState 新组件

**Files:**
- Create: `src/components/ui/PageGreeting.tsx`
- Create: `src/components/ui/EmptyState.tsx`
- Modify: `messages/zh.json`、`messages/en.json`(加 key)
- Modify: `src/app/[locale]/(app)/page.tsx`(dashboard 顶部接入 PageGreeting)

- [ ] **Step 1: 在 zh.json 顶层加 `greeting` 节,`common` 节加空态 key**

zh.json:
```json
"greeting": {
  "morning": "早上好",
  "afternoon": "下午好",
  "evening": "晚上好"
}
```
`common` 节内追加:
```json
"emptyTitle": "还没有记录",
"emptyHint": "添加第一条吧"
```

en.json 对应:
```json
"greeting": {
  "morning": "Good morning",
  "afternoon": "Good afternoon",
  "evening": "Good evening"
}
```
```json
"emptyTitle": "Nothing here yet",
"emptyHint": "Add the first one!"
```

- [ ] **Step 2: 跑 key 同步检查确认没漏**

Run: `npm run test:copy`
Expected: PASS(两语言 key 对齐)。

- [ ] **Step 3: 写 `src/components/ui/PageGreeting.tsx`**

```tsx
'use client'

import { useTranslations } from 'next-intl'

interface Props {
  name?: string
}

export default function PageGreeting({ name }: Props) {
  const t = useTranslations('greeting')
  const hour = new Date().getHours()
  const key = hour < 11 ? 'morning' : hour < 18 ? 'afternoon' : 'evening'
  return (
    <h1 className="text-xl font-semibold text-zinc-900">
      {t(key)}
      {name ? ` · ${name}` : ''} 👋
    </h1>
  )
}
```

- [ ] **Step 4: 写 `src/components/ui/EmptyState.tsx`**

```tsx
import { ReactNode } from 'react'
import { useTranslations } from 'next-intl'

interface Props {
  emoji?: string
  title?: string
  hint?: string
  action?: ReactNode
}

export default function EmptyState({ emoji = '🗂️', title, hint, action }: Props) {
  const t = useTranslations('common')
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
      <div className="text-4xl">{emoji}</div>
      <p className="text-sm font-medium text-zinc-700">{title ?? t('emptyTitle')}</p>
      <p className="text-xs text-zinc-400">{hint ?? t('emptyHint')}</p>
      {action}
    </div>
  )
}
```

- [ ] **Step 5: dashboard 页顶接入 PageGreeting**

在 `src/app/[locale]/(app)/page.tsx` 找到现有页标题(grep `dashboard` 的 `<h1`),在其上方/替换为 `<PageGreeting />`(名字参数本期不传,主播专区期再接 profile)。原标题如承担其他职责则保留在问候下方一行 `text-xs text-zinc-400`。

- [ ] **Step 6: 验证 + Commit**

Run: `npm run test:copy && npm run build`
Expected: 全部 PASS。

```bash
git add src/components/ui/PageGreeting.tsx src/components/ui/EmptyState.tsx messages/zh.json messages/en.json "src/app/[locale]/(app)/page.tsx"
git commit -m "feat(restyle): 页头问候 + 友好空态组件"
```

### Task 6: PR 1 收尾

- [ ] **Step 1: 全量回归**

Run: `npm run test && npm run test:copy && npm run build`
Expected: 全部 PASS。

- [ ] **Step 2: 人工抽查**

`npm run dev`,zh/en 各看:dashboard、creators、expenses、finance-forecast。确认:无残留深蓝侧栏、按钮紫色、弹窗圆角、移动端(<1024px)抽屉正常。

- [ ] **Step 3: 发 PR**

```bash
git push -u origin feat/restyle-pr1-tokens
gh pr create --title "feat(restyle): 设计 token + 共享组件换肤(风格 B)" --body "$(cat <<'EOF'
PR 1/2 · 设计文档 docs/superpowers/specs/2026-06-09-internal-backend-restyle-design.md

- Tailwind token(violet 主色/圆角/阴影)+ bg-texture/sidebar-frosted 工具类
- Button/Badge/Modal/Sidebar/StatsCard 吃 token,侧栏深蓝→浅色磨砂
- 新增 PageGreeting / EmptyState 组件
- 不动业务逻辑;PR 2 做页面清扫 + 三语文案 + ja locale

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

# PR 2:页面清扫 + 三语文案 + 日文 locale

分支(PR 1 合并后):`git checkout main && git pull && git checkout -b feat/restyle-pr2-i18n-sweep`

### Task 7: 创建 messages/ja.json(全量日文翻译)

**Files:**
- Create: `messages/ja.json`(与 zh.json 同结构,1189 行级别)

- [ ] **Step 1: 以 zh.json 为蓝本逐节翻译成日文**

语气规范(写进每条翻译的判断标准):
- です/ます体 + 适度亲和,不用敬语过剩的ビジネス文
- 行业用语用日本直播业惯例:主播=ライバー,直播=配信,直播间/时段=配信枠,观众=リスナー,打赏=ギフト
- 状态枚举术语表(只是显示文案,枚举值不动):

| 枚举值 | ja | 参考 zh |
|--------|-----|---------|
| prospect | 候補 | 潜在 |
| contacted | 連絡済み | 已联系 |
| engaged | 交渉中 | 洽谈中 |
| onboarded | デビュー準備 | 已签约 |
| live_ready | 配信準備OK | 待开播 |
| live | 配信中 | 直播中 |
| monetized | 収益化中 | 已变现 |
| terminated | 契約終了 | 已终止 |

- 数字播报带温度:趋势 sub 文案类用「順調です」「あと◯回!」风格
- `greeting` 节:morning=おはようございます / afternoon=こんにちは / evening=こんばんは;`common.emptyTitle`=まだ記録がありません / `common.emptyHint`=最初の1件を追加しましょう

- [ ] **Step 2: 结构校验(此时 ja 还没进 check 脚本,先手动)**

Run: `node -e "const z=require('./messages/zh.json'),j=require('./messages/ja.json');const f=(o,p='')=>Object.entries(o).flatMap(([k,v])=>typeof v==='object'?f(v,p+k+'.'):[p+k]);const a=f(z),b=f(j);console.log('missing:',a.filter(k=>!b.includes(k)).length,'extra:',b.filter(k=>!a.includes(k)).length)"`
Expected: `missing: 0 extra: 0`

- [ ] **Step 3: Commit**

```bash
git add messages/ja.json
git commit -m "feat(i18n): 日文文案全量翻译"
```

### Task 8: ja locale 接入

**Files:**
- Modify: `src/i18n/routing.ts:3`
- Modify: `scripts/check-i18n.mjs:5`
- Modify: `src/components/layout/LanguageSwitcher.tsx:8-11`
- Modify: `messages/zh.json` / `en.json` / `ja.json`(`language` 节加 ja key)

- [ ] **Step 1: routing.ts 加 locale**

```ts
export const locales = ['zh', 'en', 'ja'] as const
```
(`src/i18n.ts` 动态 import、`src/middleware.ts` 走 routing,均无需改。)

- [ ] **Step 2: check-i18n.mjs 加 locale**

```js
const locales = ['zh', 'en', 'ja']
```

- [ ] **Step 3: 确认 check-no-bare-han 不会误伤**

Run: `head -40 scripts/check-no-bare-han.mjs`
确认它扫描的是 src 源码而非 messages/。若它会扫 ja.json,把 ja.json 加入其豁免清单(按脚本现有豁免机制)。

- [ ] **Step 4: LanguageSwitcher 加日文选项**

```ts
const languages = [
  { code: 'zh', flag: '🇨🇳' },
  { code: 'en', flag: '🇺🇸' },
  { code: 'ja', flag: '🇯🇵' },
]
```

三个 messages 文件的 `language` 节各加 `"ja": "日本語"`(key 命名跟现有 zh/en key 的模式走,先 `grep -n '"language"' -A5 messages/zh.json` 确认)。

- [ ] **Step 5: 验证**

Run: `npm run test:copy`
Expected: PASS(三语 key 全对齐)。
Run: `npm run dev` 打开 `http://localhost:3001/ja` → 全站日文;切换器三语互切正常。

- [ ] **Step 6: Commit**

```bash
git add src/i18n/routing.ts scripts/check-i18n.mjs src/components/layout/LanguageSwitcher.tsx messages/
git commit -m "feat(i18n): 接入日文 locale"
```

### Task 9: zh/en 文案语气重写

**Files:**
- Modify: `messages/zh.json`、`messages/en.json`(只改 value,不改 key/结构)

- [ ] **Step 1: 按节(nav→common→dashboard→creators→…)重写 zh 文案**

规则:
- 去 ERP 腔:「暂无数据」→「还没有记录,添加第一条吧」;「操作失败」→「出了点小问题,再试一次」;「确认删除?」→「确定要删掉吗?删了就找不回来了」
- 表头/枚举标签保持短(表格空间有限),长文案只用于空态/提示/确认框
- 状态枚举显示文案与 Task 7 术语表的 zh 列对齐

- [ ] **Step 2: en 跟随 zh 语气重写**

casual professional:「No data」→「Nothing here yet — add the first one!」;错误类「Something went wrong — try again.」

- [ ] **Step 3: ja.json 对照复核**

逐节对照新 zh 语气,确保 ja 不再对应旧版直译(Task 7 已按新语气写的可跳过)。

- [ ] **Step 4: 验证 + Commit**

Run: `npm run test:copy && npm run test`
Expected: 全部 PASS(value 改动不影响 key 校验;`src/lib` 单测确认无文案被代码断言依赖——若有失败,同步更新对应测试期望值)。

```bash
git add messages/
git commit -m "feat(copy): 三语文案语气自然化重写"
```

### Task 10: 页面清扫(indigo-/slate- 清零)

**Files:**
- Modify: 全部命中的 `src/**/*.tsx`(基线约 41 个文件 200 处 indigo;slate 量更大)

- [ ] **Step 1: 生成清单**

Run: `grep -rln 'indigo-\|slate-' src --include='*.tsx' | sort > /tmp/sweep-list.txt && wc -l /tmp/sweep-list.txt`

- [ ] **Step 2: 按映射表逐文件替换(每 5-8 个文件一个 commit)**

| 旧 | 新 |
|-----|-----|
| `bg-indigo-600` | `bg-primary` |
| `hover:bg-indigo-700` | `hover:bg-primary-hover` |
| `text-indigo-600` / `-700` | `text-primary` |
| `bg-indigo-50` / `-100` | `bg-primary-soft` |
| `ring-indigo-500` / `border-indigo-*` / 其余 `indigo-N` | 同号 `violet-N` |
| `slate-N`(全部) | 同号 `zinc-N` |
| 卡片容器 `rounded-xl border border-slate-200`(清扫时顺手) | `rounded-card border-zinc-200 shadow-card` |
| 表格全包边框(`border` 包行) | 行间 `divide-y divide-zinc-100`,外框保留容器圆角 |

机械部分可用 sed 起步(逐文件、改后过目 diff):
`sed -i '' -e 's/slate-/zinc-/g' <file>`
indigo 映射有语义分支(600/700→primary,50/100→soft,其余→violet),逐处确认后替换。

- [ ] **Step 3: 清零验收**

Run: `grep -rn 'indigo-\|slate-' src --include='*.tsx' | wc -l`
Expected: `0`
Run: `grep -rn 'slate' src/app/globals.css`
Expected: 仅剩 scrollbar 十六进制色(`#cbd5e1` 改为 `#d4d4d8` 顺手统一)。

- [ ] **Step 4: 验证 + 收尾 Commit**

Run: `npm run build && npm run test`
Expected: PASS。

```bash
git add -A src
git commit -m "feat(restyle): 页面硬编码色清扫(indigo/slate 清零)"
```

### Task 11: Recharts 图表色板

**Files:**
- Modify: 命中的图表组件(dashboard / finance-forecast / expenses 内)

- [ ] **Step 1: 找硬编码 hex**

Run: `grep -rn '#4f46e5\|#6366f1\|#818cf8\|#a5b4fc\|#64748b\|#94a3b8' src --include='*.tsx'`

- [ ] **Step 2: 按映射替换**

| 旧 hex (indigo/slate) | 新 hex (violet/zinc) |
|-----|-----|
| `#4f46e5` | `#7c3aed` |
| `#6366f1` | `#8b5cf6` |
| `#818cf8` | `#a78bfa` |
| `#a5b4fc` | `#c4b5fd` |
| `#64748b` | `#71717a` |
| `#94a3b8` | `#a1a1aa` |

- [ ] **Step 3: 验证 + Commit**

`npm run dev` 看 dashboard 与 finance-forecast 图表配色统一为 violet 族。

```bash
git add -A src
git commit -m "feat(restyle): 图表色板切换 violet 族"
```

### Task 12: PR 2 收尾

- [ ] **Step 1: 全量回归**

Run: `npm run test && npm run test:copy && npm run build`
Expected: 全部 PASS。

- [ ] **Step 2: 人工核对清单(三语)**

`npm run dev`,按 `/zh` `/en` `/ja` 各过:dashboard、creators、expenses、finance-forecast;其余模块(pipeline/timeline/tasks/workspace/team/knowledge/config/notifications/discussions/users/admin 等)至少 zh 全过一遍。核对:无 indigo/slate 残留视觉、空态文案友好、日文无乱码/溢出(日文通常比中文长 2-4 成,注意按钮和表头截断)。

- [ ] **Step 3: 日语母语者抽查(spec 风险项)**

把 `messages/ja.json` 的 nav/common/dashboard/creators 四节导给日语母语同事抽查,修正回填。此步可与 PR review 并行,不阻塞发 PR,但合并前要完成。

- [ ] **Step 4: 发 PR**

```bash
git push -u origin feat/restyle-pr2-i18n-sweep
gh pr create --title "feat(restyle): 页面清扫 + 三语文案 + 日文 locale" --body "$(cat <<'EOF'
PR 2/2 · 设计文档 docs/superpowers/specs/2026-06-09-internal-backend-restyle-design.md

- messages/ja.json 全量日文翻译 + ja locale 接入(routing/check-i18n/切换器)
- zh/en 文案语气自然化重写
- 全站 indigo-/slate- 硬编码清零(grep 验收) + Recharts 色板切 violet
- 验证:test/test:copy/build 全过,三语人工核对完成

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Self-Review 记录

- **Spec 覆盖**:3.1 token→Task 1;3.2 纹理→Task 1/4;3.3 视觉变化 1-6→Task 3(侧栏)/10(表格)/4(KPI)/5(问候+空态)/2(主色);4.2 组件→Task 2/3/4/5;4.3 清扫+图表→Task 10/11;5.1 ja 接入→Task 8;5.2 语气→Task 7/9;5.3 枚举口语化→Task 7 术语表 + Task 9;6.1 两 PR→分支结构;6.2 验证→Task 6/12;风险(日语母语抽查、grep 清零)→Task 12 Step 3 / Task 10 Step 3。无缺口。
- **占位符扫描**:无 TBD/TODO;翻译类任务给了规则+术语表+校验命令而非全文,属工作本体而非占位。
- **类型一致性**:PageGreeting/EmptyState 的 props 与调用处一致;Badge/Button 对外 API 未变,调用方零改动。
