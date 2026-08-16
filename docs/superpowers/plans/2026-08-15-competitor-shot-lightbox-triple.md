# 竞品截图灯箱三连排 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 竞品截图灯箱由「一次一张」改为「一次并排三张」，箭头以 1 张为步长在当天照片间滑动，改日期与删除作用于用户点选的那一张。

**Architecture:** 只动两个文件。窗口起点的夹逼逻辑抽成纯函数放进已有的 `shotGrid.ts` 以便单测；`ShotLightbox` 的 state 由「当前下标 `index`」换成「窗口起点 `start` + 点选 id `pickedId`」，渲染期派生出可见窗口与选中项，选中项兜底到窗口首张，从结构上保证删除的作用对象永远可见。

**Tech Stack:** Next.js 14 App Router、React、TypeScript、Tailwind、next-intl、`node --test`（原生测试运行器，无 Jest）。

设计依据：`docs/superpowers/specs/2026-08-15-competitor-shot-lightbox-triple-design.md`

---

## 背景：动手前必须知道的三件事

1. **「箭头切换当天照片」已经存在**，不要重复实现。`ShotAlbum` 打开灯箱时传的 `shots` 已经只有当天那一组（`ShotAlbum.tsx` 中 `shots={grouped.get(openDate) ?? []}`），灯箱也已有左右箭头。本次唯一新增的是「一次显示三张」及其引出的「操作作用于哪一张」。

2. **测试用原生 `node --test`，不是 Jest。** 断言写 `assert from 'node:assert/strict'`，import 本地模块要带 `.ts` 后缀（见 `shotGrid.test.ts` 现有写法）。`src/lib/competitors/shotGrid.test.ts` 已经在 `package.json` 的 `test` 脚本列表里，新增用例不需要改脚本。

3. **本仓有三道 CI 闸门会挡你**：
   - `check-style-tokens`：颜色必须用既有 token，不许裸 hex。
   - `check-i18n`：新增 i18n key 必须三语 `messages/{zh,en,ja}.json` 同步。**本计划不新增任何 key。**
   - `check-no-bare-han`：JSX 里不许出现裸中文。文案一律走 `t('...')`。

---

## 文件结构

| 文件 | 职责 | 本次动作 |
|---|---|---|
| `src/lib/competitors/shotGrid.ts` | 竞品截图的纯函数集合（日期轴、分组、窗口） | 新增常量 `LIGHTBOX_VISIBLE` 与函数 `clampWindowStart` |
| `src/lib/competitors/shotGrid.test.ts` | 上者的单测 | 追加 3 个 `clampWindowStart` 用例 |
| `src/components/competitors/ShotLightbox.tsx` | 截图灯箱 | 单图渲染改三连排 + 选中态 |

`ShotAlbum.tsx`、`ShotDateStrip.tsx`、后端接口、`messages/*.json` **都不改**。

---

### Task 1: 窗口起点夹逼纯函数

**Files:**
- Modify: `src/lib/competitors/shotGrid.ts`（在文件末尾追加）
- Test: `src/lib/competitors/shotGrid.test.ts`（在文件末尾追加）

- [ ] **Step 1: 写失败的测试**

在 `src/lib/competitors/shotGrid.test.ts` **末尾**追加：

```ts
test('clampWindowStart: 总数不超过窗口时恒为 0', () => {
  // 当天只有 1-3 张时窗口不该滑动,否则会滑出空位
  assert.equal(clampWindowStart(0, 1, 3), 0)
  assert.equal(clampWindowStart(2, 3, 3), 0)
  assert.equal(clampWindowStart(5, 0, 3), 0)
})

test('clampWindowStart: 贴左与贴右', () => {
  assert.equal(clampWindowStart(-1, 5, 3), 0)
  assert.equal(clampWindowStart(9, 5, 3), 2) // total - size
})

test('clampWindowStart: 窗口内原样返回', () => {
  assert.equal(clampWindowStart(1, 5, 3), 1)
  assert.equal(clampWindowStart(2, 5, 3), 2)
})

test('LIGHTBOX_VISIBLE: 灯箱并排张数', () => {
  assert.equal(LIGHTBOX_VISIBLE, 3)
})
```

