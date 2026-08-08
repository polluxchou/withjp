# 界面风格提升 · PR1 样板间 — 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 落地新设计语言的地基（CSS 变量 token + 防漂移门禁 + 组件库 v1 + 全站换底换侧栏），并把支出管理页完整迁移为样板间。

**Architecture:** token 全部落 `globals.css` CSS 变量、tailwind 只做映射；新组件集中 `src/components/ui/`；图表常量收口 `src/lib/chart-theme.ts`；`check-style-tokens.mjs` 以 baseline 机制防漂移。全局件（底色/Sidebar/Button 皮肤）合并即全站生效，页面级重排只做支出管理一页。

**Tech Stack:** Next.js 14 + Tailwind 3.4 + lucide-react + recharts；测试用 `node --test --experimental-strip-types`（仅纯函数，本仓库无 React 组件测试设施，UI 以浏览器走查验证）。

**分期总览（本文件只覆盖第 1 期）：**
| 期 | 内容 | 计划文件 |
|---|---|---|
| PR1 | 样板间（本计划，14 个任务） | 本文件 |
| PR2 | 高频六页迁移 + CommandBar 换皮 | PR1 合并后另写 |
| PR3 | 孤岛消除 + 图表统一 | PR2 合并后另写 |
| PR4 | 细节清扫 + 门禁转硬 | PR3 合并后另写 |

**权威文档**：设计取值一律以 `docs/design-system.md` 为准；本计划中的具体数值若与其冲突，以 design-system.md 为准并回改本计划。

**两个刻意的全站副作用（不是 bug）**：① Tailwind `fontSize.sm` 从 14px 收到 13px，旧页面正文统一微缩 1px（新排版阶梯的一部分）；② Button primary 变渐变药丸后全站按钮同步换皮。两者都在 Task 14 走查中确认无布局破坏。

---

## Task 0: 工作区与分支

**Files:** 无代码变更

- [ ] **Step 1: 建独立 worktree（共享工作区禁令，见记忆/spec §8）**

```bash
cd /Users/fengzhou/Code/newWith
git fetch origin
git worktree add .claude/worktrees/ui-uplift-pr1 -b feat/ui-uplift-pr1-pilot origin/main
cd .claude/worktrees/ui-uplift-pr1
npm install
```

- [ ] **Step 2: 把两份设计文档拷入 worktree 并作为首个提交**

```bash
cp ../../docs/design-system.md docs/design-system.md 2>/dev/null || cp /Users/fengzhou/Code/newWith/docs/design-system.md docs/design-system.md
cp /Users/fengzhou/Code/newWith/docs/superpowers/specs/2026-08-08-ui-style-uplift-design.md docs/superpowers/specs/
cp /Users/fengzhou/Code/newWith/docs/superpowers/plans/2026-08-08-ui-uplift-pr1-pilot.md docs/superpowers/plans/
git add docs && git commit -m "docs(design): 设计系统权威文档 + 风格提升 spec + PR1 计划"
```

- [ ] **Step 3: 基线验证**：`npm test && npm run test:copy` 全绿后再动手。

---

## Task 1: Token 层（CSS 变量 + Tailwind 映射 + 氛围底）

**Files:**
- Modify: `src/app/globals.css`
- Modify: `tailwind.config.ts`

- [ ] **Step 1: globals.css 的 `:root` 增加变量组，并新增 `bg-atmosphere` 工具类**

在 `@layer base` 的 `:root` 中（现有 `--sidebar-width` 旁）加入：

```css
:root {
  --sidebar-width: 240px;

  /* ink（文字，RGB 三元组，供 alpha 修饰符） */
  --ink-900: 33 28 51;
  --ink-700: 61 54 84;
  --ink-500: 111 104 132;
  --ink-400: 141 135 161;

  /* 发丝线（带固定透明度，直接用） */
  --line-soft: rgba(33, 28, 51, 0.05);
  --line: rgba(33, 28, 51, 0.07);
  --line-strong: rgba(33, 28, 51, 0.09);

  --surface: #ffffff;
  --canvas: #faf9fc;

  /* violet 档位 */
  --primary: 124 58 237;
  --primary-hover: 109 40 217;
  --primary-soft: rgba(124, 58, 237, 0.10);
  --primary-soft-hover: rgba(124, 58, 237, 0.14);
  --primary-border: rgba(124, 58, 237, 0.35);

  /* 语义色三件套 × 6 tone（值见 design-system.md §1.3） */
  --success-text: #067647; --success-soft: rgba(16,185,129,.09); --success-dot: #10b981;
  --warning-text: #b45309; --warning-soft: rgba(245,158,11,.11); --warning-dot: #f59e0b;
  --danger-text:  #dc2626; --danger-soft:  rgba(239,68,68,.09);  --danger-dot:  #ef4444;
  --info-text:    #1d4ed8; --info-soft:    rgba(59,130,246,.09); --info-dot:    #3b82f6;
}
```

`@layer utilities` 中新增（`bg-texture` 暂留，PR3 删）：

```css
.bg-atmosphere {
  background-color: var(--canvas);
  background-image:
    radial-gradient(ellipse 900px 480px at 8% -10%, rgba(139, 92, 246, 0.10), transparent 60%),
    radial-gradient(ellipse 800px 420px at 100% 0%, rgba(236, 72, 153, 0.05), transparent 55%),
    radial-gradient(ellipse 900px 500px at 90% 110%, rgba(139, 92, 246, 0.07), transparent 60%);
  background-repeat: no-repeat;
  background-attachment: fixed;
}
```

同时把 `body` 的 `@apply bg-canvas text-zinc-900` 改为 `@apply bg-canvas text-ink-900`。

- [ ] **Step 2: tailwind.config.ts 全量替换 theme.extend**

