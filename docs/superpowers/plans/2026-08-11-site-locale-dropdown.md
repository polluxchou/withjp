# Site Locale Dropdown Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the public site's segmented language links with an accessible blueprint-style dropdown on desktop and mobile, and localize the Contact page's operating-entity label.

**Architecture:** Keep menu ordering and keyboard state transitions in a small pure helper with Node tests. `LocaleSwitch` remains the single client component used by both header layouts; next-intl links preserve the current locale-free pathname, while translated accessibility labels and Contact partner copy stay in the three message files.

**Tech Stack:** Next.js 14 App Router, React 18, TypeScript, next-intl, Tailwind CSS, Lucide React, Node test runner.

---

## File map

- Create `src/lib/site/locale-menu.ts`: stable locale option data and pure menu-state/keyboard transitions.
- Create `src/lib/site/locale-menu.test.ts`: option ordering, active state, open/close events, and keyboard-index tests.
- Modify `src/components/site/LocaleSwitch.tsx`: custom dropdown UI, outside-click, Escape, focus return, and arrow-key navigation.
- Modify `src/lib/site/contact.test.ts`: lock the three localized operating-entity labels and unchanged production-partner label.
- Modify `messages/ja.json`, `messages/zh.json`, `messages/en.json`: accessibility copy and Contact label translations.
- Modify `package.json`: register the new unit test in the full suite.

### Task 1: Lock and implement locale menu behavior

**Files:**
- Create: `src/lib/site/locale-menu.test.ts`
- Create: `src/lib/site/locale-menu.ts`
- Modify: `package.json`
- Test: `src/lib/site/locale-menu.test.ts`

- [ ] **Step 1: Write the failing unit tests**

Create `src/lib/site/locale-menu.test.ts`:

```ts
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildLocaleMenuOptions,
  nextLocaleMenuIndex,
  nextLocaleMenuOpen,
} from './locale-menu.ts'

test('locale menu keeps routing order and marks exactly the current locale', () => {
  const options = buildLocaleMenuOptions('ja')
  assert.deepEqual(options.map(({ locale }) => locale), ['zh', 'en', 'ja'])
  assert.deepEqual(options.map(({ active }) => active), [false, false, true])
})

test('an unknown current locale does not invent an active option', () => {
  assert.equal(buildLocaleMenuOptions('fr').filter(({ active }) => active).length, 0)
})

test('toggle opens and closes while dismiss events always close', () => {
  assert.equal(nextLocaleMenuOpen(false, 'toggle'), true)
  assert.equal(nextLocaleMenuOpen(true, 'toggle'), false)
  assert.equal(nextLocaleMenuOpen(true, 'outside'), false)
  assert.equal(nextLocaleMenuOpen(true, 'escape'), false)
  assert.equal(nextLocaleMenuOpen(true, 'select'), false)
})

test('arrow, home and end keys move focus with wrapping', () => {
  assert.equal(nextLocaleMenuIndex(0, 'ArrowDown', 3), 1)
  assert.equal(nextLocaleMenuIndex(2, 'ArrowDown', 3), 0)
  assert.equal(nextLocaleMenuIndex(0, 'ArrowUp', 3), 2)
  assert.equal(nextLocaleMenuIndex(1, 'Home', 3), 0)
  assert.equal(nextLocaleMenuIndex(1, 'End', 3), 2)
  assert.equal(nextLocaleMenuIndex(1, 'Escape', 3), 1)
})
```

- [ ] **Step 2: Verify RED**

Run:

```bash
node --test --experimental-strip-types src/lib/site/locale-menu.test.ts
```

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `src/lib/site/locale-menu.ts`.

- [ ] **Step 3: Add the minimal pure implementation**

Create `src/lib/site/locale-menu.ts`:

```ts
import { locales, type Locale } from '../../i18n/routing.ts'

export interface LocaleMenuOption {
  locale: Locale
  active: boolean
}

export type LocaleMenuEvent = 'toggle' | 'outside' | 'escape' | 'select'
export type LocaleMenuKey = 'ArrowDown' | 'ArrowUp' | 'Home' | 'End' | 'Escape'

export function buildLocaleMenuOptions(current: string): LocaleMenuOption[] {
  return locales.map((locale) => ({ locale, active: locale === current }))
}

export function nextLocaleMenuOpen(open: boolean, event: LocaleMenuEvent): boolean {
  return event === 'toggle' ? !open : false
}

export function nextLocaleMenuIndex(
  current: number,
  key: string,
  count: number,
): number {
  if (count <= 0) return -1
  if (key === 'ArrowDown') return (current + 1 + count) % count
  if (key === 'ArrowUp') return (current - 1 + count) % count
  if (key === 'Home') return 0
  if (key === 'End') return count - 1
  return current
}
```