同时把该文件顶部的 import 补上这两个名字（改 import 块，不要新增第二条 import 语句）：

```ts
import {
  UNDATED_KEY,
  LIGHTBOX_VISIBLE,
  isValidShotDate,
  collectShotDates,
  windowOf,
  resolveAnchor,
  groupShotsByDate,
  clampWindowStart,
} from './shotGrid.ts'
```

- [ ] **Step 2: 运行测试，确认它失败**

Run:
```bash
npm test 2>&1 | tail -20
```
Expected: FAIL —— 报 `clampWindowStart is not a function` 或 `LIGHTBOX_VISIBLE` 为 `undefined`。

> 若报 `Cannot find module`，说明你在仓外目录执行了。本 worktree 嵌套在主仓内，Node 会向上解析到主仓的 `node_modules`，直接在 worktree 根目录跑即可。

- [ ] **Step 3: 写最小实现**

在 `src/lib/competitors/shotGrid.ts` **末尾**追加：

```ts
/** 灯箱一次并排显示的张数。 */
export const LIGHTBOX_VISIBLE = 3

/**
 * 把灯箱窗口起点夹逼到 [0, max(0, total - size)]。
 *
 * total <= size 时恒为 0：当天照片不够铺满窗口就不该滑动，
 * 否则会滑出一段空位，而空位会被读成「图没加载出来」。
 */
export function clampWindowStart(start: number, total: number, size: number): number {
  const max = Math.max(total - size, 0)
  if (!Number.isFinite(start) || start < 0) return 0
  return Math.min(Math.floor(start), max)
}
```

- [ ] **Step 4: 运行测试，确认通过**

Run:
```bash
npm test 2>&1 | tail -12
```
Expected: PASS，`fail 0`，总数比改动前多 4 条。

- [ ] **Step 5: 提交**

```bash
git add src/lib/competitors/shotGrid.ts src/lib/competitors/shotGrid.test.ts
git commit -m "feat(competitors): 灯箱窗口起点夹逼纯函数 clampWindowStart"
```

---

### Task 2: 灯箱改三连排

**Files:**
- Modify: `src/components/competitors/ShotLightbox.tsx`（整文件替换）

这一步没有自动化测试可写（该模块无组件测试设施，见 spec「测试」节），验证放在 Task 3 的实机环节。

- [ ] **Step 1: 整文件替换 `src/components/competitors/ShotLightbox.tsx`**

