/**
 * templates.ts — predefined venue layout templates
 *
 * Each template's `build(canvasW, canvasH)` accepts the current canvas
 * dimensions so the layout is centred regardless of screen size.
 * Falls back to sensible defaults (1000 × 650) if not provided.
 */

import { TABLE_HEIGHT, SEAT_RADIUS, SEAT_GAP } from './geometry';

// Bounding radii for spacing (matching geometry.ts constants)
const TABLE_RADIUS = 58;
const TABLE_WIDTH  = 170;
const ROUND_R      = TABLE_RADIUS + SEAT_GAP + SEAT_RADIUS + 4; // ~82px — half-width with seats
const RECT_H       = TABLE_HEIGHT / 2 + SEAT_GAP + SEAT_RADIUS + 4; // ~69px — half-height with seats
const RECT_W       = TABLE_WIDTH  / 2 + SEAT_GAP + SEAT_RADIUS + 4; // ~99px — half-width with seats

type TableSpec = {
  shape:     'round' | 'rectangular';
  seatCount: number;
  x:         number;
  y:         number;
  rotation:  number;
  label?:    string;
};

// ── Templates ─────────────────────────────────────────────────────────────────

export const TEMPLATES = {

  'ten-round-tables': {
    label:       '10 round tables of 8',
    description: '5 × 2 grid of round 8-seat tables',

    build(canvasW = 1000, canvasH = 650): TableSpec[] {
      const cols        = 5;
      const rows        = 2;
      const colSpacing  = Math.min(Math.floor((canvasW * 0.85) / cols), 210);
      const rowSpacing  = Math.round(canvasH * 0.5);
      const totalW      = (cols - 1) * colSpacing;
      const totalH      = (rows - 1) * rowSpacing;
      const startX      = Math.round((canvasW - totalW) / 2);
      const startY      = Math.round((canvasH - totalH) / 2);

      return Array.from({ length: 10 }, (_, i) => ({
        shape:    'round',
        seatCount: 8,
        x:        startX + (i % cols)             * colSpacing,
        y:        startY + Math.floor(i / cols)   * rowSpacing,
        rotation: 0,
        label:    `Table ${i + 1}`,
      }));
    },
  },

  'u-shape': {
    label:       'U-shape head table + round tables',
    description: 'Head table at top, 8 round tables below in 2 rows of 4',

    build(canvasW = 1000, canvasH = 650): TableSpec[] {
      const tables: TableSpec[] = [];

      // Head table — centred horizontally near the top quarter
      const headX = Math.round(canvasW / 2);
      const headY = Math.round(canvasH * 0.18) + RECT_H;
      tables.push({
        shape:     'rectangular',
        seatCount: 8,
        x:         headX,
        y:         headY,
        rotation:  0,
        label:     'Head Table',
      });

      // 8 round tables: 4 per row, 2 rows, occupying bottom ~60% of canvas
      const cols       = 4;
      const colSpacing = Math.min(Math.floor((canvasW * 0.85) / cols), 215);
      const totalW     = (cols - 1) * colSpacing;
      const rowStartX  = Math.round((canvasW - totalW) / 2);
      const rowStartY  = headY + RECT_H + Math.round(canvasH * 0.12) + ROUND_R;
      const rowSpacing = Math.round(canvasH * 0.38);

      for (let i = 0; i < 8; i++) {
        const col = i % cols;
        const row = Math.floor(i / cols);
        tables.push({
          shape:     'round',
          seatCount: 8,
          x:         rowStartX + col * colSpacing,
          y:         rowStartY + row * rowSpacing,
          rotation:  0,
          label:     `Table ${i + 1}`,
        });
      }

      return tables;
    },
  },

  'classroom-rows': {
    label:       'Classroom rows',
    description: '12 rectangular tables in 3 rows of 4',

    build(canvasW = 1000, canvasH = 650): TableSpec[] {
      const cols        = 4;
      const rows        = 3;
      const colSpacing  = Math.min(Math.floor((canvasW * 0.88) / cols), 240);
      const rowSpacing  = Math.round(canvasH * 0.38);
      const totalW      = (cols - 1) * colSpacing;
      const totalH      = (rows - 1) * rowSpacing;
      const startX      = Math.round((canvasW - totalW) / 2);
      const startY      = Math.round((canvasH - totalH) / 2);

      return Array.from({ length: 12 }, (_, i) => ({
        shape:     'rectangular',
        seatCount: 6,
        x:         startX + (i % cols)             * colSpacing,
        y:         startY + Math.floor(i / cols)   * rowSpacing,
        rotation:  0,
        label:     `Table ${i + 1}`,
      }));
    },
  },

} as const;

export type TemplateKey = keyof typeof TEMPLATES;
