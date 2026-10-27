# Migration Grant Guard Release Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close known permission-denied gaps in PR #368, verify it against current `main`, and release it.

**Architecture:** Extend the existing pure Node checker with ordered privilege accounting for newly created public tables and serial sequences. Keep runtime database verification in the README because repository static analysis cannot prove which SQL Editor statements were applied remotely.

**Tech Stack:** Node.js ES modules, `node:test`, GitHub Actions, Supabase SQL.

---

### Task 1: Prove current false negatives

**Files:** `scripts/migration-grants.test.mjs`

- [ ] Add one test each for `SELECT`-only table grant, grant then revoke, schema-wide grant before table creation, and a serial table without sequence `USAGE` or `UPDATE`.
- [ ] Run `node --test scripts/migration-grants.test.mjs`; confirm each new case fails for the expected missing privilege.

### Task 2: Calculate effective table and sequence privileges

**Files:** `scripts/migration-grants.mjs`, `scripts/check-migrations.mjs`, `scripts/migration-grants.test.mjs`

- [ ] Process SQL statements in source order, recording newly created tables and sequences and applying matching grants/revokes to the `service_role` role.
- [ ] Require table CRUD privileges; require sequence `USAGE` or `UPDATE` for serial/`nextval` columns; return actionable missing privilege diagnostics.
- [ ] Run `node --test scripts/migration-grants.test.mjs` and `npm run test:migrations`; expect zero failures.

### Task 3: Document remote checks

**Files:** `supabase/migrations/README.md`

- [ ] Explain table and sequence grants with least-privilege examples and the old-migration late-application risk.
- [ ] Replace anon-key OpenAPI verification with SQL Editor catalog checks and role-effective privilege checks.
- [ ] Verify the examples against official PostgreSQL and Supabase documentation.

### Task 4: Integrate and release

**Files:** PR #368 branch and GitHub/Vercel state

- [ ] Integrate current `main` into the PR branch and resolve any conflicts.
- [ ] Run the full repository verification commands, inspect the diff, and push the PR branch without force.
- [ ] Wait for PR checks, merge with an expected head SHA, and confirm `merged=true`.
- [ ] Confirm the resulting main commit's production Vercel status. Report remote Supabase audit as unverified unless it is read directly from the project.
