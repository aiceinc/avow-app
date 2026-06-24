/**
 * geometry.ts — pure math helpers for seat positioning
 *
 * Used in two places:
 *  1. SeatingCanvas.tsx — to position seat circles in the Konva layer
 *  2. Drop detection — to find which seat a dragged guest was dropped on
 *
 * All positions are in canvas pixels. Table coordinates (x, y) are the
 * centre of the table shape.
 *
 * Tables may carry their own dimensions (radius / width / height) once they've
 * been resized. When those are absent we fall back to the default constants.
 */

// ── Visual constants ──────────────────────────────────────────────────────────

export const TABLE_RADIUS = 58;   // default round table radius (px)
export const TABLE_WIDTH  = 170;  // default rectangular table width (px)
export const TABLE_HEIGHT = 85;   // default rectangular table height (px)
export const SEAT_RADIUS  = 14;   // radius of each seat circle (px)
export const SEAT_GAP     = 6;    // gap between table edge and seat centre (px)

// ── Real-world scale ──────────────────────────────────────────────────────────
// Canvas pixels → feet, chosen so the default round table (Ø116px) reads ~5.0 ft
// (a standard 60" round) and the default rectangular table (170×85px) ~7.4×3.7 ft.
export const PX_PER_FOOT = 23;

/** Format a pixel length as feet with one decimal, e.g. 116 → "5.0". */
export function pxToFeetLabel(px: number): string {
  return (px / PX_PER_FOOT).toFixed(1);
}

// ── Resize clamps ───────────────────────────────────────────────────────────
// Minimums are 2 ft (= 2 × PX_PER_FOOT): a 2 ft min diameter for round shapes
// (radius ≥ 1 ft) and a 2 ft × 2 ft floor for rectangular ones. Applies to guest
// tables and to decorative objects/features alike.
export const MIN_RADIUS = PX_PER_FOOT;       // 1 ft radius → 2 ft diameter
export const MAX_RADIUS = 150;
export const MIN_RECT_W = 2 * PX_PER_FOOT;   // 2 ft
export const MAX_RECT_W = 460;
export const MIN_RECT_H = 2 * PX_PER_FOOT;   // 2 ft
export const MAX_RECT_H = 320;

// ── Types ─────────────────────────────────────────────────────────────────────

export type TableDims = {
  radius?: number;
  width?: number;
  height?: number;
};

type TableShape = {
  shape: 'round' | 'rectangular';
  seatCount: number;
} & TableDims;

type TableWithPosition = TableShape & {
  x: number;
  y: number;
  rotation: number; // degrees
};

// ── Effective-dimension helpers ─────────────────────────────────────────────

export function getRadius(dims?: TableDims): number {
  return dims?.radius ?? TABLE_RADIUS;
}
export function getWidth(dims?: TableDims): number {
  return dims?.width ?? TABLE_WIDTH;
}
export function getHeight(dims?: TableDims): number {
  return dims?.height ?? TABLE_HEIGHT;
}

export function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

// ── Core helpers ──────────────────────────────────────────────────────────────

/**
 * Position of seat `seatIndex` relative to the table's centre, BEFORE rotation.
 *
 * Round tables: seats evenly distributed around the circumference, starting
 * from 12 o'clock.
 *
 * Rectangular tables: seats split evenly across the top and bottom long edges.
 * Top half gets the extra seat when seatCount is odd.
 *
 * `dims` overrides the default size (used for resized tables and for live
 * preview while a resize drag is in progress).
 */
export function getSeatLocalPosition(
  shape: 'round' | 'rectangular',
  seatCount: number,
  seatIndex: number,
  dims?: TableDims
): { x: number; y: number } {
  if (shape === 'round') {
    const dist  = getRadius(dims) + SEAT_GAP + SEAT_RADIUS;
    const angle = ((2 * Math.PI * seatIndex) / seatCount) - Math.PI / 2;
    return {
      x: Math.cos(angle) * dist,
      y: Math.sin(angle) * dist,
    };
  }

  // Rectangular ─────────────────────────────────────────────────────────────
  const w = getWidth(dims);
  const h = getHeight(dims);
  const topCount = Math.ceil(seatCount / 2);
  const botCount = Math.floor(seatCount / 2);
  const yTop = -(h / 2 + SEAT_GAP + SEAT_RADIUS);
  const yBot =   h / 2 + SEAT_GAP + SEAT_RADIUS;

  if (seatIndex < topCount) {
    return {
      x: -w / 2 + (w / (topCount + 1)) * (seatIndex + 1),
      y: yTop,
    };
  } else {
    const i = seatIndex - topCount;
    return {
      x: -w / 2 + (w / (botCount + 1)) * (i + 1),
      y: yBot,
    };
  }
}

