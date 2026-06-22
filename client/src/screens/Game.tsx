import { useEffect, useRef, useState } from "react";
import type { RoomApi } from "../useRoom";
import { BRUSH_SIZES } from "@shared/types";
import { PlayerList } from "../components/PlayerList";
import { DrawBoard } from "../components/DrawBoard";
import { TopBar } from "../components/TopBar";
import { ChatInput, ChatMessages } from "../components/Chat";
import { ChatToasts } from "../components/ChatToasts";
import { ThumbsBar } from "../components/ThumbsBar";
import { ColorSizePopup } from "../components/ColorSizePopup";
import { Avatar } from "../components/Avatar";
import type { Tool } from "../components/Toolbar";
import type { Player } from "@shared/types";

interface Props {
  api: RoomApi;
  meId?: string;
  onOpenAdmin: () => void;
}

export function Game({ api, meId, onOpenAdmin }: Props) {
  const { room, timeLeft, wordChoices, yourWord, reveal, messages } = api;

  const [color, setColor] = useState("#000000");
  const [size, setSize] = useState(BRUSH_SIZES[1]);
  const [tool, setTool] = useState<Tool>("brush");
  const [pickerOpen, setPickerOpen] = useState(false);

  useEffect(() => {
    setColor("#000000");
  }, [room?.drawerId]);

  if (!room) return null;

  const isDrawer = room.drawerId === meId;
  const drawer = room.players.find((p) => p.id === room.drawerId);
  const drawerName = drawer?.name ?? "Someone";
  const drawable = room.phase === "drawing" && isDrawer;

  const wordChars = isDrawer && yourWord ? yourWord : room.maskedWord || "";
  const wordLen = (yourWord || room.maskedWord || "").replace(/\s/g, "").length;

  const headerLabel = isDrawer
    ? room.phase === "drawing"
      ? "DRAW THIS"
      : "YOUR WORD"
    : "GUESS THIS";

  const ranking = [...room.players].sort((a, b) => b.score - a.score);

  const everyoneGuessed = reveal
    ? (() => {
        const guessers = room.players.filter((p) => p.id !== room.drawerId);
        return (
          guessers.length > 0 &&
          guessers.every((p) => (reveal.gained[p.id] ?? 0) > 0)
        );
      })()
    : false;

  return (
    <main className="game">
      <div className="game-stack">
        <TopBar
          center={
            room.phase === "drawing" ? (
              <div className="topbar-word">
                <div className="topbar-word-label">{headerLabel}</div>
                <div className="topbar-word-value">
                  {wordChars ? spaced(wordChars) : <span className="masked-empty">--- --- ---</span>}
                  {wordLen > 0 && <sup className="topbar-word-len">{wordLen}</sup>}
                </div>
              </div>
            ) : (
              <div className="topbar-word">
                <div className="topbar-word-value">WAITING</div>
              </div>
            )
          }
          timer={timeLeft}
          round={room.round || 1}
          totalRounds={room.settings.rounds}
          isAdmin={api.isAdmin}
          onLongPressCenter={onOpenAdmin}
          onCogTap={onOpenAdmin}
          rightSlot={
            drawable ? (
              <button
                type="button"
                className="topbar-palette"
                onClick={() => setPickerOpen(true)}
                aria-label="Colour and brush size"
                title="Colour and brush size"
                style={{ "--swatch": color } as React.CSSProperties}
              />
            ) : undefined
          }
        />

        <div className="game-canvas-wrap">
          <DrawBoard
            drawable={drawable}
            color={color}
            size={size}
            tool={tool}
            onTool={setTool}
          />

          {!isDrawer && room.phase === "drawing" && (
            <ThumbsBar
              hidden={!!(meId && room.votes?.[meId])}
              onVote={api.rateDrawing}
            />
          )}

          <ColorSizePopup
            open={pickerOpen && drawable}
            color={color}
            size={size}
            onColor={setColor}
            onSize={setSize}
            onClose={() => setPickerOpen(false)}
          />

          <ChatToasts messages={messages} />

          {room.paused && (
            api.drawerDisconnected
              ? <DrawerReconnectOverlay info={api.drawerDisconnected} />
              : <Overlay>Paused by admin</Overlay>
          )}

          {room.phase === "choosing" &&
            (isDrawer ? (
              <Overlay>
                <p className="choose-word-headline">Choose a word</p>
                <div className="word-choices">
                  {wordChoices.map((w) => (
                    <button key={w} className="primary" onClick={() => api.chooseWord(w)}>
                      {w}
                    </button>
                  ))}
                </div>
              </Overlay>
            ) : (
              <Overlay>{drawerName} is choosing a word...</Overlay>
            ))}

          {room.phase === "reveal" && reveal && (
            <Overlay>
              <div className="reveal-inner">
                <p className="reveal-headline">
                  The word was <span className="reveal-word-inline">{reveal.word}</span>
                </p>
                <p className="reveal-subtitle">
                  {everyoneGuessed ? "Everyone guessed the word!" : "Time is up!"}
                </p>
                <ul className="reveal-gains">
                  {[...room.players]
                    .map((p) => ({ p, pts: reveal.gained[p.id] ?? 0 }))
                    .sort((a, b) => b.pts - a.pts)
                    .map(({ p, pts }) => (
                      <li key={p.id}>
                        <span className="reveal-name">{p.name}</span>
                        <span className={"reveal-pts" + (pts === 0 ? " reveal-pts-zero" : "")}>
                          {pts > 0 ? `+${pts}` : "0"}
                        </span>
                      </li>
                    ))}
                </ul>
              </div>
            </Overlay>
          )}

          {room.phase === "gameover" && (
            <Overlay>
              <GameOver ranking={ranking} />
            </Overlay>
          )}
        </div>
      </div>

      <section className="players-chat-split">
        <div className="players-pane">
          <PlayerList
            players={room.players}
            hostId={room.hostId}
            meId={meId}
            drawerId={room.drawerId ?? undefined}
            canKick={api.isAdmin}
            onKick={api.kick}
          />
        </div>
        <div className="chat-pane">
          <ChatMessages messages={messages} />
          <div className="game-chat-input-wrap">
            <ChatInput
              onSend={api.sendChat}
              placeholder={isDrawer ? "Chat while drawing..." : "Type your guess here..."}
            />
          </div>
        </div>
      </section>

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

function DrawerReconnectOverlay({
  info,
}: {
  info: { name: string; seconds: number; since: number };
}) {
  const [remaining, setRemaining] = useState(() => {
    const elapsed = Math.floor((Date.now() - info.since) / 1000);
    return Math.max(0, info.seconds - elapsed);
  });
  const rafRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    rafRef.current = setInterval(() => {
      const elapsed = Math.floor((Date.now() - info.since) / 1000);
      setRemaining(Math.max(0, info.seconds - elapsed));
    }, 500);
    return () => {
      if (rafRef.current) clearInterval(rafRef.current);
    };
  }, [info.since, info.seconds]);

  return (
    <Overlay>
      <p className="drawer-reconnect-name">{info.name} lost connection!</p>
      <p className="drawer-reconnect-sub">Waiting for them to return...</p>
      <div className="drawer-reconnect-countdown">{remaining}</div>
    </Overlay>
  );
}