```ts
theme: {
  extend: {
    colors: {
      canvas: 'var(--canvas)',
      surface: 'var(--surface)',
      ink: {
        900: 'rgb(var(--ink-900) / <alpha-value>)',
        700: 'rgb(var(--ink-700) / <alpha-value>)',
        500: 'rgb(var(--ink-500) / <alpha-value>)',
        400: 'rgb(var(--ink-400) / <alpha-value>)',
      },
      line: { soft: 'var(--line-soft)', DEFAULT: 'var(--line)', strong: 'var(--line-strong)' },
      primary: {
        DEFAULT: 'rgb(var(--primary) / <alpha-value>)',
        hover: 'rgb(var(--primary-hover) / <alpha-value>)',
        soft: 'var(--primary-soft)',
        'soft-hover': 'var(--primary-soft-hover)',
        border: 'var(--primary-border)',
        ring: 'rgb(var(--primary) / <alpha-value>)',
      },
      success: { text: 'var(--success-text)', soft: 'var(--success-soft)', dot: 'var(--success-dot)' },
      warning: { text: 'var(--warning-text)', soft: 'var(--warning-soft)', dot: 'var(--warning-dot)' },
      danger:  { text: 'var(--danger-text)',  soft: 'var(--danger-soft)',  dot: 'var(--danger-dot)' },
      info:    { text: 'var(--info-text)',    soft: 'var(--info-soft)',    dot: 'var(--info-dot)' },
    },
    fontSize: {
      micro: ['11px', '14px'], xs: ['12px', '16px'], sm: ['13px', '18px'],
      md: ['14px', '20px'], lg: ['15px', '22px'], xl: ['20px', '26px'], '2xl': ['24px', '30px'],
    },
    borderRadius: { card: '14px', field: '10px', chip: '7px', btn: '999px' },
    boxShadow: {
      card: '0 1px 3px rgba(33,28,51,0.05), 0 8px 24px -12px rgba(124,58,237,0.08)',
      pop: '0 4px 12px rgba(33,28,51,0.08), 0 16px 40px -12px rgba(33,28,51,0.18)',
      'card-hover': '0 1px 3px rgba(33,28,51,0.07), 0 4px 10px -6px rgba(33,28,51,0.10)',
    },
    backgroundImage: {
      'primary-gradient': 'linear-gradient(135deg, #7c3aed 0%, #9333ea 60%, #a855f7 100%)',
    },
  },
},
```

注意：旧类名 `bg-canvas`/`rounded-card`/`shadow-card`/`bg-primary-soft` 全部保号换值，旧页面自动继承新值。

- [ ] **Step 3: 构建验证**：`npm run build` 通过；`npm run dev` 起服务，浏览器抽查仪表盘/任务/支出三页——预期整体只发生「底色微紫、卡片圆角略大、正文微缩」级别的变化，无布局破坏。

- [ ] **Step 4: Commit** `git add -A && git commit -m "feat(ui): token 体系落 CSS 变量（mauve 灰阶/violet 档位/语义色/新阶梯）+ bg-atmosphere"`

---

## Task 2: 防漂移门禁 check-style-tokens

**Files:**
- Create: `scripts/check-style-tokens.mjs`
- Create: `scripts/style-tokens-baseline.json`（脚本生成）
- Modify: `package.json`（test:copy 链）

- [ ] **Step 1: 写脚本**

```js
// scripts/check-style-tokens.mjs
// 禁用样式扫描：slate-* / indigo-* / zinc-* / 裸 hex。
// 基线机制：--update-baseline 记录存量违规（文件 × 计数），常规运行时
// 任何文件的违规数超过基线即失败；低于基线则提示可收紧。
// 白名单：图表主题与 token 定义处允许 hex。
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const ROOT = new URL('..', import.meta.url).pathname
const SRC = join(ROOT, 'src')
const BASELINE = join(ROOT, 'scripts/style-tokens-baseline.json')
const WHITELIST = ['src/lib/chart-theme.ts', 'src/app/globals.css']
const PATTERNS = [
  { name: 'slate', re: /\bslate-\d{2,3}\b/g },
  { name: 'indigo', re: /\bindigo-\d{2,3}\b/g },
  { name: 'zinc', re: /\bzinc-\d{2,3}\b/g },
  { name: 'hex', re: /#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b/g },
]

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) yield* walk(p)
    else if (/\.(tsx?|css)$/.test(name)) yield p
  }
}

const counts = {}
for (const file of walk(SRC)) {
  const rel = relative(ROOT, file)
  if (WHITELIST.includes(rel)) continue
  const text = readFileSync(file, 'utf8')
  let n = 0
  for (const { re } of PATTERNS) n += (text.match(re) ?? []).length
  if (n > 0) counts[rel] = n
}

if (process.argv.includes('--update-baseline')) {
  writeFileSync(BASELINE, JSON.stringify(counts, null, 2) + '\n')
  console.log(`baseline updated: ${Object.keys(counts).length} files, ${Object.values(counts).reduce((a, b) => a + b, 0)} violations`)
  process.exit(0)
}

let baseline = {}
try { baseline = JSON.parse(readFileSync(BASELINE, 'utf8')) } catch { /* 无基线 = 零容忍 */ }

const errors = []
for (const [file, n] of Object.entries(counts)) {
  const allowed = baseline[file] ?? 0
  if (n > allowed) errors.push(`${file}: ${n} 处禁用样式（基线 ${allowed}）`)
}
if (errors.length) {
  console.error('check-style-tokens 失败：新增了 slate/indigo/zinc/裸 hex —— 请改用 design-system.md 的 token\n' + errors.join('\n'))
  process.exit(1)
}
console.log('check-style-tokens ok')
```

- [ ] **Step 2: 生成基线并挂进 test:copy**

```bash
node scripts/check-style-tokens.mjs --update-baseline
```

package.json：`"test:style": "node scripts/check-style-tokens.mjs"`，并把 `test:copy` 改为 `npm run test:i18n && npm run test:no-bare-han && npm run test:style`。

- [ ] **Step 3: 验证双向**：`npm run test:copy` 绿；随便往某 tsx 加一个 `text-slate-500` 再跑，预期 exit 1 且报出该文件，然后撤销改动。

- [ ] **Step 4: Commit** `git commit -am "chore(ui): check-style-tokens 门禁（baseline 机制）挂入 test:copy"`

---

## Task 3: 图表主题 chart-theme.ts（TDD）

**Files:**
- Create: `src/lib/chart-theme.ts`
- Create: `src/lib/chart-theme.test.ts`（加入 package.json test 列表）

- [ ] **Step 1: 写失败测试**

