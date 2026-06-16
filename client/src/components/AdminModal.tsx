/**
 * AdminModal.tsx — the Super-Admin (godmode) console.
 *
 * If this device hasn't proven the key yet, it shows the unlock form. Once
 * unlocked (server-verified), it shows the godmode panel: global game controls,
 * live settings editing, and per-player powers. Every action is re-checked on
 * the server against this socket's admin flag.
 */

import { useState } from "react";
import type { Player } from "@shared/types";
import type { RoomApi } from "../useRoom";
import { SettingsPanel } from "./SettingsPanel";

interface Props {
  api: RoomApi;
  meId?: string;
  onClose: () => void;
}

export function AdminModal({ api, onClose }: Props) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-card admin-card"
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="admin-head">
          <h3 className="modal-title">Godmode</h3>
          <button className="ghost close-x" onClick={onClose} aria-label="close">
            ✕
          </button>
        </div>
        {api.isAdmin ? <Panel api={api} /> : <Unlock api={api} />}
      </div>
    </div>
  );
}

function Unlock({ api }: { api: RoomApi }) {
  const [key, setKey] = useState("");
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(false);
    const ok = await api.adminUnlock(key);
    setBusy(false);
    if (!ok) setError(true);
  }

  return (
    <form className="admin-unlock" onSubmit={submit}>
      <p>Enter the secret key to unlock godmode.</p>
      <input
        type="password"
        className="text-input"
        value={key}
        placeholder="Secret key"
        onChange={(e) => setKey(e.target.value)}
        autoFocus
      />
      <button className="primary" disabled={busy || key.length === 0}>
        Unlock
      </button>
      {error && <p className="hint error">Wrong key.</p>}
    </form>
  );
}

function Panel({ api }: { api: RoomApi }) {
  const room = api.room;
  if (!room) return null;
  const inGame = room.phase !== "lobby" && room.phase !== "gameover";

  return (
    <div className="admin-panel">
      <div className="admin-actions">
        {room.paused ? (
          <button className="secondary" onClick={api.admin.resume}>
            Resume
          </button>
        ) : (
          <button className="secondary" onClick={api.admin.pause} disabled={!inGame}>
            Pause
          </button>
        )}
        <button className="secondary" onClick={api.admin.skipTurn} disabled={!inGame}>
          Skip turn
        </button>
        <button className="secondary" onClick={api.admin.revealWord} disabled={room.phase !== "drawing"}>
          Reveal word
        </button>
        {room.phase === "lobby" ? (
          <button className="secondary" onClick={api.startGame}>
            Start game
          </button>
        ) : (
          <button className="secondary" onClick={api.returnToLobby}>
            To lobby
          </button>
        )}
      </div>

      <h4>Settings (live)</h4>
      <SettingsPanel settings={room.settings} editable onChange={api.updateSettings} />

      <h4>Players</h4>
      <div className="admin-players">
        {room.players.map((p) => (
          <AdminPlayerRow key={p.id} api={api} player={p} drawerId={room.drawerId} inGame={inGame} />
        ))}
      </div>
    </div>
  );
}

function AdminPlayerRow({
  api,
  player,
  drawerId,
  inGame,
}: {
  api: RoomApi;
  player: Player;
  drawerId: string | null;
  inGame: boolean;
}) {
  const [score, setScore] = useState(String(player.score));

  return (
    <div className="admin-player-row">
      <span className="ap-name">
        {player.name}
        {player.muted && " 🔇"}
        {player.id === drawerId && " ✏️"}
      </span>
      <div className="ap-controls">
        <button onClick={() => api.admin.setDrawer(player.id)} disabled={!inGame} title="Make drawer">
          ✏️
        </button>
        <input
          className="ap-score"
          type="number"
          value={score}
          onChange={(e) => setScore(e.target.value)}
          aria-label={`score for ${player.name}`}
        />
        <button onClick={() => api.admin.setScore(player.id, Number(score))} title="Set score">
          set
        </button>
        <button onClick={() => api.admin.mute(player.id)} title="Mute / unmute">
          🔇
        </button>
        <button className="danger-text" onClick={() => api.admin.kick(player.id)} title="Kick">
          ✕
        </button>
      </div>
    </div>
  );
}
