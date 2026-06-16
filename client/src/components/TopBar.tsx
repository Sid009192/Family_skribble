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
  /** "WAITING" in the lobby, the time remaining in the live game, etc. */
  centerText: string;
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
}

export function TopBar({
  centerText,
  timer = 0,
  round,
  totalRounds,
  isAdmin,
  onLongPressCenter,
  onCogTap,
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
        {centerText}
      </div>

      <div className="topbar-right">
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