```ts
// src/lib/chart-theme.test.ts
import { test } from 'node:test'
import assert from 'node:assert'
import { CHART_SERIES, seriesColor, AXIS, GRID, TOOLTIP_STYLE } from './chart-theme.ts'

test('系列色首位与 UI 主色同值且无重复', () => {
  assert.equal(CHART_SERIES[0], '#7c3aed')
  assert.equal(new Set(CHART_SERIES).size, CHART_SERIES.length)
})
test('seriesColor 越界循环取色', () => {
  assert.equal(seriesColor(0), CHART_SERIES[0])
  assert.equal(seriesColor(CHART_SERIES.length), CHART_SERIES[0])
})
test('轴/网格用 mauve 灰阶，不再是 slate/zinc', () => {
  assert.equal(AXIS.tick.fill, '#8d87a1')
  assert.match(GRID.stroke, /rgba\(33, ?28, ?51/)
  assert.equal(TOOLTIP_STYLE.border, '1px solid rgba(33,28,51,0.07)')
})
```

- [ ] **Step 2: 跑测试确认失败**：`node --test --experimental-strip-types src/lib/chart-theme.test.ts` → 模块不存在，FAIL。

- [ ] **Step 3: 实现**

```ts
// src/lib/chart-theme.ts — 全站 recharts 唯一取色处（design-system.md §1.5）
export const CHART_SERIES = ['#7c3aed', '#3b82f6', '#10b981', '#f59e0b', '#ec4899', '#8d87a1'] as const
export const seriesColor = (i: number): string => CHART_SERIES[i % CHART_SERIES.length]
export const AXIS = { tick: { fill: '#8d87a1', fontSize: 11 }, axisLine: false, tickLine: false } as const
export const GRID = { stroke: 'rgba(33,28,51,0.05)', strokeDasharray: '0' } as const
export const TOOLTIP_STYLE = {
  background: '#ffffff',
  border: '1px solid rgba(33,28,51,0.07)',
  borderRadius: '10px',
  boxShadow: '0 4px 12px rgba(33,28,51,0.08), 0 16px 40px -12px rgba(33,28,51,0.18)',
  fontSize: '12px', color: '#211c33',
} as const
export const AREA_FILL = { id: 'chartAreaFill', from: 'rgba(124,58,237,0.14)', to: 'rgba(124,58,237,0)' } as const
```

- [ ] **Step 4: 测试转绿**，把测试文件加进 package.json 的 `test` 列表。
- [ ] **Step 5: Commit** `git commit -am "feat(ui): chart-theme 统一图表色板与轴/网格/tooltip 常量"`

---

## Task 4: 状态→tone 映射 lib（TDD）

**Files:**
- Create: `src/lib/ui/status-tone.ts`
- Create: `src/lib/ui/status-tone.test.ts`（加入 test 列表）

- [ ] **Step 1: 失败测试**

```ts
import { test } from 'node:test'
import assert from 'node:assert'
import { toneOf } from './status-tone.ts'

test('creator 生命周期映射与 design-system §1.3 一致', () => {
  assert.equal(toneOf('creator', 'prospect'), 'neutral')
  assert.equal(toneOf('creator', 'live'), 'success')
  assert.equal(toneOf('creator', 'churned'), 'danger')
})
test('expense/task/milestone/item 域覆盖', () => {
  assert.equal(toneOf('expense', 'paid'), 'success')
  assert.equal(toneOf('task', 'pending'), 'warning')
  assert.equal(toneOf('milestone', 'at_risk'), 'warning')
  assert.equal(toneOf('item', 'in_use'), 'success')
})
test('未登记枚举回退 neutral（不抛错）', () => {
  assert.equal(toneOf('creator', 'unknown-status'), 'neutral')
})
```

- [ ] **Step 2: 确认 FAIL** → **Step 3: 实现**

```ts
// src/lib/ui/status-tone.ts — 状态枚举→Tag tone 唯一登记处（design-system.md §1.3）
export type Tone = 'success' | 'warning' | 'danger' | 'info' | 'neutral' | 'violet'
type Domain = 'creator' | 'task' | 'expense' | 'milestone' | 'item'

const MAP: Record<Domain, Record<string, Tone>> = {
  creator: {
    prospect: 'neutral', contacted: 'info', engaged: 'info', onboarded: 'violet',
    preparing: 'warning', live: 'success', monetized: 'success', churned: 'danger',
  },
  task: { pending: 'warning', running: 'info', done: 'success', failed: 'danger' },
  expense: { paid: 'success', pending: 'warning', budget: 'info' },
  milestone: { planned: 'neutral', in_progress: 'info', at_risk: 'warning', done: 'success', overdue: 'danger' },
  item: { in_use: 'success', idle: 'neutral', repairing: 'warning', scrapped: 'danger' },
}

export function toneOf(domain: Domain, status: string): Tone {
  return MAP[domain]?.[status] ?? 'neutral'
}
```

实现前先核对真实枚举值：`grep -n "status" src/lib/types.ts src/lib/state-machine/creator-lifecycle.ts`，以代码里的枚举字符串为准调整 key（测试同步改），**不得改枚举值本身**。

- [ ] **Step 4: 转绿 + 加入 test 列表** → **Step 5: Commit** `git commit -am "feat(ui): status-tone 状态→语义色唯一映射"`

---

## Task 5: 展示组件 — Tag / Stat / StatBand / SectionCard / ProgressBar

**Files:**
- Create: `src/components/ui/Tag.tsx`, `src/components/ui/Stat.tsx`, `src/components/ui/SectionCard.tsx`, `src/components/ui/ProgressBar.tsx`

- [ ] **Step 1: Tag**

```tsx
import type { Tone } from '@/lib/ui/status-tone'

interface TagProps { label: string; tone?: Tone; variant?: 'soft' | 'dot'; size?: 'sm' | 'md' }

const SOFT: Record<Tone, string> = {
  success: 'bg-success-soft text-success-text', warning: 'bg-warning-soft text-warning-text',
  danger: 'bg-danger-soft text-danger-text',    info: 'bg-info-soft text-info-text',
  neutral: 'bg-line-soft text-ink-700',         violet: 'bg-primary-soft text-primary-hover',
}
const DOT: Record<Tone, string> = {
  success: 'bg-success-dot', warning: 'bg-warning-dot', danger: 'bg-danger-dot',
  info: 'bg-info-dot', neutral: 'bg-ink-400', violet: 'bg-primary',
}
const TEXT: Record<Tone, string> = {
  success: 'text-success-text', warning: 'text-warning-text', danger: 'text-danger-text',
  info: 'text-info-text', neutral: 'text-ink-700', violet: 'text-primary-hover',
}

export default function Tag({ label, tone = 'neutral', variant = 'soft', size = 'md' }: TagProps) {
  if (variant === 'dot') {
    return (
      <span className={`inline-flex items-center gap-1.5 font-medium ${size === 'sm' ? 'text-micro' : 'text-xs'} ${TEXT[tone]}`}>
        <span aria-hidden className={`w-1.5 h-1.5 rounded-full ${DOT[tone]}`} />
        {label}
      </span>
    )
  }
  const pad = size === 'sm' ? 'px-2 py-0.5 text-micro' : 'px-2.5 py-1 text-xs'
  return <span className={`inline-flex items-center rounded-btn font-medium ${SOFT[tone]} ${pad}`}>{label}</span>
}
```

