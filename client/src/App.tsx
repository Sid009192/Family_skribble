/**
 * App.tsx — the top-level router.
 *
 * Picks the screen from game state: Home (not in a room), Lobby (phase lobby),
 * or Game (everything else). The Super-Admin console overlays any screen and is
 * opened by long-pressing the title (handled inside each screen).
 *
 * DEV-ONLY: if running under `vite dev` AND the URL has `?dev=lobby` etc, we
 * swap the live socket-driven RoomApi for a mock from `./dev/mockRoom`. The
 * mock module is dynamically imported behind an `import.meta.env.DEV` gate so
 * it never appears in a production bundle.
 */

import { useEffect, useState } from "react";
import { useRoom } from "./useRoom";
import { Home } from "./screens/Home";
import { Lobby } from "./screens/Lobby";
import { Game } from "./screens/Game";
import { AdminModal } from "./components/AdminModal";
import { JoinRequestToast } from "./components/JoinRequestToast";
import { Intro } from "./components/Intro";
import { socket } from "./socket";

// Type-only import — TypeScript strips this at compile, no runtime reference.
// In a production build the entire dev mock module is tree-shaken away.
import type { MockBundle } from "./dev/mockRoom";
import type { IncomingJoinRequest } from "./useRoom";
import type { ChatMessage } from "@shared/types";

// TEMP DEMO ONLY — shows the JoinRequestToast with fake data via ?joinreq=1,
// since it's normally only driven by a real second player. Remove after demo.
const FAKE_JOIN_REQUESTS: IncomingJoinRequest[] = [
  { requestId: "demo-1", name: "Grandpa Ravi", avatar: { color: 7, eyes: 3, mouth: 5 } },
];

// The splash plays once per browser tab session: a flag in sessionStorage means
// reloads/reconnects within the same session skip straight to the app.
const INTRO_KEY = "introSeen";

