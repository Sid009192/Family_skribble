/**
 * DrawBoard.tsx — pairs the Canvas with its Toolbar and owns the tool state.
 * When `drawable` is false (you're not the drawer), the canvas is view-only and
 * the toolbar is hidden.
 */

import { useState } from "react";
import { BRUSH_SIZES } from "@shared/types";
import { Canvas } from "./Canvas";
import { Toolbar, type Tool } from "./Toolbar";

export function DrawBoard({ drawable = true }: { drawable?: boolean }) {
  const [color, setColor] = useState("#000000");
  const [size, setSize] = useState(BRUSH_SIZES[1]);
  const [tool, setTool] = useState<Tool>("brush");

  return (
    <div className="draw-board">
      <Canvas color={color} size={size} tool={tool} drawable={drawable} />
      {drawable && (
        <Toolbar
          color={color}
          size={size}
          tool={tool}
          onColor={setColor}
          onSize={setSize}
          onTool={setTool}
        />
      )}
    </div>
  );
}
