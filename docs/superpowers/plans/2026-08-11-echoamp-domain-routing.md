# EchoAmp Domain Routing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Serve the EchoAmp public site at `echoamp.agenova.chat` with clean public URLs while keeping the existing MCN domain and Supabase-backed admin application unchanged.

**Architecture:** A pure routing policy converts `(hostname, pathname)` into one of four outcomes: pass through, redirect an internal `/site` URL to its clean public canonical URL, rewrite a clean public URL to the existing `/[locale]/site` route, or return 404. Edge middleware applies that policy before the existing i18n/auth flow; the public host allows only public site pages, static assets handled outside middleware, and `/api/site/applications`.

**Tech Stack:** Next.js App Router middleware, next-intl locale routing, Node built-in test runner, TypeScript.

---

### Task 1: Define the domain-routing contract

**Files:**
- Create: `src/lib/site/domain-routing.test.ts`
- Create: `src/lib/site/domain-routing.ts`
- Modify: `package.json`

- [ ] **Step 1: Write the failing domain-routing tests**

Cover these exact outcomes:

```ts
resolvePublicSiteRoute('mcn.agenova.chat', '/') === null
resolvePublicSiteRoute('echoamp.agenova.chat', '/') === { kind: 'rewrite', pathname: '/ja/site', locale: 'ja' }
resolvePublicSiteRoute('echoamp.agenova.chat', '/news/example') === { kind: 'rewrite', pathname: '/ja/site/news/example', locale: 'ja' }
resolvePublicSiteRoute('echoamp.agenova.chat', '/zh/recruit') === { kind: 'rewrite', pathname: '/zh/site/recruit', locale: 'zh' }
resolvePublicSiteRoute('echoamp.agenova.chat', '/ja/site/news') === { kind: 'redirect', pathname: '/news' }
resolvePublicSiteRoute('echoamp.agenova.chat', '/api/site/applications') === { kind: 'passthrough' }
resolvePublicSiteRoute('echoamp.agenova.chat', '/zh/creators') === { kind: 'not_found' }
resolvePublicSiteRoute('echoamp.agenova.chat', '/api/expenses') === { kind: 'not_found' }
```

- [ ] **Step 2: Run the focused test and confirm RED**

Run:

```bash
node --test --experimental-strip-types src/lib/site/domain-routing.test.ts
```

Expected: failure because `domain-routing.ts` does not exist.

- [ ] **Step 3: Implement the minimal pure routing policy**

Create `resolvePublicSiteRoute(hostname, pathname)` with a fixed production host, Japanese as the unprefixed default locale, explicit `zh/en/ja` support, allowed site sections, canonical redirects for `/[locale]/site/*`, exact application API pass-through, and deny-by-default behavior on the public host.

- [ ] **Step 4: Register and run the focused test**

Add `src/lib/site/domain-routing.test.ts` to `npm test`, then rerun the focused test. Expected: all domain-routing tests pass.

### Task 2: Apply the routing policy at the edge

**Files:**
- Modify: `src/middleware.ts`
- Modify: `src/lib/middleware-matcher.ts`
- Modify: `src/lib/middleware-matcher.test.ts`

- [ ] **Step 1: Change matcher expectations to include API routes**

The public host must reject admin APIs, so middleware must see `/api/*`. Update the matcher test to expect API routes to match while Next internals and static image assets remain excluded.

- [ ] **Step 2: Run the matcher test and confirm RED**

Run:

```bash
node --test --experimental-strip-types src/lib/middleware-matcher.test.ts
```

Expected: failure because the current matcher excludes API routes.

- [ ] **Step 3: Integrate the policy before existing middleware branches**

In `src/middleware.ts`, resolve the host route first:

```ts
const siteRoute = resolvePublicSiteRoute(request.nextUrl.hostname, pathname)
```

Apply outcomes as follows:

- `null`: continue through the existing MCN i18n/auth logic.
- `passthrough`: `NextResponse.next()` for `/api/site/applications`.
- `redirect`: preserve query parameters and return a permanent redirect to the clean public URL.
- `rewrite`: preserve query parameters, set `X-NEXT-INTL-LOCALE`, and rewrite internally to `/[locale]/site/*`.
- `not_found`: return a plain 404 without invoking an admin route or API handler.

Remove only `api` from the matcher negative lookahead, both in the exported test helper and the literal `config.matcher` required by Next's static analyzer.

- [ ] **Step 4: Run routing and matcher tests**

Run:

```bash
node --test --experimental-strip-types src/lib/site/domain-routing.test.ts src/lib/middleware-matcher.test.ts
```

Expected: all tests pass.

### Task 3: Keep navigation state correct on clean URLs

**Files:**
- Modify: `src/lib/site/nav.test.ts`
- Modify: `src/lib/site/nav.ts`

- [ ] **Step 1: Add failing clean-URL navigation tests**

Assert that `/`, `/news`, `/zh/news`, and `/en/recruit` activate the corresponding existing `/site` navigation entries, while unrelated paths remain inactive.

- [ ] **Step 2: Run the navigation test and confirm RED**

Run:

```bash
node --test --experimental-strip-types src/lib/site/nav.test.ts
```

Expected: clean public paths are not recognized yet.

- [ ] **Step 3: Normalize clean public paths before active-link comparison**

Extend `isNavActive` through a small normalization helper that maps public paths such as `/news` to `/site/news`, while preserving existing `/site/*` behavior.

- [ ] **Step 4: Run navigation tests**

Run the focused navigation test. Expected: all navigation tests pass.

### Task 4: Verify the completed deployment behavior

**Files:**
- Modify: `docs/public-site.md`

- [ ] **Step 1: Document the production host contract**

Record the clean URL mapping, Japanese default locale, application endpoint exception, and deny-by-default isolation for admin routes/APIs.

- [ ] **Step 2: Run the full verification suite**

Run:

```bash
npm test
npm run test:copy
npx tsc --noEmit
npm run build
```

Expected: all tests, copy/style gates, type checking, and production build pass.

- [ ] **Step 3: Review the final diff**

Confirm no user-owned changes in messages, site page components, media assets, or the running development log were altered.
