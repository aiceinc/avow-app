/**
 * objects.ts — decorative / non-seating object presets for the seating planner
 * (v1.17.0; grouped v1.18.3). Each preset creates a labeled, movable, resizable
 * table with `kind: 'object'` and no seats (so no placemats, not a guest drop
 * target). Sizes are in canvas px (PX_PER_FOOT ≈ 23 → a 300px stage ≈ 13 ft).
 *
 * `group` drives the sidebar grouping: 'table' (under "Tables", alongside the
 * round/rectangular guest tables), 'feature' (under "Features"), or 'other'
 * (the generic "+ New object" button).
 */

export type ObjectPreset = {
  key: string;
  label: string;
  group: 'table' | 'feature' | 'other';
  shape: 'round' | 'rectangular';
  radius?: number;
  width?: number;
  height?: number;
};

export const OBJECT_PRESETS: ObjectPreset[] = [
  { key: 'cake',       label: 'Cake table',   group: 'table',   shape: 'round',       radius: 34 },
  { key: 'gift',       label: 'Gift table',   group: 'table',   shape: 'rectangular', width: 100, height: 55 },
  { key: 'guestbook',  label: 'Guestbook',    group: 'table',   shape: 'rectangular', width: 100, height: 55 },
  { key: 'bar',        label: 'Bar',          group: 'feature', shape: 'rectangular', width: 220, height: 70 },
  { key: 'stage',      label: 'Stage',        group: 'feature', shape: 'rectangular', width: 300, height: 95 },
  { key: 'dancefloor', label: 'Dance Floor',  group: 'feature', shape: 'rectangular', width: 280, height: 240 },
  { key: 'djband',     label: 'DJ/Band Area', group: 'feature', shape: 'rectangular', width: 180, height: 120 },
  { key: 'object',     label: 'Object',       group: 'other',   shape: 'rectangular', width: 120, height: 80 },
];
