# News Recruit Apply Visibility Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show the public news apply button only for articles whose stable category is `recruit`.

**Architecture:** Keep locale-independent article metadata in `src/lib/site/news.ts`, keyed by stable slug, and add the category to every built article. A pure predicate owns the exact visibility rule, while the detail page conditionally renders only the existing apply button and leaves navigation unchanged.

**Tech Stack:** Next.js 14 App Router, React 18, TypeScript, Node.js built-in test runner.

---

### Task 1: Add category metadata and the visibility rule

**Files:**
- Modify: `src/lib/site/news.test.ts`
- Modify: `src/lib/site/news.ts`
- Modify: `src/app/[locale]/site/news/[slug]/page.tsx`

- [x] **Step 1: Write the failing tests**

Update the module imports so the test can probe the not-yet-existing predicate without causing an import error, then add these tests:

```ts
import * as news from './news.ts'

test('assigns locale-independent categories in slug order', () => {
  assert.deepEqual(
    buildArticles(copy).map((article) => article.category),
    ['live', 'project', 'recruit', 'project'],
  )
})

test('shows the apply action only for the recruit category', () => {
  const shouldShowNewsApply = (news as typeof news & {
    shouldShowNewsApply?: (category: string) => boolean
  }).shouldShowNewsApply

  assert.equal(shouldShowNewsApply?.('recruit'), true)
  assert.equal(shouldShowNewsApply?.('live'), false)
  assert.equal(shouldShowNewsApply?.('project'), false)
})
```

- [x] **Step 2: Run the focused test and verify RED**

Run:

```bash
node --test --experimental-strip-types src/lib/site/news.test.ts
```

Expected: the new category and apply-visibility tests fail because categories and `shouldShowNewsApply` do not exist yet; the original four tests continue to pass.

- [x] **Step 3: Add minimal category metadata and predicate**

In `src/lib/site/news.ts`, replace the image-only map with typed metadata:

```ts
export type NewsCategory = 'live' | 'project' | 'recruit'

const NEWS_METADATA: Record<NewsSlug, { image: string; category: NewsCategory }> = {
  'nightly-live-start': { image: '/site/moondollz-group.webp', category: 'live' },
  'moondollz-launch': { image: '/site/moondollz-key.webp', category: 'project' },
  'first-gen-audition': { image: '/site/card-kano.webp', category: 'recruit' },
  'osaka-studio-open': { image: '/site/card-shino.webp', category: 'project' },
}
```

Add `category: NewsCategory` to `SiteArticle`, spread the metadata into each built article, and add:

```ts
export function shouldShowNewsApply(category: NewsCategory): boolean {
  return category === 'recruit'
}
```

- [x] **Step 4: Render the apply button conditionally**

Import `shouldShowNewsApply` in `src/app/[locale]/site/news/[slug]/page.tsx` and change only the existing apply button block to:

```tsx
{shouldShowNewsApply(article.category) && (
  <SiteButton href={RECRUIT_HREF} variant="hot" size="md">
    {t('applyCta')}
  </SiteButton>
)}
```

Leave the back-to-news button outside the condition.

- [x] **Step 5: Run focused tests and verify GREEN**

Run:

```bash
node --test --experimental-strip-types src/lib/site/news.test.ts
```

Expected: all six news tests pass with zero failures.

- [x] **Step 6: Run full verification**

Run:

```bash
npm test
npm run build
git diff --check
```

Expected: 300 tests pass, the production build exits 0, and the diff check prints no errors.

- [x] **Step 7: Commit the implementation**

```bash
git add src/lib/site/news.test.ts src/lib/site/news.ts 'src/app/[locale]/site/news/[slug]/page.tsx'
git commit -m "fix(site): limit news apply button to recruit articles"
```
