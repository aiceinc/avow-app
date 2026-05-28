# Avow Seating Planner — Phase 1 Prototype Notes

**Date completed:** May 2026  
**Status:** Phase 1 complete. All §4 capabilities working end-to-end.

---

## Day 1 Validation Gate: PASSED

The core risk the brief was testing — whether Claude Code can write Convex code reliably — is answered.

**Result:** All Convex schema, queries, and mutations compiled on the first deploy with no errors. No correction cycles were needed. The three validation questions from §3:

1. **Did queries/mutations work first time?** Yes. All five backend files (`schema.ts`, `guests.ts`, `tables.ts`, `seatAssignments.ts`, `seed.ts`) were accepted by the Convex CLI immediately after writing. No validator errors, no type errors, no runtime failures.

2. **Were there Convex-specific patterns that Claude consistently got wrong?** No. The `v` schema builder, indexes, `withIndex`, `.unique()`, and the `internalMutation` / `mutation` distinction were all used correctly. The generated `guidelines.md` file (installed via `npx convex ai-files install`) was a significant help — it overrides training data with current Convex patterns and is clearly designed for exactly this purpose.

3. **When the Convex CLI emitted errors, could Claude debug without flailing?** Not tested — no errors were emitted. The feedback loop (save file → Convex terminal updates in ~3 seconds) is fast enough that friction would surface quickly if it existed.

**Conclusion:** Stack risk is cleared. Proceed to Phase 2.

---

## What Was Built

A single-user seating planner with full persistence. Capabilities delivered:

- **Canvas** — react-konva, fills available viewport, responsive to window resize
- **Tables** — round and rectangular, draggable, rotatable (via edit bar), label/seat count editable, deletable
- **Templates** — 3 layouts (10 round tables 5×2, U-shape head table + rounds, classroom rows), each canvas-centred using actual measured canvas dimensions
- **Seat rendering** — seats evenly spaced around table perimeter, occupied seats show guest first names
- **Guest panel** — 18 pre-seeded guests, grouped by unassigned/seated, colour-coded by Partner A / Partner B / both, dietary indicator
- **Drag assignment** — HTML5 drag from guest panel to canvas seat, nearest-seat hit detection with threshold
- **Unassign** — click any occupied seat, confirm via custom modal
- **Uniqueness enforcement** — a guest can only occupy one seat; a seat can only hold one guest. Both constraints enforced atomically in the Convex mutation layer
- **Persistence** — all state in Convex; full refresh restores exact layout

---

## What Worked Smoothly

- **Convex schema and data model** — the three-table design (`guests`, `tables`, `seatAssignments`) maps cleanly onto the feature. No surprises.
- **Seat assignment uniqueness** — implementing "evict occupant, evict existing guest assignment, then insert" in a single mutation transaction was straightforward and works correctly.
- **react-konva for the canvas** — the right library choice. Konva's built-in drag handling for the table Group nodes meant table repositioning was ~10 lines of code. The `onDragEnd` → Convex mutation pattern is clean.
- **HTML5 drag API for guest-to-seat assignment** — storing `guestId` in `dataTransfer` and doing nearest-seat geometry on drop worked reliably. No additional DnD library needed.
- **Geometry helpers as pure functions** — extracting seat position math into `app/lib/geometry.ts` (shared between canvas rendering and drop detection) was the right call. Both uses of the same calculation stay in sync automatically.
- **Convex real-time subscriptions** — `useQuery` hooks update the UI instantly when any mutation fires. No manual cache invalidation, no polling.

---

## What Had Friction

**1. Template layout positioning**  
Initial templates used a fixed left margin (`MARGIN = 100px`), which placed all tables in the left ~30% of a typical widescreen canvas. Fix: added an `onSizeChange` callback prop to `SeatingCanvas` that reports measured dimensions to `page.tsx`, then passes them to `TEMPLATES[key].build(canvasW, canvasH)`. Templates now compute centred positions at runtime. Minor but real — templates need to know their canvas.

