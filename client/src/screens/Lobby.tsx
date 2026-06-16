/**
 * Lobby.tsx — pre-game waiting room, laid out per `hsot_settings.png`.
 *
 *   ┌─ lobby-stack (one continuous panel, no internal gaps) ───────────┐
 *   │  TopBar          white background                                │
 *   │  Settings        glass-morphism (translucent white + blur)       │
 *   │  Start | Invite  white background                                │
 *   │  Chat input      white background, centred placeholder           │
 *   └──────────────────────────────────────────────────────────────────┘
 *   ┌─ players-chat-split ─────────────────────────────────────────────┐
 *   │  Players (left)   |   Chat messages (right, white)               │
 *   └──────────────────────────────────────────────────────────────────┘
 *
 * Long-press the WAITING label = admin unlock. After verification the cog
 * appears in the top bar and tapping it reopens the admin panel.
 */

import { useState } from "react";
import type { RoomApi } from "../useRoom";
import { PlayerList } from "../components/PlayerList";
import { SettingsGrid, CustomWordsSection } from "../components/SettingsPanel";
import { TopBar } from "../components/TopBar";
import { ChatInput, ChatMessages } from "../components/Chat";

interface Props {
  api: RoomApi;
  meId?: string;
  onOpenAdmin: () => void;
}

export function Lobby({ api, meId, onOpenAdmin }: Props) {
  const room = api.room;
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
      <div className="lobby-stack">
        <TopBar
          centerText="WAITING"
          timer={0}
          round={room.round || 1}
          totalRounds={room.settings.rounds}
          isAdmin={api.isAdmin}
          onLongPressCenter={onOpenAdmin}
          onCogTap={onOpenAdmin}
        />

        <div className="settings-section">
          <SettingsGrid
            settings={room.settings}
            editable={isHost}
            onChange={api.updateSettings}
          />
        </div>

        {/* Custom words breaks out of the glass panel: full lobby width, flush
            white textarea, edge-to-edge. */}
        <div className="custom-words-strip">
          <CustomWordsSection
            settings={room.settings}
            editable={isHost}
            onChange={api.updateSettings}
          />
        </div>

        {isHost && (
          <div className="lobby-actions">
            <button
              className="primary start-btn"
              onClick={api.startGame}
              disabled={!canStart}
            >
              {canStart ? "Start!" : "Need 2+ players"}
            </button>
            <button
              type="button"
              className="secondary invite-btn"
              onClick={copyCode}
              title="Copy room code"
            >
              <img src="/img/link.svg" alt="" className="invite-link-icon" />
              {copied ? "Copied!" : "Invite"}
            </button>
          </div>
        )}

        <div className="lobby-chat-input-wrap">
          <ChatInput onSend={api.sendChat} placeholder="Chat with the room…" />
        </div>
      </div>

      <section className="players-chat-split">
        <div className="players-pane">
          <PlayerList
            players={room.players}
            hostId={room.hostId}
            meId={meId}
            canKick={isHost || api.isAdmin}
            onKick={api.kick}
          />
        </div>
        <div className="chat-pane">
          <ChatMessages messages={api.messages} />
        </div>
      </section>

      {!isHost && (
        <p className="hint waiting-hint">Waiting for the host to start…</p>
      )}

      <button className="ghost leave-btn" onClick={api.leaveRoom}>
        Leave room
      </button>
    </main>
  );
}
