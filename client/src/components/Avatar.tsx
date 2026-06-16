/**
 * Avatar.tsx — a player's face, built from three sprite atlases.
 *
 * An avatar is just three numbers: { color, eyes, mouth }. Each number indexes
 * a cell in one of the 10×10 atlas images in `public/avatar/`. We stack three
 * transparent layers (color on the bottom, then eyes, then mouth) and slide
 * each atlas to the right cell with CSS `background-position` — the browser
 * does the cropping, so there are no image assets to slice.
 *
 * Why `background-size: 1000%`? The atlas is 10 cells wide, so blowing it up to
 * 1000% makes each cell exactly the size of the box. Then a position of
 * `col/9 * 100%` lines that column up against the left edge (0% = first cell,
 * 100% = last cell), and likewise for rows.
 */

import { AVATAR_OPTIONS, AVATAR_ATLAS_COLS } from "@shared/types";
import type { Avatar as AvatarType } from "@shared/types";

const COLS = AVATAR_ATLAS_COLS; // 10

/** Map a flat cell index to a CSS background-position for a 10×10 atlas. */
function cellPosition(index: number): string {
  const col = index % COLS;
  const row = Math.floor(index / COLS);
  const x = (col / (COLS - 1)) * 100;
  const y = (row / (COLS - 1)) * 100;
  return `${x}% ${y}%`;
}

/** Pick a random valid avatar (used by the "Randomize" die). */
export function randomAvatar(): AvatarType {
  const r = (n: number) => Math.floor(Math.random() * n);
  return {
    color: r(AVATAR_OPTIONS.colors),
    eyes: r(AVATAR_OPTIONS.eyes),
    mouth: r(AVATAR_OPTIONS.mouths),
  };
}

/** One stacked atlas layer (color / eyes / mouth). */
function Layer({ atlas, index }: { atlas: string; index: number }) {
  return (
    <span
      className="avatar-layer"
      style={{
        backgroundImage: `url(/avatar/${atlas}.gif)`,
        backgroundPosition: cellPosition(index),
      }}
    />
  );
}

export function Avatar({
  avatar,
  size = 96,
}: {
  avatar: AvatarType;
  size?: number;
}) {
  return (
    <span
      className="avatar"
      role="img"
      aria-label="player avatar"
      style={{ width: size, height: size }}
    >
      <Layer atlas="color_atlas" index={avatar.color % AVATAR_OPTIONS.colors} />
      <Layer atlas="eyes_atlas" index={avatar.eyes % AVATAR_OPTIONS.eyes} />
      <Layer atlas="mouth_atlas" index={avatar.mouth % AVATAR_OPTIONS.mouths} />
    </span>
  );
}
