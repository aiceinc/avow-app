'use client';

/**
 * SeatingCanvas — the Konva-powered venue floor plan canvas.
 *
 * Renders tables and their seats. Each table is a draggable Konva Group.
 * Seat assignment is handled via HTML5 drag-and-drop: the canvas container
 * div receives the drop, computes which seat was targeted using geometry
 * helpers, and fires onAssignGuest.
 *
 * NOTE: This component is loaded via Next.js `dynamic()` with `ssr: false`
 * because Konva requires `window`, which doesn't exist on the server.
 */

import { useRef, useEffect, useState, useCallback } from 'react';
import { Stage, Layer, Circle, Rect, Text, Group } from 'react-konva';
import { useMutation } from 'convex/react';
import { api } from '@/convex/_generated/api';
import { Doc, Id } from '@/convex/_generated/dataModel';
import {
  TABLE_RADIUS,
  TABLE_WIDTH,
  TABLE_HEIGHT,
  SEAT_RADIUS,
  getSeatLocalPosition,
  findNearestSeat,
} from '@/app/lib/geometry';

// ── Colour palette (warm neutrals matching Avow brand) ────────────────────────
const C = {
  tableFill:          '#f8f4ef',
  tableStroke:        '#d4b896',
  tableStrokeSelect:  '#b08968',
  seatEmpty:          '#ffffff',
  seatEmptyStroke:    '#d1d5db',
  seatOccupied:       '#b08968',
  seatOccupiedStroke: '#8a6848',
  labelText:          '#6b7280',
  guestText:          '#ffffff',
  canvasBg:           '#faf6f0',
};

// ── TableNode ─────────────────────────────────────────────────────────────────

/**
 * Renders a single table (shape + label + seats + guest names) as a Konva
 * Group. The Group is draggable; `onDragEnd` persists the new position to
 * Convex.
 */
function TableNode({
  table,
  tableAssignments,
  guestMap,
  isSelected,
  onSelect,
  onMoveEnd,
  onSeatClick,
}: {
  table:            Doc<'tables'>;
  tableAssignments: Doc<'seatAssignments'>[];
  guestMap:         Map<string, Doc<'guests'>>;
  isSelected:       boolean;
  onSelect:         () => void;
  onMoveEnd:        (x: number, y: number) => void;
  onSeatClick:      (seatIndex: number, guestId?: Id<'guests'>) => void;
}) {
  // Build seatIndex → assignment lookup for this table
  const seatMap = new Map<number, Doc<'seatAssignments'>>();
  for (const a of tableAssignments) {
    seatMap.set(a.seatIndex, a);
  }

  const strokeColor = isSelected ? C.tableStrokeSelect : C.tableStroke;
  const strokeWidth = isSelected ? 2.5 : 1.5;

  return (
    <Group
      x={table.x}
      y={table.y}
      rotation={table.rotation}
      draggable
      onClick={e => {
        e.cancelBubble = true; // prevent Stage click from deselecting immediately
        onSelect();
      }}
      onDragEnd={e => onMoveEnd(e.target.x(), e.target.y())}
    >
      {/* ── Table body ── */}
      {table.shape === 'round' ? (
        <Circle
          radius={TABLE_RADIUS}
          fill={C.tableFill}
          stroke={strokeColor}
          strokeWidth={strokeWidth}
        />
      ) : (
        <Rect
          x={-TABLE_WIDTH / 2}
          y={-TABLE_HEIGHT / 2}
          width={TABLE_WIDTH}
          height={TABLE_HEIGHT}
          fill={C.tableFill}
          stroke={strokeColor}
          strokeWidth={strokeWidth}
          cornerRadius={5}
        />
      )}

      {/* ── Table label ── */}
      {table.label ? (
        <Text
          text={table.label}
          x={-60}
          y={-9}
          width={120}
          align="center"
          fontSize={11}
          fill={C.labelText}
          fontFamily="system-ui, sans-serif"
          listening={false}
        />
      ) : null}

      {/* ── Seats ── */}
      {Array.from({ length: table.seatCount }, (_, i) => {
        const local      = getSeatLocalPosition(table.shape, table.seatCount, i);
        const assignment = seatMap.get(i);
        const guest      = assignment ? guestMap.get(assignment.guestId) : undefined;

        return (
          <Group
            key={i}
            x={local.x}
            y={local.y}
            onClick={e => {
              e.cancelBubble = true;
              onSeatClick(i, guest?._id as Id<'guests'> | undefined);
            }}
          >
            <Circle
              radius={SEAT_RADIUS}
              fill={guest ? C.seatOccupied : C.seatEmpty}
              stroke={guest ? C.seatOccupiedStroke : C.seatEmptyStroke}
              strokeWidth={1}
            />
            {/* First name only — seats are small */}
            {guest && (
              <Text
                text={guest.name.split(' ')[0]}
                x={-SEAT_RADIUS}
                y={-5}
                width={SEAT_RADIUS * 2}
                align="center"
                fontSize={7}
                fill={C.guestText}
                fontFamily="system-ui, sans-serif"
                listening={false}
              />
            )}
          </Group>
        );
      })}
    </Group>
  );
}

