/**
 * events.ts — the "contract" between client and server.
 *
 * Every message that can travel over the socket is declared here ONCE, with
 * its exact payload shape. Both sides import these, so if either side sends the
 * wrong data, TypeScript catches it before the app runs.
 *
 * Two messaging styles you'll see:
 *   - "fire-and-forget"  : socket.emit("roomState", room)  — just send it.
 *   - "request/response" : socket.emit("createRoom", data, (result) => {...})
 *        The last argument is a callback ("acknowledgement") the server calls
 *        to answer THIS specific request — perfect for create/join where we
 *        need a yes/no + reason back.
 */

import type {
  Avatar,
  ChatMessage,
  DrawOp,
  Point,
  Room,
  RoomSummary,
  Segment,
} from "./types";

/** Standard answer to a create/join request. */
export interface JoinResult {
  ok: boolean;
  /** Present when ok === false — a human-readable reason. */
  error?: string;
  /** Present when ok === true — the room you're now in. */
  room?: Room;
}

/**
 * A settings change. Numbers are clamped server-side; `customWords` is the raw
 * comma-separated text from the textarea (the server parses + validates it).
 */
export interface SettingsUpdate {
  maxPlayers?: number;
  rounds?: number;
  drawTime?: number;
  wordChoiceCount?: number;
  hintCount?: number;
  customWordsOnly?: boolean;
  customWords?: string;
}

/** Messages the CLIENT can send TO the server. */
export interface ClientToServerEvents {
  /** Create a brand-new room and become its host. */
  createRoom: (
    payload: { name: string; avatar: Avatar; isPublic: boolean },
    callback: (result: JoinResult) => void
  ) => void;

  /** Ask the server for the current public room list. */
  requestRoomList: () => void;

  /** Join an existing room by its code. */
  joinRoom: (
    payload: { code: string; name: string; avatar: Avatar },
    callback: (result: JoinResult) => void
  ) => void;

  /** Leave the current room (e.g. "back to home" button). */
  leaveRoom: () => void;

  /** Host removes another player from the room (lobby only, for now). */
  kickPlayer: (payload: { targetId: string }) => void;

  /* --- Drawing --- */

  /** Ask the server for the current full canvas (called when the canvas mounts). */
  requestCanvas: () => void;
  /** Stream one line segment while drawing (high-frequency, not stored). */
  liveSegment: (segment: Segment) => void;
  /** Finalize a freehand stroke (stored by the server for history/undo). */
  commitStroke: (payload: { points: Point[]; color: string; size: number }) => void;
  /** Flood-fill at a point. */
  fillCanvas: (payload: { x: number; y: number; color: string }) => void;
  /** Undo your own most recent draw operation. */
  undoDraw: () => void;
  /** Redo your own most recently undone draw operation. */
  redoDraw: () => void;
  /** Clear the whole canvas. */
  clearCanvas: () => void;

  /* --- Game --- */

  /** Host starts (or restarts) the game. */
  startGame: () => void;
  /** Host returns the room to the lobby (e.g. after a game, to tweak settings). */
  returnToLobby: () => void;
  /** Change settings (host in lobby, or Super-Admin any time). */
  updateSettings: (payload: SettingsUpdate) => void;
  /** The drawer picks one of their offered words. */
  chooseWord: (payload: { word: string }) => void;
  /** Send a chat message / guess. */
  chat: (payload: { text: string }) => void;

  /* --- Super-Admin (godmode) --- */

  /** Unlock godmode by proving the secret key. Server flags this socket. */
  adminUnlock: (payload: { key: string }, callback: (res: { ok: boolean }) => void) => void;
  adminPause: () => void;
  adminResume: () => void;
  /** Skip the current turn (reveal + move on). */
  adminSkipTurn: () => void;
  /** Force a specific player to be the drawer right now. */
  adminSetDrawer: (payload: { targetId: string }) => void;
  /** Privately reveal the current word to the admin. */
  adminRevealWord: () => void;
  /** Set a player's score to an exact value. */
  adminSetScore: (payload: { targetId: string; score: number }) => void;
  /** Remove a player (any time, any room state). */
  adminKick: (payload: { targetId: string }) => void;
  /** Toggle a player's mute (their chat/guesses hidden from everyone). */
  adminMute: (payload: { targetId: string }) => void;
}

/** Messages the SERVER can send TO the client. */
export interface ServerToClientEvents {
  /** The authoritative, up-to-date room state. Sent whenever it changes. */
  roomState: (room: Room) => void;

  /** Sent to a player who has just been removed from a room. */
  kicked: (payload: { reason: string }) => void;

  /** The current list of public rooms on the network. */
  roomList: (rooms: RoomSummary[]) => void;

  /* --- Drawing --- */

  /** The authoritative full canvas (on request, and after undo/clear). */
  canvasState: (ops: DrawOp[]) => void;
  /** Relay of someone else's live drawing segment. */
  liveSegment: (segment: Segment) => void;
  /** A newly completed operation to apply on top (used for fills). */
  opCommitted: (op: DrawOp) => void;

  /* --- Game --- */

  /** The word choices, sent only to the current drawer. */
  wordChoices: (words: string[]) => void;
  /** The full word, sent only to the current drawer while drawing. */
  yourWord: (word: string) => void;
  /** One-second countdown update. */
  gameTick: (timeLeft: number) => void;
  /** End-of-turn reveal: the word + points gained this turn (by socket id). */
  turnReveal: (payload: { word: string; gained: Record<string, number> }) => void;
  /** A chat line to display. */
  chat: (message: ChatMessage) => void;
}

/** Server-to-server events (unused for now, required by Socket.IO's types). */
export interface InterServerEvents {}

/** Per-connection data we keep on the server side. */
export interface SocketData {
  /** Set true once a socket proves it knows the secret admin key (later phase). */
  isAdmin: boolean;
  /** Which room (code) this socket is currently in, if any. */
  roomCode?: string;
}