- [ ] **Step 2: Stat + StatBand**

```tsx
import { ReactNode } from 'react'
import type { Tone } from '@/lib/ui/status-tone'

interface StatProps { label: string; value: ReactNode; delta?: { text: string; tone?: Tone }; note?: string; tone?: 'default' | 'danger' }

export function Stat({ label, value, delta, note, tone = 'default' }: StatProps) {
  return (
    <div className="flex-1 min-w-0 px-5 py-4 border-r border-line-soft last:border-r-0">
      <div className="text-xs text-ink-500 mb-1.5">{label}</div>
      <div className={`text-2xl font-bold tracking-tight tabular-nums truncate ${tone === 'danger' ? 'text-danger-text' : 'text-ink-900'}`}>{value}</div>
      {(delta || note) && (
        <div className="flex items-center gap-1.5 mt-1.5 min-w-0">
          {delta && <span className={`text-micro font-semibold px-1.5 py-px rounded-btn ${delta.tone === 'danger' ? 'bg-danger-soft text-danger-text' : 'bg-success-soft text-success-text'}`}>{delta.text}</span>}
          {note && <span className="text-micro text-ink-400 truncate">{note}</span>}
        </div>
      )}
    </div>
  )
}

export function StatBand({ children }: { children: ReactNode }) {
  return <div className="flex bg-surface border border-line rounded-card shadow-card overflow-x-auto">{children}</div>
}
```

- [ ] **Step 3: SectionCard**

```tsx
import { ReactNode } from 'react'

interface Props { icon?: ReactNode; title?: string; actions?: ReactNode; footer?: ReactNode; padding?: 'default' | 'none'; children: ReactNode }

export default function SectionCard({ icon, title, actions, footer, padding = 'default', children }: Props) {
  return (
    <section className="bg-surface border border-line rounded-card shadow-card">
      {(title || actions) && (
        <div className="flex items-center justify-between gap-3 px-5 py-3.5 border-b border-line-soft">
          <h2 className="flex items-center gap-2.5 text-lg font-semibold text-ink-900 tracking-tight min-w-0 truncate">
            {icon && <span aria-hidden className="w-6 h-6 rounded-chip bg-primary-soft text-primary flex items-center justify-center [&>svg]:w-3.5 [&>svg]:h-3.5">{icon}</span>}
            {title}
          </h2>
          {actions && <div className="flex items-center gap-2 flex-none">{actions}</div>}
        </div>
      )}
      <div className={padding === 'default' ? 'p-5' : ''}>{children}</div>
      {footer && <div className="px-5 py-3 border-t border-line-soft text-xs text-ink-400">{footer}</div>}
    </section>
  )
}
```

- [ ] **Step 4: ProgressBar**

```tsx
interface Props { value: number; max: number; tone?: 'default' | 'warning' }

export default function ProgressBar({ value, max, tone }: Props) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0
  const resolved = tone ?? (pct > 90 ? 'warning' : 'default')
  return (
    <div className="h-1.5 rounded-btn bg-line-soft overflow-hidden" role="progressbar" aria-valuenow={value} aria-valuemax={max}>
      <div className={`h-full rounded-btn ${resolved === 'warning' ? 'bg-warning-dot' : 'bg-primary-gradient'}`} style={{ width: `${pct}%` }} />
    </div>
  )
}
```

- [ ] **Step 5: 构建 + Commit** `npm run build` 通过后 `git commit -am "feat(ui): Tag/Stat/StatBand/SectionCard/ProgressBar 展示组件"`

---

## Task 6: 表单组件 — Field / Input / Select / Textarea / SearchInput

**Files:**
- Create: `src/components/ui/Field.tsx`

单文件导出五件（表单件天然同变，放一起）：

- [ ] **Step 1: 实现**

```tsx
'use client'
import { InputHTMLAttributes, SelectHTMLAttributes, TextareaHTMLAttributes, ReactNode } from 'react'
import { Search } from 'lucide-react'

const CONTROL = 'w-full h-8 rounded-field border border-line-strong bg-surface px-3 text-sm text-ink-900 placeholder:text-ink-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-ring focus-visible:ring-offset-1 disabled:opacity-50 disabled:bg-canvas'

export function Field({ label, hint, error, required, children }: { label: string; hint?: string; error?: string; required?: boolean; children: ReactNode }) {
  return (
    <label className="block min-w-0">
      <span className="block text-xs font-medium text-ink-700 mb-1.5">{label}{required && <span className="text-danger-text ml-0.5">*</span>}</span>
      {children}
      {error ? <span className="block text-micro text-danger-text mt-1">{error}</span>
        : hint ? <span className="block text-micro text-ink-400 mt-1">{hint}</span> : null}
    </label>
  )
}

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`${CONTROL} ${props.className ?? ''}`} />
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={`${CONTROL} appearance-none bg-[url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2210%22 height=%2210%22 viewBox=%220 0 16 16%22 fill=%22none%22 stroke=%22%238d87a1%22 stroke-width=%222%22><path d=%22M4 6l4 4 4-4%22/></svg>')] bg-no-repeat bg-[right_10px_center] pr-8 ${props.className ?? ''}`} />
}

export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={`${CONTROL} h-auto min-h-20 py-2 resize-none ${props.className ?? ''}`} />
}

