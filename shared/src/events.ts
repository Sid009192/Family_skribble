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
  Difficulty,
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
  /**
   * True when joining an active game that needs host approval.
   * The socket connection stays alive; joinApproved / joinDenied will follow.
   */
  pending?: boolean;
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
  difficulty?: Difficulty;
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
  /**
   * Guesser-only thumbs vote on the current drawer's effort.
   * One vote per guesser per round (no take-backs). Drawer can't vote.
   */
  rateDrawing: (payload: { kind: "up" | "down" }) => void;

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

  /**
   * Request to join an active (in-progress) game.
   * If a disconnected slot with the same name exists the server reconnects
   * immediately (ok: true). Otherwise the host gets a joinRequest notification
   * and the ack returns { ok: false, pending: true }.
   */
  requestJoinActive: (
    payload: { code: string; name: string; avatar: Avatar },
    callback: (result: JoinResult) => void
  ) => void;

  /** Host or admin approves / denies a pending join request. */
  respondJoinRequest: (payload: { requestId: string; approved: boolean }) => void;
}

/** Messages the SERVER can send TO the client. */
export interface ServerToClientEvents {
  /** The authoritative, up-to-date room state. Sent whenever it changes. */
  roomState: (room: Room) => void;

  /** Sent to a player who has just been removed from a room. */
  kicked: (payload: { reason: string }) => void;

  /** The current list of public rooms on the network. */
  roomList: (rooms: RoomSummary[]) => void;

  /**
   * A reconnect token the client must persist in localStorage. Sent once after
   * a successful createRoom / joinRoom so the player can reclaim their slot if
   * their socket drops (phone sleep, brief wifi blip, etc.).
   */
  sessionToken: (token: string) => void;

  /** A player's socket dropped unexpectedly (not a deliberate leave). */
  playerDisconnected: (payload: { name: string }) => void;

  /**
   * A previously-disconnected player successfully reconnected.
   * oldId / newId let the client update its player-id diff so join/leave
   * sounds don't fire spuriously when the socket id changes.
   */
  playerReconnected: (payload: { oldId: string; newId: string; name: string }) => void;

  /**
   * The current drawer lost connection; the game is pausing for up to
   * `seconds` seconds to give them a chance to reconnect.
   */
  drawerDisconnecting: (payload: { name: string; seconds: number }) => void;

  /**
   * Sent to a reconnecting client when their previous room no longer exists
   * (game ended or server restarted while they were away).
   */
  gameEndedWhileAway: () => void;

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

  /** Sent to host + admin when someone wants to join the active game. */
  joinRequest: (payload: { requestId: string; name: string; avatar: Avatar }) => void;
  /** Sent to the requester when the host approves their join request. */
  joinApproved: (payload: { room: Room }) => void;
  /** Sent to the requester when the host denies (or times out on) their request. */
  joinDenied: (payload: { reason: string }) => void;
}

/** Server-to-server events (unused for now, required by Socket.IO's types). */
export interface InterServerEvents {}

/** Per-connection data we keep on the server side. */
export interface SocketData {
  /** Set true once a socket proves it knows the secret admin key (later phase). */
  isAdmin: boolean;
  /** Which room (code) this socket is currently in, if any. */
  roomCode?: string;
  /**
   * How many times THIS connection has tried (and failed) `adminUnlock`.
   * Used to lock out brute-force key guessing after a small number of tries;
   * resets when the socket reconnects (i.e. closing and reopening the page).
   */
  adminUnlockAttempts?: number;
}
