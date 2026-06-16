/**
 * JoinModal.tsx — the popup behind the green "Join" button.
 *
 * Two ways to join from here:
 *  1. Type a 5-letter room code (any room, public OR private).
 *  2. Tap a row in the live network list (public rooms only).
 *
 * The modal slides+fades in (handled by CSS keyframes). When a join succeeds
 * the parent unmounts us; if it fails we surface the error inline.
 */

import { useEffect, useState } from "react";
import { MAX_PLAYERS, ROOM_CODE_LENGTH } from "@shared/types";
import type { RoomSummary } from "@shared/types";
import type { JoinResult } from "@shared/events";

interface Props {
  roomList: RoomSummary[];
  canJoin: boolean; // false until we have a valid name + the socket is connected
  onJoin: (code: string) => Promise<JoinResult>;
  onClose: () => void;
}

export function JoinModal({ roomList, canJoin, onJoin, onClose }: Props) {
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Close on Escape — a nice keyboard nicety since this is a modal.
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  async function tryJoin(c: string) {
    setError(null);
    setBusy(true);
    const res = await onJoin(c);
    setBusy(false);
    if (!res.ok) setError(res.error ?? "Couldn't join that room.");
  }

  const trimmed = code.trim();
  const codeOk = trimmed.length === ROOM_CODE_LENGTH;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="join-modal" onClick={(e) => e.stopPropagation()}>
        <header className="join-modal-head">
          <h2>Join a room</h2>
          <button className="close-x" onClick={onClose} aria-label="close">
            ×
          </button>
        </header>

        <section className="join-by-code">
          <label className="section-label">Enter room code</label>
          <div className="join-row">
            <input
              className="text-input code-input"
              type="text"
              placeholder="CODE"
              value={code}
              maxLength={ROOM_CODE_LENGTH}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              autoFocus
              spellCheck={false}
              autoCapitalize="characters"
            />
            <button
              className="secondary"
              onClick={() => tryJoin(trimmed)}
              disabled={!canJoin || !codeOk || busy}
            >
              Join
            </button>
          </div>
          {error && <p className="hint error">{error}</p>}
        </section>

        <section className="join-by-list">
          <label className="section-label">
            On your network
            <span className="room-count-badge">{roomList.length}</span>
          </label>

          {roomList.length === 0 ? (
            <p className="empty-rooms">No public rooms yet. Create one or wait.</p>
          ) : (
            <ul className="room-list-modal">
              {roomList.map((r, idx) => (
                <li
                  key={r.code}
                  className="room-item-modal"
                  style={{ animationDelay: `${idx * 40}ms` }}
                >
                  <div className="room-info">
                    <strong className="room-code">{r.code}</strong>
                    <span className="room-host">{r.hostName}</span>
                  </div>
                  <span className="room-count">
                    {r.playerCount}/{MAX_PLAYERS}
                  </span>
                  <button
                    className="secondary"
                    disabled={!canJoin || busy}
                    onClick={() => tryJoin(r.code)}
                  >
                    Join
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

