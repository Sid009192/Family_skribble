/**
 * AvatarPicker.tsx — lets a player customize their avatar before joining.
 *
 * It's a "controlled component": it doesn't own the avatar value itself. The
 * parent holds the value and passes it in, plus an `onChange` to update it.
 * That keeps a single source of truth in the parent (a key React habit).
 */

import { AVATAR_OPTIONS } from "@shared/types";
import type { Avatar as AvatarType } from "@shared/types";
import { Avatar, randomAvatar } from "./Avatar";

interface Props {
  value: AvatarType;
  onChange: (next: AvatarType) => void;
}

export function AvatarPicker({ value, onChange }: Props) {
  // Cycle one part (color/eyes/mouth) forward or backward, wrapping around.
  function cycle(part: keyof AvatarType, delta: number, count: number) {
    const next = (((value[part] + delta) % count) + count) % count;
    onChange({ ...value, [part]: next });
  }

  return (
    <div className="avatar-picker">
      <Avatar avatar={value} size={120} />

      <div className="avatar-rows">
        <PartRow
          label="Color"
          onPrev={() => cycle("color", -1, AVATAR_OPTIONS.colors)}
          onNext={() => cycle("color", 1, AVATAR_OPTIONS.colors)}
        />
        <PartRow
          label="Eyes"
          onPrev={() => cycle("eyes", -1, AVATAR_OPTIONS.eyes)}
          onNext={() => cycle("eyes", 1, AVATAR_OPTIONS.eyes)}
        />
        <PartRow
          label="Mouth"
          onPrev={() => cycle("mouth", -1, AVATAR_OPTIONS.mouths)}
          onNext={() => cycle("mouth", 1, AVATAR_OPTIONS.mouths)}
        />
      </div>

      <button
        type="button"
        className="ghost randomize"
        onClick={() => onChange(randomAvatar())}
      >
        🎲 Randomize
      </button>
    </div>
  );
}

function PartRow({
  label,
  onPrev,
  onNext,
}: {
  label: string;
  onPrev: () => void;
  onNext: () => void;
}) {
  return (
    <div className="part-row">
      <button type="button" className="arrow" onClick={onPrev} aria-label={`previous ${label}`}>
        ◀
      </button>
      <span className="part-label">{label}</span>
      <button type="button" className="arrow" onClick={onNext} aria-label={`next ${label}`}>
        ▶
      </button>
    </div>
  );
}
