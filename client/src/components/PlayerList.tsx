/**
 * PlayerList.tsx — the rank+score+avatar list shown left of the chat.
 *
 * Visual order = room.players join-order (stable — never re-sorted by score).
 * Disconnected players are hidden; reconnected players appear at the bottom
 * (the server moves them there in room.players on reconnect).
 * Rank chips (#1, #2…) are derived from score independently of row position.
 */

import type { Player } from "@shared/types";
import { Avatar } from "./Avatar";

interface Props {
  players: Player[];
  hostId: string;
  meId?: string;
  /** The player currently drawing — shows the pen icon on their row. */
  drawerId?: string;
  /** If true, show a kick button next to other players. */
  canKick?: boolean;
  onKick?: (targetId: string) => void;
}

export function PlayerList({ players, hostId, meId, drawerId, canKick, onKick }: Props) {
  // Score-based rank for every player (including disconnected ones so ranks
  // don't jump around while someone is away).
  const byScore = [...players].sort((a, b) => b.score - a.score);
  const rankOf = new Map(byScore.map((p, i) => [p.id, i + 1]));

  // Leader = highest scorer among connected players (crown makes no sense on
  // a hidden row, and a disconnected player "holding" the crown is confusing).
  const leaderId = byScore.find((p) => p.connected)?.id;

  // Display order = room.players as-is (join order, reconnects at bottom).
  // Only show connected players.
  const visible = players.filter((p) => p.connected);

  return (
    <ul className="player-list">
      {visible.map((p) => {
        const rank = rankOf.get(p.id) ?? 0;
        return (
          <li key={p.id} className="player-row">
            <div className="rank-cell">
              <span className="rank-chip">#{rank}</span>
              {p.id === hostId && (
                <img className="owner-badge" src="/img/owner.gif" alt="" title="Room owner" />
              )}
            </div>

            <div className="player-info">
              <div className="player-name-row">
                <span className="player-name">
                  {p.name}
                  {p.id === meId && <span className="you-tag"> (You)</span>}
                </span>
                {drawerId && p.id === drawerId && (
                  <img className="pen-badge" src="/img/pen.gif" alt="drawing" title="Currently drawing" />
                )}
              </div>
              <span className="player-points">{p.score} points</span>
            </div>

            <div className="avatar-cell">
              <Avatar avatar={p.avatar} />
              {p.id === leaderId && (
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
        );
      })}
    </ul>
  );
}