export function SearchInput({ kbdHint, ...props }: InputHTMLAttributes<HTMLInputElement> & { kbdHint?: string }) {
  return (
    <div className="relative min-w-0">
      <Search aria-hidden className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-ink-400" />
      <input {...props} className={`${CONTROL} pl-8 ${kbdHint ? 'pr-12' : ''} ${props.className ?? ''}`} />
      {kbdHint && <kbd className="absolute right-2.5 top-1/2 -translate-y-1/2 text-micro text-ink-400 border border-line rounded px-1 py-px bg-canvas">{kbdHint}</kbd>}
    </div>
  )
}
```

- [ ] **Step 2: 构建 + Commit** `git commit -am "feat(ui): Field/Input/Select/Textarea/SearchInput 表单组件"`

---

## Task 7: 导航型组件 — Tabs / SegmentedControl / FilterChip

**Files:**
- Create: `src/components/ui/Tabs.tsx`, `src/components/ui/SegmentedControl.tsx`, `src/components/ui/FilterChip.tsx`

- [ ] **Step 1: Tabs**

```tsx
'use client'
interface Item { value: string; label: string }
export default function Tabs({ items, value, onChange }: { items: Item[]; value: string; onChange: (v: string) => void }) {
  return (
    <div role="tablist" className="flex gap-5 border-b border-line overflow-x-auto scrollbar-thin">
      {items.map((it) => (
        <button key={it.value} role="tab" type="button" aria-selected={it.value === value}
          onClick={() => onChange(it.value)}
          className={`pb-2.5 px-px text-sm whitespace-nowrap transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-ring rounded-sm ${
            it.value === value ? 'text-ink-900 font-semibold shadow-[inset_0_-2px_0_theme(colors.primary.DEFAULT)]' : 'text-ink-500 hover:text-ink-700'}`}>
          {it.label}
        </button>
      ))}
    </div>
  )
}
```

- [ ] **Step 2: SegmentedControl**

```tsx
'use client'
interface Item { value: string; label: string }
export default function SegmentedControl({ items, value, onChange }: { items: Item[]; value: string; onChange: (v: string) => void }) {
  return (
    <div role="group" className="inline-flex gap-0.5 p-0.5 rounded-field bg-line-soft">
      {items.map((it) => (
        <button key={it.value} type="button" aria-pressed={it.value === value} onClick={() => onChange(it.value)}
          className={`px-2.5 py-1 text-xs rounded-[8px] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-ring ${
            it.value === value ? 'bg-surface text-ink-900 font-semibold shadow-card' : 'text-ink-500 hover:text-ink-700'}`}>
          {it.label}
        </button>
      ))}
    </div>
  )
}
```

- [ ] **Step 3: FilterChip（含 count 变体）**

```tsx
'use client'
import { X } from 'lucide-react'
import type { Tone } from '@/lib/ui/status-tone'

const COUNT_TONE: Record<Tone, { chip: string; dot: string }> = {
  success: { chip: 'text-success-text border-success-dot/40 bg-success-soft', dot: 'bg-success-dot' },
  warning: { chip: 'text-warning-text border-warning-dot/40 bg-warning-soft', dot: 'bg-warning-dot' },
  danger:  { chip: 'text-danger-text border-danger-dot/40 bg-danger-soft',   dot: 'bg-danger-dot' },
  info:    { chip: 'text-info-text border-info-dot/40 bg-info-soft',         dot: 'bg-info-dot' },
  neutral: { chip: 'text-ink-700 border-line-strong bg-surface',             dot: 'bg-ink-400' },
  violet:  { chip: 'text-primary-hover border-primary-border bg-primary-soft', dot: 'bg-primary' },
}

export function FilterChip({ label, set, onClick, onClear }: { label: string; set?: boolean; onClick?: () => void; onClear?: () => void }) {
  return (
    <span onClick={onClick} role="button" tabIndex={0}
      className={`inline-flex items-center gap-1.5 h-8 px-3 rounded-field text-xs text-ink-700 cursor-pointer transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-ring ${
        set ? 'border border-line-strong bg-surface shadow-card' : 'border border-dashed border-line-strong hover:bg-line-soft'}`}>
      {label}
      {set && onClear && (
        <button type="button" aria-label="clear" onClick={(e) => { e.stopPropagation(); onClear() }} className="text-ink-400 hover:text-ink-700">
          <X className="w-3 h-3" />
        </button>
      )}
    </span>
  )
}

export function CountChip({ label, count, tone = 'neutral', active, onClick }: { label: string; count: number; tone?: Tone; active?: boolean; onClick?: () => void }) {
  const c = COUNT_TONE[tone]
  return (
    <button type="button" onClick={onClick} aria-pressed={active}
      className={`inline-flex items-center gap-2 h-8 px-3 rounded-btn text-xs font-semibold border transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-ring ${c.chip} ${active ? 'ring-1 ring-primary-ring' : ''}`}>
      <span aria-hidden className={`w-1.5 h-1.5 rounded-full ${c.dot}`} />
      {label}<span className="font-bold tabular-nums">{count}</span>
    </button>
  )
}
```

- [ ] **Step 4: 构建 + Commit** `git commit -am "feat(ui): Tabs/SegmentedControl/FilterChip 导航型组件"`

---

## Task 8: 列表组件 — Table 原语 + RecordRow

**Files:**
- Create: `src/components/ui/Table.tsx`, `src/components/ui/RecordRow.tsx`

- [ ] **Step 1: Table 原语**

```tsx
import { ReactNode, ThHTMLAttributes, TdHTMLAttributes } from 'react'

export function Table({ children, minWidth }: { children: ReactNode; minWidth?: number }) {
  return (
    <div className="overflow-x-auto scrollbar-thin">
      <table className="w-full text-sm border-collapse" style={minWidth ? { minWidth } : undefined}>{children}</table>
    </div>
  )
}
export function THead({ children }: { children: ReactNode }) {
  return <thead><tr className="border-b border-line">{children}</tr></thead>
}
export function Th({ align = 'left', children, ...rest }: ThHTMLAttributes<HTMLTableCellElement> & { align?: 'left' | 'right' | 'center' }) {
  return <th {...rest} className={`px-3 py-2 text-xs font-medium text-ink-400 whitespace-nowrap text-${align}`}>{children}</th>
}
export function Tr({ children, onClick }: { children: ReactNode; onClick?: () => void }) {
  return <tr onClick={onClick} className={`border-b border-line-soft last:border-b-0 transition-colors hover:bg-primary-soft/20 ${onClick ? 'cursor-pointer' : ''}`}>{children}</tr>
}
export function Td({ align = 'left', numeric, children, ...rest }: TdHTMLAttributes<HTMLTableCellElement> & { align?: 'left' | 'right' | 'center'; numeric?: boolean }) {
  return <td {...rest} className={`px-3 py-2.5 text-ink-700 text-${align} ${numeric ? 'tabular-nums font-medium text-ink-900' : ''}`}>{children}</td>
}
```

- [ ] **Step 2: RecordRow**

```tsx
import { ReactNode } from 'react'
import type { Tone } from '@/lib/ui/status-tone'
import { Link } from '@/i18n/navigation'

