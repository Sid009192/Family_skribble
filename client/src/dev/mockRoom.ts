/**
 * mockRoom.ts — DEV-ONLY fake RoomApi for previewing screens without sockets.
 *
 * SECURITY: this module is gated behind `import.meta.env.DEV` AND loaded via a
 * dynamic `import()` from App.tsx. In a production build Vite replaces DEV
 * with the literal `false`; the branch becomes unreachable; dead-code
 * elimination removes the dynamic import; this module never ends up in any
 * shipped JS chunk. The `?dev=` URL param is also only read inside the DEV
 * branch, so even if the file leaked it would do nothing on first load.
 *
 * Modes (URL param `?dev=X`):
 *   lobby     — host view, 5 mock players
 *   game      — drawing phase, you're a guesser
 *   game      — with `&role=drawer` you're the drawer (toolbar + yourWord)
 *   choosing  — choose-word overlay; add `&role=drawer` for the picker view
 *   reveal    — word-reveal overlay with points-gained list
 *   gameover  — final podium
 *
 * Add `&admin=1` to any mode to mount with `isAdmin: true` (cog visible).
 *
 * Every action (createRoom, kick, chooseWord, etc.) is a console.log no-op so
 * clicks don't crash the UI; the mock state is static and never mutates.
 */

import type { Avatar, ChatMessage, Player, Room, RoomPhase, Settings } from "@shared/types";
import { DEFAULT_SETTINGS } from "@shared/types";
import type { RoomApi } from "../useRoom";

const DEV_ME_ID = "dev-me";
const DEV_BANNER_TEXT = "DEV MOCK";

/** Bundle that App.tsx consumes — keeps every dev-only string inside this
 *  module so production bundles don't carry any of them. */
export interface MockBundle {
  api: RoomApi;
  meId: string;
  bannerText: string;
}

/** Tiny helper that logs a no-op so the UI handlers don't crash on click. */
function noopAsync<T>(label: string, ret: T): (...args: unknown[]) => Promise<T> {
  return (...args) => {
    // eslint-disable-next-line no-console
    console.log(`[dev-mock] ${label}`, args);
    return Promise.resolve(ret);
  };
}
function noop(label: string): (...args: unknown[]) => void {
  return (...args) => {
    // eslint-disable-next-line no-console
    console.log(`[dev-mock] ${label}`, args);
  };
}

function mkAvatar(color: number, eyes: number, mouth: number): Avatar {
  return { color, eyes, mouth };
}

function mkPlayer(
  id: string,
  name: string,
  partial: Partial<Player> = {},
): Player {
  return {
    id,
    name,
    avatar: mkAvatar(0, 0, 0),
    score: 0,
    isHost: false,
    muted: false,
    connected: true,
    hasGuessed: false,
    ...partial,
  };
}

/** A canned set of 5 players, with the dev user at the top as host. */
function fixturePlayers(): Player[] {
  return [
    mkPlayer(DEV_ME_ID, "Sid", { avatar: mkAvatar(5, 2, 0), isHost: true, score: 1820 }),
    mkPlayer("p2", "Aanya", { avatar: mkAvatar(2, 4, 1), score: 1620 }),
    mkPlayer("p3", "Pari", { avatar: mkAvatar(8, 1, 3), score: 1280 }),
    mkPlayer("p4", "Robin", { avatar: mkAvatar(11, 6, 2), score: 980 }),
    mkPlayer("p5", "Mom", { avatar: mkAvatar(3, 10, 7), score: 720 }),
  ];
}

const SAMPLE_CHAT: ChatMessage[] = [
  { kind: "system", name: "", text: "Sid is now the room owner!" },
  { kind: "system", name: "", text: "Aanya joined the room!" },
  { kind: "normal", name: "Aanya", text: "tree?" },
  { kind: "normal", name: "Robin", text: "bush?" },
  { kind: "close", name: "Mom", text: "garden — close!" },
  { kind: "correct", name: "Pari", text: "Pari guessed the word!" },
  { kind: "normal", name: "Sid", text: "good one" },
];

function baseRoom(phase: RoomPhase, partial: Partial<Room> = {}): Room {
  const settings: Settings = { ...DEFAULT_SETTINGS };
  return {
    code: "DEVXX",
    hostId: DEV_ME_ID,
    phase,
    players: fixturePlayers(),
    isPublic: false,
    settings,
    round: phase === "lobby" ? 0 : 1,
    drawerId: null,
    maskedWord: "",
    timeLeft: 0,
    paused: false,
    votes: {},
    ...partial,
  };
}

/** Bundle of every state slot in RoomApi so we can build it in one place. */
interface MockState {
  room: Room;
  timeLeft: number;
  wordChoices: string[];
  yourWord: string | null;
  reveal: { word: string; gained: Record<string, number> } | null;
  messages: ChatMessage[];
  isAdmin: boolean;
}

