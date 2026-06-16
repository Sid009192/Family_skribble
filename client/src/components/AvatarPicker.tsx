/**
 * AvatarPicker.tsx — customize your avatar (skribbl-faithful).
 *
 * Layout: avatar in the middle, three "‹" arrows on the left and three "›"
 * arrows on the right (one row per feature: eyes → mouth → colour). A small
 * die in the corner randomizes all three.
 *
 * Arrows + die are the actual skribbl sprite GIFs the user supplied. The arrow
 * is a 2×2 sprite (left / right × normal / hover) — we point the same image
 * with different `background-position` for each state.
 */

import { AVATAR_OPTIONS } from "@shared/types";
import type { Avatar as AvatarType } from "@shared/types";
import { Avatar, randomAvatar } from "./Avatar";

interface Props {
  value: AvatarType;
  onChange: (next: AvatarType) => void;
}

// Top-to-bottom order requested by the user.
const PARTS = [
  { key: "eyes", label: "eyes", count: AVATAR_OPTIONS.eyes },
  { key: "mouth", label: "mouth", count: AVATAR_OPTIONS.mouths },
  { key: "color", label: "colour", count: AVATAR_OPTIONS.colors },
] as const;

export function AvatarPicker({ value, onChange }: Props) {
  function cycle(part: keyof AvatarType, delta: number, count: number) {
    const next = (((value[part] + delta) % count) + count) % count;
    onChange({ ...value, [part]: next });
  }

  return (
    <div className="avatar-customizer">
      <button
        type="button"
        className="randomize-die"
        onClick={() => onChange(randomAvatar())}
        aria-label="randomize avatar"
        title="Randomize"
      />

      <div className="arrows left">
        {PARTS.map((p) => (
          <button
            key={p.key}
            type="button"
            className="arrow"
            onClick={() => cycle(p.key, -1, p.count)}
            aria-label={`previous ${p.label}`}
          />
        ))}
      </div>

      <Avatar avatar={value} />

      <div className="arrows right">
        {PARTS.map((p) => (
          <button
            key={p.key}
            type="button"
            className="arrow"
            onClick={() => cycle(p.key, 1, p.count)}
            aria-label={`next ${p.label}`}
          />
        ))}
      </div>
    </div>
  );
}