function spaced(masked: string): string {
  return [...masked].join(" ");
}

function GameOver({ ranking }: { ranking: Player[] }) {
  const [first, second, third] = ranking;
  const others = ranking.slice(3);

  return (
    <div className="gameover">
      {first && (
        <h2 className="gameover-headline">
          <span className="gameover-winner-name">{first.name}</span> is the winner!
        </h2>
      )}

      <div className="gameover-podium">
        <PodiumSlot rank={2} player={second} />
        <PodiumSlot rank={1} player={first} />
        <PodiumSlot rank={3} player={third} />
      </div>

      {others.length > 0 && (
        <div className="gameover-others">
          {others.map((p, i) => (
            <div className="gameover-other" key={p.id}>
              <span className="gameover-other-rank">#{i + 4}</span>
              <Avatar avatar={p.avatar} size={36} />
              <span className="gameover-other-name">{p.name}</span>
              <span className="gameover-other-points">{p.score} points</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function PodiumSlot({ rank, player }: { rank: 1 | 2 | 3; player?: Player }) {
  if (!player) {
    return (
      <div className={`podium-slot podium-slot-empty podium-rank-${rank}`}>
        <div className="podium-figure" aria-hidden />
        <div className="podium-block podium-block-empty">
          <span className="podium-rank">#{rank}</span>
          <span className="podium-name">-</span>
        </div>
      </div>
    );
  }

  return (
    <div className={`podium-slot podium-rank-${rank}`}>
      <div className="podium-figure">
        {rank === 1 ? (
          <div className="podium-winner">
            <img className="podium-trophy" src="/img/trophy.gif" alt="winner trophy" />
            <div className="podium-winner-dancer">
              <img className="podium-crown" src="/img/crown.gif" alt="" />
              <Avatar avatar={player.avatar} size={52} />
            </div>
          </div>
        ) : (
          <Avatar avatar={player.avatar} size={52} />
        )}
      </div>
      <div className="podium-block">
        <span className="podium-rank">#{rank}</span>
        <span className="podium-name">{player.name}</span>
        <span className="podium-points">{player.score} points</span>
      </div>
    </div>
  );
}
