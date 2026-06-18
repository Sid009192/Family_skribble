/**
 * JoinModal.tsx — the popup behind the green "Join" button.
 *
 * Two ways to join from here:
 *  1. Type a 5-letter room code (any room, public OR private).
 *  2. Tap a row in the live network list (public rooms only, lobby OR active).
 *
 * For active-game rooms the server will auto-reconnect if you were there, or
 * send a joinRequest to the host. In that case `pendingApproval` becomes true
 * and this modal shows a "Waiting for host…" message instead of closing.
 */

import { useEffect, useState } from "react";
import { MAX_PLAYERS, ROOM_CODE_LENGTH } from "@shared/types";
import type { RoomSummary } from "@shared/types";
import type { JoinResult } from "@shared/events";

interface Props {
  roomList: RoomSummary[];
  canJoin: boolean;
  pendingApproval: boolean;
  onJoin: (code: string) => Promise<JoinResult>;
  onJoinActive: (code: string) => Promise<JoinResult>;
  onClose: () => void;
  onCancelApproval: () => void;
}

export function JoinModal({ roomList, canJoin, pendingApproval, onJoin, onJoinActive, onClose, onCancelApproval }: Props) {
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !pendingApproval) onClose();
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose, pendingApproval]);

  // Clear error when pendingApproval changes (denied = error shows in Home notice).
  useEffect(() => {
    if (!pendingApproval) setError(null);
  }, [pendingApproval]);

  async function tryJoin(c: string, isActive: boolean) {
    setError(null);
    setBusy(true);
    const res = isActive ? await onJoinActive(c) : await onJoin(c);
    setBusy(false);
    if (res.pending) {
      // pendingApproval state is now true in useRoom; keep modal open.
      return;
    }
    if (!res.ok) setError(res.error ?? "Couldn't join that room.");
    // If ok, parent will unmount us (room state changed → App re-routes).
  }

  const trimmed = code.trim();
  const codeOk = trimmed.length === ROOM_CODE_LENGTH;

  if (pendingApproval) {
    return (
      <div className="modal-overlay">
        <div className="join-modal pending-modal">
          <div className="pending-spinner" />
          <p className="pending-text">Waiting for host approval…</p>
          <button
            className="secondary"
            onClick={() => {
              onCancelApproval();
              onClose();
            }}
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

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
              onClick={() => tryJoin(trimmed, false)}
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
              {roomList.map((r, idx) => {
                const isActive = r.phase !== "lobby";
                return (
                  <li
                    key={r.code}
                    className={`room-item-modal${isActive ? " room-active" : ""}`}
                    style={{ animationDelay: `${idx * 40}ms` }}
                  >
                    <div className="room-info">
                      <strong className="room-code">{r.code}</strong>
                      <span className="room-host">{r.hostName}</span>
                      {isActive && <span className="room-phase-badge">In Game</span>}
                    </div>
                    <span className="room-count">
                      {r.playerCount}/{MAX_PLAYERS}
                    </span>
                    <button
                      className="secondary"
                      disabled={!canJoin || busy}
                      onClick={() => tryJoin(r.code, isActive)}
                    >
                      {isActive ? "Request" : "Join"}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
