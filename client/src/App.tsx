/**
 * App.tsx — the top-level router.
 *
 * Picks the screen from game state: Home (not in a room), Lobby (phase lobby),
 * or Game (everything else). The Super-Admin console overlays any screen and is
 * opened by long-pressing the title (handled inside each screen).
 */

import { useState } from "react";
import { useRoom } from "./useRoom";
import { Home } from "./screens/Home";
import { Lobby } from "./screens/Lobby";
import { Game } from "./screens/Game";
import { AdminModal } from "./components/AdminModal";
import { socket } from "./socket";

export function App() {
  const api = useRoom();
  const [adminOpen, setAdminOpen] = useState(false);
  const meId = socket.id;
  const openAdmin = () => setAdminOpen(true);

  let screen;
  if (!api.room) {
    screen = (
      <Home
        connected={api.connected}
        notice={api.notice}
        roomList={api.roomList}
        onCreate={api.createRoom}
        onJoin={api.joinRoom}
        onDismissNotice={api.clearNotice}
        onOpenAdmin={openAdmin}
      />
    );
  } else if (api.room.phase === "lobby") {
    screen = <Lobby api={api} meId={meId} onOpenAdmin={openAdmin} />;
  } else {
    screen = <Game api={api} meId={meId} onOpenAdmin={openAdmin} />;
  }

  return (
    <>
      {screen}
      {adminOpen && <AdminModal api={api} meId={meId} onClose={() => setAdminOpen(false)} />}
    </>
  );
}