```tsx
// src/components/competitors/ShotLightbox.tsx
'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { ChevronLeft, ChevronRight, Trash2, X } from 'lucide-react'
import type { CompetitorShot } from '@/lib/competitors/types'
import { todayLocal } from '@/lib/competitors/localDate'
import { LIGHTBOX_VISIBLE, clampWindowStart } from '@/lib/competitors/shotGrid'

export default function ShotLightbox({
  shots, canEdit, onClose, onChanged,
}: {
  shots: CompetitorShot[]
  canEdit: boolean
  onClose: () => void
  onChanged: () => void | Promise<void>
}) {
  const t = useTranslations('competitors')
  const [start, setStart] = useState(0)
  const [pickedId, setPickedId] = useState<string | null>(null)
  const [dateInput, setDateInput] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  // 渲染期夹逼,不放 useEffect:effect 版本在 shots 变短时会先渲染出
  // 越界的一帧(整个灯箱闪掉),effect 跑完才回来。
  const from = clampWindowStart(start, shots.length, LIGHTBOX_VISIBLE)
  const visible = shots.slice(from, from + LIGHTBOX_VISIBLE)

  // 兜底到窗口首张,一次覆盖"选中项被删"与"选中项滑出窗口"两种情况。
  // 删除不可逆,作用对象必须永远在画面里。
  const selected = visible.find((s) => s.id === pickedId) ?? visible[0]

  // 依赖两个原始值而不是 selected 对象本身:调用方每次渲染换引用也不会重复触发,
  // 同时满足 exhaustive-deps(依赖数组不参与类型检查,靠 lint 兜底,别写成对象)。
  const selectedId = selected?.id
  const selectedShotOn = selected?.shot_on ?? ''

  useEffect(() => {
    setDateInput(selectedShotOn)
    setError(null)
  }, [selectedId, selectedShotOn])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  if (!selected) return null

  const atStart = from <= 0
  const atEnd = from + LIGHTBOX_VISIBLE >= shots.length
  const selectedIndex = shots.findIndex((s) => s.id === selected.id)

  // 箭头既翻窗口也换选中:选中新进来的那一张,读作"看下一张",
  // 与改版前单图模式的心智模型一致。
  const step = (direction: -1 | 1) => {
    const next = clampWindowStart(from + direction, shots.length, LIGHTBOX_VISIBLE)
    const win = shots.slice(next, next + LIGHTBOX_VISIBLE)
    const pick = direction === 1 ? win[win.length - 1] : win[0]
    setStart(next)
    if (pick) setPickedId(pick.id)
  }

  const saveDate = async () => {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/competitors/shots/${selected.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shot_on: dateInput || null }),
      })
      // 只有 400 才是日期本身的问题;401/500 也说成"日期格式不对"
      // 会让人反复重打一个根本没错的日期
      if (!res.ok) { setError(res.status === 400 ? t('shotDateInvalid') : t('actionFailed')); return }
      await onChanged()
      onClose()
    } catch {
      setError(t('actionFailed'))
    } finally {
      setBusy(false)
    }
  }

  const removeSelected = async () => {
    if (!confirm(t('deleteShotConfirm'))) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/competitors/shots/${selected.id}`, { method: 'DELETE' })
      if (!res.ok) { setError(t('actionFailed')); return }
      await onChanged()
      // 只在删掉最后一张时才关。否则清理某天的多张图要"开→删→关→再开"
      // 循环一遍;留着不关的话,refetch 后 shots 变短、窗口与选中都会自动夹逼兜底。
      if (shots.length <= 1) onClose()
    } catch {
      setError(t('actionFailed'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-3 bg-black/70 p-6"
      onClick={onClose}
      role="dialog"
      aria-label={selected.shot_on ?? t('undated')}
    >
      {/*
        不写 aria-modal:本仓约定是没有 focus trap 就不许声明它
        (见 tasks/page.tsx 的同款注释),否则等于骗读屏说外面已经 inert。
        全套 focus trap 在 components/ui/Modal.tsx,这里用不上,Esc 关闭已够。
      */}
      <div className="flex max-h-[80vh] items-center gap-3" onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          onClick={() => step(-1)}
          disabled={atStart}
          aria-label={t('prevShot')}
          className="shrink-0 rounded bg-black/50 p-2 text-white disabled:opacity-30"
        >
          <ChevronLeft size={20} />
        </button>
        {/*
          并排最多 LIGHTBOX_VISIBLE 张。当天不足这么多就有几张排几张——
          父层 justify-center 会让它们保持居中,不需要占位空格。
          min-w-0 是为了极窄视口下等比缩小而不是横向溢出。
        */}
        {visible.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => setPickedId(s.id)}
            aria-pressed={s.id === selected.id}
            aria-label={s.caption || s.tag || s.shot_on || t('undated')}
            className={`min-w-0 rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-ring ${
              s.id === selected.id ? 'ring-2 ring-primary' : ''
            }`}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={s.image_url}
              alt={s.caption || s.tag || ''}
              className="max-h-[64vh] max-w-full rounded-lg"
            />
          </button>
        ))}
        <button
          type="button"
          onClick={() => step(1)}
          disabled={atEnd}
          aria-label={t('nextShot')}
          className="shrink-0 rounded bg-black/50 p-2 text-white disabled:opacity-30"
        >
          <ChevronRight size={20} />
        </button>
      </div>

      <div className="flex items-center gap-3 text-xs text-white" onClick={(e) => e.stopPropagation()}>
        <span>{t('shotIndexOf', { index: selectedIndex + 1, total: shots.length })}</span>
        {canEdit && (
          <>
            <label className="flex items-center gap-1">
              <span>{t('shotDate')}</span>
              <input
                type="date"
                value={dateInput}
                max={todayLocal()}
                onChange={(e) => setDateInput(e.target.value)}
                className="rounded border border-line-strong px-1.5 py-0.5 text-ink-900"
              />
            </label>
            <button
              type="button"
              onClick={saveDate}
              disabled={busy}
              className="rounded bg-primary px-2 py-1 text-white disabled:opacity-50"
            >
              {t('saveShotDate')}
            </button>
            <button
              type="button"
              onClick={removeSelected}
              disabled={busy}
              aria-label={t('delete')}
              className="rounded bg-black/50 p-1 text-white hover:bg-danger-strong disabled:opacity-50"
            >
              <Trash2 size={14} />
            </button>
          </>
        )}
        <button type="button" onClick={onClose} aria-label={t('closeShot')} className="rounded bg-black/50 p-1 text-white">
          <X size={14} />
        </button>
      </div>

      {error && (
        <p
          role="status"
          onClick={(e) => e.stopPropagation()}
          className="rounded bg-danger-strong px-2 py-1 text-xs text-white"
        >
          {error}
        </p>
      )}
    </div>
  )
}
```

- [ ] **Step 2: 类型检查与 lint**

Run:
```bash
npx tsc --noEmit; echo "tsc exit: $?"
```
Expected: `tsc exit: 0`

Run:
```bash
npm run lint 2>&1 | tail -5
```
Expected: 退出码 0。允许出现存量 `react-hooks/exhaustive-deps` warning，但**不允许**出现指向 `ShotLightbox.tsx` 的新 warning。若出现，说明你把 `selected` 对象本身写进了依赖数组——改回依赖 `selectedId` / `selectedShotOn` 两个原始值。

- [ ] **Step 3: 跑闸门与单测**

Run:
```bash
npm test 2>&1 | tail -8 && npm run test:copy 2>&1 | tail -6
```
Expected: `fail 0`；`check-i18n`、`check-no-bare-han`、`check-style-tokens` 三项全部 OK。

- [ ] **Step 4: 提交**

```bash
git add src/components/competitors/ShotLightbox.tsx
git commit -m "feat(competitors): 截图灯箱当天多图三连排,箭头滑 1 张、点选决定操作对象"
```

---

### Task 3: 实机验证

竞品页在 `[locale]/(app)/competitors` 下、走 Supabase 鉴权，而本 worktree 没有 `.env.local`，直接开页面会被重定向到登录。按本仓既有配方，用 `/login` 下的临时夹具页绕过——`src/middleware.ts` 的 `PUBLIC_PATHS` 含 `/login`，且该路径仍继承 `[locale]/layout.tsx` 的 `NextIntlClientProvider`，所以 `useTranslations` 可用。夹具页不碰 Supabase，缺 `.env.local` 无妨。

**Files:**
- Create（临时，验证后必须删）: `src/app/[locale]/login/lightbox-fixture/page.tsx`

- [ ] **Step 1: 建临时夹具页**

```tsx
// src/app/[locale]/login/lightbox-fixture/page.tsx
'use client'

