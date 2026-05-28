'use client';

/**
 * SeatingCanvas — the Konva-powered venue floor plan canvas.
 *
 * Renders tables and their seats. Each table is a draggable Konva Group.
 * Seat assignment is handled via HTML5 drag-and-drop.
 *
 * Phase 2 additions:
 *   - Live cursor broadcasting + rendering.
 *   - FloatingEditPanel that follows the selected table during drag.
 *   - Rotate mode: click "Rotate" in the popup → drag the table to spin it
 *     around its centre instead of translating it. A crosshairs overlay shows
 *     the centre point and a dashed rotation ring.
 */

import { useRef, useEffect, useState, useCallback } from 'react';
import { Stage, Layer, Circle, Rect, Text, Group, Arrow, Line } from 'react-konva';
import { useMutation, useQuery } from 'convex/react';
import { useConvexAuth } from '@convex-dev/auth/react';
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

// ── Colour palette ─────────────────────────────────────────────────────────────
const C = {
  tableFill:          '#f8f4ef',
  tableStroke:        '#d4b896',
  tableStrokeSelect:  '#b08968',
  tableStrokeRotate:  '#3b82f6',
  seatEmpty:          '#ffffff',
  seatEmptyStroke:    '#d1d5db',
  seatOccupied:       '#b08968',
  seatOccupiedStroke: '#8a6848',
  labelText:          '#6b7280',
  guestText:          '#ffffff',
  canvasBg:           '#faf6f0',
};

const CURSOR_TTL_MS      = 4_000;
const CURSOR_THROTTLE_MS = 80;

// ── Pure math helpers ─────────────────────────────────────────────────────────

/** Angle in degrees from canvas point (cx,cy) to mouse (mx,my). */
function getAngleDeg(cx: number, cy: number, mx: number, my: number): number {
  return Math.atan2(my - cy, mx - cx) * (180 / Math.PI);
}

// ── RemoteCursor ───────────────────────────────────────────────────────────────

function RemoteCursor({ x, y, label, color }: {
  x: number; y: number; label: string; color: string;
}) {
  return (
    <Group x={0} y={0} listening={false}>
      <Arrow
        points={[x, y, x + 10, y + 14]}
        pointerLength={8} pointerWidth={8}
        fill={color} stroke="#ffffff" strokeWidth={1.5}
        listening={false}
      />
      <Rect
        x={x + 12} y={y + 2}
        width={label.length * 7 + 10} height={18}
        fill={color} cornerRadius={4} listening={false}
      />
      <Text
        x={x + 17} y={y + 5}
        text={label} fontSize={10} fill="#ffffff"
        fontFamily="system-ui, sans-serif" listening={false}
      />
    </Group>
  );
}

// ── TableNode ──────────────────────────────────────────────────────────────────

