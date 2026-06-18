/**
 * TopBar.tsx — the three-cell header used by both lobby and live game.
 *
 * Layout (per skribbl's PNG references):
 *   ┌──────────┬─────────────┬────────┐
 *   │ clock    │   centre    │  cog   │
 *   │ Round x of y │ STATUS   │ (admin)│
 *   └──────────┴─────────────┴────────┘
 *
 * The cog is rendered only when `isAdmin` is true — non-admins (including
 * the host) never see it. A long-press on the centre label opens the admin
 * unlock flow. After verification, `isAdmin` flips on and the cog appears.
 */

import { useLongPress } from "../hooks/useLongPress";

interface Props {
  /**
   * What sits in the middle cell. Lobby passes the plain "WAITING" string;
   * Game passes a richer block (label + masked word). Anything ReactNode-able
   * works — we apply long-press to the whole cell so admins can still unlock.
   */
  center: React.ReactNode;
  /** Seconds remaining on the active turn — shown over the clock. 0 in lobby. */
  timer?: number;
  /** Current round, 1-indexed. */
  round: number;
  /** Total rounds in this game. */
  totalRounds: number;
  isAdmin: boolean;
  /** Fires on long-press of the centre label (used to enter admin mode). */
  onLongPressCenter: () => void;
  /** Fires on cog tap (opens admin panel). */
  onCogTap: () => void;
  /**
   * Optional extra node placed to the LEFT of the admin cog in the right cell.
   * Game uses this for the drawer's colour/size palette trigger.
   */
  rightSlot?: React.ReactNode;
}

export function TopBar({
  center,
  timer = 0,
  round,
  totalRounds,
  isAdmin,
  onLongPressCenter,
  onCogTap,
  rightSlot,
}: Props) {
  const longPress = useLongPress(onLongPressCenter);
  return (
    <header className="topbar">
      <div className="topbar-left">
        <div className="topbar-clock-wrap">
          <img className="topbar-clock" src="/img/clock.gif" alt="" />
          <span className="topbar-timer">{timer}</span>
        </div>
        <span className="topbar-round">
          Round {round} of {totalRounds}
        </span>
      </div>

      <div className="topbar-center" {...longPress}>
        {center}
      </div>

      <div className="topbar-right">
        {rightSlot}
        {isAdmin && (
          <button
            type="button"
            className="topbar-cog"
            onClick={onCogTap}
            aria-label="admin panel"
            title="Admin panel"
          />
        )}
      </div>
    </header>
  );
}