import { useState } from 'react'
import ShotLightbox from '@/components/competitors/ShotLightbox'
import type { CompetitorShot } from '@/lib/competitors/types'

// 5 张竖图占位,尺寸取 9:16,用于验证三连排版式与箭头滑动。
const SHOTS: CompetitorShot[] = [1, 2, 3, 4, 5].map((n) => ({
  id: `fixture-${n}`,
  competitor_id: 'fixture',
  image_url: `https://placehold.co/720x1280/1f2937/f9fafb/png?text=${n}`,
  shot_on: '2026-08-15',
  tag: null,
  caption: `fixture ${n}`,
  sort_order: n,
  created_at: `2026-08-15T0${n}:00:00Z`,
}))

export default function LightboxFixturePage() {
  const [open, setOpen] = useState(true)
  const [count, setCount] = useState(5)
  return (
    <div className="p-8">
      <div className="mb-4 flex gap-2">
        {[1, 2, 3, 5].map((n) => (
          <button key={n} type="button" onClick={() => { setCount(n); setOpen(true) }} className="rounded border px-3 py-1">
            {n} shots
          </button>
        ))}
      </div>
      {open && (
        <ShotLightbox
          key={count}
          shots={SHOTS.slice(0, count)}
          canEdit
          onClose={() => setOpen(false)}
          onChanged={() => {}}
        />
      )}
    </div>
  )
}
```

> 用外部占位图服务是为了不往 `public/` 塞验证用的资产。若网络不通，把 `image_url` 换成仓内任意已有图片路径（例如 `/site/moondollz-group.webp`），版式验证同样成立。

- [ ] **Step 2: 起 dev server（换端口，避开主仓的 3001）**

Run（后台执行）:
```bash
npx next dev --port 3010
```
确认启动日志里的 cwd 是本 worktree 而不是主仓：
```bash
lsof -p $(pgrep -f "next dev --port 3010" | head -1) | awk '$4=="cwd"{print $NF}'
```
Expected: 输出以 `.claude/worktrees/shot-lightbox-triple` 结尾。

- [ ] **Step 3: 逐条核对**

打开 `http://localhost:3010/zh/login/lightbox-fixture`，在 1280×800 与更宽两种视口下各核一遍：

