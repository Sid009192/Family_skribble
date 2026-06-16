/**
 * Lobby.tsx — the waiting room: room code, players, settings, sketchpad, start.
 * The host edits settings + starts; others see them read-only and wait.
 */

import { useState } from "react";
import { useLongPress } from "../hooks/useLongPress";
import type { RoomApi } from "../useRoom";
import { PlayerList } from "../components/PlayerList";
import { DrawBoard } from "../components/DrawBoard";
import { SettingsPanel } from "../components/SettingsPanel";

interface Props {
  api: RoomApi;
  meId?: string;
  onOpenAdmin: () => void;
}

export function Lobby({ api, meId, onOpenAdmin }: Props) {
  const room = api.room;
  const longPress = useLongPress(onOpenAdmin);
  const [copied, setCopied] = useState(false);
  if (!room) return null;

  const isHost = room.hostId === meId;
  const canStart = room.players.length >= 2;

  function copyCode() {
    navigator.clipboard?.writeText(room!.code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  return (
    <main className="lobby">
      <header className="lobby-header">
        <span className="wordmark" {...longPress}>
          Agarwal Family Skribbl
        </span>
        <span className="lobby-label">Room code</span>
        <button className="code-chip" onClick={copyCode} title="Tap to copy">
          {room.code}
          <span className="copy-hint">{copied ? "Copied!" : "Tap to copy"}</span>
        </button>
      </header>

      <section className="lobby-players">
        <h2>
          Players <span className="count">{room.players.length}</span>
        </h2>
        <PlayerList
          players={room.players}
          hostId={room.hostId}
          meId={meId}
          canKick={isHost}
          onKick={api.kick}
        />
      </section>

      <section className="lobby-settings">
        <h2>Settings</h2>
        <SettingsPanel settings={room.settings} editable={isHost} onChange={api.updateSettings} />
      </section>

      <section className="lobby-sketchpad">
        <h2>Sketchpad</h2>
        <p className="hint">Doodle together while you wait.</p>
        <DrawBoard drawable />
      </section>

      <div className="lobby-actions">
        {isHost ? (
          <button className="primary" onClick={api.startGame} disabled={!canStart}>
            {canStart ? "Start game" : "Need 2+ players"}
          </button>
        ) : (
          <p className="hint">Waiting for the host to start…</p>
        )}
        <button className="ghost" onClick={api.leaveRoom}>
          Leave room
        </button>
      </div>
    </main>
  );
}
