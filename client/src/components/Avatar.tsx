/**
 * Avatar.tsx — our own avatar, drawn as an SVG face (no image assets needed).
 *
 * An avatar is just three numbers: { color, eyes, mouth }. Each number picks a
 * variant below. Because it's pure SVG, it scales crisply to any size and is
 * fully "ours" — a small quirk that sets us apart from skribbl.
 */

import { AVATAR_OPTIONS } from "@shared/types";
import type { Avatar as AvatarType } from "@shared/types";

/** The 8 face colors (index = avatar.color). */
export const AVATAR_COLORS = [
  "#ff5a5f",
  "#ffb400",
  "#ffe14d",
  "#5ad15a",
  "#3ec8c8",
  "#5a9bff",
  "#a06cff",
  "#ff7ac0",
];

const INK = "#1f2a44"; // dark outline/feature color

/** Pick a random valid avatar (used by the "Randomize" button). */
export function randomAvatar(): AvatarType {
  const r = (n: number) => Math.floor(Math.random() * n);
  return {
    color: r(AVATAR_OPTIONS.colors),
    eyes: r(AVATAR_OPTIONS.eyes),
    mouth: r(AVATAR_OPTIONS.mouths),
  };
}

function Eyes({ variant }: { variant: number }) {
  switch (variant % AVATAR_OPTIONS.eyes) {
    case 0: // dots
      return (
        <g fill={INK}>
          <circle cx="36" cy="44" r="5" />
          <circle cx="64" cy="44" r="5" />
        </g>
      );
    case 1: // wide ovals
      return (
        <g fill={INK}>
          <ellipse cx="36" cy="44" rx="6" ry="4" />
          <ellipse cx="64" cy="44" rx="6" ry="4" />
        </g>
      );
    case 2: // happy arches ^ ^
      return (
        <g fill="none" stroke={INK} strokeWidth="3" strokeLinecap="round">
          <path d="M30 46 L36 40 L42 46" />
          <path d="M58 46 L64 40 L70 46" />
        </g>
      );
    case 3: // surprised
      return (
        <g>
          <circle cx="36" cy="44" r="8" fill="#fff" stroke={INK} strokeWidth="2" />
          <circle cx="36" cy="44" r="3" fill={INK} />
          <circle cx="64" cy="44" r="8" fill="#fff" stroke={INK} strokeWidth="2" />
          <circle cx="64" cy="44" r="3" fill={INK} />
        </g>
      );
    default: // sleepy lines
      return (
        <g stroke={INK} strokeWidth="3" strokeLinecap="round">
          <line x1="30" y1="44" x2="42" y2="44" />
          <line x1="58" y1="44" x2="70" y2="44" />
        </g>
      );
  }
}

function Mouth({ variant }: { variant: number }) {
  switch (variant % AVATAR_OPTIONS.mouths) {
    case 0: // smile
      return (
        <path
          d="M36 64 Q50 76 64 64"
          fill="none"
          stroke={INK}
          strokeWidth="3"
          strokeLinecap="round"
        />
      );
    case 1: // open oval
      return <ellipse cx="50" cy="68" rx="10" ry="7" fill={INK} />;
    case 2: // flat
      return (
        <line
          x1="40"
          y1="68"
          x2="60"
          y2="68"
          stroke={INK}
          strokeWidth="3"
          strokeLinecap="round"
        />
      );
    case 3: // big grin
      return <path d="M34 62 Q50 80 66 62 Z" fill={INK} />;
    default: // small o
      return <circle cx="50" cy="68" r="5" fill={INK} />;
  }
}

export function Avatar({
  avatar,
  size = 96,
}: {
  avatar: AvatarType;
  size?: number;
}) {
  const color = AVATAR_COLORS[avatar.color % AVATAR_COLORS.length];
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      role="img"
      aria-label="player avatar"
    >
      <circle cx="50" cy="50" r="46" fill={color} stroke={INK} strokeWidth="3" />
      <Eyes variant={avatar.eyes} />
      <Mouth variant={avatar.mouth} />
    </svg>
  );
}
