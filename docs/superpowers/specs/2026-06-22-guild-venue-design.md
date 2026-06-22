# Guild Venue 2D Layout Design

## Goal

Add a first-version 2D venue layout tool for offline guild room planning. The page should let managers place equipment, renovation areas, corridors, workstations, exits, and safety-related objects on a simple floor canvas without introducing CAD, 3D, multiplayer editing, approval workflows, or construction task linkage.

## Route And Navigation

- Add an app route at `src/app/[locale]/(app)/guild-venue/page.tsx`, available as `/zh/guild-venue`, `/en/guild-venue`, and other configured locales.
- Add a sidebar navigation entry for the venue tool using a Lucide icon.
- Do not add a standalone `/guild-venue.html` file because this project uses Next.js App Router and locale-aware app navigation.

## Layout Direction

Use the confirmed canvas-first layout:

- Top toolbar: venue/floor controls, add equipment, add area, add corridor, background plan controls, undo, redo, save, export.
- Left side: a narrow vertical tool rail for venue list, area list, object library, layers, and grid settings.
- Canvas center: the primary workspace, with a large grid-backed 2D floor area, zoom controls, selectable items, and an optional floor-plan background layer.
- Right side: a persistent inspector for the selected item.

On smaller screens, preserve access to the tool but allow horizontal scrolling or stacked panels rather than trying to make the full editor phone-optimized. The first version is primarily a desktop back-office workflow.

## Data Model

Keep data local and simple for the MVP:

```ts
type VenueLayout = {
  venueId: string
  name: string
  width: number
  height: number
  floors: VenueFloor[]
}

type VenueFloor = {
  id: string
  name: string
  width: number
  height: number
  backgroundImage?: string
  items: VenueItem[]
}

type VenueItem = {
  id: string
  type: 'equipment' | 'renovation' | 'area' | 'corridor' | 'workstation' | 'fire' | 'exit' | 'safety'
  name: string
  x: number
  y: number
  width: number
  height: number
  rotation: number
  status: 'planned' | 'in_progress' | 'completed' | 'maintenance'
  note: string
}
```

The initial data lives in `src/venue/layoutData.ts`. Runtime edits can persist to `localStorage` under a versioned key such as `guild-venue:layout:v1`. This keeps the first version usable without requiring a database migration.

## Canvas Technology

Use React + SVG for the first implementation.

Reasoning:

- The current project has no `konva` or `react-konva` dependency.
- The MVP shapes are rectangles/icons with basic selection, drag, zoom, rotation, and export. SVG is enough for this scope.
- Avoiding a new canvas dependency keeps build risk lower in the current dirty worktree.

The component boundary should still make it possible to replace the SVG canvas with Konva later if selection boxes, multi-select, or image export requirements become more advanced.

## Components

Create:

- `src/venue/layoutData.ts`: types, status/type options, sample venue data, localStorage helpers, and small pure update helpers.
- `src/venue/VenueCanvas.jsx`: canvas-first SVG editor surface. Owns pointer drag behavior, selection hit targets, zoom state, grid display, item rendering, and export helpers.
- `src/venue/VenueInspector.jsx`: right-side property editor. Updates name, type, status, x/y, width/height, rotation, and note.
- `src/app/[locale]/(app)/guild-venue/page.tsx`: page composition and undo/redo/save/export state management.

If TypeScript is practical during implementation, prefer `.tsx`/`.ts` for these files even though the initial request used `.jsx`; this codebase is predominantly TypeScript.

## Interactions

First version supports:

- Select an item by clicking it on the canvas or list.
- Drag selected items on the canvas.
- Edit position, dimensions, rotation, type, status, name, and note in the inspector.
- Add common object types from the toolbar.
- Zoom in/out and reset zoom.
- Toggle or display grid.
- Configure a background image URL/base64 string through a simple control.
- Undo/redo layout mutations within the current session.
- Save edits to browser localStorage.
- Export JSON by downloading the current layout.
- Export image as SVG download. PNG export can be added later if browser-side SVG rasterization is needed.

Out of scope for this version:

- Precise CAD units, snapping to real-world measurements, wall drawing, 3D, multiplayer, server persistence, approval flows, construction task linkage, permissioning beyond existing route access, and historical version UI.

## Error Handling

- If localStorage contains invalid JSON, ignore it and fall back to sample data.
- If no object is selected, the inspector shows an empty state and disables item controls.
- If export fails in the browser, show a small inline error near the toolbar.
- Keep background image optional; invalid image URLs should not break the canvas.

## Testing

Add focused tests for pure layout helpers:

- Add item creates a unique item with default size/status.
- Update item changes only the targeted item.
- Delete item clears selection if necessary.
- Undo/redo state transitions preserve previous and next layouts.
- Invalid persisted data falls back to the default layout.

Manual verification:

- Open `/zh/guild-venue` in the app.
- Add an item, drag it, edit inspector fields, rotate it, save, refresh, and confirm persisted state restores.
- Export JSON and SVG and confirm files contain the current item state.