- [ ] 5 张时：并排显示 3 张，横向不出现滚动条，图片没有被裁
- [ ] 默认最左那张有 `ring-2 ring-primary` 高亮，底部计数显示 `1 / 5`
- [ ] 按 ▶：窗口变成第 2-4 张，**高亮落在最右那张**，计数 `4 / 5`
- [ ] 按 ◀：窗口回到第 1-3 张，**高亮落在最左那张**，计数 `1 / 5`
- [ ] 点中间那张：高亮跟着走，计数随之变化，窗口不动
- [ ] 到头时对应箭头置灰不可点
- [ ] 3 shots：排 3 张，两个箭头都置灰
- [ ] 2 shots：排 2 张且居中，右侧不留空位
- [ ] 1 shots：排 1 张且居中
- [ ] Esc 能关闭；点遮罩能关闭；点图片**不会**误关（`stopPropagation` 生效）
- [ ] Tab 能依次聚焦到三张图，聚焦时有可见的 focus ring

- [ ] **Step 4: 截图留证**

对 5 张与 2 张两种状态各截一张图，附到 PR 描述里。

- [ ] **Step 5: 删夹具页并停服务**

```bash
rm -rf src/app/\[locale\]/login/lightbox-fixture
pkill -f "next dev --port 3010"
```

**必做的收尾**：删页面后 `.next/types` 里会残留该路由的类型文件，`tsc` 会报 TS2307。清掉再验：

```bash
rm -rf .next/types
npx tsc --noEmit; echo "tsc exit: $?"
```
Expected: `tsc exit: 0`

- [ ] **Step 6: 确认工作区干净**

```bash
git status --porcelain
```
Expected: 空输出。若出现 `?? src/app/[locale]/login/lightbox-fixture`，说明 Step 5 没删干净。

---

### Task 4: 开 PR

- [ ] **Step 1: 全量闸门复跑**

Run:
```bash
npx tsc --noEmit && npm run lint > /dev/null && npm test 2>&1 | tail -6 && npm run test:copy 2>&1 | tail -4
```
Expected: 全部通过，`fail 0`。

- [ ] **Step 2: 推分支开 PR**

```bash
git push -u origin feat/shot-lightbox-triple
```

PR 描述必须包含：改动前后的行为对比、Task 3 的两张截图、以及「箭头切当天照片是既有能力、本次只新增三连排」这条范围澄清（避免评审误以为改动面更大）。

**不要直接推 main**，本仓交付一律走 PR。

---

## 完成标准

- `clampWindowStart` 4 条单测通过，`npm test` 全绿
- `tsc --noEmit` 0 错误，`lint` 无新增 warning
- 三道 copy 闸门全过
- Task 3 的 11 条实机核对项逐条打勾
- 工作区干净，夹具页已删
- PR 已开且 CI 绿