const DOT: Record<Tone, string> = {
  success: 'bg-success-dot shadow-[0_0_0_3px_var(--success-soft)]', warning: 'bg-warning-dot shadow-[0_0_0_3px_var(--warning-soft)]',
  danger: 'bg-danger-dot shadow-[0_0_0_3px_var(--danger-soft)]',    info: 'bg-info-dot shadow-[0_0_0_3px_var(--info-soft)]',
  neutral: 'bg-ink-400 shadow-[0_0_0_3px_var(--line-soft)]',        violet: 'bg-primary shadow-[0_0_0_3px_var(--primary-soft)]',
}
interface Meta { icon?: ReactNode; text: string; mono?: boolean }
interface Props { status?: Tone; title: string; meta?: Meta[]; amount?: string; tags?: ReactNode; who?: ReactNode; actions?: ReactNode; href?: string }

export default function RecordRow({ status, title, meta = [], amount, tags, who, actions, href }: Props) {
  const body = (
    <div className="flex items-center gap-3.5 px-5 py-3 border-t border-line-soft first:border-t-0 transition-colors hover:bg-primary-soft/20">
      {status && <span aria-hidden className={`w-2 h-2 rounded-full flex-none ${DOT[status]}`} />}
      <div className="flex-1 min-w-0">
        <div className="text-md font-semibold text-ink-900 truncate">{title}</div>
        {meta.length > 0 && (
          <div className="flex items-center gap-3.5 mt-0.5 text-xs text-ink-400 min-w-0">
            {meta.map((m, i) => (
              <span key={i} className={`inline-flex items-center gap-1 truncate ${m.mono ? 'font-mono' : ''} [&>svg]:w-3 [&>svg]:h-3 [&>svg]:opacity-75`}>
                {m.icon}{m.text}
              </span>
            ))}
          </div>
        )}
      </div>
      {amount && <span className="text-md font-semibold tabular-nums font-mono text-ink-900 flex-none">{amount}</span>}
      {tags}
      {who && <span className="w-24 flex-none text-xs text-ink-700 truncate">{who}</span>}
      {actions}
    </div>
  )
  return href ? <Link href={href} className="block focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-ring">{body}</Link> : body
}
```

- [ ] **Step 3: 构建 + Commit** `git commit -am "feat(ui): Table 原语 + RecordRow 行列表组件"`

---

## Task 9: Button 改造 + Modal/EmptyState 升级 + LoadingState/ErrorState

**Files:**
- Modify: `src/components/ui/Button.tsx`（保持 props 兼容）
- Modify: `src/components/ui/Modal.tsx`、`src/components/ui/EmptyState.tsx`
- Create: `src/components/ui/LoadingState.tsx`, `src/components/ui/ErrorState.tsx`

- [ ] **Step 1: Button 换皮（API 不变，新增 lg 档与 icon 用法说明）**

VARIANTS/SIZES 替换为：

```tsx
const VARIANTS = {
  primary:   'bg-primary-gradient text-white border-transparent shadow-[0_2px_6px_rgba(124,58,237,0.35),inset_0_1px_0_rgba(255,255,255,0.2)] hover:opacity-95',
  secondary: 'bg-primary-soft hover:bg-primary-soft-hover text-primary-hover border-transparent',
  ghost:     'bg-transparent hover:bg-line-soft text-ink-700 border-transparent',
  danger:    'bg-danger-dot hover:opacity-90 text-white border-transparent',
}
const SIZES = {
  sm: 'h-7 px-3 text-xs',
  md: 'h-8 px-4 text-sm',
  lg: 'h-[38px] px-5 text-sm',
}
```

按钮外层类中 `rounded-btn` 保留（token 已改为 999px，自动药丸化）；加 `focus-visible:ring-2 focus-visible:ring-primary-ring focus-visible:ring-offset-1`。

- [ ] **Step 2: Modal 换皮**：面板类 `rounded-t-card sm:rounded-card` 保留（自动 14px），`shadow-xl` → `shadow-pop`，头部 `border-zinc-100` → `border-line-soft`，标题加 `tracking-tight`，关闭钮 hover 色换 `hover:bg-line-soft text-ink-400 hover:text-ink-700`。z-[60] 不动（层级表登记值）。

- [ ] **Step 3: EmptyState 升级（API 兼容，emoji prop 保留但改渲染为图标圈）**

```tsx
import { ReactNode } from 'react'
import { useTranslations } from 'next-intl'
import { Inbox } from 'lucide-react'

interface Props { emoji?: string; icon?: ReactNode; title?: string; hint?: string; action?: ReactNode }

export default function EmptyState({ icon, title, hint, action }: Props) {
  const t = useTranslations('common')
  const resolvedHint = hint ?? (title === undefined ? t('emptyHint') : undefined)
  return (
    <div className="flex flex-col items-center justify-center gap-2.5 py-12 text-center">
      <div aria-hidden className="w-11 h-11 rounded-full bg-primary-soft text-primary flex items-center justify-center [&>svg]:w-5 [&>svg]:h-5">
        {icon ?? <Inbox />}
      </div>
      <p className="text-sm font-medium text-ink-700">{title ?? t('emptyTitle')}</p>
      {resolvedHint && <p className="text-xs text-ink-400 max-w-64">{resolvedHint}</p>}
      {action && <div className="mt-1">{action}</div>}
    </div>
  )
}
```

`emoji` prop 从接口移除；`grep -rn "emoji=" src --include='*.tsx'` 找到 5 处调用点同步删参（不破坏构建）。

- [ ] **Step 4: LoadingState + ErrorState**

```tsx
// src/components/ui/LoadingState.tsx
import { useTranslations } from 'next-intl'

