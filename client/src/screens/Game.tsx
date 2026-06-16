/**
 * Game.tsx — the in-game screen. Shows the header (round/timer/word), the
 * canvas (drawable only on your turn), overlays for the choosing/reveal/gameover
 * moments, a live scoreboard, and chat/guessing.
 */

import { useLongPress } from "../hooks/useLongPress";
import type { RoomApi } from "../useRoom";
import { Avatar } from "../components/Avatar";
import { DrawBoard } from "../components/DrawBoard";
import { Chat } from "../components/Chat";

interface Props {
  api: RoomApi;
  meId?: string;
  onOpenAdmin: () => void;
}

export function Game({ api, meId, onOpenAdmin }: Props) {
  const { room, timeLeft, wordChoices, yourWord, reveal, messages } = api;
  const longPress = useLongPress(onOpenAdmin);
  if (!room) return null;

  const isDrawer = room.drawerId === meId;
  const drawer = room.players.find((p) => p.id === room.drawerId);
  const drawerName = drawer?.name ?? "Someone";
  const drawable = room.phase === "drawing" && isDrawer;

  // What to show in the header word slot.
  const wordDisplay =
    isDrawer && yourWord ? yourWord : spaced(room.maskedWord);

  const ranking = [...room.players].sort((a, b) => b.score - a.score);

  return (
    <main className="game">
      <header className="game-header">
        <span className="wordmark" {...longPress}>
          Scribble
        </span>
        <span className="round">
          Round {room.round}/{room.settings.rounds}
        </span>
        <span className={"timer" + (timeLeft <= 10 ? " low" : "")}>
          {room.paused ? "❚❚" : timeLeft}
        </span>
      </header>

      <div className="word-slot">
        {room.phase === "drawing" || (isDrawer && yourWord) ? (
          <span className="masked">{wordDisplay}</span>
        ) : (
          <span className="masked dim">— — —</span>
        )}
      </div>

      <div className="canvas-area">
        <DrawBoard drawable={drawable} />

        {room.paused && <Overlay>⏸ Paused by admin</Overlay>}

        {room.phase === "choosing" &&
          (isDrawer ? (
            <Overlay>
              <p>Choose a word to draw:</p>
              <div className="word-choices">
                {wordChoices.map((w) => (
                  <button key={w} className="primary" onClick={() => api.chooseWord(w)}>
                    {w}
                  </button>
                ))}
              </div>
            </Overlay>
          ) : (
            <Overlay>{drawerName} is choosing a word…</Overlay>
          ))}

        {room.phase === "reveal" && reveal && (
          <Overlay>
            <p>The word was</p>
            <h2 className="reveal-word">{reveal.word}</h2>
            <ul className="reveal-gains">
              {Object.entries(reveal.gained).map(([id, pts]) => {
                const p = room.players.find((x) => x.id === id);
                return (
                  <li key={id}>
                    {p?.name ?? "?"} <b>+{pts}</b>
                  </li>
                );
              })}
              {Object.keys(reveal.gained).length === 0 && <li>Nobody guessed it!</li>}
            </ul>
          </Overlay>
        )}

        {room.phase === "gameover" && (
          <Overlay>
            <h2>Game over!</h2>
            <ol className="final-ranking">
              {ranking.map((p) => (
                <li key={p.id}>
                  <span>{p.name}</span>
                  <b>{p.score}</b>
                </li>
              ))}
            </ol>
            {room.hostId === meId && (
              <div className="gameover-buttons">
                <button className="primary" onClick={api.startGame}>
                  Play again
                </button>
                <button className="ghost" onClick={api.returnToLobby}>
                  Back to lobby
                </button>
              </div>
            )}
          </Overlay>
        )}
      </div>

      <ul className="scoreboard">
        {ranking.map((p) => (
          <li key={p.id} className={"score-row" + (p.id === room.drawerId ? " drawing" : "")}>
            <Avatar avatar={p.avatar} size={28} />
            <span className="score-name">
              {p.name}
              {p.id === meId && " (You)"}
            </span>
            {p.hasGuessed && <span className="guessed-tick">✓</span>}
            {p.id === room.drawerId && <span className="drawer-pen">✏️</span>}
            <span className="score-points">{p.score}</span>
          </li>
        ))}
      </ul>

      <Chat
        messages={messages}
        onSend={api.sendChat}
        placeholder={isDrawer ? "Chat (you're drawing)…" : "Type your guess…"}
      />

      <button className="ghost leave-btn" onClick={api.leaveRoom}>
        Leave game
      </button>
    </main>
  );
}

function Overlay({ children }: { children: React.ReactNode }) {
  return (
    <div className="canvas-overlay">
      <div className="canvas-overlay-inner">{children}</div>
    </div>
  );
}

/** Add spacing between mask characters so "_ _ _" reads as letter slots. */
function spaced(masked: string): string {
  return [...masked].join(" ");
}
