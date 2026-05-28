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
  SEAT_RADIUS,
  MIN_RADIUS, MAX_RADIUS,
  MIN_RECT_W, MAX_RECT_W,
  MIN_RECT_H, MAX_RECT_H,
  getRadius, getWidth, getHeight,
  clamp,
  getSeatLocalPosition,
  findNearestSeat,
  type TableDims,
} from '@/app/lib/geometry';

// Table properties copied via "Copy table" and reproduced when the ghost is dropped.
type ClipboardTable = {
  shape:      'round' | 'rectangular';
  seatCount:  number;
  rotation:   number;
  radius?:    number;
  width?:     number;
  height?:    number;
};

// ── Colour palette ─────────────────────────────────────────────────────────────
const C = {
  tableFill:          '#f8f4ef',
  tableStroke:        '#d4b896',
  tableStrokeSelect:  '#b08968',
  tableStrokeRotate:  '#3b82f6',
  tableStrokeResize:  '#b08968',
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

/** Rotate a world-space delta into the table's local (pre-rotation) frame. */
function toLocalFrame(dx: number, dy: number, rotationDeg: number): { x: number; y: number } {
  const rad = (-rotationDeg * Math.PI) / 180;
  return {
    x: dx * Math.cos(rad) - dy * Math.sin(rad),
    y: dx * Math.sin(rad) + dy * Math.cos(rad),
  };
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
  isSelected, isRotating, isResizing, rotationOverride, dims,
  onSelect, onMoveEnd, onDragMove, onSeatClick,
}: {
  table:             Doc<'tables'>;
  tableAssignments:  Doc<'seatAssignments'>[];
  guestMap:          Map<string, Doc<'guests'>>;
  isSelected:        boolean;
  isRotating:        boolean;
  isResizing:        boolean;
  rotationOverride?: number;
  dims:              TableDims;
  onSelect:          () => void;
  onMoveEnd:         (x: number, y: number) => void;
  onDragMove?:       (x: number, y: number) => void;
  onSeatClick:       (seatIndex: number, guestId?: Id<'guests'>) => void;
}) {
  const seatMap = new Map<number, Doc<'seatAssignments'>>();
  for (const a of tableAssignments) seatMap.set(a.seatIndex, a);

  const rotation    = rotationOverride ?? table.rotation;
  const active      = isRotating || isResizing;
  const strokeColor = isRotating ? C.tableStrokeRotate
                    : isResizing ? C.tableStrokeResize
                    : isSelected ? C.tableStrokeSelect
                    : C.tableStroke;
  const strokeWidth = (active || isSelected) ? 2 : 1.5;
  const dash        = active ? ([5, 3] as number[]) : undefined;

  const r = getRadius(dims);
  const w = getWidth(dims);
  const h = getHeight(dims);

  // Edge-midpoint handle positions, in the table's local (pre-rotation) frame.
  const handlePoints = table.shape === 'round'
    ? [{ x: r, y: 0 }, { x: -r, y: 0 }, { x: 0, y: -r }, { x: 0, y: r }]
    : [{ x: w / 2, y: 0 }, { x: -w / 2, y: 0 }, { x: 0, y: -h / 2 }, { x: 0, y: h / 2 }];

  return (
    <Group
      x={table.x}
      y={table.y}
      rotation={rotation}
      draggable={!isRotating && !isResizing}
      onClick={e => { e.cancelBubble = true; onSelect(); }}
      onDragMove={e => onDragMove?.(e.target.x(), e.target.y())}
      onDragEnd={e => onMoveEnd(e.target.x(), e.target.y())}
    >
      {/* Table body */}
      {table.shape === 'round' ? (
        <Circle
          radius={r}
          fill={C.tableFill} stroke={strokeColor} strokeWidth={strokeWidth} dash={dash}
        />
      ) : (
        <Rect
          x={-w / 2} y={-h / 2}
          width={w} height={h}
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
        const local      = getSeatLocalPosition(table.shape, table.seatCount, i, dims);
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

      {/* Resize handles — drag detection happens in the container mousedown handler */}
      {isResizing && handlePoints.map((p, idx) => (
        <Rect
          key={`handle-${idx}`}
          x={p.x - 5} y={p.y - 5} width={10} height={10}
          fill="#ffffff" stroke={C.tableStrokeResize} strokeWidth={2}
          cornerRadius={2} listening={false}
        />
      ))}
    </Group>
  );
}

// ── GhostTable ───────────────────────────────────────────────────────────────

/**
 * Translucent preview of a copied table, rendered at the cursor while the user
 * is choosing where to drop the duplicate. Non-interactive.
 */
function GhostTable({ clip, x, y }: { clip: ClipboardTable; x: number; y: number }) {
  const r = getRadius(clip);
  const w = getWidth(clip);
  const h = getHeight(clip);
  return (
    <Group x={x} y={y} rotation={clip.rotation} opacity={0.4} listening={false}>
      {clip.shape === 'round' ? (
        <Circle radius={r} fill={C.tableFill} stroke={C.tableStrokeSelect} strokeWidth={2} dash={[4, 3]} />
      ) : (
        <Rect
          x={-w / 2} y={-h / 2} width={w} height={h}
          fill={C.tableFill} stroke={C.tableStrokeSelect} strokeWidth={2} cornerRadius={5} dash={[4, 3]}
        />
      )}
      {Array.from({ length: clip.seatCount }, (_, i) => {
        const local = getSeatLocalPosition(clip.shape, clip.seatCount, i, clip);
        return (
          <Circle
            key={i} x={local.x} y={local.y} radius={SEAT_RADIUS}
            fill={C.seatEmpty} stroke={C.seatEmptyStroke} strokeWidth={1}
          />
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
  label, seatCount, rotateMode, resizeMode,
  onLabel, onSeatCount, onToggleRotate, onToggleResize, onCopy, onCommitLabel, onCommitSeatCount, onDelete, onClose,
}: {
  table:              Doc<'tables'>;
  liveDragX?:         number;
  liveDragY?:         number;
  canvasW:            number;
  canvasH:            number;
  label:              string;
  seatCount:          number;
  rotateMode:         boolean;
  resizeMode:         boolean;
  onLabel:            (v: string) => void;
  onSeatCount:        (v: number) => void;
  onToggleRotate:     () => void;
  onToggleResize:     () => void;
  onCopy:             () => void;
  onCommitLabel:      () => void;
  onCommitSeatCount:  (n: number) => void;
  onDelete:           () => void;
  onClose:            () => void;
}) {
  const POPUP_W = 165;
  const POPUP_H = 222; // approximate height for clamping

  // Follow the table during a drag
  const cx = liveDragX ?? table.x;
  const cy = liveDragY ?? table.y;

  // Anchor just to the right of the table, vertically centred on it
  const gap     = 6;
  const anchorX = table.shape === 'round'
    ? cx + getRadius(table) + gap
    : cx + getWidth(table) / 2 + gap;

  const left = Math.min(Math.max(anchorX, 8),           canvasW - POPUP_W - 8);
  const top  = Math.min(Math.max(cy - POPUP_H / 2, 8),  canvasH - POPUP_H - 8);

  return (
    <div
      style={{ position: 'absolute', left, top, width: POPUP_W, zIndex: 50 }}
      className="bg-white rounded-xl shadow-lg border border-rule p-2.5"
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
          className="text-xs font-medium border-0 border-b border-rule focus:outline-none focus:border-accent bg-transparent w-full mr-2 pb-0.5 text-ink"
        />
        <button onClick={onClose} className="text-ink-faint hover:text-ink-soft text-xs shrink-0 transition-colors">✕</button>
      </div>

      {/* Seat count — stepper */}
      <div className="flex items-center justify-between text-xs text-ink-soft mb-2.5">
        <span>Seats</span>
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              const n = Math.max(1, seatCount - 1);
              onSeatCount(n);
              onCommitSeatCount(n);
            }}
            className="w-5 h-5 flex items-center justify-center rounded border border-rule text-ink-soft hover:bg-bg-tint hover:border-accent transition-colors leading-none select-none"
          >−</button>
          <span className="w-5 text-center font-medium text-ink tabular-nums">{seatCount}</span>
          <button
            onClick={() => {
              const n = Math.min(20, seatCount + 1);
              onSeatCount(n);
              onCommitSeatCount(n);
            }}
            className="w-5 h-5 flex items-center justify-center rounded border border-rule text-ink-soft hover:bg-bg-tint hover:border-accent transition-colors leading-none select-none"
          >+</button>
        </div>
      </div>

      {/* Rotate (blue, matches crosshair) + Resize (gold, matches handles) — side by side */}
      <div className="flex gap-2 mb-2.5">
        <button
          onClick={onToggleRotate}
          className={`flex-1 text-xs py-1.5 rounded-lg border transition-colors ${
            rotateMode
              ? 'bg-blue-600 border-blue-600 text-white'
              : 'border-rule text-ink-soft hover:bg-bg-tint hover:border-accent'
          }`}
        >
          ↺  Rotate
        </button>
        <button
          onClick={onToggleResize}
          className={`flex-1 text-xs py-1.5 rounded-lg border transition-colors ${
            resizeMode
              ? 'bg-accent border-accent text-white'
              : 'border-rule text-ink-soft hover:bg-bg-tint hover:border-accent'
          }`}
        >
          ⤡  Resize
        </button>
      </div>

      {/* Copy → place a duplicate (a ghost follows the cursor until you click) */}
      <button
        onClick={onCopy}
        className="w-full text-xs py-1.5 rounded-lg mb-2.5 border border-rule text-ink-soft hover:bg-bg-tint hover:border-accent transition-colors"
      >
        ⧉  Copy table
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

  // ── Resize-mode state ─────────────────────────────────────────────────────
  const [resizeMode, setResizeMode] = useState(false);
  const [liveSize,   setLiveSize]   = useState<TableDims | null>(null);

  // ── Copy → place a translucent "ghost" duplicate that follows the cursor ───
  const [clipboard, setClipboard] = useState<ClipboardTable | null>(null);
  const [placing,   setPlacing]   = useState(false);
  const [ghostPos,  setGhostPos]  = useState<{ x: number; y: number } | null>(null);

  // Stable refs so window listeners don't go stale
  const rotateRef        = useRef<{ startAngle: number; baseRotation: number } | null>(null);
  const resizeRef        = useRef<{ round: true } | { edge: 'left' | 'right' | 'top' | 'bottom' } | null>(null);
  const selectedTableRef = useRef(selectedTable);
  const liveRotationRef  = useRef(liveRotation);
  const liveSizeRef      = useRef(liveSize);
  useEffect(() => { selectedTableRef.current = selectedTable; },  [selectedTable]);
  useEffect(() => { liveRotationRef.current  = liveRotation; },   [liveRotation]);
  useEffect(() => { liveSizeRef.current      = liveSize; },       [liveSize]);

  // Reset rotate + resize state whenever the selected table changes
  useEffect(() => {
    setRotateMode(false);
    setResizeMode(false);
    setLiveRotation(null);
    setLiveSize(null);
    setLiveDragPos(null);
    rotateRef.current = null;
    resizeRef.current = null;
  }, [selectedTableId]);

  // ── Convex table mutations ────────────────────────────────────────────────

  const updateTable = useMutation(api.tables.update);
  const createTable = useMutation(api.tables.create);

  // Rotate and resize are mutually exclusive modes.
  const toggleRotate = useCallback(() => {
    setResizeMode(false);
    setLiveSize(null);
    resizeRef.current = null;
    setRotateMode(r => !r);
  }, []);

  const toggleResize = useCallback(() => {
    setRotateMode(false);
    setLiveRotation(null);
    rotateRef.current = null;
    setResizeMode(r => !r);
  }, []);

  // Latest pointer position over the canvas (used to seat the ghost on copy).
  const lastPointerRef = useRef<{ x: number; y: number } | null>(null);

  // Copy the selected table's shape/size/seats/rotation, then enter placement
  // mode: a translucent ghost follows the cursor until the user clicks to drop.
  const copySelectedTable = useCallback(() => {
    const t = selectedTableRef.current;
    if (!t) return;
    setClipboard({
      shape: t.shape,
      seatCount: t.seatCount,
      rotation: t.rotation,
      radius: t.radius,
      width: t.width,
      height: t.height,
    });
    setGhostPos(lastPointerRef.current ?? { x: t.x, y: t.y });
    setPlacing(true);
    onSelectTable(null); // close the popup so the ghost can be placed
  }, [onSelectTable]);

  // Drop the ghost: create the table at the click point and leave placement mode.
  const handleCanvasClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!placing || !clipboard) return;
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;
      createTable({
        workspaceId,
        shape: clipboard.shape,
        seatCount: clipboard.seatCount,
        x: Math.round(e.clientX - rect.left),
        y: Math.round(e.clientY - rect.top),
        rotation: clipboard.rotation,
        label: `Table ${tables.length + 1}`,
        ...(clipboard.radius != null ? { radius: clipboard.radius } : {}),
        ...(clipboard.width  != null ? { width:  clipboard.width }  : {}),
        ...(clipboard.height != null ? { height: clipboard.height } : {}),
      });
      setPlacing(false);
    },
    [placing, clipboard, createTable, workspaceId, tables.length]
  );

  // Escape cancels placement without creating a table.
  useEffect(() => {
    if (!placing) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setPlacing(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [placing]);

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

  // Window-level mouse handlers for a resize drag
  useEffect(() => {
    if (!resizeMode) return;

    function onMove(e: MouseEvent) {
      const table = selectedTableRef.current;
      if (!resizeRef.current || !table) return;
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const local = toLocalFrame(
        e.clientX - rect.left - table.x,
        e.clientY - rect.top - table.y,
        table.rotation
      );

      let next: TableDims;
      if ('round' in resizeRef.current) {
        next = { radius: clamp(Math.hypot(local.x, local.y), MIN_RADIUS, MAX_RADIUS) };
      } else {
        const prev = liveSizeRef.current ?? {};
        const edge = resizeRef.current.edge;
        if (edge === 'left' || edge === 'right') {
          next = { width: clamp(Math.abs(local.x) * 2, MIN_RECT_W, MAX_RECT_W), height: prev.height ?? getHeight(table) };
        } else {
          next = { width: prev.width ?? getWidth(table), height: clamp(Math.abs(local.y) * 2, MIN_RECT_H, MAX_RECT_H) };
        }
      }
      // Keep the ref in sync synchronously so the mouseup commit always sees the
      // latest size, even if React hasn't flushed the state-sync effect yet.
      liveSizeRef.current = next;
      setLiveSize(next);
    }

    function onUp() {
      if (!resizeRef.current) return;
      resizeRef.current = null;
      const table = selectedTableRef.current;
      const size  = liveSizeRef.current;
      if (table && size) {
        if (table.shape === 'round' && size.radius != null) {
          updateTable({ tableId: table._id, radius: Math.round(size.radius) });
        } else if (table.shape === 'rectangular') {
          updateTable({
            tableId: table._id,
            width:  Math.round(size.width  ?? getWidth(table)),
            height: Math.round(size.height ?? getHeight(table)),
          });
        }
      }
    }

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup',   onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup',   onUp);
    };
  }, [resizeMode, updateTable]);

  // Start a rotation or resize drag when the user mousedowns on/near the table
  const handleMouseDown = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!selectedTable) return;
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;

      if (rotateMode) {
        const dist = Math.hypot(mx - selectedTable.x, my - selectedTable.y);
        const hitR = selectedTable.shape === 'round'
          ? getRadius(selectedTable) + SEAT_RADIUS + 10
          : Math.hypot(getWidth(selectedTable) / 2, getHeight(selectedTable) / 2) + 10;
        if (dist < hitR) {
          const startAngle   = getAngleDeg(selectedTable.x, selectedTable.y, mx, my);
          const baseRotation = liveRotationRef.current ?? selectedTable.rotation;
          rotateRef.current  = { startAngle, baseRotation };
          e.preventDefault(); // avoid text selection while dragging
        }
        return;
      }

      if (resizeMode) {
        const local = toLocalFrame(mx - selectedTable.x, my - selectedTable.y, selectedTable.rotation);
        if (selectedTable.shape === 'round') {
          const r = getRadius(selectedTable);
          if (Math.hypot(local.x, local.y) < r + SEAT_RADIUS + 16) {
            resizeRef.current = { round: true };
            e.preventDefault();
          }
        } else {
          const w = getWidth(selectedTable);
          const h = getHeight(selectedTable);
          const handles = [
            { edge: 'right'  as const, x:  w / 2, y: 0 },
            { edge: 'left'   as const, x: -w / 2, y: 0 },
            { edge: 'top'    as const, x: 0, y: -h / 2 },
            { edge: 'bottom' as const, x: 0, y:  h / 2 },
          ];
          let chosen: 'left' | 'right' | 'top' | 'bottom' | null = null;
          let bestD = 20; // hit tolerance (px)
          for (const hpt of handles) {
            const d = Math.hypot(local.x - hpt.x, local.y - hpt.y);
            if (d < bestD) { bestD = d; chosen = hpt.edge; }
          }
          if (chosen) {
            resizeRef.current = { edge: chosen };
            e.preventDefault();
          }
        }
      }
    },
    [rotateMode, resizeMode, selectedTable]
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
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const px = e.clientX - rect.left;
      const py = e.clientY - rect.top;
      lastPointerRef.current = { x: px, y: py };

      // Move the placement ghost (unthrottled, so it tracks smoothly).
      if (placing) setGhostPos({ x: px, y: py });

      // Broadcast the live cursor (throttled, auth-gated).
      if (!myUserId || !isAuthenticated) return;
      const now = Date.now();
      if (now - lastCursorWriteRef.current < CURSOR_THROTTLE_MS) return;
      lastCursorWriteRef.current = now;
      upsertCursor({
        workspaceId,
        userId: myUserId,
        label:  myLabel,
        x: px,
        y: py,
        updatedAt: now,
      });
    },
    [upsertCursor, workspaceId, myUserId, myLabel, isAuthenticated, placing]
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

  // Effective dimensions for a table — applies the live resize preview to the
  // selected table while a resize drag is in progress.
  const dimsFor = (table: Doc<'tables'>): TableDims => {
    if (selectedTableId === table._id && liveSize) {
      return {
        radius: liveSize.radius ?? table.radius,
        width:  liveSize.width  ?? table.width,
        height: liveSize.height ?? table.height,
      };
    }
    return { radius: table.radius, width: table.width, height: table.height };
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div
      ref={containerRef}
      className="flex-1 overflow-hidden relative"
      style={{
        backgroundColor: C.canvasBg,
        backgroundImage:
          'linear-gradient(to right, rgba(26,31,46,0.05) 1px, transparent 1px),' +
          'linear-gradient(to bottom, rgba(26,31,46,0.05) 1px, transparent 1px)',
        backgroundSize: '26px 26px',
        cursor: placing ? 'copy' : rotateMode ? 'crosshair' : resizeMode ? 'nwse-resize' : 'default',
      }}
      onDragOver={e => e.preventDefault()}
      onDrop={handleDrop}
      onMouseMove={handleMouseMove}
      onMouseDown={handleMouseDown}
      onClick={handleCanvasClick}
      onContextMenu={e => e.preventDefault()}
    >
      {/* Empty-state hint */}
      {tables.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <p className="text-sm text-ink-faint">Add a table or choose a template to get started</p>
        </div>
      )}

      {/* Guest-drop hint */}
      {draggingGuestId && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-10 pointer-events-none">
          <span className="bg-bg-tint border border-accent-soft text-ink-soft text-xs px-3 py-1.5 rounded-full shadow-sm">
            Drop on a seat to assign
          </span>
        </div>
      )}

      <Stage
        width={size.width}
        height={size.height}
        onClick={() => { if (!placing) onSelectTable(null); }}
      >
        {/* Tables layer — non-interactive while placing a ghost, so any click drops it */}
        <Layer listening={!placing}>
          {tables.map(table => (
            <TableNode
              key={table._id}
              table={table}
              tableAssignments={assignmentsByTable.get(table._id) ?? []}
              guestMap={guestMap as Map<string, Doc<'guests'>>}
              isSelected={selectedTableId === table._id}
              isRotating={rotateMode && selectedTableId === table._id}
              isResizing={resizeMode && selectedTableId === table._id}
              dims={dimsFor(table)}
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

          {/* Placement ghost — a translucent preview of the copied table */}
          {placing && clipboard && ghostPos && (
            <GhostTable clip={clipboard} x={ghostPos.x} y={ghostPos.y} />
          )}
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
                    ? getRadius(selectedTable) + 18
                    : Math.hypot(getWidth(selectedTable) / 2, getHeight(selectedTable) / 2) + 14
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
          resizeMode={resizeMode}
          onLabel={onEditLabel}
          onSeatCount={onEditSeatCount}
          onToggleRotate={toggleRotate}
          onToggleResize={toggleResize}
          onCopy={copySelectedTable}
          onCommitLabel={onCommitLabel}
          onCommitSeatCount={onCommitSeatCount}
          onDelete={onDeleteSelected}
          onClose={() => onSelectTable(null)}
        />
      )}

      {/* Placement hint while a ghost is following the cursor */}
      {placing && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-10 pointer-events-none">
          <span className="bg-bg-tint border border-accent-soft text-ink-soft text-xs px-3 py-1.5 rounded-full shadow-sm">
            Click to place the copy · Esc to cancel
          </span>
        </div>
      )}
    </div>
  );
}
