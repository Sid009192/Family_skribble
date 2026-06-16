/**
 * prefs.ts — remember the player's name + avatar between sessions.
 *
 * We use the browser's localStorage (small, per-device, persists after closing
 * the tab). Everything is wrapped in try/catch because storage can be disabled
 * (private mode) or hold corrupted JSON — in which case we just fall back to
 * defaults rather than crashing.
 */

import { AVATAR_OPTIONS } from "@shared/types";
import type { Avatar } from "@shared/types";

const KEY = "familyScribble.prefs.v1";

export interface Prefs {
  name: string;
  avatar: Avatar;
}

/** Read saved prefs, validating shape. Returns null if absent/invalid. */
export function loadPrefs(): Prefs | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<Prefs>;
    const a = parsed.avatar;
    if (
      typeof parsed.name !== "string" ||
      !a ||
      typeof a.color !== "number" ||
      typeof a.eyes !== "number" ||
      typeof a.mouth !== "number"
    ) {
      return null;
    }
    // Keep indexes in range in case option counts changed since last save.
    const avatar: Avatar = {
      color: ((a.color % AVATAR_OPTIONS.colors) + AVATAR_OPTIONS.colors) % AVATAR_OPTIONS.colors,
      eyes: ((a.eyes % AVATAR_OPTIONS.eyes) + AVATAR_OPTIONS.eyes) % AVATAR_OPTIONS.eyes,
      mouth: ((a.mouth % AVATAR_OPTIONS.mouths) + AVATAR_OPTIONS.mouths) % AVATAR_OPTIONS.mouths,
    };
    return { name: parsed.name, avatar };
  } catch {
    return null;
  }
}

/** Save prefs (best-effort). */
export function savePrefs(prefs: Prefs): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(prefs));
  } catch {
    // ignore (storage full or disabled)
  }
}