function TableNode({
  table, tableAssignments, guestMap,
  isSelected, isRotating, rotationOverride,
  onSelect, onMoveEnd, onDragMove, onSeatClick,
}: {
  table:             Doc<'tables'>;
  tableAssignments:  Doc<'seatAssignments'>[];
  guestMap:          Map<string, Doc<'guests'>>;
  isSelected:        boolean;
  isRotating:        boolean;
  rotationOverride?: number;
  onSelect:          () => void;
  onMoveEnd:         (x: number, y: number) => void;
  onDragMove?:       (x: number, y: number) => void;
  onSeatClick:       (seatIndex: number, guestId?: Id<'guests'>) => void;
}) {
  const seatMap = new Map<number, Doc<'seatAssignments'>>();
  for (const a of tableAssignments) seatMap.set(a.seatIndex, a);

  const rotation   = rotationOverride ?? table.rotation;
  const strokeColor = isRotating ? C.tableStrokeRotate : isSelected ? C.tableStrokeSelect : C.tableStroke;
  const strokeWidth = (isRotating || isSelected) ? 2 : 1.5;
  const dash        = isRotating ? ([5, 3] as number[]) : undefined;

  return (
    <Group
      x={table.x}
      y={table.y}
      rotation={rotation}
      draggable={!isRotating}
      onClick={e => { e.cancelBubble = true; onSelect(); }}
      onDragMove={e => onDragMove?.(e.target.x(), e.target.y())}
      onDragEnd={e => onMoveEnd(e.target.x(), e.target.y())}
    >
      {/* Table body */}
      {table.shape === 'round' ? (
        <Circle
          radius={TABLE_RADIUS}
          fill={C.tableFill} stroke={strokeColor} strokeWidth={strokeWidth} dash={dash}
        />
      ) : (
        <Rect
          x={-TABLE_WIDTH / 2} y={-TABLE_HEIGHT / 2}
          width={TABLE_WIDTH} height={TABLE_HEIGHT}
          fill={C.tableFill} stroke={strokeColor} strokeWidth={strokeWidth}
          cornerRadius={5} dash={dash}
        />
      )}

      {/* Label */}
      {table.label ? (
        <Text
          text={table.label} x={-60} y={-9} width={120}
          align="center" fontSize={11} fill={C.labelText}
          fontFamily="system-ui, sans-serif" listening={false}
        />
      ) : null}

      {/* Seats */}
      {Array.from({ length: table.seatCount }, (_, i) => {
        const local      = getSeatLocalPosition(table.shape, table.seatCount, i);
        const assignment = seatMap.get(i);
        const guest      = assignment ? guestMap.get(assignment.guestId) : undefined;
        return (
          <Group
            key={i} x={local.x} y={local.y}
            onClick={e => { e.cancelBubble = true; onSeatClick(i, guest?._id as Id<'guests'> | undefined); }}
          >
            <Circle
              radius={SEAT_RADIUS}
              fill={guest ? C.seatOccupied : C.seatEmpty}
              stroke={guest ? C.seatOccupiedStroke : C.seatEmptyStroke}
              strokeWidth={1}
            />
            {guest && (
              <Text
                text={guest.name.split(' ')[0]}
                x={-SEAT_RADIUS} y={-5} width={SEAT_RADIUS * 2}
                align="center" fontSize={7} fill={C.guestText}
                fontFamily="system-ui, sans-serif" listening={false}
              />
            )}
          </Group>
        );
      })}
    </Group>
  );
}

// ── FloatingEditPanel ──────────────────────────────────────────────────────────

/**
 * Small floating card rendered as an absolutely-positioned div over the canvas.
 * Tracks the table during a Konva drag (via liveDragX/Y) so it moves with it.
 * In rotate mode the Rotate button turns blue and shows "Drag to rotate".
 */
function FloatingEditPanel({
  table, liveDragX, liveDragY, canvasW, canvasH,
  label, seatCount, rotateMode,
  onLabel, onSeatCount, onToggleRotate, onCommitLabel, onCommitSeatCount, onDelete, onClose,
}: {
  table:              Doc<'tables'>;
  liveDragX?:         number;
  liveDragY?:         number;
  canvasW:            number;
  canvasH:            number;
  label:              string;
  seatCount:          number;
  rotateMode:         boolean;
  onLabel:            (v: string) => void;
  onSeatCount:        (v: number) => void;
  onToggleRotate:     () => void;
  onCommitLabel:      () => void;
  onCommitSeatCount:  (n: number) => void;
  onDelete:           () => void;
  onClose:            () => void;
}) {
  const POPUP_W = 165;
  const POPUP_H = 168; // approximate height for clamping

  // Follow the table during a drag
  const cx = liveDragX ?? table.x;
  const cy = liveDragY ?? table.y;

  // Anchor just to the right of the table, vertically centred on it
  const gap     = 6;
  const anchorX = table.shape === 'round'
    ? cx + TABLE_RADIUS + gap
    : cx + TABLE_WIDTH / 2 + gap;

  const left = Math.min(Math.max(anchorX, 8),           canvasW - POPUP_W - 8);
  const top  = Math.min(Math.max(cy - POPUP_H / 2, 8),  canvasH - POPUP_H - 8);

  return (
    <div
      style={{ position: 'absolute', left, top, width: POPUP_W, zIndex: 50 }}
      className="bg-white rounded-xl shadow-lg border border-gray-200 p-2.5"
      onClick={e => e.stopPropagation()}
      onMouseDown={e => e.stopPropagation()}
      onMouseMove={e => e.stopPropagation()}
    >
      {/* Label + close */}
      <div className="flex items-center justify-between mb-2.5">
        <input
          type="text"
          value={label}
          onChange={e => onLabel(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') onCommitLabel(); }}
          onBlur={onCommitLabel}
          placeholder="Table name"
          className="text-xs font-medium border-0 border-b border-gray-200 focus:outline-none focus:border-amber-400 bg-transparent w-full mr-2 pb-0.5"
        />
        <button onClick={onClose} className="text-gray-300 hover:text-gray-500 text-xs shrink-0">✕</button>
      </div>

      {/* Seat count — stepper */}
      <div className="flex items-center justify-between text-xs text-gray-500 mb-2.5">
        <span>Seats</span>
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              const n = Math.max(1, seatCount - 1);
              onSeatCount(n);
              onCommitSeatCount(n);
            }}
            className="w-5 h-5 flex items-center justify-center rounded border border-gray-200 text-gray-500 hover:bg-gray-100 transition-colors leading-none select-none"
          >−</button>
          <span className="w-5 text-center font-medium text-gray-800 tabular-nums">{seatCount}</span>
          <button
            onClick={() => {
              const n = Math.min(20, seatCount + 1);
              onSeatCount(n);
              onCommitSeatCount(n);
            }}
            className="w-5 h-5 flex items-center justify-center rounded border border-gray-200 text-gray-500 hover:bg-gray-100 transition-colors leading-none select-none"
          >+</button>
        </div>
      </div>

      {/* Rotate toggle — colour changes, text stays */}
      <button
        onClick={onToggleRotate}
        className={`w-full text-xs py-1.5 rounded-lg mb-2.5 border transition-colors ${
          rotateMode
            ? 'bg-blue-600 border-blue-600 text-white'
            : 'border-gray-200 text-gray-600 hover:bg-gray-50'
        }`}
      >
        ↺  Rotate
      </button>

      {/* Delete */}
      <button
        onClick={onDelete}
        className="w-full text-xs py-1.5 bg-red-50 text-red-600 border border-red-200 rounded-lg hover:bg-red-100 transition-colors"
      >
        Delete table
      </button>
    </div>
  );
}