function makeApi(s: MockState): RoomApi {
  /*
   * The real RoomApi's action methods return the Socket (because they wrap
   * `socket.emit`), but no caller ever uses that return value. Building a
   * fake Socket here would be pointless ceremony, so we cast the whole
   * object via `unknown`. This is a standard mock-shaping escape hatch and
   * only ever runs in dev.
   */
  const mock = {
    room: s.room,
    connected: true,
    notice: null,
    roomList: [],
    timeLeft: s.timeLeft,
    wordChoices: s.wordChoices,
    yourWord: s.yourWord,
    reveal: s.reveal,
    messages: s.messages,
    isAdmin: s.isAdmin,
    createRoom: noopAsync("createRoom", { ok: false as const, error: "dev mock" }),
    joinRoom: noopAsync("joinRoom", { ok: false as const, error: "dev mock" }),
    leaveRoom: noop("leaveRoom"),
    clearNotice: noop("clearNotice"),
    kick: noop("kick"),
    startGame: noop("startGame"),
    returnToLobby: noop("returnToLobby"),
    updateSettings: noop("updateSettings"),
    chooseWord: noop("chooseWord"),
    sendChat: noop("sendChat"),
    rateDrawing: noop("rateDrawing"),
    adminUnlock: () => {
      // eslint-disable-next-line no-console
      console.log("[dev-mock] adminUnlock");
      return Promise.resolve(true);
    },
    admin: {
      pause: noop("admin.pause"),
      resume: noop("admin.resume"),
      skipTurn: noop("admin.skipTurn"),
      revealWord: noop("admin.revealWord"),
      setDrawer: noop("admin.setDrawer"),
      setScore: noop("admin.setScore"),
      kick: noop("admin.kick"),
      mute: noop("admin.mute"),
    },
  };
  return mock as unknown as RoomApi;
}

/**
 * Build a fake bundle for the requested mode. Returns null for an unknown
 * mode — caller should fall back to the real `useRoom()`.
 */
export function getMockBundle(search: URLSearchParams): MockBundle | null {
  const mode = search.get("dev");
  if (!mode) return null;

  // All branches return through this helper so every MockBundle carries the
  // dev-only constants from this module (App.tsx never sees them).
  const bundle = (api: RoomApi): MockBundle => ({
    api,
    meId: DEV_ME_ID,
    bannerText: DEV_BANNER_TEXT,
  });

  const role = search.get("role") === "drawer" ? "drawer" : "guesser";
  const isAdmin = search.get("admin") === "1";

  switch (mode) {
    case "lobby": {
      return bundle(makeApi({
        room: baseRoom("lobby"),
        timeLeft: 0,
        wordChoices: [],
        yourWord: null,
        reveal: null,
        messages: [
          { kind: "system", name: "", text: "Sid is now the room owner!" },
          { kind: "system", name: "", text: "You need at least 2 players to start the game!" },
          { kind: "normal", name: "Aanya", text: "yo" },
          { kind: "normal", name: "Pari", text: "what's up" },
        ],
        isAdmin,
      }));
    }

    case "game": {
      const drawer = role === "drawer" ? DEV_ME_ID : "p2";
      // "garden" — 6 letters, "d" revealed at index 4 like the user's screenshot.
      const masked = "_ _ _ _ d _";
      return bundle(makeApi({
        room: baseRoom("drawing", {
          drawerId: drawer,
          maskedWord: masked,
          timeLeft: 44,
        }),
        timeLeft: 44,
        wordChoices: [],
        yourWord: role === "drawer" ? "garden" : null,
        reveal: null,
        messages: SAMPLE_CHAT,
        isAdmin,
      }));
    }

    case "choosing": {
      const drawer = role === "drawer" ? DEV_ME_ID : "p3";
      return bundle(makeApi({
        room: baseRoom("choosing", {
          drawerId: drawer,
          maskedWord: "",
          timeLeft: 12,
        }),
        timeLeft: 12,
        wordChoices: role === "drawer" ? ["pizza", "elephant", "snowman"] : [],
        yourWord: null,
        reveal: null,
        messages: SAMPLE_CHAT,
        isAdmin,
      }));
    }

    case "reveal": {
      return bundle(makeApi({
        room: baseRoom("reveal", {
          drawerId: "p2",
          maskedWord: "garden",
          timeLeft: 5,
        }),
        timeLeft: 5,
        wordChoices: [],
        yourWord: null,
        reveal: {
          word: "garden",
          gained: { p3: 480, p4: 360, p5: 200, p2: 280 },
        },
        messages: SAMPLE_CHAT,
        isAdmin,
      }));
    }

    case "gameover": {
      // Spread scores out so the podium has a clear winner.
      const ranked = fixturePlayers().map((p, i) => ({
        ...p,
        score: [3200, 2680, 1980, 1450, 980][i] ?? 0,
      }));
      return bundle(makeApi({
        room: baseRoom("gameover", { players: ranked, drawerId: null }),
        timeLeft: 0,
        wordChoices: [],
        yourWord: null,
        reveal: null,
        messages: [
          ...SAMPLE_CHAT,
          { kind: "system", name: "", text: "Game over!" },
        ],
        isAdmin,
      }));
    }

    default:
      return null;
  }
}