export default function LoadingState({ variant = 'plain', rows = 4 }: { variant?: 'plain' | 'list' | 'stats'; rows?: number }) {
  const t = useTranslations('common')
  if (variant === 'list') {
    return (
      <div aria-busy className="animate-pulse">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex items-center gap-3.5 px-5 py-3.5 border-t border-line-soft first:border-t-0">
            <span className="w-2 h-2 rounded-full bg-line-soft" />
            <div className="flex-1 space-y-2"><div className="h-3 w-1/3 rounded bg-line-soft" /><div className="h-2.5 w-1/2 rounded bg-line-soft" /></div>
            <div className="h-3 w-16 rounded bg-line-soft" />
          </div>
        ))}
      </div>
    )
  }
  if (variant === 'stats') {
    return (
      <div aria-busy className="flex animate-pulse bg-surface border border-line rounded-card shadow-card">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex-1 px-5 py-4 border-r border-line-soft last:border-r-0 space-y-2.5">
            <div className="h-2.5 w-14 rounded bg-line-soft" /><div className="h-6 w-24 rounded bg-line-soft" />
          </div>
        ))}
      </div>
    )
  }
  return <div aria-busy className="py-12 text-center text-sm text-ink-400">{t('loading')}</div>
}
```

```tsx
// src/components/ui/ErrorState.tsx
'use client'
import { useTranslations } from 'next-intl'
import { AlertTriangle } from 'lucide-react'
import Button from './Button'

export default function ErrorState({ title, detail, onRetry }: { title?: string; detail?: string; onRetry?: () => void }) {
  const t = useTranslations('common')
  return (
    <div role="alert" className="flex flex-col items-center justify-center gap-2.5 py-12 text-center">
      <div aria-hidden className="w-11 h-11 rounded-full bg-danger-soft text-danger-text flex items-center justify-center"><AlertTriangle className="w-5 h-5" /></div>
      <p className="text-sm font-medium text-ink-700">{title ?? t('errorTitle')}</p>
      {detail && <p className="text-xs text-ink-400 max-w-72">{detail}</p>}
      {onRetry && <Button variant="secondary" size="sm" onClick={onRetry}>{t('retry')}</Button>}
    </div>
  )
}
```

`messages/{zh,en,ja}.json` 的 `common` 增加 `errorTitle` / `retry` 两 key（zh：「加载出错了」/「重试」；en：\"Something went wrong\" / \"Retry\"；ja：「読み込みに失敗しました」/「再試行」），跑 `npm run test:i18n` 验证三语同构。

- [ ] **Step 5: 构建 + 浏览器抽查**（全站按钮已药丸化、弹窗阴影变化）+ Commit `git commit -am "feat(ui): Button 药丸化 + Modal/EmptyState 换新 + Loading/ErrorState 三态组件"`

---

## Task 10: 全局换底

**Files:**
- Modify: `src/app/[locale]/(app)/layout.tsx`

- [ ] **Step 1**: `className="bg-texture main-content ..."` → `className="bg-atmosphere main-content ..."`（其余不动）。
- [ ] **Step 2**: 浏览器验证：任意三页底色为淡紫氛围渐变，点阵消失；滚动时渐变固定（background-attachment: fixed）。
- [ ] **Step 3**: Commit `git commit -am "feat(ui): 全站换氛围渐变底，点阵纹理退役"`

---

## Task 11: Sidebar 改造

**Files:**
- Modify: `src/components/layout/Sidebar.tsx`

- [ ] **Step 1: NAV 增加 chip 色**（`NavLeaf`/`NavGroup` 类型加 `chip?: string`），配色按 design-system §1.4 固定：

```ts
const CHIP: Record<string, string> = {
  dashboard: 'bg-line-soft text-ink-700',
  creators: 'bg-[rgba(236,72,153,0.10)] text-[#db2777]',
  pipeline: 'bg-info-soft text-info-dot',
  timeline: 'bg-primary-soft text-primary',
  tasks: 'bg-success-soft text-[#059669]',
  workspace: 'bg-info-soft text-info-dot',
  team: 'bg-primary-soft text-primary',
  knowledge: 'bg-[rgba(245,158,11,0.12)] text-[#d97706]',
  costManagement: 'bg-success-soft text-[#059669]',
  expenses: 'bg-primary-soft text-primary',
  items: 'bg-[rgba(245,158,11,0.12)] text-[#d97706]',
  venue: 'bg-primary-soft text-primary',
  financeForecast: 'bg-success-soft text-[#059669]',
  config: 'bg-line-soft text-ink-700',
}
```

（此处 pink/amber 两色 token 未进 tailwind 映射，允许方括号 rgba 写法——它们不含 hex，不触发门禁；如触发则在 tailwind colors 里补 `chip-pink`/`chip-amber` 两个别名。）

- [ ] **Step 2: 图标渲染统一为 chip 形态**——所有 `<item.icon className="w-4 h-4..." />` 处改为：

```tsx
<span aria-hidden className={`w-6 h-6 rounded-chip flex items-center justify-center flex-none ${CHIP[item.key] ?? 'bg-line-soft text-ink-700'}`}>
  <item.icon className="w-3.5 h-3.5" strokeWidth={1.5} />
</span>
```

- [ ] **Step 3: 皮肤类替换**（文件内全局）：`sidebar-frosted` → `bg-transparent`；激活态 `bg-primary-soft text-primary` 保留（token 已换新值）并加 `rounded-field font-semibold`；分组标签色 `text-zinc-400` → `text-ink-400`；其余 `zinc-*` → 对应 `ink-*`/`line-*`（对照 design-system §1.1）。右侧 `border-r` 用 `border-line`。
- [ ] **Step 4: 浏览器验证**：展开/收合/移动端抽屉三态；激活项紫晕药丸；每项彩色 chip；分组标签 mauve。
- [ ] **Step 5: Commit** `git commit -am "feat(ui): Sidebar 彩色图标 chip + 紫晕激活态 + 氛围底融合"`

---

## Task 12: PageHeader（Header 改造）

**Files:**
- Modify: `src/components/layout/Header.tsx`

- [ ] **Step 1: 扩展 props（向后兼容，18 个既有调用点零改动）**

```tsx
import { ReactNode } from 'react'

interface HeaderProps { title: ReactNode; subtitle?: string; actions?: ReactNode; tabs?: ReactNode; search?: ReactNode }

