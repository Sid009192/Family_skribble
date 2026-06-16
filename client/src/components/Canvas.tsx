/**
 * Canvas.tsx — the drawing surface.
 *
 * Two jobs:
 *   1. RENDER what the server says is on the canvas (authoritative), plus live
 *      segments other people are currently drawing.
 *   2. CAPTURE this device's drawing (pointer events) and send it up.
 *
 * Key idea: full re-renders ONLY happen from the server's `canvasState`
 * (which includes everyone's committed strokes). Between those, we paint
 * incrementally. That keeps drawing smooth while staying consistent after
 * undo/clear, with no double-drawing.
 *
 * We use Pointer Events (not mouse/touch separately) so one code path handles
 * mouse, touch, and stylus.
 */

import { useEffect, useRef } from "react";
import { CANVAS_HEIGHT, CANVAS_WIDTH } from "@shared/types";
import type { DrawOp, Point, Segment } from "@shared/types";
import { socket } from "../socket";
import type { Tool } from "./Toolbar";

interface Props {
  color: string;
  size: number;
  tool: Tool;
  /** When false, this device can only VIEW (e.g. you're not the drawer). */
  drawable?: boolean;
}

export function Canvas({ color, size, tool, drawable = true }: Props) {
  // The eraser is just a white brush (our canvas background is white). All the
  // brush/segment code below uses this color so erasing syncs like any stroke.
  const drawColor = tool === "eraser" ? "#ffffff" : color;
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  // Drawing-in-progress state lives in refs (changing it shouldn't re-render).
  const drawingRef = useRef(false);
  const lastRef = useRef<Point | null>(null);
  const strokeRef = useRef<Point[]>([]);

  // --- Set up the canvas + server listeners once on mount ----------------
  useEffect(() => {
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    paintBackground(ctx);

    const onCanvasState = (ops: DrawOp[]) => redrawAll(ctx, ops);
    const onLiveSegment = (seg: Segment) => drawSegment(ctx, seg);
    const onOpCommitted = (op: DrawOp) => applyOp(ctx, op);

    socket.on("canvasState", onCanvasState);
    socket.on("liveSegment", onLiveSegment);
    socket.on("opCommitted", onOpCommitted);

    // Ask for the current picture (avoids a race where the server's reply
    // could arrive before our listener was attached).
    socket.emit("requestCanvas");

    return () => {
      socket.off("canvasState", onCanvasState);
      socket.off("liveSegment", onLiveSegment);
      socket.off("opCommitted", onOpCommitted);
    };
  }, []);

  // --- Convert a pointer event to canvas-space coordinates ---------------
  function toCanvasPoint(e: React.PointerEvent<HTMLCanvasElement>): Point {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * CANVAS_WIDTH,
      y: ((e.clientY - rect.top) / rect.height) * CANVAS_HEIGHT,
    };
  }

  function onPointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawable) return; // view-only (not your turn)
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    const pt = toCanvasPoint(e);

    if (tool === "fill") {
      socket.emit("fillCanvas", { x: pt.x, y: pt.y, color });
      floodFill(ctx, pt.x, pt.y, color); // optimistic local fill
      return;
    }

    // Brush: begin a stroke. Capture the pointer so we keep getting moves even
    // if the finger drifts slightly off the element.
    e.currentTarget.setPointerCapture(e.pointerId);
    drawingRef.current = true;
    lastRef.current = pt;
    strokeRef.current = [pt];
    dot(ctx, pt, drawColor, size); // so a single tap leaves a dot
  }

  function onPointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawingRef.current) return;
    const ctx = canvasRef.current?.getContext("2d");
    const last = lastRef.current;
    if (!ctx || !last) return;
    const pt = toCanvasPoint(e);
    // Skip tiny movements to avoid flooding the network with zero-length segments.
    if (Math.abs(pt.x - last.x) < 0.6 && Math.abs(pt.y - last.y) < 0.6) return;

    const seg: Segment = { x0: last.x, y0: last.y, x1: pt.x, y1: pt.y, color: drawColor, size };
    drawSegment(ctx, seg); // draw locally now
    socket.emit("liveSegment", seg); // others see it live
    strokeRef.current.push(pt);
    lastRef.current = pt;
  }

  function endStroke() {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    const points = strokeRef.current;
    strokeRef.current = [];
    lastRef.current = null;
    if (points.length > 0) {
      socket.emit("commitStroke", { points, color: drawColor, size });
    }
  }

  return (
    <canvas
      ref={canvasRef}
      width={CANVAS_WIDTH}
      height={CANVAS_HEIGHT}
      className={"draw-canvas" + (drawable ? "" : " view-only")}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endStroke}
      onPointerCancel={endStroke}
      onPointerLeave={endStroke}
    />
  );
}

