/**
 * RoomList.tsx — the "rooms on your network" list on the Home screen.
 *
 * It just renders whatever summaries the server sent. Tapping Join uses the
 * name/avatar already chosen on Home. Disabled until a valid name is entered.
 */

import type { RoomSummary } from "@shared/types";

interface Props {
  rooms: RoomSummary[];
  canJoin: boolean;
  onJoin: (code: string) => void;
}

export function RoomList({ rooms, canJoin, onJoin }: Props) {
  if (rooms.length === 0) return null;

  return (
    <div className="room-list">
      <h2>Rooms on your network</h2>
      <ul>
        {rooms.map((r) => (
          <li key={r.code} className="room-item">
            <div className="room-info">
              <b className="room-code">{r.code}</b>
              <span className="room-host">{r.hostName}'s room</span>
            </div>
            <span className="room-count">
              {r.playerCount} {r.playerCount === 1 ? "player" : "players"}
            </span>
            <button
              type="button"
              className="secondary"
              disabled={!canJoin}
              onClick={() => onJoin(r.code)}
            >
              Join
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
