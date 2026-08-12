# Services Image Focus Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep the Services horizontal cards while showing the character's face in the left image and a complete expression-label row in the right image.

**Architecture:** Store image-specific focal points beside the existing Services media paths, pass them through the Services page, and add an optional `objectPosition` prop to the shared `SiteImage` component. The default remains unchanged, so only the two Services images receive custom crop focus.

**Tech Stack:** Next.js 14, React, TypeScript, `next/image`, Node test runner.

---

## File Structure

- Modify `src/lib/site/services.test.ts`: assert the two approved focal points and component/page wiring.
- Modify `src/lib/site/services.ts`: store `50% 24%` and `50% 28%` beside the media paths.
- Modify `src/components/site/SiteImage.tsx`: accept and apply an optional `objectPosition`.
- Modify `src/app/[locale]/site/services/page.tsx`: pass each media focal point to `SiteImage`.

### Task 1: Lock the crop correction in a failing regression test

**Files:**
- Modify: `src/lib/site/services.test.ts`

- [ ] **Step 1: Update expected media entries with the approved focal points**

Change both expected objects to:

```ts
{ src: '/site/services-character.webp', alt: expectedAlts[locale][0], objectPosition: '50% 24%' },
{ src: '/site/services-expression.webp', alt: expectedAlts[locale][1], objectPosition: '50% 28%' },
```

- [ ] **Step 2: Add wiring assertions**

Extend the page test with:

```ts
assert.match(source, /objectPosition=\{media\.objectPosition\}/)
```

Add a component test:

```ts
test('SiteImage applies an optional focal point without changing its default crop mode', () => {
  const source = readFileSync(
    new URL('../../components/site/SiteImage.tsx', import.meta.url),
    'utf8',
  )
  assert.match(source, /objectPosition\?: string/)
  assert.match(source, /style=\{objectPosition \? \{ objectPosition \} : undefined\}/)
  assert.match(source, /className="object-cover"/)
})
```

- [ ] **Step 3: Run the focused test and verify RED**

Run:

```bash
node --test --experimental-strip-types src/lib/site/services.test.ts
```

Expected: FAIL because the media entries do not contain focal points and `SiteImage` does not accept or apply them.

### Task 2: Implement per-image crop focus

**Files:**
- Modify: `src/lib/site/services.ts`
- Modify: `src/components/site/SiteImage.tsx`
- Modify: `src/app/[locale]/site/services/page.tsx`

- [ ] **Step 1: Store path and focal point together**

Replace `SERVICE_MEDIA_PATHS` with:

```ts
const SERVICE_MEDIA = [
  { src: '/site/services-character.webp', objectPosition: '50% 24%' },
  { src: '/site/services-expression.webp', objectPosition: '50% 28%' },
] as const
```

Update the interface and builder:

```ts
export interface SiteServiceMedia {
  src: (typeof SERVICE_MEDIA)[number]['src']
  alt: string
  objectPosition: (typeof SERVICE_MEDIA)[number]['objectPosition']
}

export function buildServiceMedia(placeholders: string[]): SiteServiceMedia[] {
  return SERVICE_MEDIA.map((media, index) => ({
    ...media,
    alt: placeholders[index] ?? '',
  }))
}
```

- [ ] **Step 2: Add the optional focal point to `SiteImage`**

Add `objectPosition` to destructuring and props:

```ts
objectPosition,
```

```ts
objectPosition?: string
```

Add to the `Image` element:

```tsx
style={objectPosition ? { objectPosition } : undefined}
```

- [ ] **Step 3: Pass the focal point from the Services page**

Add to the Services `SiteImage` call:

```tsx
objectPosition={media.objectPosition}
```

- [ ] **Step 4: Run the focused test and verify GREEN**

Run:

```bash
node --test --experimental-strip-types src/lib/site/services.test.ts
```

Expected: 4 tests pass, 0 fail.

- [ ] **Step 5: Commit the fix**

```bash
git add src/lib/site/services.test.ts src/lib/site/services.ts src/components/site/SiteImage.tsx 'src/app/[locale]/site/services/page.tsx'
git commit -m "fix(site): tune services image focus"
```

### Task 3: Verify and publish

**Files:**
- Verify: all files changed in Tasks 1–2

- [ ] **Step 1: Run copy/style gates**

Run `npm run test:copy`.

Expected: i18n, bare-Han, and style-token checks pass.

- [ ] **Step 2: Run the full test suite**

Run `npm test`.

Expected: all tests pass with 0 failures.

- [ ] **Step 3: Run the production build**

Run `npm run build` with network access for the project's existing Google Fonts.

Expected: build exits 0 and generates all three Services locale routes.

- [ ] **Step 4: Verify desktop and mobile crops**

Start `npm run dev`, inspect `/ja/site/services` at the default desktop viewport and 390×844 mobile viewport, and confirm:

- the left card includes the character's face;
- the right card contains a complete row of expression names;
- desktop remains two columns;
- mobile remains one column;
- computed image positions are `50% 24%` and `50% 28%`.

- [ ] **Step 5: Publish and verify production**

Push the branch, create a ready PR targeting `main`, confirm required checks, merge without force, wait for Vercel production deployment, and inspect `https://eacn.agenova.chat/services` for the same focal points and visible content.