export function App() {
  const realApi = useRoom();
  const [devBundle, setDevBundle] = useState<MockBundle | null>(null);
  const [adminOpen, setAdminOpen] = useState(false);
  const [showIntro, setShowIntro] = useState(
    () => !sessionStorage.getItem(INTRO_KEY),
  );

  /*
   * Dev-mock loader. Three guards stack so production users can never reach
   * this code path:
   *   1. `import.meta.env.DEV` is statically replaced with `false` in prod
   *      builds — the whole effect body becomes unreachable after DCE.
   *   2. The `?dev=` URL param is only read inside the DEV branch.
   *   3. The mock module is loaded via dynamic `import()`, so when (1) is
   *      false the import statement is dropped and the module never ships.
   * We verify this with: npm run build && grep -r mockRoom client/dist/
   * → should match zero files.
   */
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const search = new URLSearchParams(window.location.search);
    if (!search.has("dev")) return;
    let cancelled = false;
    import("./dev/mockRoom").then((m) => {
      if (cancelled) return;
      const b = m.getMockBundle(search);
      if (b) setDevBundle(b);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Use the mock if loaded; otherwise the real socket-driven api.
  const api = devBundle?.api ?? realApi;
  const meId = devBundle?.meId ?? socket.id;
  const openAdmin = () => setAdminOpen(true);

  function dismissIntro() {
    sessionStorage.setItem(INTRO_KEY, "1");
    setShowIntro(false);
  }

  // While in dev-mock mode, skip the intro splash so we land straight on the
  // screen under test.
  const introVisible = showIntro && !devBundle;

  // TEMP DEMO ONLY — remove after demo.
  const demoJoinRequests =
    import.meta.env.DEV && new URLSearchParams(window.location.search).get("joinreq") === "1";

  // TEMP DEMO ONLY — simulates new chat lines arriving so ChatToasts animates
  // in (it only reacts to messages added AFTER mount, so the mock's static
  // history alone shows nothing). Remove after demo.
  const demoChatToast =
    import.meta.env.DEV && new URLSearchParams(window.location.search).get("chattoast") === "1";
  const [demoExtraMessages, setDemoExtraMessages] = useState<ChatMessage[]>([]);
  useEffect(() => {
    if (!demoChatToast) return;
    const t1 = setTimeout(() => {
      setDemoExtraMessages((prev) => [...prev, { kind: "correct", name: "Mom", text: "Mom guessed the word!" }]);
    }, 1500);
    const t2 = setTimeout(() => {
      setDemoExtraMessages((prev) => [...prev, { kind: "system", name: "", text: "Robin joined the room!" }]);
    }, 4000);
    const t3 = setTimeout(() => {
      setDemoExtraMessages((prev) => [...prev, { kind: "normal", name: "Pari", text: "nice one!" }]);
    }, 6500);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, [demoChatToast]);
  const effectiveApi = demoChatToast
    ? { ...api, messages: [...api.messages, ...demoExtraMessages] }
    : api;

  let screen;
  if (!api.room) {
    screen = (
      <Home
        connected={api.connected}
        notice={api.notice}
        roomList={api.roomList}
        pendingApproval={api.pendingApproval}
        onCreate={api.createRoom}
        onJoin={api.joinRoom}
        onJoinActive={api.requestJoinActive}
        onCancelApproval={api.cancelPendingApproval}
        onDismissNotice={api.clearNotice}
        onOpenAdmin={openAdmin}
      />
    );
  } else if (api.room.phase === "lobby") {
    screen = <Lobby api={api} meId={meId} onOpenAdmin={openAdmin} />;
  } else {
    screen = <Game api={effectiveApi} meId={meId} onOpenAdmin={openAdmin} />;
  }

  // Show a "reconnecting" overlay when OUR socket drops while we're in a room.
  // (If we're on the Home screen with no room, the loss is less disruptive.)
  const showReconnecting = !api.connected && api.room !== null;

  return (
    <>
      {screen}
      {adminOpen && <AdminModal api={api} meId={meId} onClose={() => setAdminOpen(false)} />}
      {introVisible && <Intro onDone={dismissIntro} />}
      {devBundle && <DevModeBanner text={devBundle.bannerText} />}
      {showReconnecting && <ReconnectingOverlay />}
      {realApi.gameEndedWhileAway && (
        <GameEndedBanner onDismiss={realApi.dismissGameEndedWhileAway} />
      )}
      <JoinRequestToast
        requests={demoJoinRequests ? FAKE_JOIN_REQUESTS : realApi.incomingJoinRequests}
        onRespond={
          demoJoinRequests
            ? (id, approved) => console.log("[demo] respond", id, approved)
            : realApi.respondJoinRequest
        }
      />
    </>
  );
}

function ReconnectingOverlay() {
  return (
    <div className="reconnect-overlay">
      <div className="reconnect-card">
        <div className="reconnect-spinner" />
        <p className="reconnect-title">Reconnecting...</p>
        <p className="reconnect-sub">You'll be right back where you left off.</p>
      </div>
    </div>
  );
}

function GameEndedBanner({ onDismiss }: { onDismiss: () => void }) {
  return (
    <div className="reconnect-overlay" onClick={onDismiss}>
      <div className="reconnect-card">
        <p className="reconnect-title">Game Over!</p>
        <p className="reconnect-sub">The game ended while you were away.</p>
        <button className="btn primary" style={{ marginTop: 12 }} onClick={onDismiss}>
          Back to Home
        </button>
      </div>
    </div>
  );
}

/**
 * Fixed pill in the top-right, visible in every dev-mock screen.
 * Banner text comes from the dev module so this file never contains any
 * dev-only string literals — keeps the production bundle 100% clean.
 */
function DevModeBanner({ text }: { text: string }) {
  return (
    <div
      style={{
        position: "fixed",
        top: 6,
        right: 6,
        zIndex: 9999,
        background: "#ff3838",
        color: "#fff",
        font: "700 11px/1 Nunito, sans-serif",
        padding: "4px 8px",
        borderRadius: 3,
        letterSpacing: "0.08em",
        boxShadow: "0 2px 6px rgba(0,0,0,0.4)",
        pointerEvents: "none",
      }}
    >
      {text}
    </div>
  );
}
