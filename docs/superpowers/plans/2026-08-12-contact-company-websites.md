# Contact Company Websites Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add clickable company website rows to Contact sections 01 and 02 in all three locales.

**Architecture:** Keep the URLs in the existing localized Contact row data. Extend the Contact row link discriminator with an external-link variant, resolve it in `buildContactSections`, and render external links in a new tab without changing email-link behavior.

**Tech Stack:** Next.js 14, React, TypeScript, next-intl, node:test

---

### Task 1: Lock the external-link data contract

**Files:**
- Modify: `src/lib/site/contact.test.ts`
- Test: `src/lib/site/contact.test.ts`

- [ ] Add a test that asserts the localized row labels, the two exact URLs, resolved `href` values, and unchanged Contact 03 email link.
- [ ] Run `node --test --experimental-strip-types src/lib/site/contact.test.ts` and confirm it fails because the website rows do not exist.

### Task 2: Add localized website rows and external-link resolution

**Files:**
- Modify: `messages/ja.json`
- Modify: `messages/zh.json`
- Modify: `messages/en.json`
- Modify: `src/lib/site/contact.ts`
- Test: `src/lib/site/contact.test.ts`

- [ ] Add `link: "external"` website rows to Contact 01 and 02 in all three message files.
- [ ] Extend `SiteContactRowCopy.link` to `'email' | 'external'` and map external links directly to their HTTPS values.
- [ ] Re-run the Contact test and confirm it passes.

### Task 3: Open company websites safely in a new tab

**Files:**
- Modify: `src/components/site/ContactSection.tsx`
- Test: `src/lib/site/contact.test.ts`

- [ ] Add `target="_blank"` and `rel="noreferrer"` only when `row.link === 'external'`.
- [ ] Run `npm run test:copy`, `npm test`, `npm run build`, and `git diff --check`; require successful exits.
- [ ] Publish the validated source through the repository's established production workflow and verify the deployed Contact page.
