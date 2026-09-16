# Timeline grouped list implementation plan

**Goal:** Make strategic milestones scannable and connect the compact target-date timeline to expandable rows.

**Architecture:** Pure grouping/date/ruler helpers feed a dedicated list component. The list owns selection, expansion, deletion feedback, and the linked overview. The existing page remains responsible for loading, filters and alternate views.

**Tech stack:** Next.js, React, TypeScript, next-intl, existing Tailwind tokens and Node test runner.

1. Add `src/lib/milestones/list-view.ts` and behavioral tests for group order, completed precedence, business-day countdown, localized dates and collision grouping. Run tests red then green; register the test in package.json.
2. Add `MilestoneListView.tsx` with four shared grid tracks, expandable rows and an archived completed section. Reuse MilestoneTiming, translated metadata, current deletion endpoint, and surface failures. Keep existing task descriptions intact.
3. Add `MilestoneListOverview.tsx`: month ticks, today marker, numbered target-date markers, cluster selection. Pass selection to the list, expand the target and focus/scroll its row. Respect reduced motion.
4. Replace the page's local ListView with the new component, default to list and put it first among views. Scope legacy alert to other views to avoid duplicate list risk signals. Add matching zh/en/ja keys.
5. Run unit tests, TypeScript and copy/style/lint checks. Render actual components with fixture data for desktop/mobile and verify selection of a collapsed completed row. Run production build. Obtain spec and code review and resolve findings before delivery.

Approved design: `docs/superpowers/specs/2026-09-10-timeline-grouped-list.md`.
