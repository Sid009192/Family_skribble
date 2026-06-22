import type { CSSProperties } from "react";
import { BrushIcon, EraserIcon, FillIcon, RedoIcon, TrashIcon, UndoIcon } from "./icons";

export type Tool = "brush" | "eraser" | "fill";

interface Props {
  tool: Tool;
  color: string;
  onTool: (t: Tool) => void;
  onUndo: () => void;
  onRedo: () => void;
  onClear: () => void;
}

export function Toolbar({ tool, color, onTool, onUndo, onRedo, onClear }: Props) {
  return (
    <div className="toolbar" aria-label="Drawing tools">
      <div className="tool-row tool-row-primary">
        <button
          type="button"
          className={"tool-btn" + (tool === "brush" ? " selected" : "")}
          onClick={() => onTool("brush")}
          aria-label="Brush"
          title="Brush"
        >
          <BrushIcon />
        </button>
        <button
          type="button"
          className={"tool-btn" + (tool === "eraser" ? " selected" : "")}
          onClick={() => onTool("eraser")}
          aria-label="Eraser"
          title="Eraser"
        >
          <EraserIcon />
        </button>
        <button
          type="button"
          className={"tool-btn fill-tool" + (tool === "fill" ? " selected" : "")}
          onClick={() => onTool("fill")}
          aria-label="Fill"
          title="Fill"
          style={{ "--tool-color": color } as CSSProperties}
        >
          <FillIcon />
        </button>
      </div>

      <div className="tool-row tool-row-actions">
        <button
          type="button"
          className="tool-btn action-tool"
          onClick={onUndo}
          aria-label="Undo"
          title="Undo"
        >
          <UndoIcon />
        </button>
        <button
          type="button"
          className="tool-btn action-tool"
          onClick={onRedo}
          aria-label="Redo"
          title="Redo"
        >
          <RedoIcon />
        </button>
        <button
          type="button"
          className="tool-btn action-tool danger-tool"
          onClick={onClear}
          aria-label="Clear drawing"
          title="Clear drawing"
        >
          <TrashIcon />
        </button>
      </div>
    </div>
  );
}
