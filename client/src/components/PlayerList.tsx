/**
 * PlayerList.tsx — shows everyone currently in the room.
 *
 * It's "dumb": it just renders whatever players array it's given. The live
 * updating happens because the parent re-renders with a new list whenever the
 * server sends a fresh `roomState`.
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
  return (
    <ul className="player-list">
      {players.map((p) => (
        <li key={p.id} className="player-row">
          <Avatar avatar={p.avatar} size={40} />
          <span className="player-name">
            {p.name}
            {p.id === meId && <span className="you-tag"> (You)</span>}
          </span>
          {p.id === hostId && (
            <span className="badge-host" title="Host">
              👑
            </span>
          )}
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