/* ------------------------------------------------------------------ *
 * Pure drawing helpers (no React, no sockets — just pixels).
 * ------------------------------------------------------------------ */

function paintBackground(ctx: CanvasRenderingContext2D) {
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
}

function dot(ctx: CanvasRenderingContext2D, p: Point, color: string, size: number) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(p.x, p.y, size / 2, 0, Math.PI * 2);
  ctx.fill();
}

function drawSegment(ctx: CanvasRenderingContext2D, s: Segment) {
  ctx.strokeStyle = s.color;
  ctx.lineWidth = s.size;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.moveTo(s.x0, s.y0);
  ctx.lineTo(s.x1, s.y1);
  ctx.stroke();
}

function applyOp(ctx: CanvasRenderingContext2D, op: DrawOp) {
  if (op.type === "fill") {
    floodFill(ctx, op.x, op.y, op.color);
  } else {
    drawStroke(ctx, op);
  }
}

function drawStroke(
  ctx: CanvasRenderingContext2D,
  op: Extract<DrawOp, { type: "stroke" }>
) {
  if (op.points.length === 1) {
    dot(ctx, op.points[0], op.color, op.size);
    return;
  }
  ctx.strokeStyle = op.color;
  ctx.lineWidth = op.size;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.moveTo(op.points[0].x, op.points[0].y);
  for (let i = 1; i < op.points.length; i++) {
    ctx.lineTo(op.points[i].x, op.points[i].y);
  }
  ctx.stroke();
}

function redrawAll(ctx: CanvasRenderingContext2D, ops: DrawOp[]) {
  paintBackground(ctx);
  for (const op of ops) applyOp(ctx, op);
}

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/**
 * Flood fill ("paint bucket"). Standard stack-based fill with a small color
 * tolerance (to bridge anti-aliased edges) and a visited map (so it can never
 * loop). Operates on the whole 800x600 image — fast enough in practice.
 */
function floodFill(
  ctx: CanvasRenderingContext2D,
  fx: number,
  fy: number,
  hex: string
) {
  const w = CANVAS_WIDTH;
  const h = CANVAS_HEIGHT;
  const sx = Math.round(fx);
  const sy = Math.round(fy);
  if (sx < 0 || sy < 0 || sx >= w || sy >= h) return;

  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  const start = (sy * w + sx) * 4;
  const tr = d[start];
  const tg = d[start + 1];
  const tb = d[start + 2];
  const ta = d[start + 3];
  const [fr, fg, fb] = hexToRgb(hex);
  if (tr === fr && tg === fg && tb === fb && ta === 255) return; // already that color

  const tol = 32;
  const matches = (i: number) =>
    Math.abs(d[i] - tr) <= tol &&
    Math.abs(d[i + 1] - tg) <= tol &&
    Math.abs(d[i + 2] - tb) <= tol &&
    Math.abs(d[i + 3] - ta) <= tol;

  const visited = new Uint8Array(w * h);
  const stack: number[] = [sx, sy];
  while (stack.length) {
    const y = stack.pop()!;
    const x = stack.pop()!;
    const p = y * w + x;
    if (visited[p]) continue;
    visited[p] = 1;
    const i = p * 4;
    if (!matches(i)) continue;
    d[i] = fr;
    d[i + 1] = fg;
    d[i + 2] = fb;
    d[i + 3] = 255;
    if (x > 0) stack.push(x - 1, y);
    if (x < w - 1) stack.push(x + 1, y);
    if (y > 0) stack.push(x, y - 1);
    if (y < h - 1) stack.push(x, y + 1);
  }
  ctx.putImageData(img, 0, 0);
}