**2. Dark mode CSS bleeding into light UI**  
The Next.js scaffold includes a `@media (prefers-color-scheme: dark)` block that sets `--foreground: #ededed`. The "Use Template" button had no explicit text colour, so on machines with dark mode enabled, the text was near-white on a white background — invisible. Fix: explicit `text-gray-700` on the button, dark mode CSS removed from `globals.css`. Reminder: always set explicit text colours on interactive elements; never rely on inherited `--foreground`.

**3. Browser `confirm()` dialogs**  
The native browser confirmation popups (unassign, delete table, clear layout) are styled inconsistently with the rest of the UI and can't be customised. Replaced with a custom `ConfirmModal` component. This required lifting confirmation state up to `page.tsx` and threading callbacks through props. Not painful, but took ~30 minutes to refactor cleanly.

**4. JSX fragment + Turbopack parse error**  
Placing the modal outside the main `<div>` using a `<>` fragment caused a Turbopack parse error (`Expected ',', got '{'`). The root cause appears to be a Turbopack-specific issue with Unicode characters (`──`) in JSX comments adjacent to a fragment boundary. Fix: moved the modal inside the main div (valid because it's `position: fixed` and renders on top regardless of DOM position). Worth knowing for future: keep `<>` fragments simple and avoid non-ASCII in adjacent JSX comments when using Turbopack.

---

## Architecture Notes for Phase 2

The schema and mutations were designed with Phase 2 (multi-user editing) in mind, per §7 of the brief.

- **No application-layer locking** — the `assign` mutation uses Convex's transactional guarantees to atomically evict a seat occupant and assign a new guest. Under concurrent writes (two users dragging simultaneously), Convex serialises transactions correctly. No additional locking needed.
- **seatAssignments as a separate table** — the brief's guideline ("do not store unbounded lists as array fields") was followed. This table will scale cleanly and supports Phase 2 queries like "show me all assignments in real-time."
- **Canvas state is Convex state** — table positions, rotations, seat counts are all in the database, not local React state. When Phase 2 adds a second user, their changes will appear instantly on the first user's canvas via Convex's reactive queries. The canvas component already handles this correctly because it re-renders on every `useQuery` update.
- **`guestMap` and `assignmentsByTable` are derived on render** — both are computed from the raw Convex query results each render. When Phase 2 adds auth and workspaces, the queries will just take a `workspaceId` argument and everything downstream works without structural changes.

---

## Known Limitations (Phase 1 scope, not bugs)

- **No pan/zoom on the canvas.** Large layouts (10+ tables) may extend beyond the visible area on smaller screens. Tables can be dragged to reposition but there's no viewport navigation. Phase 2 (or a Phase 1.5 polish pass) should add pan/zoom.
- **No guest management UI.** Guests are seeded and read-only. Adding, editing, or removing guests requires manual Convex dashboard intervention.
- **Seat names are first-name only, small.** Seats are 14px radius circles — not much space. At scale, the canvas will feel dense. A hover tooltip showing the full name would help.
- **Single workspace, no auth.** Anyone who accesses localhost:3000 sees and edits the same data. Intentional for Phase 1.
- **No deployment.** Runs locally only.

---

## Recommendation

**Proceed to Phase 2.**

The stack works. Convex + Next.js + react-konva is a viable foundation for the real product. The Day 1 validation gate cleared cleanly, the seating planner UX is buildable and usable, and the architecture is already oriented toward multi-user editing. None of the friction points encountered were fundamental — they were all surface-level issues (CSS, fragment syntax, template positioning) that were resolved quickly.

The highest-risk item for Phase 2 is **live cursors on the canvas** — showing where another user is hovering in real-time without flooding Convex with cursor-position mutations. This should be the first thing validated in Phase 2, before building out auth and presence fully.

---

*Avow — AICE Inc. internal prototype documentation*
