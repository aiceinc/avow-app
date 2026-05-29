/**
 * timeline.ts — time helpers for the Day-of Timeline module.
 *
 * Times are stored as minutes-from-midnight (0–1439). These helpers convert
 * to/from the native <input type="time"> "HH:MM" value and to a human 12-hour
 * display string. Single-day, no date/timezone (see schema).
 */

/** Normalize any minute value into the 0–1439 range. */
function norm(minutes: number): number {
  return (((Math.round(minutes) % 1440) + 1440) % 1440);
}

/** Format minutes-from-midnight as a 12-hour time, e.g. 930 → "3:30 PM". */
export function formatTime(minutes: number): string {
  const m = norm(minutes);
  const h24 = Math.floor(m / 60);
  const min = m % 60;
  const period = h24 < 12 ? 'AM' : 'PM';
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${String(min).padStart(2, '0')} ${period}`;
}

/** Convert minutes-from-midnight to a "HH:MM" 24h value for <input type="time">. */
export function minutesToInput(minutes: number): string {
  const m = norm(minutes);
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

/** Parse an <input type="time"> "HH:MM" value to minutes-from-midnight, or null. */
export function parseTimeInput(raw: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(raw.trim());
  if (!match) return null;
  const h = Number(match[1]);
  const min = Number(match[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}
