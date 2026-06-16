/**
 * CharacterRow.tsx — a decorative row of sample avatars above the form.
 *
 * Like skribbl's landing row of characters. We generate 8 random combos from
 * our atlas once per mount (a `useMemo` keeps them stable while the page is
 * open, but they re-shuffle on every full page load).
 */

import { useMemo } from "react";
import { Avatar, randomAvatar } from "./Avatar";

const CHARS = 8;

export function CharacterRow() {
  const avatars = useMemo(() => Array.from({ length: CHARS }, () => randomAvatar()), []);
  return (
    <div className="character-row" aria-hidden="true">
      {avatars.map((a, i) => (
        <Avatar key={i} avatar={a} />
      ))}
    </div>
  );
}
