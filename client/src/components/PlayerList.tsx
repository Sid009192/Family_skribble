/**
 * PlayerList.tsx — the rank+score+avatar list shown left of the chat.
 *
 * Each row matches the skribbl reference:
 *   #1   sid (You)        [crown]  [avatar]   [kick?]
 *        0 points
 *
 * Players are ranked by points desc; ties keep original join order. The host
 * gets the orange owner crown next to their avatar. Kick is host-only and we
 * still need the parent to enforce when (lobby-only for host; admin always).
 */

import type { Player } from "@shared/types";
import { Avatar } from "./Avatar";

interface Props {
  players: Player[];
  hostId: string;
  meId?: string;
  /** If true, show a kick button next to other players. */
  canKick?: boolean;
  onKick?: (targetId: string) => void;
}

export function PlayerList({ players, hostId, meId, canKick, onKick }: Props) {
  // Rank by points; stable for equal scores via original order.
  const ranked = [...players]
    .map((p, i) => ({ p, originalIndex: i }))
    .sort((a, b) => b.p.score - a.p.score || a.originalIndex - b.originalIndex);

  return (
    <ul className="player-list">
      {ranked.map(({ p }, idx) => (
        <li key={p.id} className="player-row">
          <div className="rank-cell">
            <span className="rank-chip">#{idx + 1}</span>
            {/* Left crown = "room owner" badge, only for the host. */}
            {p.id === hostId && (
              <img className="owner-badge" src="/img/owner.gif" alt="" title="Room owner" />
            )}
          </div>

          <div className="player-info">
            <span className="player-name">
              {p.name}
              {p.id === meId && <span className="you-tag"> (You)</span>}
            </span>
            <span className="player-points">{p.score} points</span>
          </div>

          <div className="avatar-cell">
            <Avatar avatar={p.avatar} />
            {/* Right crown = "in the lead", sits over the avatar like skribbl. */}
            {idx === 0 && p.id === hostId && (
              <img className="leader-crown" src="/img/crown.gif" alt="" title="Leader" />
            )}
          </div>

          {canKick && p.id !== meId && (
            <button
              type="button"
              className="kick-btn"
              title={`Kick ${p.name}`}
              onClick={() => onKick?.(p.id)}
            >
              ✕
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}