- [ ] **Step 4: Register and run the test**

Append `src/lib/site/locale-menu.test.ts` to the existing `test` script in `package.json`, preserving every existing test path. Then run:

```bash
node --test --experimental-strip-types src/lib/site/locale-menu.test.ts
```

Expected: 4 tests pass, 0 fail.

- [ ] **Step 5: Commit the behavior model**

```bash
git add src/lib/site/locale-menu.ts src/lib/site/locale-menu.test.ts package.json
git commit -m "test(site): define locale menu behavior"
```

### Task 2: Localize menu accessibility and Contact entity copy

**Files:**
- Modify: `src/lib/site/contact.test.ts`
- Modify: `messages/ja.json`
- Modify: `messages/zh.json`
- Modify: `messages/en.json`
- Test: `src/lib/site/contact.test.ts`

- [ ] **Step 1: Extend the Contact content test first**

In `src/lib/site/contact.test.ts`, add an `en` and `zh` message read beside the existing `ja` read, using the same type. Add this test:

```ts
const zh = JSON.parse(
  readFileSync(new URL('../../../messages/zh.json', import.meta.url), 'utf8'),
) as { site: { contact: { sections: SiteContactSectionCopy[] } } }

const en = JSON.parse(
  readFileSync(new URL('../../../messages/en.json', import.meta.url), 'utf8'),
) as { site: { contact: { sections: SiteContactSectionCopy[] } } }

test('Contact localizes the operating entity but keeps production partner unchanged', () => {
  assert.equal(zh.site.contact.sections[0].partner, '运营主体')
  assert.equal(ja.site.contact.sections[0].partner, '運営主体')
  assert.equal(en.site.contact.sections[0].partner, 'Operating Entity')
  for (const messages of [zh, ja, en]) {
    assert.equal(messages.site.contact.sections[1].partner, 'PRODUCTION PARTNER')
  }
})
```

- [ ] **Step 2: Verify RED**

Run:

```bash
node --test --experimental-strip-types src/lib/site/contact.test.ts
```

Expected: FAIL because all three first-section partner values are still `RECRUITING PARTNER`.

- [ ] **Step 3: Update all locale messages**

In each `site.locale` object, preserve `ja`, `zh`, and `en`, then add:

```json
// messages/zh.json
"toggle": "切换语言",
"menuLabel": "语言选项"
```

```json
// messages/ja.json
"toggle": "言語を切り替える",
"menuLabel": "言語オプション"
```

```json
// messages/en.json
"toggle": "Switch language",
"menuLabel": "Language options"
```

Update `site.contact.sections[0].partner` to `运营主体`, `運営主体`, and `Operating Entity` in zh, ja, and en respectively. Do not change any `site.contact.sections[1].partner` value.

- [ ] **Step 4: Verify GREEN and locale parity**

Run:

```bash
node --test --experimental-strip-types src/lib/site/contact.test.ts
npm run test:i18n
```

Expected: Contact tests pass and i18n parity exits 0.

- [ ] **Step 5: Commit localized copy**

```bash
git add src/lib/site/contact.test.ts messages/ja.json messages/zh.json messages/en.json
git commit -m "feat(site): localize operating entity label"
```

### Task 3: Replace segmented links with the blueprint dropdown

**Files:**
- Modify: `src/components/site/LocaleSwitch.tsx`
- Test: `src/lib/site/locale-menu.test.ts`

- [ ] **Step 1: Implement the dropdown component**

Replace `src/components/site/LocaleSwitch.tsx` with:

