/**
 * Toolbar.tsx — the drawer's action bar (single row).
 *
 * Only the *frequently-used* tools live here: brush, eraser, fill, undo, redo,
 * clear. Colour swatches and brush sizes were moved into ColorSizePopup, which
 * is opened from the palette icon in the TopBar — that keeps the canvas area
 * clean and gives small phones more vertical room for the picture.
 */

import { socket } from "../socket";
import { BrushIcon, EraserIcon } from "./icons";

const ASSET_FILL = "/img/fill.gif";
const ASSET_UNDO = "/img/undo.gif";
const ASSET_CLEAR = "/img/clear.gif";

export type Tool = "brush" | "eraser" | "fill";

interface Props {
  tool: Tool;
  onTool: (t: Tool) => void;
}

export function Toolbar({ tool, onTool }: Props) {
  return (
    <div className="toolbar">
      <div className="tool-row">
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
          className={"tool-btn img-btn" + (tool === "fill" ? " selected" : "")}
          onClick={() => onTool("fill")}
          title="Fill"
        >
          <img src={ASSET_FILL} alt="" className="tool-icon" />
        </button>
        <button
          type="button"
          className="tool-btn img-btn"
          onClick={() => socket.emit("undoDraw")}
          title="Undo"
        >
          <img src={ASSET_UNDO} alt="" className="tool-icon" />
        </button>
        <button
          type="button"
          className="tool-btn img-btn"
          onClick={() => socket.emit("redoDraw")}
          title="Redo"
        >
          {/* No redo.gif in the asset pack — mirror the undo GIF horizontally,
              which is exactly the convention skribbl follows. */}
          <img src={ASSET_UNDO} alt="" className="tool-icon mirror-x" />
        </button>
        <button
          type="button"
          className="tool-btn img-btn"
          onClick={() => socket.emit("clearCanvas")}
          title="Clear"
        >
          <img src={ASSET_CLEAR} alt="" className="tool-icon" />
        </button>
      </div>
    </div>
  );
}