export default function Header({ title, subtitle, actions, tabs, search }: HeaderProps) {
  return (
    <div className="mb-4 sm:mb-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-ink-900 truncate">{title}</h1>
          {subtitle && <p className="text-xs sm:text-sm text-ink-500 mt-1">{subtitle}</p>}
        </div>
        {(actions || search) && (
          <div className="flex items-center gap-2.5 flex-wrap">{search}{actions}</div>
        )}
      </div>
      {tabs && <div className="mt-4">{tabs}</div>}
    </div>
  )
}
```

- [ ] **Step 2: 构建 + 抽查三页页头** + Commit `git commit -am "feat(ui): Header→PageHeader，新增 tabs/search slot，标题升 2xl"`

---

## Task 13: 支出管理页迁移（样板间本体）

**Files:**
- Modify: `src/app/[locale]/(app)/expenses/page.tsx`（989 行，只动渲染层不动数据逻辑）
- Modify: `src/components/expenses/ExpenseCategoryChart.tsx`、`ExpenseSankeyChart.tsx`、`ExpenseDetailModal.tsx`、`SavedViewsBar.tsx`

逐段替换，每个子步骤单独浏览器验证 + commit：

- [ ] **Step a: 页头区**——现有 Header 调用增加 `tabs`（`<Tabs items={[列表/类别占比/累计趋势/月度汇总]}>` 接管现有图表卡内 tab 的状态）与 `search`（`<SearchInput kbdHint="⌘K" placeholder={t('searchPlaceholder')}>` 绑定现有搜索 state）；「添加支出」改 `<Button size="lg" icon>`，币种切换改 `<SegmentedControl>`。commit `feat(expenses): 页头 Tabs/SearchInput/SegmentedControl 化`
- [ ] **Step b: 状态汇总**——在页头下加 `<CountChip>` 行：全部（neutral，count=全部记录数）/ 已付款（success）/ 待付款（warning），点击写入现有 status filter state；AI 提示横幅保留但换 `bg-primary-soft border border-primary-border rounded-card`。commit
- [ ] **Step c: KPI**——`page.tsx:494-545` 五张手写卡替换为 `<StatBand>` + 5×`<Stat>`（跨境成本 tone 不再粉色，负毛利率用 `tone="danger"`；delta/note 按现值填充）。commit
- [ ] **Step d: 筛选行**——5 个原生 select + 搜索输入替换为 `<SearchInput>` + 5×`<Select>`（保留既有 onChange），外层容器 `flex gap-2 items-center`；「重置」用 `<Button variant="ghost" size="sm">`。commit
- [ ] **Step e: 列表**——`page.tsx:806` 起的 `<table>` 替换为 `<SectionCard padding="none" icon={<Receipt/>} title={t('listTitle')}>` 内的 `RecordRow` 映射：`status={toneOf('expense', e.status)}`、meta=[编号(mono)、日期·归属周期(icon Calendar)、类别(icon Home)]、amount=格式化金额、who=经办人、actions=编辑/删除 ghost 图标钮；空态 `<EmptyState>`、加载 `<LoadingState variant="list">`、错误 `<ErrorState onRetry>`（替换 HTTP 503 黄条）。分页/加载更多进 SectionCard `footer`。commit
- [ ] **Step f: 图表与弹窗**——两张图表文件删除本地 `CATEGORY_COLORS`，改 `import { seriesColor, AXIS, GRID, TOOLTIP_STYLE } from '@/lib/chart-theme'`（类目→色 用 `seriesColor(index)` 固定次序，**同图不重色**）；`ExpenseDetailModal` 删除本地 STATUS_COLOR/CATEGORY_COLOR 两份映射，状态用 `<Tag tone={toneOf('expense', ...)}>`，表单控件换 `Field/Input/Select`；`SavedViewsBar` 的 chip 换 `FilterChip`。commit

- [ ] **Step g: 页面级验证清单**（每条在浏览器确认）：
  1. 列表/图表/汇总四个 tab 切换正常，直接刷新 URL 状态不丢
  2. 状态 CountChip 点击过滤生效且与筛选行 select 联动一致
  3. 添加支出 → 详情 → 编辑 → 删除 全流程可走，弹窗 Escape 可关
  4. 断网/接口报错时出现 ErrorState 且重试可恢复
  5. `npm test && npm run test:copy` 全绿（门禁：本页violet 硬编码应减少，基线数只降不升）

---

## Task 14: 校准回写 + 三语走查 + 开 PR

**Files:**
- Modify: `docs/design-system.md`（取值校准）
- Modify: `docs/records/2026-08-08-ui-style-research-progress.md`（追加 PR1 状态一行）

- [ ] **Step 1: 校准回写**——实现中与 design-system.md 数值不一致处（字号、间距、阴影……）逐条核对：实现更合理的改文档，文档更合理的改实现；同 commit。
- [ ] **Step 2: 三语走查**——`/zh` `/ja` `/en` 各过支出管理 + 仪表盘 + 任务页；ja 重点看 CountChip/Stat/RecordRow 长词截断（`min-w-0`+truncate 应生效）；截图存档。
- [ ] **Step 3: 全量验证**——`npm test && npm run test:copy && npm run build` 三绿。
- [ ] **Step 4: 开 PR**——push 分支，PR 标题 `feat(ui): 风格提升 PR1 样板间 — token 体系 + 组件库 v1 + 支出管理页新语言`；描述含：spec/design-system 链接、改前/改后截图对（Task 1/10/11/13 各阶段截图）、两个刻意全站副作用说明、PR2-4 预告。**不合并**，等 pollux 验收。

---

## Self-Review 记录

- **Spec 覆盖**：spec §6 PR1 五项（layout 换底 ✓ Task10 / Sidebar ✓ Task11 / token+组件+门禁 ✓ Task1-9 / 支出管理 ✓ Task13 / design-system 入库校准 ✓ Task0+14）。
- **占位符扫描**：无 TBD/TODO；Task 13 属对既有 989 行文件的改造，采用「子步骤 + 关键代码 + 逐步验证」而非全文重写（符合 skill 对既有大文件的处理原则）。
- **类型一致性**：`Tone` 类型唯一定义于 `status-tone.ts`，Tag/FilterChip/RecordRow/Stat 均从此 import；`toneOf(domain, status)` 签名各处一致；组件名与 spec §5 清单一一对应。
- **遗留说明**：CommandBar 换皮按 spec 归 PR2；`bg-texture`/`sidebar-frosted` 死类清理归 PR3。