```tsx
'use client'

import { useEffect, useId, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { ChevronDown } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { Link, usePathname } from '@/i18n/navigation'
import {
  buildLocaleMenuOptions,
  nextLocaleMenuIndex,
  nextLocaleMenuOpen,
} from '@/lib/site/locale-menu'

export default function LocaleSwitch({ locale }: { locale: string }) {
  const t = useTranslations('site.locale')
  const pathname = usePathname()
  const options = buildLocaleMenuOptions(locale)
  const current = options.find(({ active }) => active) ?? options[0]
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const optionRefs = useRef<Array<HTMLAnchorElement | null>>([])
  const menuId = useId()

  useEffect(() => {
    if (!open) return

    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen((value) => nextLocaleMenuOpen(value, 'outside'))
      }
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault()
        setOpen((value) => nextLocaleMenuOpen(value, 'escape'))
        triggerRef.current?.focus()
        return
      }

      const currentIndex = optionRefs.current.findIndex((node) => node === document.activeElement)
      if (currentIndex < 0) return
      const nextIndex = nextLocaleMenuIndex(currentIndex, event.key, options.length)
      if (nextIndex !== currentIndex) {
        event.preventDefault()
        optionRefs.current[nextIndex]?.focus()
      }
    }

    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open, options.length])

  function openAndFocus(index: number) {
    setOpen(true)
    requestAnimationFrame(() => optionRefs.current[index]?.focus())
  }

  function onTriggerKeyDown(event: ReactKeyboardEvent<HTMLButtonElement>) {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      openAndFocus(0)
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      openAndFocus(options.length - 1)
    }
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        aria-label={`${t('toggle')}: ${t(current.locale)}`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((value) => nextLocaleMenuOpen(value, 'toggle'))}
        onKeyDown={onTriggerKeyDown}
        className="inline-flex min-w-[108px] items-center justify-between gap-3 whitespace-nowrap border border-site-line-strong px-2.5 py-[7px] font-condensed text-[12px] tracking-[0.16em] text-site-accent transition-colors hover:border-site-accent"
      >
        <span className="inline-flex items-center gap-2">
          <span aria-hidden className="h-1.5 w-1.5 bg-site-accent" />
          {t(current.locale)}
        </span>
        <ChevronDown
          aria-hidden
          className={`h-3.5 w-3.5 transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <div
          id={menuId}
          role="menu"
          aria-label={t('menuLabel')}
          className="absolute right-0 top-full z-50 mt-1 min-w-full border border-site-line-strong bg-site-canvas"
        >
          {options.map((option, index) => (
            <Link
              key={option.locale}
              ref={(node) => {
                optionRefs.current[index] = node
              }}
              href={pathname}
              locale={option.locale}
              role="menuitem"
              aria-current={option.active ? 'true' : undefined}
              onClick={() => setOpen((value) => nextLocaleMenuOpen(value, 'select'))}
              className={`flex w-full items-center gap-2 border-b border-site-line px-3 py-2.5 font-condensed text-[13px] tracking-[0.16em] transition-colors last:border-b-0 hover:bg-site-panel hover:text-site-accent ${
                option.active ? 'text-site-accent' : 'text-site-fg/60'
              }`}
            >
              <span
                aria-hidden
                className={`h-1.5 w-1.5 ${option.active ? 'bg-site-accent' : 'bg-transparent'}`}
              />
              {t(option.locale)}
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Run focused and copy checks**

Run:

```bash
node --test --experimental-strip-types src/lib/site/locale-menu.test.ts src/lib/site/contact.test.ts
npm run test:copy
```

Expected: all focused tests and copy/style gates pass.

- [ ] **Step 3: Commit the dropdown UI**

```bash
git add src/components/site/LocaleSwitch.tsx
git commit -m "feat(site): replace locale tabs with dropdown"
```

### Task 4: Full verification and 3099 QA

**Files:**
- Verify only; modify the smallest owning file only if a definite defect is found.

- [ ] **Step 1: Run full tests and copy gates**

Run:

```bash
npm test
npm run test:copy
```

Expected: zero test failures and all copy gates pass.

- [ ] **Step 2: Verify production build without corrupting the active dev cache**

Resolve the exact process listening on 3099 and confirm its cwd is this worktree. Stop only that process, run `npm run build`, then remove only the generated `.next` directory and restart `./node_modules/.bin/next dev -p 3099`. Wait for `Ready` and confirm the Contact page returns HTTP 200.

Expected: build exits 0; regenerated development server returns HTTP 200. `.next` is a disposable generated cache and is never staged.

- [ ] **Step 3: Browser-check desktop behavior**

At `http://localhost:3099/ja/site/contact` in a desktop viewport:

- One language trigger shows `日本語` and a down arrow; the old three horizontal links are absent.
- Click opens a right-aligned zero-radius menu with `中文 / EN / 日本語`.
- Current item is accented; `aria-expanded` changes from false to true.
- `Escape` closes the menu and returns focus to the trigger.
- Clicking outside closes the menu.
- Selecting EN navigates to `/en/site/contact`; selecting 中文 then navigates to `/zh/site/contact`, preserving `/site/contact`.
- Contact shows `運営主体`, `Operating Entity`, and `运营主体` in their respective locales; `PRODUCTION PARTNER` remains unchanged.
- Fresh console errors/warnings are empty.

- [ ] **Step 4: Browser-check mobile and themes**

At 390×844:

- Open the mobile drawer and the same single trigger/dropdown.
- Menu remains within `clientWidth`; `scrollWidth <= clientWidth`.
- Language navigation works from the drawer.
- Repeat one open-menu screenshot in light theme and one in dark theme; borders, canvas, panel hover, accent state, and arrow remain readable.
- Reset the temporary viewport before finalizing browser tabs.

- [ ] **Step 5: Inspect scope**

Run:

```bash
git diff 5f63097..HEAD --check
git status --short
```

Expected: no whitespace errors; only the pre-existing untracked `dev-3099.log` remains outside committed changes.
