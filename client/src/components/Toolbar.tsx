/**
 * Toolbar.tsx — colors, brush sizes, tool toggle (brush/eraser/fill),
 * undo, redo, clear. Controlled by the parent (DrawBoard); undo/redo/clear
 * are just socket messages.
 */

import { BRUSH_SIZES, DRAW_PALETTE } from "@shared/types";
import { socket } from "../socket";
import {
  BrushIcon,
  EraserIcon,
  FillIcon,
  RedoIcon,
  TrashIcon,
  UndoIcon,
} from "./icons";

export type Tool = "brush" | "eraser" | "fill";

interface Props {
  color: string;
  size: number;
  tool: Tool;
  onColor: (c: string) => void;
  onSize: (s: number) => void;
  onTool: (t: Tool) => void;
}

export function Toolbar({ color, size, tool, onColor, onSize, onTool }: Props) {
  return (
    <div className="toolbar">
      <div className="palette">
        {DRAW_PALETTE.map((c) => (
          <button
            key={c}
            type="button"
            className={"swatch" + (c === color ? " selected" : "")}
            style={{ backgroundColor: c }}
            aria-label={`color ${c}`}
            onClick={() => onColor(c)}
          />
        ))}
      </div>

      <div className="tool-row">
        <div className="sizes">
          {BRUSH_SIZES.map((s) => (
            <button
              key={s}
              type="button"
              className={"size-btn" + (s === size ? " selected" : "")}
              onClick={() => onSize(s)}
              aria-label={`brush size ${s}`}
            >
              <span className="size-dot" style={{ width: s, height: s }} />
            </button>
          ))}
        </div>

        <div className="actions">
          <button
            type="button"
            className={"tool-btn" + (tool === "brush" ? " selected" : "")}
            onClick={() => onTool("brush")}
            title="Brush"
          >
            <BrushIcon />
          </button>
          <button
            type="button"
            className={"tool-btn" + (tool === "eraser" ? " selected" : "")}
            onClick={() => onTool("eraser")}
            title="Eraser"
          >
            <EraserIcon />
          </button>
          <button
            type="button"
            className={"tool-btn" + (tool === "fill" ? " selected" : "")}
            onClick={() => onTool("fill")}
            title="Fill"
          >
            <FillIcon />
          </button>
          <button type="button" className="tool-btn" onClick={() => socket.emit("undoDraw")} title="Undo">
            <UndoIcon />
          </button>
          <button type="button" className="tool-btn" onClick={() => socket.emit("redoDraw")} title="Redo">
            <RedoIcon />
          </button>
          <button type="button" className="tool-btn" onClick={() => socket.emit("clearCanvas")} title="Clear">
            <TrashIcon />
          </button>
        </div>
      </div>
    </div>
  );
}
