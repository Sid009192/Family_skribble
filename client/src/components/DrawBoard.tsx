/**
 * DrawBoard.tsx — pairs the Canvas with its action Toolbar.
 *
 * Colour, size and tool are owned by the *parent* (Game.tsx) because the
 * colour/size popup is opened from the TopBar palette icon, not from here.
 * Lifting the state up means one source of truth and avoids prop drilling
 * through a context.
 */

import { useRef } from "react";
import { Canvas, type CanvasActions } from "./Canvas";
import { Toolbar, type Tool } from "./Toolbar";

interface Props {
  drawable: boolean;
  color: string;
  size: number;
  tool: Tool;
  onTool: (t: Tool) => void;
}

export function DrawBoard({ drawable, color, size, tool, onTool }: Props) {
  const canvasActions = useRef<CanvasActions | null>(null);

  return (
    <div className="draw-board">
      <Canvas
        color={color}
        size={size}
        tool={tool}
        drawable={drawable}
        actionsRef={canvasActions}
      />
      {drawable && (
        <Toolbar
          tool={tool}
          color={color}
          onTool={onTool}
          onUndo={() => canvasActions.current?.undo()}
          onRedo={() => canvasActions.current?.redo()}
          onClear={() => canvasActions.current?.clear()}
        />
      )}
    </div>
  );
}
