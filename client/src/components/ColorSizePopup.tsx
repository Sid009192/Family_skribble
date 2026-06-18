/**
 * ColorSizePopup.tsx — modal for the drawer to pick a colour + brush size.
 *
 * Lives over the canvas (not blocking the whole page) so the drawer can still
 * see what they were drawing. Closes on backdrop tap, on the X button, or
 * automatically once the user picks a colour (sizing also auto-closes so a
 * single tap = pick + dismiss, like skribbl).
 */

import { BRUSH_SIZES, DRAW_PALETTE } from "@shared/types";

interface Props {
  open: boolean;
  color: string;
  size: number;
  onColor: (c: string) => void;
  onSize: (s: number) => void;
  onClose: () => void;
}

export function ColorSizePopup({
  open,
  color,
  size,
  onColor,
  onSize,
  onClose,
}: Props) {
  if (!open) return null;
  return (
    <div className="picker-backdrop" onClick={onClose}>
      <div
        className="picker-panel"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Choose colour and brush size"
      >
        <button
          type="button"
          className="picker-close"
          onClick={onClose}
          aria-label="Close"
        >
          ×
        </button>

        <div className="palette">
          {DRAW_PALETTE.map((c) => (
            <button
              key={c}
              type="button"
              className={"swatch" + (c === color ? " selected" : "")}
              style={{ backgroundColor: c }}
              aria-label={`color ${c}`}
              onClick={() => {
                onColor(c);
              }}
            />
          ))}
        </div>

        <div className="sizes">
          {BRUSH_SIZES.map((s) => (
            <button
              key={s}
              type="button"
              className={"size-btn" + (s === size ? " selected" : "")}
              onClick={() => {
                onSize(s);
              }}
              aria-label={`brush size ${s}`}
            >
              <span className="size-dot" style={{ width: s, height: s }} />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
