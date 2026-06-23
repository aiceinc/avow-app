/**
 * objects.ts — decorative / non-seating object presets for the seating planner
 * (v1.17.0). Each preset creates a labeled, movable, resizable table with
 * `kind: 'object'` and no seats (so no placemats, not a guest drop target).
 * Sizes are in canvas px (PX_PER_FOOT ≈ 23 → e.g. a 300px stage ≈ 13 ft wide).
 */

export type ObjectPreset = {
  key: string;
  label: string;
  shape: 'round' | 'rectangular';
  radius?: number;
  width?: number;
  height?: number;
};

export const OBJECT_PRESETS: ObjectPreset[] = [
  { key: 'cake',       label: 'Cake table',  shape: 'round',       radius: 34 },
  { key: 'gift',       label: 'Gift table',  shape: 'rectangular', width: 100, height: 55 },
  { key: 'guestbook',  label: 'Guestbook',   shape: 'rectangular', width: 100, height: 55 },
  { key: 'bar',        label: 'Bar',         shape: 'rectangular', width: 220, height: 70 },
  { key: 'stage',      label: 'Stage',       shape: 'rectangular', width: 300, height: 95 },
  { key: 'dancefloor', label: 'Dance floor', shape: 'rectangular', width: 280, height: 240 },
  { key: 'object',     label: 'Object',      shape: 'rectangular', width: 120, height: 80 },
];