// ── SeatingCanvas ─────────────────────────────────────────────────────────────

type Props = {
  tables:             Doc<'tables'>[];
  guests:             Doc<'guests'>[];
  assignments:        Doc<'seatAssignments'>[];
  draggingGuestId:    string | null;
  onAssignGuest:      (tableId: Id<'tables'>, seatIndex: number, guestId: Id<'guests'>) => void;
  onRequestUnassign:  (guestId: Id<'guests'>, guestName: string) => void;
  selectedTableId:    string | null;
  onSelectTable:      (id: string | null) => void;
  onSizeChange?:      (width: number, height: number) => void;
};

export default function SeatingCanvas({
  tables,
  guests,
  assignments,
  draggingGuestId,
  onAssignGuest,
  onRequestUnassign,
  selectedTableId,
  onSelectTable,
  onSizeChange,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 900, height: 600 });

  // Fill the container — respond to window/layout resize
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const report = (w: number, h: number) => {
      setSize({ width: w, height: h });
      onSizeChange?.(w, h);
    };
    const ro = new ResizeObserver(() => report(el.offsetWidth, el.offsetHeight));
    ro.observe(el);
    report(el.offsetWidth, el.offsetHeight);
    return () => ro.disconnect();
  }, []);

  // Build lookup maps from query results
  const guestMap = new Map(guests.map(g => [g._id as string, g]));

  const assignmentsByTable = new Map<string, Doc<'seatAssignments'>[]>();
  for (const a of assignments) {
    const arr = assignmentsByTable.get(a.tableId) ?? [];
    arr.push(a);
    assignmentsByTable.set(a.tableId, arr);
  }

  // Mutations called directly when table position changes via drag
  const updateTable = useMutation(api.tables.update);

  // ── Drop handler: HTML5 drag from guest panel ──────────────────────────────
  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      const guestId = e.dataTransfer.getData('guestId') as Id<'guests'>;
      if (!guestId) return;

      // Convert browser coordinates → canvas-local coordinates
      const rect = containerRef.current!.getBoundingClientRect();
      const px   = e.clientX - rect.left;
      const py   = e.clientY - rect.top;

      const hit = findNearestSeat(tables, px, py);
      if (hit) {
        onAssignGuest(hit.tableId as Id<'tables'>, hit.seatIndex, guestId);
      }
    },
    [tables, onAssignGuest]
  );

  return (
    <div
      ref={containerRef}
      className="flex-1 overflow-hidden relative"
      style={{ background: C.canvasBg }}
      onDragOver={e => e.preventDefault()} // required to allow drop
      onDrop={handleDrop}
    >
      {/* Empty state hint */}
      {tables.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <p className="text-sm text-gray-400">
            Add a table or choose a template to get started
          </p>
        </div>
      )}

      {/* Drop-target hint while dragging a guest */}
      {draggingGuestId && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-10 pointer-events-none">
          <span className="bg-amber-50 border border-amber-200 text-amber-700 text-xs px-3 py-1.5 rounded-full shadow-sm">
            Drop on a seat to assign
          </span>
        </div>
      )}

      <Stage
        width={size.width}
        height={size.height}
        onClick={() => onSelectTable(null)} // click empty canvas → deselect
      >
        <Layer>
          {tables.map(table => (
            <TableNode
              key={table._id}
              table={table}
              tableAssignments={assignmentsByTable.get(table._id) ?? []}
              guestMap={guestMap as Map<string, Doc<'guests'>>}
              isSelected={selectedTableId === table._id}
              onSelect={() => onSelectTable(table._id)}
              onMoveEnd={(x, y) =>
                updateTable({ tableId: table._id, x, y })
              }
              onSeatClick={(seatIndex, guestId) => {
                if (guestId) {
                  const name = guestMap.get(guestId)?.name ?? 'this guest';
                  onRequestUnassign(guestId, name);
                }
              }}
            />
          ))}
        </Layer>
      </Stage>
    </div>
  );
}
