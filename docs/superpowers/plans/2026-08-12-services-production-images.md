# Services Production Images Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the two Services page media placeholders with the supplied character-setting and expression-test images while preserving the selected horizontal cover-crop layout.

**Architecture:** A focused `services.ts` content helper owns the stable image-path order and combines it with locale-specific placeholder text to produce accessible media entries. The Services page consumes those entries through the existing `SiteImage` component, so responsive layout, Next.js image optimization, and the approved center `object-cover` crop remain unchanged.

**Tech Stack:** Next.js 14, React, TypeScript, next-intl, `next/image`, Node test runner, WebP assets.

---

## File Structure

- Create `src/lib/site/services.ts`: stable Services media paths and localized media-entry builder.
- Create `src/lib/site/services.test.ts`: image order, localization, asset existence, and page wiring regression tests.
- Modify `src/app/[locale]/site/services/page.tsx`: render localized media entries with real image paths and correct responsive `sizes`.
- Modify `package.json`: add the Services regression test to the full `npm test` suite.
- Create `public/site/services-character.webp`: optimized character-setting image.
- Create `public/site/services-expression.webp`: optimized expression/motion-test image.

### Task 1: Define and test the Services media contract

**Files:**
- Create: `src/lib/site/services.test.ts`
- Create: `src/lib/site/services.ts`
- Modify: `package.json`

- [ ] **Step 1: Write the failing media-order and localization test**

Create `src/lib/site/services.test.ts`:

```ts
import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { buildServiceMedia } from './services.ts'

type ServicesMessages = { site: { services: { placeholders: string[] } } }

const readMessages = (locale: 'ja' | 'zh' | 'en') =>
  JSON.parse(
    readFileSync(new URL(`../../../messages/${locale}.json`, import.meta.url), 'utf8'),
  ) as ServicesMessages

test('Services media preserves the approved image order and localized alt text', () => {
  const expectedAlts = {
    ja: ['着ぐるみ撮影／制作風景', 'モーション連動のテスト画面'],
    zh: ['皮套拍摄／制作现场', '动作联动测试画面'],
    en: ['Suit shoot / production floor', 'Motion linkage test screen'],
  } as const

  for (const locale of ['ja', 'zh', 'en'] as const) {
    const media = buildServiceMedia(readMessages(locale).site.services.placeholders)
    assert.deepEqual(media, [
      { src: '/site/services-character.webp', alt: expectedAlts[locale][0] },
      { src: '/site/services-expression.webp', alt: expectedAlts[locale][1] },
    ])
  }
})

test('Services media assets exist in the public site directory', () => {
  for (const filename of ['services-character.webp', 'services-expression.webp']) {
    assert.equal(
      existsSync(new URL(`../../../public/site/${filename}`, import.meta.url)),
      true,
      filename,
    )
  }
})

test('Services page renders real media with responsive two-column sizes', () => {
  const source = readFileSync(
    new URL('../../app/[locale]/site/services/page.tsx', import.meta.url),
    'utf8',
  )
  assert.match(source, /buildServiceMedia\(placeholders\)/)
  assert.match(source, /src=\{media\.src\}/)
  assert.match(source, /alt=\{media\.alt\}/)
  assert.match(source, /sizes="\(min-width: 640px\) 50vw, 100vw"/)
})
```

- [ ] **Step 2: Register the test and verify RED**

Append `src/lib/site/services.test.ts` to the existing `test` script in `package.json`.

Run:

```bash
node --test --experimental-strip-types src/lib/site/services.test.ts
```

Expected: FAIL because `./services.ts` and the two WebP assets do not exist.

- [ ] **Step 3: Implement the minimal media builder**

Create `src/lib/site/services.ts`:

```ts
const SERVICE_MEDIA_PATHS = [
  '/site/services-character.webp',
  '/site/services-expression.webp',
] as const

export interface SiteServiceMedia {
  src: (typeof SERVICE_MEDIA_PATHS)[number]
  alt: string
}

export function buildServiceMedia(placeholders: string[]): SiteServiceMedia[] {
  return SERVICE_MEDIA_PATHS.map((src, index) => ({
    src,
    alt: placeholders[index] ?? '',
  }))
}
```

- [ ] **Step 4: Run the focused test and confirm only asset/page wiring assertions remain red**

Run:

```bash
node --test --experimental-strip-types src/lib/site/services.test.ts
```

Expected: the mapping assertion passes; asset existence and page-wiring assertions fail.

- [ ] **Step 5: Commit the contract and red regression test**

