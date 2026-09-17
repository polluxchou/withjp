# Expenses list grouping implementation plan

**Goal:** Make the expense list scannable — stop reprinting the same date, period, category and record id on every row, and surface the per-day subtotal the list was already able to compute.

**Architecture:** A pure sorting/grouping module feeds the existing list section. The page keeps loading, filters, charts and modals; `RecordRow` gains one opt-in prop so the six other pages that use it are untouched.

**Tech stack:** Next.js, React, TypeScript, next-intl, existing Tailwind tokens and the Node test runner.

1. Add `src/lib/expenses/grouping.ts` with behavioral tests covering sort direction, per-day grouping, subtotal suppression for single-row days, year-qualified labels across a year boundary, the daily alert threshold, and buyer grouping (ordering, row survival, trailing unassigned group). Run red then green; register the test file in package.json. — done
2. Give `RecordRow` opt-in props, all defaulting to today's behavior for the six other consumers: `hoverActions` (actions fade in on hover at `sm` and up), `stackOnNarrow` (below `sm`, the title takes its own line and amount/actions drop to a second one — with always-on actions a 375px row otherwise squeezes the title to zero width, so the name disappears entirely), `titleIcon`, and `amountAlert`.
3. Rework the list section of the expenses page: sort collapses to `date` / `amount` (each button toggles its own direction, `period` sorting removed), a separate toggle groups by buyer, day grouping applies when sorting by date. Group headers carry `MM/DD · N 笔` plus a subtotal from two rows up, flagged when the day reaches ¥100,000. Rows drop the record id, the status dot and the buyer column, and the category becomes an icon.
4. Add zh/en/ja keys for the new controls and group headers. The threshold marker gets its own sentence rather than reusing the orphaned `dailyAlert100k` chart-legend copy; the two share a number, not a string.
5. Add a changelog entry.
6. Verify: unit tests, tsc, lint, copy/style gates, production build, and the real page rendered at desktop and 375px widths.

Design agreed interactively through four rounds of mockups (grouping dimension, sort controls, group-header density, subtotal threshold); no separate spec document.
