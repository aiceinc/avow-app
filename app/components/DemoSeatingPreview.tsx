'use client';

/**
 * DemoSeatingPreview — a static, read-only rendering of the example wedding's
 * seating layout, shown instead of the real interactive Seating Planner for a
 * locked, never-trialed workspace (WorkspaceContext.isDemo).
 *
 * Deliberately NOT the real SeatingCanvas: that component (~1,400 lines) has
 * no canEdit checks anywhere — drag/resize/rotate/add/delete are all wired
 * directly to Convex mutations with no read-only mode, because it's only ever
 * been reachable through the hard trial paywall. Retrofitting safe read-only
 * behavior into it is a real project of its own. This component instead has
 * zero mutation wiring by construction — plain divs, nothing to accidentally
 * expose.
 */

import { Doc } from '@/convex/_generated/dataModel';
import ObjectIcon from '@/app/components/ObjectIcon';

const CANVAS_W = 900;
const CANVAS_H = 660;

export default function DemoSeatingPreview({
  tables,
  guests,
  seatAssignments,
}: {
  tables: Doc<'tables'>[];
  guests: Doc<'guests'>[];
  seatAssignments: Doc<'seatAssignments'>[];
}) {
  const nameById = new Map(guests.map((g) => [g._id as string, g.name.split(' ')[0]]));
  const namesByTable = new Map<string, string[]>();
  for (const a of seatAssignments) {
    const list = namesByTable.get(a.tableId as string) ?? [];
    const name = nameById.get(a.guestId as string);
    if (name) list.push(name);
    namesByTable.set(a.tableId as string, list);
  }

  const seatingTables = tables.filter((t) => (t.kind ?? 'seating') === 'seating');
  const totalSeated = seatAssignments.length;
  const totalSeats = seatingTables.reduce((sum, t) => sum + t.seatCount, 0);

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-6xl mx-auto w-full px-6 py-6">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h1 className="font-serif text-2xl text-ink">Seating Planner</h1>
            <p className="text-sm text-ink-faint mt-0.5">
              {seatingTables.length} tables · {totalSeated}/{totalSeats} seats assigned · Example wedding
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_240px] gap-5">
          <div className="border border-rule rounded-xl bg-bg overflow-auto">
            <div className="relative mx-auto" style={{ width: CANVAS_W, height: CANVAS_H }}>
              {tables.map((t) => (
                <TableShape key={t._id} table={t} guestNames={namesByTable.get(t._id as string) ?? []} />
              ))}
            </div>
          </div>

          <div className="border border-rule rounded-xl bg-white/60 p-4 h-fit">
            <h2 className="text-xs font-semibold text-ink-faint uppercase tracking-wide mb-2">All guests</h2>
            <ul className="space-y-1.5 max-h-[560px] overflow-y-auto">
              {guests.map((g) => {
                const seated = seatAssignments.some((a) => a.guestId === g._id);
                return (
                  <li key={g._id} className="flex items-center justify-between gap-2 text-sm">
                    <span className="text-ink-soft truncate">{g.name}</span>
                    {seated ? (
                      <span className="text-[0.65rem] text-emerald-700 shrink-0">Seated</span>
                    ) : (
                      <span className="text-[0.65rem] text-ink-faint shrink-0">Unseated</span>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

function TableShape({ table, guestNames }: { table: Doc<'tables'>; guestNames: string[] }) {
  const isObject = (table.kind ?? 'seating') === 'object';

  if (isObject) {
    const w = table.width ?? (table.radius ? table.radius * 2 : 80);
    const h = table.height ?? (table.radius ? table.radius * 2 : 80);
    const rounded = table.shape === 'round' ? 'rounded-full' : 'rounded-lg';
    return (
      <div
        className={`absolute flex flex-col items-center justify-center gap-1 bg-bg-tint border border-accent-soft text-ink-soft ${rounded}`}
        style={{ left: table.x - w / 2, top: table.y - h / 2, width: w, height: h }}
      >
        {table.objectKind && <ObjectIcon name={table.objectKind} size={18} />}
        <span className="text-[0.65rem] font-medium">{table.label}</span>
      </div>
    );
  }

  const w = table.shape === 'round' ? (table.radius ?? 46) * 2 : (table.width ?? 160);
  const h = table.shape === 'round' ? (table.radius ?? 46) * 2 : (table.height ?? 60);
  const rounded = table.shape === 'round' ? 'rounded-full' : 'rounded-lg';

  return (
    <div className="absolute" style={{ left: table.x - w / 2, top: table.y - h / 2, width: w }}>
      <div
        className={`flex flex-col items-center justify-center bg-white border-2 border-accent text-center ${rounded}`}
        style={{ width: w, height: h }}
      >
        <span className="text-xs font-medium text-ink">{table.label}</span>
        <span className="text-[0.6rem] text-ink-faint">{guestNames.length}/{table.seatCount} seated</span>
      </div>
      {guestNames.length > 0 && (
        <div className="mt-1.5 text-[0.65rem] text-ink-soft text-center leading-snug">
          {guestNames.join(', ')}
        </div>
      )}
    </div>
  );
}
