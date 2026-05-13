# Lightweight Next 30 Timeline Design

## Goal

Add a lightweight view to the strategic timeline module that answers one question quickly:

> What important milestones are coming up in the next 30 days?

The view should feel like a timeline, not a dashboard. It should prioritize temporal rhythm, upcoming risk, and quick access to milestone detail.

## User Context

The current `/timeline` page has list, Gantt, and progress curve views. Those are useful for full planning and reporting, but they are heavier than needed for a weekly management check-in. The user rejected repeated per-week statistics as visually bulky and preferred a lighter left-to-right time expression.

## Product Decision

Create a new `/timeline` view tab for upcoming milestones. The tab label should be `接下来 30 天` in the current product language style.

The tab displays a horizontal timeline from today to 30 days from today. Milestones are placed by `target_date`, so position carries the meaning. The design should keep statistics minimal.

## Layout

The view has three main regions:

1. Header controls
   - Title: `接下来 30 天`
   - Subtitle: a short phrase such as `按日期查看即将到来的战略节点`
   - Range switch: `14 / 30 / 90`, with `30` selected by default

2. Horizontal timeline
   - A single left-to-right axis from today to the selected range end
   - Date ticks at a small number of meaningful points, such as today, +7, +15, +30
   - Milestone nodes positioned by target date
   - Node cards or labels alternate above and below the axis to avoid overlap

3. Lightweight focus detail
   - Optional, shown when a milestone is selected or hovered
   - Displays only enough detail to support a next action:
     - title
     - target date / days left
     - owner agent
     - priority
     - status
     - risk level
     - short description when present

No per-week statistic blocks should be shown.

## Milestone Node Content

Each visible milestone node should show:

- title
- days left
- owner agent, when present
- a compact risk/status visual

Use color and shape instead of extra text where possible:

- red: missed, at risk, high risk, or overdue
- amber: high priority or approaching attention window
- green: completed or on track
- slate/gray: planned, low-risk, or informational
- hollow node: missing owner agent

Completed milestones remain visible by default in a subdued style so the upcoming timeline keeps continuity for review conversations.

## Data Rules

For the default 30-day range:

- Include milestones with `target_date >= todayStart` and `target_date <= todayStart + 30 days`.
- Sort by `target_date` ascending.
- Keep completed milestones unless the user later requests a hide-completed toggle.
- Compute days left consistently with the existing milestone API, but the implementation should avoid UTC date-shift bugs when converting date-only inputs and displaying dates.

The 14-day and 90-day controls use the same logic with different upper bounds.

## Overlap And Density

When milestones are close together:

- Allow labels/cards to alternate above and below the axis.
- If multiple milestones fall on the same day or within a very tight pixel distance, group them into a compact cluster marker.
- The cluster marker shows a count and opens a small popover or expanded list on hover/click.

The view should optimize for readability over showing every detail inline.

## Interactions

- Click a milestone node or card to navigate to `/timeline/[id]`.
- Hover a node to show a compact tooltip with date, status, priority, risk, and owner.
- Range switch updates the local view and refetches or filters milestone data.
- Empty state should be calm and useful: `未来 30 天暂无战略节点`.

## Component Boundary

Keep the implementation focused and testable:

- Add a `NextTimelineView` component under `src/components/milestones/` or colocate it near the timeline page if that is more consistent with current patterns.
- Extract pure helpers for:
  - date range building
  - filtering upcoming milestones
  - computing x-position
  - grouping dense milestones
  - mapping milestone state to visual style

The current `timeline/page.tsx` is already large, so avoid adding all helper logic inline if the implementation becomes non-trivial.

## Error Handling

- Loading state matches the existing timeline page style.
- API errors should show a small inline failure state rather than clearing the page silently.
- Invalid or missing dates should not crash the view; those milestones can be skipped from the axis and optionally logged in development.

## Testing

Add focused tests for the pure helper logic:

- filters milestones into 14/30/90 day ranges
- positions dates at the expected percentages across the axis
- groups milestones that land on the same day or tight date range
- maps status/risk/priority/owner state to the intended visual category

Manual verification:

- desktop view with several milestones across 30 days
- clustered milestones on the same date
- empty upcoming range
- mobile width behavior, likely horizontal scrolling

## Future Iterations

The first implementation should use the lightweight horizontal timeline as the primary view. It should not add weekly statistic cards. A future iteration can add a small summary or execution list only if the timeline alone proves insufficient in weekly use.
