/**
 * geometry.ts — pure math helpers for seat positioning
 *
 * Used in two places:
 *  1. SeatingCanvas.tsx — to position seat circles in the Konva layer
 *  2. Drop detection — to find which seat a dragged guest was dropped on
 *
 * All positions are in canvas pixels. Table coordinates (x, y) are the
 * centre of the table shape.
 */

// ── Visual constants ──────────────────────────────────────────────────────────

export const TABLE_RADIUS = 58;   // round table radius (px)
export const TABLE_WIDTH  = 170;  // rectangular table width (px)
export const TABLE_HEIGHT = 85;   // rectangular table height (px)
export const SEAT_RADIUS  = 14;   // radius of each seat circle (px)
export const SEAT_GAP     = 6;    // gap between table edge and seat centre (px)

// ── Types ─────────────────────────────────────────────────────────────────────

type TableShape = {
  shape: 'round' | 'rectangular';
  seatCount: number;
};

type TableWithPosition = TableShape & {
  x: number;
  y: number;
  rotation: number; // degrees
};

// ── Core helpers ──────────────────────────────────────────────────────────────

/**
 * Position of seat `seatIndex` relative to the table's centre, BEFORE rotation.
 *
 * Round tables: seats evenly distributed around the circumference, starting
 * from 12 o'clock.
 *
 * Rectangular tables: seats split evenly across the top and bottom long edges.
 * Top half gets the extra seat when seatCount is odd.
 */
export function getSeatLocalPosition(
  shape: 'round' | 'rectangular',
  seatCount: number,
  seatIndex: number
): { x: number; y: number } {
  if (shape === 'round') {
    const dist  = TABLE_RADIUS + SEAT_GAP + SEAT_RADIUS;
    const angle = ((2 * Math.PI * seatIndex) / seatCount) - Math.PI / 2;
    return {
      x: Math.cos(angle) * dist,
      y: Math.sin(angle) * dist,
    };
  }

  // Rectangular ─────────────────────────────────────────────────────────────
  const topCount = Math.ceil(seatCount / 2);
  const botCount = Math.floor(seatCount / 2);
  const yTop = -(TABLE_HEIGHT / 2 + SEAT_GAP + SEAT_RADIUS);
  const yBot =   TABLE_HEIGHT / 2 + SEAT_GAP + SEAT_RADIUS;

  if (seatIndex < topCount) {
    return {
      x: -TABLE_WIDTH / 2 + (TABLE_WIDTH / (topCount + 1)) * (seatIndex + 1),
      y: yTop,
    };
  } else {
    const i = seatIndex - topCount;
    return {
      x: -TABLE_WIDTH / 2 + (TABLE_WIDTH / (botCount + 1)) * (i + 1),
      y: yBot,
    };
  }
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
 * Absolute canvas position of a seat, accounting for the table's position
 * and rotation.
 */
export function getSeatAbsolutePosition(
  table: TableWithPosition,
  seatIndex: number
): { x: number; y: number } {
  const local   = getSeatLocalPosition(table.shape, table.seatCount, seatIndex);
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