// ── Props ──────────────────────────────────────────────────────────────────────

type Props = {
  workspaceId:        Id<'workspaces'>;
  tables:             Doc<'tables'>[];
  guests:             Doc<'guests'>[];
  assignments:        Doc<'seatAssignments'>[];
  draggingGuestId:    string | null;
  onAssignGuest:      (tableId: Id<'tables'>, seatIndex: number, guestId: Id<'guests'>) => void;
  onRequestUnassign:  (guestId: Id<'guests'>, guestName: string) => void;
  selectedTableId:    string | null;
  onSelectTable:      (id: string | null) => void;
  onSizeChange?:      (width: number, height: number) => void;
  editLabel:          string;
  editSeatCount:      number;
  onEditLabel:        (v: string) => void;
  onEditSeatCount:    (v: number) => void;
  onCommitLabel:      () => void;
  onCommitSeatCount:  (n: number) => void;
  onDeleteSelected:   () => void;
};

// ── SeatingCanvas ──────────────────────────────────────────────────────────────

export default function SeatingCanvas({
  workspaceId,
  tables,
  guests,
  assignments,
  draggingGuestId,
  onAssignGuest,
  onRequestUnassign,
  selectedTableId,
  onSelectTable,
  onSizeChange,
  editLabel,
  editSeatCount,
  onEditLabel,
  onEditSeatCount,
  onCommitLabel,
  onCommitSeatCount,
  onDeleteSelected,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 900, height: 600 });

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
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const selectedTable = tables.find(t => t._id === selectedTableId) ?? null;

  // ── Rotate-mode state ─────────────────────────────────────────────────────

  const [rotateMode,   setRotateMode]   = useState(false);
  const [liveRotation, setLiveRotation] = useState<number | null>(null);
  const [liveDragPos,  setLiveDragPos]  = useState<{ x: number; y: number } | null>(null);

  // Stable refs so window listeners don't go stale
  const rotateRef        = useRef<{ startAngle: number; baseRotation: number } | null>(null);
  const selectedTableRef = useRef(selectedTable);
  const liveRotationRef  = useRef(liveRotation);
  useEffect(() => { selectedTableRef.current = selectedTable; },  [selectedTable]);
  useEffect(() => { liveRotationRef.current  = liveRotation; },   [liveRotation]);

  // Reset rotate state whenever the selected table changes
  useEffect(() => {
    setRotateMode(false);
    setLiveRotation(null);
    setLiveDragPos(null);
    rotateRef.current = null;
  }, [selectedTableId]);

  // ── Convex table update (also used by rotation commit) ────────────────────

  const updateTable = useMutation(api.tables.update);

  // Window-level mouse handlers for rotation drag (capture even over the popup)
  useEffect(() => {
    if (!rotateMode) return;

    function onMove(e: MouseEvent) {
      const table = selectedTableRef.current;
      if (!rotateRef.current || !table) return;
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const mx    = e.clientX - rect.left;
      const my    = e.clientY - rect.top;
      const angle = getAngleDeg(table.x, table.y, mx, my);
      const delta = angle - rotateRef.current.startAngle;
      const rot   = ((rotateRef.current.baseRotation + delta) % 360 + 360) % 360;
      setLiveRotation(rot);
    }

    function onUp() {
      if (!rotateRef.current) return;
      rotateRef.current = null;
      const table = selectedTableRef.current;
      const rot   = liveRotationRef.current;
      if (table && rot !== null) {
        updateTable({ tableId: table._id, rotation: Math.round(rot) });
      }
    }

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup',   onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup',   onUp);
    };
  }, [rotateMode, updateTable]);

  // Start a rotation drag when the user mousedowns on/near the selected table
  const handleMouseDown = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!rotateMode || !selectedTable) return;
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const dx = mx - selectedTable.x;
      const dy = my - selectedTable.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const hitR = selectedTable.shape === 'round'
        ? TABLE_RADIUS + SEAT_RADIUS + 10
        : Math.sqrt((TABLE_WIDTH / 2) ** 2 + (TABLE_HEIGHT / 2) ** 2) + 10;
      if (dist < hitR) {
        const startAngle   = getAngleDeg(selectedTable.x, selectedTable.y, mx, my);
        const baseRotation = liveRotationRef.current ?? selectedTable.rotation;
        rotateRef.current  = { startAngle, baseRotation };
        e.preventDefault(); // avoid text selection while dragging
      }
    },
    [rotateMode, selectedTable]
  );

  // ── Build lookup maps ─────────────────────────────────────────────────────

  const guestMap = new Map(guests.map(g => [g._id as string, g]));

  const assignmentsByTable = new Map<string, Doc<'seatAssignments'>[]>();
  for (const a of assignments) {
    const arr = assignmentsByTable.get(a.tableId) ?? [];
    arr.push(a);
    assignmentsByTable.set(a.tableId, arr);
  }

  // ── Live cursor broadcasting ───────────────────────────────────────────────

  const { isAuthenticated } = useConvexAuth();
  const [myUserId, setMyUserId] = useState<string | null>(null);
  const meQuery = useQuery(api.workspaces.getMyUserId);
  useEffect(() => {
    if (meQuery?.userId) setMyUserId(meQuery.userId);
  }, [meQuery]);

  const myLabel      = meQuery?.email ? meQuery.email.split('@')[0] : 'User';
  const upsertCursor = useMutation(api.cursors.upsert);
  const removeCursor = useMutation(api.cursors.remove);
  const allCursors   = useQuery(api.cursors.list, { workspaceId }) ?? [];
  const lastCursorWriteRef = useRef<number>(0);

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!myUserId || !isAuthenticated) return;
      const now = Date.now();
      if (now - lastCursorWriteRef.current < CURSOR_THROTTLE_MS) return;
      lastCursorWriteRef.current = now;
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;
      upsertCursor({
        workspaceId,
        userId: myUserId,
        label:  myLabel,
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
        updatedAt: now,
      });
    },
    [upsertCursor, workspaceId, myUserId, myLabel, isAuthenticated]
  );

  useEffect(() => {
    if (!myUserId) return;
    const uid  = myUserId;
    const wsId = workspaceId;
    return () => { removeCursor({ workspaceId: wsId, userId: uid }); };
  }, [myUserId, workspaceId, removeCursor]);

  const now = Date.now();
  const remoteCursors = allCursors.filter(
    c => c.userId !== myUserId && now - c.updatedAt < CURSOR_TTL_MS
  );

  const PALETTE = ['#3b82f6', '#f97316', '#10b981', '#a855f7', '#ef4444', '#eab308'];
  const getCursorColor = (userId: string) => {
    let hash = 0;
    for (let i = 0; i < userId.length; i++) hash = (hash * 31 + userId.charCodeAt(i)) & 0xffffffff;
    return PALETTE[Math.abs(hash) % PALETTE.length];
  };

  // ── HTML5 drop handler ────────────────────────────────────────────────────

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      const guestId = e.dataTransfer.getData('guestId') as Id<'guests'>;
      if (!guestId) return;
      const rect = containerRef.current!.getBoundingClientRect();
      const hit  = findNearestSeat(tables, e.clientX - rect.left, e.clientY - rect.top);
      if (hit) onAssignGuest(hit.tableId as Id<'tables'>, hit.seatIndex, guestId);
    },
    [tables, onAssignGuest]
  );

  // ── Rotate-mode overlay constants ─────────────────────────────────────────

  const CROSS_EXTENT = 76; // how far the crosshair lines extend (px)

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div
      ref={containerRef}
      className="flex-1 overflow-hidden relative"
      style={{ background: C.canvasBg, cursor: rotateMode ? 'crosshair' : 'default' }}
      onDragOver={e => e.preventDefault()}
      onDrop={handleDrop}
      onMouseMove={handleMouseMove}
      onMouseDown={handleMouseDown}
    >
      {/* Empty-state hint */}
      {tables.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <p className="text-sm text-gray-400">Add a table or choose a template to get started</p>
        </div>
      )}

      {/* Guest-drop hint */}
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
        onClick={() => onSelectTable(null)}
      >
        {/* Tables layer */}
        <Layer>
          {tables.map(table => (
            <TableNode
              key={table._id}
              table={table}
              tableAssignments={assignmentsByTable.get(table._id) ?? []}
              guestMap={guestMap as Map<string, Doc<'guests'>>}
              isSelected={selectedTableId === table._id}
              isRotating={rotateMode && selectedTableId === table._id}
              rotationOverride={
                selectedTableId === table._id && liveRotation !== null
                  ? liveRotation
                  : undefined
              }
              onSelect={() => onSelectTable(table._id)}
              onMoveEnd={(x, y) => {
                setLiveDragPos(null);
                updateTable({ tableId: table._id, x, y });
              }}
              onDragMove={(x, y) => {
                if (selectedTableId === table._id) setLiveDragPos({ x, y });
              }}
              onSeatClick={(seatIndex, guestId) => {
                if (guestId) {
                  const name = guestMap.get(guestId)?.name ?? 'this guest';
                  onRequestUnassign(guestId, name);
                }
              }}
            />
          ))}
        </Layer>

        {/* Rotate-mode overlay: world-aligned crosshairs + ring */}
        {rotateMode && selectedTable && (
          <Layer listening={false}>
            <Group
              x={liveDragPos?.x ?? selectedTable.x}
              y={liveDragPos?.y ?? selectedTable.y}
            >
              {/* Horizontal + vertical crosshair lines (not rotated with table) */}
              <Line
                points={[-CROSS_EXTENT, 0, CROSS_EXTENT, 0]}
                stroke="#6b7280" strokeWidth={1} dash={[5, 4]}
              />
              <Line
                points={[0, -CROSS_EXTENT, 0, CROSS_EXTENT]}
                stroke="#6b7280" strokeWidth={1} dash={[5, 4]}
              />
              {/* Centre dot */}
              <Circle radius={4} fill="#3b82f6" />
              {/* Dashed rotation ring */}
              <Circle
                radius={
                  selectedTable.shape === 'round'
                    ? TABLE_RADIUS + 18
                    : Math.sqrt((TABLE_WIDTH / 2) ** 2 + (TABLE_HEIGHT / 2) ** 2) + 14
                }
                stroke="#3b82f6" strokeWidth={1} dash={[5, 4]} fill="transparent"
              />
            </Group>
          </Layer>
        )}

        {/* Cursor layer */}
        <Layer listening={false}>
          {remoteCursors.map(cursor => (
            <RemoteCursor
              key={cursor.userId}
              x={cursor.x} y={cursor.y}
              label={cursor.label}
              color={getCursorColor(cursor.userId)}
            />
          ))}
        </Layer>
      </Stage>

      {/* Floating edit panel — DOM layer above canvas */}
      {selectedTable && (
        <FloatingEditPanel
          table={selectedTable}
          liveDragX={liveDragPos?.x}
          liveDragY={liveDragPos?.y}
          canvasW={size.width}
          canvasH={size.height}
          label={editLabel}
          seatCount={editSeatCount}
          rotateMode={rotateMode}
          onLabel={onEditLabel}
          onSeatCount={onEditSeatCount}
          onToggleRotate={() => setRotateMode(r => !r)}
          onCommitLabel={onCommitLabel}
          onCommitSeatCount={onCommitSeatCount}
          onDelete={onDeleteSelected}
          onClose={() => onSelectTable(null)}
        />
      )}
    </div>
  );
}