// ── Placemats ─────────────────────────────────────────────────────────────────
// A small place-setting (napkin + plate + cutlery) drawn ON the table surface, in
// front of each seat, just inside the table edge. Rotates with the table.
export const PLACEMAT_W = 22;
export const PLACEMAT_H = 15;
const PLACEMAT_INSET = 13; // distance from the table edge inward to the placemat centre

/**
 * Local position + facing (degrees) of the placemat for `seatIndex`, BEFORE the
 * table's own rotation. Mirrors getSeatLocalPosition but sits inside the edge and
 * is oriented tangentially so the setting faces the table centre.
 */
export function getPlacematPosition(
  shape: 'round' | 'rectangular',
  seatCount: number,
  seatIndex: number,
  dims?: TableDims
): { x: number; y: number; rotation: number } {
  if (shape === 'round') {
    const dist  = Math.max(8, getRadius(dims) - PLACEMAT_INSET);
    const angle = ((2 * Math.PI * seatIndex) / seatCount) - Math.PI / 2;
    return {
      x: Math.cos(angle) * dist,
      y: Math.sin(angle) * dist,
      rotation: (angle * 180) / Math.PI + 90, // tangential to the rim
    };
  }

  const w = getWidth(dims);
  const h = getHeight(dims);
  const topCount = Math.ceil(seatCount / 2);
  const botCount = Math.floor(seatCount / 2);
  if (seatIndex < topCount) {
    return {
      x: -w / 2 + (w / (topCount + 1)) * (seatIndex + 1),
      y: -(h / 2 - PLACEMAT_INSET),
      rotation: 0,
    };
  }
  const i = seatIndex - topCount;
  return {
    x: -w / 2 + (w / (botCount + 1)) * (i + 1),
    y: h / 2 - PLACEMAT_INSET,
    rotation: 180,
  };
}

/**
 * Rotate point (x, y) around the origin by `deg` degrees.
 */
function rotatePoint(x: number, y: number, deg: number): { x: number; y: number } {
  const rad = (deg * Math.PI) / 180;
  return {
    x: x * Math.cos(rad) - y * Math.sin(rad),
    y: x * Math.sin(rad) + y * Math.cos(rad),
  };
}

/**
 * Absolute canvas position of a seat, accounting for the table's position,
 * size, and rotation.
 */
export function getSeatAbsolutePosition(
  table: TableWithPosition,
  seatIndex: number
): { x: number; y: number } {
  const local   = getSeatLocalPosition(table.shape, table.seatCount, seatIndex, table);
  const rotated = rotatePoint(local.x, local.y, table.rotation);
  return { x: table.x + rotated.x, y: table.y + rotated.y };
}

/**
 * Given a canvas point (px, py), return the (tableId, seatIndex) of the
 * nearest seat within `threshold` pixels, or null if none is close enough.
 *
 * Used during guest-drag drop handling to determine which seat was targeted.
 */
export function findNearestSeat(
  tables: Array<TableWithPosition & { _id: string }>,
  px: number,
  py: number,
  threshold = SEAT_RADIUS * 2.5
): { tableId: string; seatIndex: number } | null {
  let best: { tableId: string; seatIndex: number } | null = null;
  let bestDist = threshold;

  for (const table of tables) {
    for (let i = 0; i < table.seatCount; i++) {
      const pos  = getSeatAbsolutePosition(table, i);
      const dist = Math.sqrt((pos.x - px) ** 2 + (pos.y - py) ** 2);
      if (dist < bestDist) {
        bestDist = dist;
        best = { tableId: table._id, seatIndex: i };
      }
    }
  }

  return best;
}
