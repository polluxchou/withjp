# Site Veil Text Color Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep the public site's top-left triangular veil text black (`#000000`) in both dark and light themes.

**Architecture:** Preserve `--site-on-accent` as the single semantic token consumed by `LogoVeil`. Remove the light-theme override so both themes inherit the root black value, and add a source-level regression test that locks the token cascade.

**Tech Stack:** Tailwind CSS, CSS custom properties, TypeScript, Node test runner.

---

## File map

- Create `src/lib/site/veil-theme.test.ts`: verify the root veil foreground is black and the light theme does not override it.
- Modify `src/app/globals.css`: remove the light-theme `--site-on-accent` override and update the explanatory comment.
- Modify `package.json`: register the new regression test in the full unit-test suite.

### Task 1: Lock and fix the veil text color

**Files:**
- Create: `src/lib/site/veil-theme.test.ts`
- Modify: `src/app/globals.css`
- Modify: `package.json`
- Test: `src/lib/site/veil-theme.test.ts`

- [ ] **Step 1: Write the failing regression test**

Read `src/app/globals.css`, extract the `:root` and `:root[data-theme='light']` blocks, assert that the root declares `--site-on-accent: #000000`, and assert that the light block does not declare `--site-on-accent`.

- [ ] **Step 2: Verify RED**

Run `node --test --experimental-strip-types src/lib/site/veil-theme.test.ts`.

Expected: one assertion fails because the light block currently declares `--site-on-accent: #ffffff`.

- [ ] **Step 3: Apply the minimal implementation**

Delete `--site-on-accent: #ffffff` from `:root[data-theme='light']`. Update the adjacent root comment to state that the accent foreground remains black in both themes.

- [ ] **Step 4: Register and verify GREEN**

Append `src/lib/site/veil-theme.test.ts` to the existing `test` script in `package.json`, preserving every existing test path. Run the targeted test and then `npm test`.

Expected: targeted test passes; full suite reports zero failures.

- [ ] **Step 5: Verify production output**

Run `npm run build`.

Expected: Next.js production build exits with status 0.