```bash
git add package.json src/lib/site/services.ts src/lib/site/services.test.ts
git commit -m "test(site): define services production media"
```

### Task 2: Create optimized WebP assets

**Files:**
- Create: `public/site/services-character.webp`
- Create: `public/site/services-expression.webp`

- [ ] **Step 1: Inspect source dimensions before conversion**

Run:

```bash
sips -g pixelWidth -g pixelHeight '/Users/fengzhou/Desktop/人物设定.jpg' '/Users/fengzhou/Desktop/表情Bom.jpg'
```

Expected: both source images report valid positive dimensions.

- [ ] **Step 2: Convert the original JPGs without changing them**

Run:

```bash
sips -s format webp -s formatOptions 82 '/Users/fengzhou/Desktop/人物设定.jpg' --out public/site/services-character.webp
sips -s format webp -s formatOptions 82 '/Users/fengzhou/Desktop/表情Bom.jpg' --out public/site/services-expression.webp
```

Expected: both commands create WebP files under `public/site/` and leave the Desktop JPGs untouched.

- [ ] **Step 3: Verify image format and dimensions**

Run:

```bash
file public/site/services-character.webp public/site/services-expression.webp
sips -g pixelWidth -g pixelHeight public/site/services-character.webp public/site/services-expression.webp
```

Expected: both files identify as WebP and retain the source aspect ratios.

- [ ] **Step 4: Run the focused test and confirm only page wiring remains red**

Run:

```bash
node --test --experimental-strip-types src/lib/site/services.test.ts
```

Expected: image order, localization, and asset-existence tests pass; page-wiring test still fails.

- [ ] **Step 5: Commit the optimized assets**

```bash
git add public/site/services-character.webp public/site/services-expression.webp
git commit -m "assets(site): add services production images"
```

### Task 3: Render the real images in the approved layout

**Files:**
- Modify: `src/app/[locale]/site/services/page.tsx`
- Test: `src/lib/site/services.test.ts`

- [ ] **Step 1: Import and build localized media entries**

Add:

```ts
import { buildServiceMedia } from '@/lib/site/services'
```

After reading `placeholders`, add:

```ts
const mediaItems = buildServiceMedia(placeholders)
```

- [ ] **Step 2: Replace placeholder-only rendering with real media rendering**

Replace the bottom map with:

```tsx
<div className="mt-8 grid gap-6 sm:grid-cols-2">
  {mediaItems.map((media) => (
    <div key={media.src} className="relative h-[240px] lg:h-[340px]">
      <SiteImage
        src={media.src}
        alt={media.alt}
        placeholder={media.alt}
        sizes="(min-width: 640px) 50vw, 100vw"
        className="h-full w-full"
      />
    </div>
  ))}
</div>
```

This preserves the existing `object-cover` center crop in `SiteImage`, desktop two-column grid, mobile single-column grid, and approved fixed heights.

- [ ] **Step 3: Run the focused test and verify GREEN**

Run:

```bash
node --test --experimental-strip-types src/lib/site/services.test.ts
```

Expected: 3 tests pass, 0 fail.

- [ ] **Step 4: Commit the page integration**

```bash
git add src/app/[locale]/site/services/page.tsx
git commit -m "feat(site): show services production images"
```

### Task 4: Run full gates and visually verify the selected crop

**Files:**
- Verify: `src/app/[locale]/site/services/page.tsx`
- Verify: `public/site/services-character.webp`
- Verify: `public/site/services-expression.webp`

- [ ] **Step 1: Run the public-site copy and style checks**

Run:

```bash
npm run test:copy
```

Expected: i18n, bare-Han, and style-token checks all pass.

- [ ] **Step 2: Run the complete test suite**

Run:

```bash
npm test
```

Expected: all tests pass with 0 failures, including `services.test.ts`.

- [ ] **Step 3: Run the production build**

Run:

```bash
npm run build
```

Expected: Next.js production build exits 0 and generates the Services route.

- [ ] **Step 4: Start the local site and inspect desktop and mobile views**

Run:

```bash
npm run dev
```

Open `/ja/site/services` at desktop width and a mobile viewport. Confirm:

- character-setting image appears first;
- expression/motion-test image appears second;
- desktop shows two horizontal cards;
- mobile shows one card per row;
- center cover-crop matches selected option B;
- no placeholder-only frame remains.

- [ ] **Step 5: Review final diff and commit any verification-only adjustments**

Run:

```bash
git diff --check
git status --short
```

Expected: no whitespace errors and only the intended Services files are changed. If visual verification required a scoped adjustment, stage only that file and commit it with `fix(site): tune services image crop`.
