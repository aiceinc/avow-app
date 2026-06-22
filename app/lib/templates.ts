/**
 * templates.ts — predefined venue layout templates (v2 — guest-count aware).
 *
 * Each template's `build(canvasW, canvasH, targetSeats)` generates a layout sized
 * to seat ≈ `targetSeats` guests, arranged in the template's style and centred (or
 * top-left anchored for large counts that overflow the canvas — the canvas pans).
 * `plan(targetSeats)` returns the resulting table/seat counts cheaply, for the
 * picker's live "N tables · M seats" preview and the suggestion logic.
 *
 * Falls back to sensible canvas defaults (1000 × 650) if not provided.
 */

import { TABLE_HEIGHT, TABLE_WIDTH, TABLE_RADIUS, SEAT_RADIUS, SEAT_GAP } from './geometry';

// Bounding half-extents incl. seats (matching geometry.ts), used for spacing.
const ROUND_R = TABLE_RADIUS + SEAT_GAP + SEAT_RADIUS + 4;       // ~82px
const RECT_H  = TABLE_HEIGHT / 2 + SEAT_GAP + SEAT_RADIUS + 4;   // ~66px

// Centre-to-centre spacing so neighbouring tables (with seats) never overlap.
const ROUND_SPACING    = 2 * ROUND_R + 30;   // ~194px
const RECT_COL_SPACING = TABLE_WIDTH + 50;   // ~220px
const RECT_ROW_SPACING = 2 * RECT_H + 40;    // ~172px

type TableSpec = {
  shape:     'round' | 'rectangular';
  seatCount: number;
  x:         number;
  y:         number;
  rotation:  number;
  label?:    string;
};

export type LayoutPlan = { tableCount: number; totalSeats: number };

export type Template = {
  label: string;
  description: string;
  /** Resulting table + seat counts for a target, without building positions. */
  plan: (targetSeats: number) => LayoutPlan;
  /** The positioned tables for a target, sized to the canvas. */
  build: (canvasW: number, canvasH: number, targetSeats: number) => TableSpec[];
};

// ── Layout helper ─────────────────────────────────────────────────────────────

/**
 * Place `count` identical tables in a centred grid whose column count roughly
 * matches the canvas aspect ratio. Grids that fit the canvas are centred; larger
 * grids anchor top-left (with a margin) so every table stays in positive space
 * and the user pans to reach them.
 */
function grid(
  count: number,
  shape: 'round' | 'rectangular',
  seatCount: number,
  canvasW: number,
  canvasH: number,
  opts: { startY?: number; labelPrefix?: string } = {}
): TableSpec[] {
  if (count <= 0) return [];

  const colSpacing = shape === 'round' ? ROUND_SPACING : RECT_COL_SPACING;
  const rowSpacing = shape === 'round' ? ROUND_SPACING : RECT_ROW_SPACING;

  const aspect = canvasW / Math.max(1, canvasH);
  const cols = Math.max(1, Math.min(count, Math.round(Math.sqrt(count * aspect))));
  const rows = Math.ceil(count / cols);

  const gridW = (cols - 1) * colSpacing;
  const gridH = (rows - 1) * rowSpacing;

  const startX = gridW + 300 <= canvasW ? Math.round((canvasW - gridW) / 2) : 150;
  const startY =
    opts.startY ?? (gridH + 260 <= canvasH ? Math.round((canvasH - gridH) / 2) : 130);
  const prefix = opts.labelPrefix ?? 'Table';

  return Array.from({ length: count }, (_, i) => ({
    shape,
    seatCount,
    x: startX + (i % cols) * colSpacing,
    y: startY + Math.floor(i / cols) * rowSpacing,
    rotation: 0,
    label: `${prefix} ${i + 1}`,
  }));
}

/** A template of identical tables (round or rectangular) sized to the target. */
function uniform(
  label: string,
  description: string,
  shape: 'round' | 'rectangular',
  seatsPerTable: number
): Template {
  const countFor = (t: number) => Math.max(1, Math.ceil(Math.max(0, t) / seatsPerTable));
  return {
    label,
    description,
    plan: (t) => ({ tableCount: countFor(t), totalSeats: countFor(t) * seatsPerTable }),
    build: (w, h, t) => grid(countFor(t), shape, seatsPerTable, w, h),
  };
}

// ── Templates ─────────────────────────────────────────────────────────────────

export type TemplateKey =
  | 'rounds-8'
  | 'rounds-10'
  | 'rounds-6'
  | 'long-banquet'
  | 'classroom'
  | 'u-shape';

export const TEMPLATES: Record<TemplateKey, Template> = {
  'rounds-8': uniform(
    'Round tables of 8',
    'The classic — round 8-seat tables in a grid',
    'round',
    8
  ),

  'rounds-10': uniform(
    'Round tables of 10',
    'Banquet style — round 10-seat tables, fewer tables',
    'round',
    10
  ),

  'rounds-6': uniform(
    'Intimate rounds of 6',
    'Smaller round 6-seat tables for a cosy room',
    'round',
    6
  ),

  'long-banquet': uniform(
    'Long banquet tables',
    'Rectangular 8-seat banquet tables in rows',
    'rectangular',
    8
  ),

  'classroom': uniform(
    'Classroom rows',
    'Rectangular 6-seat tables in tidy rows',
    'rectangular',
    6
  ),

  'u-shape': {
    label: 'U-shape head table + rounds',
    description: 'Head table up top, round 8-seat tables for everyone else',
    plan: (t) => {
      const rounds = Math.ceil(Math.max(0, t - 8) / 8);
      return { tableCount: 1 + rounds, totalSeats: 8 + rounds * 8 };
    },
    build: (w, h, t) => {
      const rounds = Math.ceil(Math.max(0, t - 8) / 8);
      const head: TableSpec = {
        shape: 'rectangular',
        seatCount: 8,
        x: Math.round(w / 2),
        y: 140,
        rotation: 0,
        label: 'Head Table',
      };
      return [head, ...grid(rounds, 'round', 8, w, h, { startY: 320 })];
    },
  },
};

/**
 * Suggest the best-fit template for a guest count: round-8 for most weddings,
 * round-10 for larger rooms (fewer, fuller tables). A simple heuristic surfaced
 * as a "Suggested" badge in the picker — the couple can always pick another.
 */
export function suggestTemplateKey(targetSeats: number): TemplateKey {
  if (targetSeats <= 0) return 'rounds-8';
  if (targetSeats > 120) return 'rounds-10';
  return 'rounds-8';
}
