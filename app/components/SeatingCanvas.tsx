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

import { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import { Stage, Layer, Circle, Rect, Text, Group, Arrow, Line, Path } from 'react-konva';
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
  getPlacematPosition,
  PLACEMAT_W, PLACEMAT_H,
  PX_PER_FOOT,
  findNearestSeat,
  pxToFeetLabel,
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
  kind?:      'seating' | 'object';
  objectKind?: string;
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
  objectFill:         '#eef0f3',
  objectStroke:       '#c0c6cf',
  venueStroke:        '#b3a890',
  venueLabel:         '#9a8a72',
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

// ── Placemat ───────────────────────────────────────────────────────────────────

/**
 * A small place setting (napkin + plate + fork/knife) drawn on the table surface
 * in front of a seat. Non-interactive; lives inside the table Group so it rotates
 * with the table — you can read the orientation at a glance.
 */
function Placemat({ x, y, rotation }: { x: number; y: number; rotation: number }) {
  return (
    <Group x={x} y={y} rotation={rotation} listening={false}>
      {/* Napkin */}
      <Rect
        x={-PLACEMAT_W / 2} y={-PLACEMAT_H / 2} width={PLACEMAT_W} height={PLACEMAT_H}
        cornerRadius={2} fill="#fdfbf8" stroke="#e7ddcf" strokeWidth={0.75}
      />
      {/* Plate */}
      <Circle radius={PLACEMAT_H / 2 - 2.5} fill="#ffffff" stroke="#d8c7ad" strokeWidth={0.75} />
      <Circle radius={PLACEMAT_H / 2 - 4.5} stroke="#ece3d5" strokeWidth={0.5} />
      {/* Fork (left) + knife (right) */}
      <Line points={[-PLACEMAT_W / 2 + 3, -3.5, -PLACEMAT_W / 2 + 3, 3.5]} stroke="#c9b89c" strokeWidth={1} lineCap="round" />
      <Line points={[PLACEMAT_W / 2 - 3, -3.5, PLACEMAT_W / 2 - 3, 3.5]} stroke="#c9b89c" strokeWidth={1} lineCap="round" />
    </Group>
  );
}

// ── TableNode ──────────────────────────────────────────────────────────────────

function TableNode({
  table, tableAssignments, guestMap,
  isSelected, isRotating, isResizing, rotationOverride, dims, centerX, centerY,
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
  centerX?:          number;
  centerY?:          number;
  onSelect:          () => void;
  onMoveEnd:         (x: number, y: number) => void;
  onDragMove?:       (x: number, y: number) => void;
  onSeatClick:       (seatIndex: number, guestId?: Id<'guests'>) => void;
}) {
  const seatMap = new Map<number, Doc<'seatAssignments'>>();
  for (const a of tableAssignments) seatMap.set(a.seatIndex, a);

  const rotation    = rotationOverride ?? table.rotation;
  const isObject    = table.kind === 'object';
  const active      = isRotating || isResizing;
  const strokeColor = isRotating ? C.tableStrokeRotate
                    : isResizing ? C.tableStrokeResize
                    : isSelected ? C.tableStrokeSelect
                    : isObject ? C.objectStroke
                    : C.tableStroke;
  const bodyFill    = isObject ? C.objectFill : C.tableFill;
  const strokeWidth = (active || isSelected) ? 2 : 1.5;
  const dash        = active ? ([5, 3] as number[]) : undefined;

  const r = getRadius(dims);
  const w = getWidth(dims);
  const h = getHeight(dims);

  // Icon size for objects — scaled to fit the object's (live) footprint.
  const objIconSize = isObject
    ? Math.max(20, Math.min(52, (table.shape === 'round' ? r * 2 : Math.min(w, h)) * 0.55))
    : 0;

  // Resize handle positions, in the table's local (pre-rotation) frame. Round =
  // edge midpoints; rectangular = corners (the opposite corner stays fixed).
  const handlePoints = table.shape === 'round'
    ? [{ x: r, y: 0 }, { x: -r, y: 0 }, { x: 0, y: -r }, { x: 0, y: r }]
    : [{ x: w / 2, y: h / 2 }, { x: -w / 2, y: h / 2 }, { x: w / 2, y: -h / 2 }, { x: -w / 2, y: -h / 2 }];

  return (
    <Group
      x={centerX ?? table.x}
      y={centerY ?? table.y}
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
          fill={bodyFill} stroke={strokeColor} strokeWidth={strokeWidth} dash={dash}
        />
      ) : (
        <Rect
          x={-w / 2} y={-h / 2}
          width={w} height={h}
          fill={bodyFill} stroke={strokeColor} strokeWidth={strokeWidth}
          cornerRadius={5} dash={dash}
        />
      )}

      {/* Placemats — a place setting in front of each seat (rotate with the table) */}
      {Array.from({ length: table.seatCount }, (_, i) => {
        const p = getPlacematPosition(table.shape, table.seatCount, i, dims);
        return <Placemat key={`pm-${i}`} x={p.x} y={p.y} rotation={p.rotation} />;
      })}

      {/* Object symbol — rotates with the object */}
      {isObject && (
        <KonvaObjectIcon kind={table.objectKind ?? 'object'} size={objIconSize} />
      )}

      {/* Table label — counter-rotated so it stays upright when the table is rotated.
          (Live dimensions now live in the floating edit panel, not on the canvas.) */}
      {!isObject && table.label && (
        <Group rotation={-rotation} listening={false}>
          <Text
            text={table.label} x={-60} y={-9} width={120}
            align="center" fontSize={11} fill={C.labelText}
            fontFamily="system-ui, sans-serif" listening={false}
          />
        </Group>
      )}

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

// ── KonvaObjectIcon ──────────────────────────────────────────────────────────

/**
 * The object presets' line-art symbols, rendered as Konva shapes (mirrors
 * app/components/ObjectIcon.tsx) so an object table shows its icon in place of a
 * text label. Drawn in a 24-unit box, scaled to `size` and centered on (0,0).
 */
function KonvaObjectIcon({ kind, size }: { kind: string; size: number }) {
  const s = size / 24;
  const col = C.labelText;
  const base = { stroke: col, strokeWidth: 1.6, lineCap: 'round' as const, lineJoin: 'round' as const, listening: false };
  const dot = (x: number, y: number, r: number) => <Circle x={x} y={y} radius={r} fill={col} listening={false} />;
  let shapes: React.ReactNode;
  switch (kind) {
    case 'cake':
      shapes = (<>
        <Path data="M4 20h16v-7a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v7Z" {...base} />
        <Path data="M4 15.5c1.6 1.2 3.2 1.2 4 0s2-1.2 2 0 2 1.2 2 0 2-1.2 2 0 2.4 1.2 4 0" {...base} />
        <Path data="M12 9V5.5" {...base} />
        {dot(12, 4.4, 0.9)}
      </>); break;
    case 'gift':
      shapes = (<>
        <Rect x={4.5} y={11} width={15} height={9} cornerRadius={1} {...base} />
        <Path data="M3.5 8h17v3h-17z" {...base} />
        <Path data="M12 8v12" {...base} />
        <Path data="M12 8C10.5 8 8.5 7.4 8.5 6S11 4.5 12 8Zm0 0c1.5 0 3.5-.6 3.5-2S13 4.5 12 8Z" {...base} />
      </>); break;
    case 'guestbook':
      shapes = (<>
        <Path data="M12 6.5v13" {...base} />
        <Path data="M12 6.5c-1.8-1.2-4.4-1.2-6 0v11.5c1.6-1.2 4.2-1.2 6 0" {...base} />
        <Path data="M12 6.5c1.8-1.2 4.4-1.2 6 0v11.5c-1.6-1.2-4.2-1.2-6 0" {...base} />
      </>); break;
    case 'bar':
      shapes = (<>
        <Path data="M5 5.5h14l-7 7.5z" {...base} />
        <Path data="M12 13v6" {...base} />
        <Path data="M8.5 19h7" {...base} />
        <Path data="M16 6.5l2.5-1.6" {...base} />
        {dot(19, 4.4, 0.9)}
      </>); break;
    case 'stage': // Concert stage — canopy, X-braced truss towers, lights, stepped base
      shapes = (<>
        <Path data="M3 10 L3.5 8 L12 5.5 L20.5 8 L21 10 Z" {...base} />
        <Path data="M4 10.2V17.8 M6 10.2V17.8 M4 10.2H6 M4 14H6 M4 17.8H6 M4 10.2L6 14 M6 10.2L4 14 M4 14L6 17.8 M6 14L4 17.8 M18 10.2V17.8 M20 10.2V17.8 M18 10.2H20 M18 14H20 M18 17.8H20 M18 10.2L20 14 M20 10.2L18 14 M18 14L20 17.8 M20 14L18 17.8" {...base} />
        <Path data="M6 10.9H18 M6 11.9H18 M9 11.9V13 M12 11.9V13.2 M15 11.9V13" {...base} />
        <Path data="M2.5 17.8H21.5V19.4H2.5Z M7 19.4H17V20.6H7Z M9 20.6H15V21.8H9Z" {...base} />
      </>); break;
    case 'altar': // Wedding arch / altar
      shapes = (<>
        <Path data="M5.5 20V9.5" {...base} />
        <Path data="M18.5 20V9.5" {...base} />
        <Path data="M5.5 9.5C5.5 5.9 8.4 3.5 12 3.5s6.5 2.4 6.5 6" {...base} />
        <Path data="M4 20h16" {...base} />
      </>); break;
    case 'dancefloor': // Disco ball
      shapes = (<>
        <Path data="M12 3.5V6" {...base} />
        <Circle x={12} y={13} radius={7} {...base} />
        <Path data="M9 6.7V19.3" {...base} />
        <Path data="M12 6V20" {...base} />
        <Path data="M15 6.7V19.3" {...base} />
        <Path data="M5.7 10H18.3" {...base} />
        <Path data="M5 13H19" {...base} />
        <Path data="M5.7 16H18.3" {...base} />
      </>); break;
    case 'djband': // DJ deck — two record platters with dials below
      shapes = (<>
        <Rect x={2.5} y={5} width={19} height={14} cornerRadius={1.5} {...base} />
        <Circle x={7.5} y={10.5} radius={3.1} {...base} />
        {dot(7.5, 10.5, 0.7)}
        <Circle x={16.5} y={10.5} radius={3.1} {...base} />
        {dot(16.5, 10.5, 0.7)}
        <Circle x={6} y={16} radius={1} {...base} />
        <Circle x={12} y={16} radius={1} {...base} />
        <Circle x={18} y={16} radius={1} {...base} />
      </>); break;
    default: // Generic object — plain square
      shapes = (<>
        <Rect x={5} y={5} width={14} height={14} cornerRadius={2} {...base} />
      </>); break;
  }
  return (
    <Group scaleX={s} scaleY={s} offsetX={12} offsetY={12} listening={false}>
      {shapes}
    </Group>
  );
}

// ── PreviewTable ───────────────────────────────────────────────────────────────

/**
 * Ghosted preview of a template table (default sizes), rendered over the existing
 * layout while the user previews a template. Non-interactive.
 */
function PreviewTable({
  table,
}: {
  table: { shape: 'round' | 'rectangular'; seatCount: number; x: number; y: number; rotation: number };
}) {
  const r = getRadius();
  const w = getWidth();
  const h = getHeight();
  return (
    <Group x={table.x} y={table.y} rotation={table.rotation} listening={false}>
      {table.shape === 'round' ? (
        <Circle radius={r} fill={C.tableFill} stroke={C.tableStrokeSelect} strokeWidth={2} dash={[5, 4]} />
      ) : (
        <Rect x={-w / 2} y={-h / 2} width={w} height={h} fill={C.tableFill} stroke={C.tableStrokeSelect} strokeWidth={2} cornerRadius={5} dash={[5, 4]} />
      )}
      {Array.from({ length: table.seatCount }, (_, i) => {
        const local = getSeatLocalPosition(table.shape, table.seatCount, i);
        return (
          <Circle key={i} x={local.x} y={local.y} radius={SEAT_RADIUS} fill={C.seatEmpty} stroke={C.seatEmptyStroke} strokeWidth={1} />
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
  table, liveDragX, liveDragY, canvasW, canvasH, scale, offsetX, offsetY, isObject, dimLabel,
  label, seatCount, rotateMode, resizeMode,
  onLabel, onSeatCount, onToggleRotate, onToggleResize, onCopy, onCommitLabel, onCommitSeatCount, onDelete, onClose,
}: {
  table:              Doc<'tables'>;
  liveDragX?:         number;
  liveDragY?:         number;
  canvasW:            number;
  canvasH:            number;
  scale:              number;
  offsetX:            number;
  offsetY:            number;
  isObject:           boolean;
  dimLabel:           string;
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
  const POPUP_H = 250; // approximate height for clamping

  // Follow the table during a drag (world coords)
  const cx = liveDragX ?? table.x;
  const cy = liveDragY ?? table.y;

  // Anchor just to the right of the table, then map world → screen so the panel
  // tracks correctly under the venue zoom-to-fit transform.
  const gap     = 6 / scale;
  const anchorXWorld = table.shape === 'round'
    ? cx + getRadius(table) + gap
    : cx + getWidth(table) / 2 + gap;
  const anchorX  = anchorXWorld * scale + offsetX;
  const cyScreen = cy * scale + offsetY;

  const left = Math.min(Math.max(anchorX, 8),                canvasW - POPUP_W - 8);
  const top  = Math.min(Math.max(cyScreen - POPUP_H / 2, 8), canvasH - POPUP_H - 8);

  return (
    <div
      style={{ position: 'absolute', left, top, width: POPUP_W, zIndex: 50 }}
      className="bg-white rounded-xl shadow-lg border border-rule p-2.5"
      onClick={e => e.stopPropagation()}
      onMouseDown={e => e.stopPropagation()}
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

      {/* Size — real-world dimensions; updates live during a resize drag */}
      <div className="flex items-center justify-between text-xs text-ink-soft mb-2.5">
        <span>Size</span>
        <span className="font-medium text-ink tabular-nums">{dimLabel}</span>
      </div>

      {/* Seat count — stepper (hidden for decorative objects) */}
      {!isObject && (
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
      )}

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
  activeLayoutId?:    Id<'seatingLayouts'>;
  tables:             Doc<'tables'>[];
  guests:             Doc<'guests'>[];
  assignments:        Doc<'seatAssignments'>[];
  draggingGuestId:    string | null;
  onAssignGuest:      (tableId: Id<'tables'>, seatIndex: number, guestId: Id<'guests'>) => void;
  onRequestUnassign:  (guestId: Id<'guests'>, guestName: string) => void;
  selectedTableId:    string | null;
  onSelectTable:      (id: string | null) => void;
  onSizeChange?:      (width: number, height: number) => void;
  venueWidthFt?:      number;
  venueHeightFt?:     number;
  onVenueResize?:     (widthFt: number, lengthFt: number) => void;
  previewTables?:     { shape: 'round' | 'rectangular'; seatCount: number; x: number; y: number; rotation: number; label?: string }[] | null;
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
  activeLayoutId,
  tables,
  guests,
  assignments,
  draggingGuestId,
  onAssignGuest,
  onRequestUnassign,
  selectedTableId,
  onSelectTable,
  onSizeChange,
  venueWidthFt,
  venueHeightFt,
  onVenueResize,
  previewTables,
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

  // ── Venue boundary + zoom-to-fit transform ────────────────────────────────
  // While a venue edge is being dragged, the transform is FROZEN (so the edge
  // visibly moves instead of the whole view just rescaling to keep fitting).
  const [venueDrag, setVenueDrag] = useState<
    { w: number; h: number; startScale: number; startOX: number; startOY: number } | null
  >(null);

  const committedVenue =
    venueWidthFt && venueHeightFt
      ? { w: venueWidthFt * PX_PER_FOOT, h: venueHeightFt * PX_PER_FOOT }
      : null;
  const venue = venueDrag ? { w: venueDrag.w, h: venueDrag.h } : committedVenue;
  const fitScale = committedVenue
    ? Math.min((size.width * 0.92) / committedVenue.w, (size.height * 0.92) / committedVenue.h)
    : 1;
  const scale   = venueDrag ? venueDrag.startScale : fitScale;
  const offsetX = venueDrag
    ? venueDrag.startOX
    : committedVenue ? Math.round((size.width - committedVenue.w * fitScale) / 2) : 0;
  const offsetY = venueDrag
    ? venueDrag.startOY
    : committedVenue ? Math.round((size.height - committedVenue.h * fitScale) / 2) : 0;

  function commitVenueResize(wPx: number, hPx: number) {
    setVenueDrag(null);
    onVenueResize?.(Math.round(wPx / PX_PER_FOOT), Math.round(hPx / PX_PER_FOOT));
  }

  /** Convert a screen (clientX/Y) point to canvas world coordinates. Re-created
   *  only when the transform changes, so the pointer handlers that depend on it
   *  stay correct under the venue zoom-to-fit. */
  const toWorld = useCallback((clientX: number, clientY: number) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return {
      x: (clientX - rect.left - offsetX) / scale,
      y: (clientY - rect.top - offsetY) / scale,
    };
  }, [scale, offsetX, offsetY]);

  const selectedTable = tables.find(t => t._id === selectedTableId) ?? null;

  // ── Rotate-mode state ─────────────────────────────────────────────────────

  const [rotateMode,   setRotateMode]   = useState(false);
  const [liveRotation, setLiveRotation] = useState<number | null>(null);
  const [liveDragPos,  setLiveDragPos]  = useState<{ x: number; y: number } | null>(null);

  // ── Resize-mode state ─────────────────────────────────────────────────────
  const [resizeMode,        setResizeMode]        = useState(false);
  const [liveSize,          setLiveSize]          = useState<TableDims | null>(null);
  // Corner resize moves the table's centre (opposite corner stays fixed), so the
  // selected table's position is overridden while a corner drag is in progress.
  const [liveResizeCenter,  setLiveResizeCenter]  = useState<{ x: number; y: number } | null>(null);

  // ── Copy → place a translucent "ghost" duplicate that follows the cursor ───
  const [clipboard, setClipboard] = useState<ClipboardTable | null>(null);
  const [placing,   setPlacing]   = useState(false);
  const [ghostPos,  setGhostPos]  = useState<{ x: number; y: number } | null>(null);

  // Stable refs so window listeners don't go stale
  const rotateRef        = useRef<{ startAngle: number; baseRotation: number } | null>(null);
  const resizeRef        = useRef<
    | { round: true }
    | { corner: 'tl' | 'tr' | 'bl' | 'br'; ox: number; oy: number }
    | null
  >(null);
  const selectedTableRef = useRef(selectedTable);
  const liveRotationRef  = useRef(liveRotation);
  const liveSizeRef      = useRef(liveSize);
  const liveCenterRef    = useRef(liveResizeCenter);
  useEffect(() => { selectedTableRef.current = selectedTable; },  [selectedTable]);
  useEffect(() => { liveRotationRef.current  = liveRotation; },   [liveRotation]);
  useEffect(() => { liveSizeRef.current      = liveSize; },       [liveSize]);
  useEffect(() => { liveCenterRef.current    = liveResizeCenter; }, [liveResizeCenter]);

  // Reset rotate + resize state whenever the selected table changes
  useEffect(() => {
    setRotateMode(false);
    setResizeMode(false);
    setLiveRotation(null);
    setLiveSize(null);
    setLiveResizeCenter(null);
    setLiveDragPos(null);
    rotateRef.current = null;
    resizeRef.current = null;
  }, [selectedTableId]);

  // ── Convex table mutations ────────────────────────────────────────────────

  // Optimistic update: patch the local tables list the instant a change is made
  // (move/rotate/resize/etc.) so the table never flashes back to its old state
  // while the server round-trips. Without this, clearing the live drag override
  // before the mutation confirms makes the table appear to "snap back".
  const baseUpdateTable = useMutation(api.tables.update);
  // Memoised so its identity is stable across renders — otherwise the rotate /
  // resize effects (which depend on it) would tear down and re-add their window
  // listeners on every drag frame.
  const updateTable = useMemo(
    () =>
      baseUpdateTable.withOptimisticUpdate((store, args) => {
        const existing = store.getQuery(api.tables.list, { workspaceId });
        if (!existing) return;
        const { tableId, ...fields } = args;
        store.setQuery(
          api.tables.list,
          { workspaceId },
          existing.map(t => (t._id === tableId ? { ...t, ...fields } : t))
        );
      }),
    [baseUpdateTable, workspaceId]
  );
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
    setLiveResizeCenter(null);
    rotateRef.current = null;
    setResizeMode(r => !r);
  }, []);

  // Latest pointer position over the canvas (used to seat the ghost on copy).
  const lastPointerRef = useRef<{ x: number; y: number } | null>(null);

  // Set true at the end of a rotate/resize drag so the trailing `click` event
  // doesn't deselect the table (which would clear the live override and flash the
  // table back to its old size/rotation before the commit lands).
  const justDraggedRef = useRef(false);

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
      kind: t.kind,
      objectKind: t.objectKind,
    });
    setGhostPos(lastPointerRef.current ?? { x: t.x, y: t.y });
    setPlacing(true);
    onSelectTable(null); // close the popup so the ghost can be placed
  }, [onSelectTable]);

  // Drop the ghost: create the table at the click point and leave placement mode.
  const handleCanvasClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!placing || !clipboard) return;
      const { x, y } = toWorld(e.clientX, e.clientY);
      const isObj = clipboard.kind === 'object';
      createTable({
        workspaceId,
        ...(activeLayoutId ? { layoutId: activeLayoutId } : {}),
        shape: clipboard.shape,
        seatCount: clipboard.seatCount,
        x: Math.round(x),
        y: Math.round(y),
        rotation: clipboard.rotation,
        label: isObj ? undefined : `Table ${tables.length + 1}`,
        ...(clipboard.kind ? { kind: clipboard.kind } : {}),
        ...(clipboard.objectKind ? { objectKind: clipboard.objectKind } : {}),
        ...(clipboard.radius != null ? { radius: clipboard.radius } : {}),
        ...(clipboard.width  != null ? { width:  clipboard.width }  : {}),
        ...(clipboard.height != null ? { height: clipboard.height } : {}),
      });
      setPlacing(false);
    },
    [placing, clipboard, createTable, workspaceId, activeLayoutId, tables.length, toWorld]
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
      const wpt   = toWorld(e.clientX, e.clientY);
      const angle = getAngleDeg(table.x, table.y, wpt.x, wpt.y);
      const delta = angle - rotateRef.current.startAngle;
      const rot   = ((rotateRef.current.baseRotation + delta) % 360 + 360) % 360;
      // Keep the ref in sync synchronously so the mouseup commit always sees the
      // latest rotation, even if React hasn't flushed the state-sync effect yet.
      liveRotationRef.current = rot;
      setLiveRotation(rot);
    }

    function onUp() {
      if (!rotateRef.current) return;
      rotateRef.current = null;
      justDraggedRef.current = true;
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
  }, [rotateMode, updateTable, toWorld]);

  // Window-level mouse handlers for a resize drag
  useEffect(() => {
    if (!resizeMode) return;

    function onMove(e: MouseEvent) {
      const table = selectedTableRef.current;
      if (!resizeRef.current || !table) return;
      const wpt = toWorld(e.clientX, e.clientY);

      if ('round' in resizeRef.current) {
        const local = toLocalFrame(wpt.x - table.x, wpt.y - table.y, table.rotation);
        const next: TableDims = { radius: clamp(Math.hypot(local.x, local.y), MIN_RADIUS, MAX_RADIUS) };
        liveSizeRef.current = next;
        setLiveSize(next);
        return;
      }

      // Rectangular corner drag: the opposite corner (ox, oy) stays pinned in
      // world space; width/height grow along the table's rotated axes and the
      // centre moves to the midpoint of the fixed corner and the dragged corner.
      const { ox, oy } = resizeRef.current;
      const rad = (table.rotation * Math.PI) / 180;
      const ux  = { x: Math.cos(rad),  y: Math.sin(rad) };  // local +x in world
      const uy  = { x: -Math.sin(rad), y: Math.cos(rad) };  // local +y in world
      const dx  = wpt.x - ox;
      const dy  = wpt.y - oy;
      const dw  = dx * ux.x + dy * ux.y;
      const dh  = dx * uy.x + dy * uy.y;
      const newW = clamp(Math.abs(dw), MIN_RECT_W, MAX_RECT_W);
      const newH = clamp(Math.abs(dh), MIN_RECT_H, MAX_RECT_H);
      const sw = dw >= 0 ? 1 : -1;
      const sh = dh >= 0 ? 1 : -1;
      const cx = ox + ux.x * sw * (newW / 2) + uy.x * sh * (newH / 2);
      const cy = oy + ux.y * sw * (newW / 2) + uy.y * sh * (newH / 2);

      const next: TableDims = { width: newW, height: newH };
      liveSizeRef.current   = next;
      liveCenterRef.current = { x: cx, y: cy };
      setLiveSize(next);
      setLiveResizeCenter({ x: cx, y: cy });
    }

    function onUp() {
      if (!resizeRef.current) return;
      const wasCorner = !('round' in resizeRef.current);
      resizeRef.current = null;
      justDraggedRef.current = true;
      const table  = selectedTableRef.current;
      const size   = liveSizeRef.current;
      const center = liveCenterRef.current;
      if (table && size) {
        if (table.shape === 'round' && size.radius != null) {
          updateTable({ tableId: table._id, radius: Math.round(size.radius) });
        } else if (table.shape === 'rectangular') {
          updateTable({
            tableId: table._id,
            width:  Math.round(size.width  ?? getWidth(table)),
            height: Math.round(size.height ?? getHeight(table)),
            ...(wasCorner && center ? { x: Math.round(center.x), y: Math.round(center.y) } : {}),
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
  }, [resizeMode, updateTable, toWorld]);

  // Start a rotation or resize drag when the user mousedowns on/near the table
  const handleMouseDown = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      justDraggedRef.current = false;
      if (!selectedTable) return;
      const { x: mx, y: my } = toWorld(e.clientX, e.clientY);

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
          const corners = [
            { corner: 'br' as const, x:  w / 2, y:  h / 2 },
            { corner: 'bl' as const, x: -w / 2, y:  h / 2 },
            { corner: 'tr' as const, x:  w / 2, y: -h / 2 },
            { corner: 'tl' as const, x: -w / 2, y: -h / 2 },
          ];
          let chosen: (typeof corners)[number] | null = null;
          let bestD = 24; // hit tolerance (px)
          for (const c of corners) {
            const d = Math.hypot(local.x - c.x, local.y - c.y);
            if (d < bestD) { bestD = d; chosen = c; }
          }
          if (chosen) {
            // Pin the opposite corner in world space so it stays fixed.
            const ol  = { x: -chosen.x, y: -chosen.y };
            const rad = (selectedTable.rotation * Math.PI) / 180;
            const ox  = selectedTable.x + ol.x * Math.cos(rad) - ol.y * Math.sin(rad);
            const oy  = selectedTable.y + ol.x * Math.sin(rad) + ol.y * Math.cos(rad);
            resizeRef.current = { corner: chosen.corner, ox, oy };
            e.preventDefault();
          }
        }
      }
    },
    [rotateMode, resizeMode, selectedTable, toWorld]
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
      const { x: px, y: py } = toWorld(e.clientX, e.clientY);
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
    [upsertCursor, workspaceId, myUserId, myLabel, isAuthenticated, placing, toWorld]
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
      const { x, y } = toWorld(e.clientX, e.clientY);
      const hit  = findNearestSeat(tables, x, y);
      if (hit) onAssignGuest(hit.tableId as Id<'tables'>, hit.seatIndex, guestId);
    },
    [tables, onAssignGuest, toWorld]
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
      {/* Empty-state hint — hidden while a template preview is on screen */}
      {tables.length === 0 && !(previewTables && previewTables.length > 0) && (
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
        scaleX={scale}
        scaleY={scale}
        x={offsetX}
        y={offsetY}
        onClick={() => {
          // Swallow the click that ends a rotate/resize drag so it doesn't deselect.
          if (justDraggedRef.current) { justDraggedRef.current = false; return; }
          if (!placing) onSelectTable(null);
        }}
      >
        {/* Venue boundary — drawn to scale, with draggable edge handles.
            Guarded on a finite, positive scale so the handles never render with
            an Infinity radius during the brief 0-size window at mount. */}
        {venue && scale > 0 && Number.isFinite(scale) && (
          <Layer>
            <Rect
              listening={false}
              x={0} y={0} width={venue.w} height={venue.h}
              stroke={C.venueStroke} strokeWidth={3 / scale} cornerRadius={6 / scale}
            />
            <Text
              listening={false}
              text={`${Math.round(venue.w / PX_PER_FOOT)} × ${Math.round(venue.h / PX_PER_FOOT)} ft`}
              x={0} y={-20 / scale} width={venue.w}
              align="center" fontSize={13 / scale} fill={C.venueLabel}
              fontFamily="system-ui, sans-serif"
            />
            {/* Right edge — drag to change width */}
            <Circle
              x={venue.w} y={venue.h / 2} radius={8 / scale}
              fill={C.venueStroke} stroke="#ffffff" strokeWidth={2 / scale}
              draggable
              onMouseEnter={(e) => { const s = e.target.getStage(); if (s) s.container().style.cursor = 'ew-resize'; }}
              onMouseLeave={(e) => { const s = e.target.getStage(); if (s) s.container().style.cursor = 'default'; }}
              onDragStart={() => setVenueDrag({ w: venue.w, h: venue.h, startScale: scale, startOX: offsetX, startOY: offsetY })}
              onDragMove={(e) => { const nx = Math.max(120, e.target.x()); e.target.x(nx); e.target.y(venue.h / 2); setVenueDrag(p => (p ? { ...p, w: nx } : p)); }}
              onDragEnd={(e) => commitVenueResize(Math.max(120, e.target.x()), venue.h)}
            />
            {/* Bottom edge — drag to change length */}
            <Circle
              x={venue.w / 2} y={venue.h} radius={8 / scale}
              fill={C.venueStroke} stroke="#ffffff" strokeWidth={2 / scale}
              draggable
              onMouseEnter={(e) => { const s = e.target.getStage(); if (s) s.container().style.cursor = 'ns-resize'; }}
              onMouseLeave={(e) => { const s = e.target.getStage(); if (s) s.container().style.cursor = 'default'; }}
              onDragStart={() => setVenueDrag({ w: venue.w, h: venue.h, startScale: scale, startOX: offsetX, startOY: offsetY })}
              onDragMove={(e) => { const ny = Math.max(120, e.target.y()); e.target.y(ny); e.target.x(venue.w / 2); setVenueDrag(p => (p ? { ...p, h: ny } : p)); }}
              onDragEnd={(e) => commitVenueResize(venue.w, Math.max(120, e.target.y()))}
            />
          </Layer>
        )}

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
              centerX={selectedTableId === table._id && liveResizeCenter ? liveResizeCenter.x : undefined}
              centerY={selectedTableId === table._id && liveResizeCenter ? liveResizeCenter.y : undefined}
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

        {/* Template preview overlay — ghosted tables shown over the existing layout */}
        {previewTables && previewTables.length > 0 && (
          <Layer listening={false} opacity={0.5}>
            {previewTables.map((t, i) => (
              <PreviewTable key={i} table={t} />
            ))}
          </Layer>
        )}

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
          liveDragX={liveDragPos?.x ?? liveResizeCenter?.x}
          liveDragY={liveDragPos?.y ?? liveResizeCenter?.y}
          canvasW={size.width}
          canvasH={size.height}
          scale={scale}
          offsetX={offsetX}
          offsetY={offsetY}
          isObject={selectedTable.kind === 'object'}
          dimLabel={(() => {
            const d = dimsFor(selectedTable);
            return selectedTable.shape === 'round'
              ? `⌀ ${pxToFeetLabel(2 * getRadius(d))} ft`
              : `${pxToFeetLabel(getWidth(d))} × ${pxToFeetLabel(getHeight(d))} ft`;
          })()}
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
