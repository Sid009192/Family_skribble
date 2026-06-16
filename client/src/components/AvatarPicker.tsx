/**
 * AvatarPicker.tsx — customize your avatar before joining (skribbl-style).
 *
 * The avatar sits in the middle with a column of "‹" arrows on the left and "›"
 * arrows on the right. Each of the three rows controls one feature, in the
 * order eyes → mouth → colour. A die in the corner randomizes everything.
 *
 * It's a "controlled component": the parent owns the avatar value and passes it
 * in with an `onChange`, so there's a single source of truth (a key React habit).
 */

import { AVATAR_OPTIONS } from "@shared/types";
import type { Avatar as AvatarType } from "@shared/types";
import { Avatar, randomAvatar } from "./Avatar";

interface Props {
  value: AvatarType;
  onChange: (next: AvatarType) => void;
}

// The three features, top-to-bottom, with their option counts.
const PARTS = [
  { key: "eyes", label: "eyes", count: AVATAR_OPTIONS.eyes },
  { key: "mouth", label: "mouth", count: AVATAR_OPTIONS.mouths },
  { key: "color", label: "colour", count: AVATAR_OPTIONS.colors },
] as const;

export function AvatarPicker({ value, onChange }: Props) {
  // Cycle one part forward/backward, wrapping around (no out-of-range cells).
  function cycle(part: keyof AvatarType, delta: number, count: number) {
    const next = (((value[part] + delta) % count) + count) % count;
    onChange({ ...value, [part]: next });
  }

  return (
    <div className="avatar-customizer">
      <div className="arrows left">
        {PARTS.map((p) => (
          <button
            key={p.key}
            type="button"
            className="arrow"
            onClick={() => cycle(p.key, -1, p.count)}
            aria-label={`previous ${p.label}`}
          >
            ‹
          </button>
        ))}
      </div>

      <Avatar avatar={value} size={120} />

      <div className="arrows right">
        {PARTS.map((p) => (
          <button
            key={p.key}
            type="button"
            className="arrow"
            onClick={() => cycle(p.key, 1, p.count)}
            aria-label={`next ${p.label}`}
          >
            ›
          </button>
        ))}
      </div>

      <button
        type="button"
        className="randomize-die"
        onClick={() => onChange(randomAvatar())}
        aria-label="randomize avatar"
        title="Randomize"
      >
        🎲
      </button>
    </div>
  );
}
