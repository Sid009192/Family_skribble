/**
 * canvas.ts — the authoritative picture for each room.
 *
 * We keep each room's completed draw operations (strokes + fills) here, on the
 * server, separate from the Room object (we don't want to ship a huge ops array
 * inside every roomState). This is what lets late-joiners and undo/clear rebuild
 * a correct canvas for everyone.
 *
 * Every helper also VALIDATES untrusted input: colors must be from the shared
 * palette, sizes from the shared list, coordinates clamped to the canvas, and
 * arrays length-capped — so a buggy or hostile client can't crash us or eat memory.
 */

import {
  BRUSH_SIZES,
  CANVAS_HEIGHT,
  CANVAS_WIDTH,
  DRAW_PALETTE,
  MAX_CANVAS_OPS,
  MAX_STROKE_POINTS,
} from "@shared/types";
import type { DrawOp, FillOp, Point, Segment, StrokeOp } from "@shared/types";

/** code -> list of completed operations. */
const canvases = new Map<string, DrawOp[]>();
/** code -> stack of UNDONE operations available to redo. */
const redoStacks = new Map<string, DrawOp[]>();
const PALETTE = new Set(DRAW_PALETTE);

export function getOps(code: string): DrawOp[] {
  return canvases.get(code) ?? [];
}

export function resetCanvas(code: string): void {
  canvases.set(code, []);
  redoStacks.delete(code); // can't redo across a clear
}

export function deleteCanvas(code: string): void {
  canvases.delete(code);
  redoStacks.delete(code);
}

export function reassignCanvasAuthor(code: string, oldAuthor: string, newAuthor: string): void {
  const ops = canvases.get(code);
  if (ops) {
    for (const op of ops) {
      if (op.author === oldAuthor) op.author = newAuthor;
    }
  }

  const stack = redoStacks.get(code);
  if (stack) {
    for (const op of stack) {
      if (op.author === oldAuthor) op.author = newAuthor;
    }
  }
}

function ensure(code: string): DrawOp[] {
  let ops = canvases.get(code);
  if (!ops) {
    ops = [];
    canvases.set(code, ops);
  }
  return ops;
}

/** Add an op to the canvas (used by both new draws and redo). */
function appendOp(code: string, op: DrawOp): void {
  const ops = ensure(code);
  ops.push(op);
  // Keep memory bounded: drop the oldest op if we exceed the cap.
  if (ops.length > MAX_CANVAS_OPS) ops.shift();
}

/** A brand-new draw invalidates that author's redo history. */
function clearRedoFor(code: string, author: string): void {
  const stack = redoStacks.get(code);
  if (stack) redoStacks.set(code, stack.filter((op) => op.author !== author));
}

/* --- validation helpers --- */

function validColor(c: unknown): string | null {
  return typeof c === "string" && PALETTE.has(c) ? c : null;
}

function validSize(s: unknown): number | null {
  const n = Number(s);
  return BRUSH_SIZES.includes(n) ? n : null;
}

function clamp(n: number, max: number): number {
  return n < 0 ? 0 : n > max ? max : n;
}

function validPoint(p: unknown): Point | null {
  const obj = p as { x?: unknown; y?: unknown } | null;
  const x = Number(obj?.x);
  const y = Number(obj?.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return { x: clamp(x, CANVAS_WIDTH), y: clamp(y, CANVAS_HEIGHT) };
}

/** Validate a live segment (not stored — just relayed). */
export function sanitizeSegment(raw: unknown): Segment | null {
  const s = raw as Partial<Segment> | null;
  const color = validColor(s?.color);
  const size = validSize(s?.size);
  if (!color || size == null) return null;
  const nums = [s?.x0, s?.y0, s?.x1, s?.y1].map(Number);
  if (!nums.every(Number.isFinite)) return null;
  const [x0, y0, x1, y1] = nums;
  return {
    x0: clamp(x0, CANVAS_WIDTH),
    y0: clamp(y0, CANVAS_HEIGHT),
    x1: clamp(x1, CANVAS_WIDTH),
    y1: clamp(y1, CANVAS_HEIGHT),
    color,
    size,
  };
}

/** Validate + store a completed stroke. Returns the stored op, or null. */
export function addStroke(code: string, raw: unknown, author: string): StrokeOp | null {
  const payload = raw as { points?: unknown; color?: unknown; size?: unknown } | null;
  const color = validColor(payload?.color);
  const size = validSize(payload?.size);
  if (!color || size == null) return null;
  if (!Array.isArray(payload?.points) || payload.points.length === 0) return null;

  const points: Point[] = [];
  for (const p of payload.points.slice(0, MAX_STROKE_POINTS)) {
    const vp = validPoint(p);
    if (vp) points.push(vp);
  }
  if (points.length === 0) return null;

  const op: StrokeOp = { type: "stroke", points, color, size, author };
  appendOp(code, op);
  clearRedoFor(code, author);
  return op;
}

/** Validate + store a fill. Returns the stored op, or null. */
export function addFill(code: string, raw: unknown, author: string): FillOp | null {
  const payload = raw as { x?: unknown; y?: unknown; color?: unknown } | null;
  const color = validColor(payload?.color);
  const point = validPoint(payload);
  if (!color || !point) return null;

  const op: FillOp = { type: "fill", x: point.x, y: point.y, color, author };
  appendOp(code, op);
  clearRedoFor(code, author);
  return op;
}

/** Undo the requester's most recent op (moves it to the redo stack). */
export function undoLast(code: string, author: string): boolean {
  const ops = canvases.get(code);
  if (!ops) return false;
  for (let i = ops.length - 1; i >= 0; i--) {
    if (ops[i].author === author) {
      const [removed] = ops.splice(i, 1);
      const stack = redoStacks.get(code) ?? [];
      stack.push(removed);
      redoStacks.set(code, stack);
      return true;
    }
  }
  const removed = ops.pop();
  if (!removed) return false;
  const stack = redoStacks.get(code) ?? [];
  stack.push(removed);
  redoStacks.set(code, stack);
  return true;
}

/** Redo the requester's most recently undone op (puts it back on top). */
export function redoLast(code: string, author: string): boolean {
  const stack = redoStacks.get(code);
  if (!stack) return false;
  for (let i = stack.length - 1; i >= 0; i--) {
    if (stack[i].author === author) {
      const [restored] = stack.splice(i, 1);
      appendOp(code, restored);
      return true;
    }
  }
  const restored = stack.pop();
  if (!restored) return false;
  appendOp(code, restored);
  return true;
}
