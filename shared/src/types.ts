/**
 * types.ts — the core data shapes used across the whole game.
 *
 * These describe the "nouns" of our app (a Player, a Room) plus a few shared
 * constants (limits, option counts). Both client and server import these so
 * they can never disagree on, say, what a Player looks like or how long a name
 * may be. We start small and expand in later phases.
 */

/* ------------------------------------------------------------------ *
 * Shared constants — one source of truth for limits & option counts.
 * The client UI and the server validation both read these, so they
 * can never drift apart.
 * ------------------------------------------------------------------ */

/**
 * How many variations exist for each avatar part.
 *
 * These are indices into the sprite atlases in `client/public/avatar/`. Each
 * atlas is a 10×10 grid of 48px cells (so cell `i` lives at column `i % 10`,
 * row `⌊i / 10⌋`). The counts below are the number of *filled* cells, so the
 * server can clamp avatars to valid cells and the picker can wrap correctly.
 */
export const AVATAR_OPTIONS = {
  colors: 28,
  eyes: 57,
  mouths: 50,
} as const;

/** Atlas grid is 10 cells per row/column (used to map an index → cell). */
export const AVATAR_ATLAS_COLS = 10;

export const NAME_MIN = 2;
export const NAME_MAX = 20;
export const MAX_PLAYERS = 12;
export const ROOM_CODE_LENGTH = 5;

/* ------------------------------------------------------------------ *
 * Core "nouns".
 * ------------------------------------------------------------------ */

/** A player's customizable look — each field is an index into a list of options. */
export interface Avatar {
  color: number;
  eyes: number;
  mouth: number;
}

/** One participant in a room. */
export interface Player {
  /** The socket id — unique per connection. */
  id: string;
  name: string;
  avatar: Avatar;
  score: number;
  /** True if this player is the room owner (the "Host"). */
  isHost: boolean;
  /** True if this player's chat/guesses are hidden from everyone. */
  muted: boolean;
  /** False while temporarily disconnected (reconnect grace period). */
  connected: boolean;
  /** True if this player has already guessed the word this turn. */
  hasGuessed: boolean;
}

/** What stage a room/game is in. */
export type RoomPhase = "lobby" | "choosing" | "drawing" | "reveal" | "gameover";

/** Host-configurable game settings. */
export interface Settings {
  /** Max number of players allowed in the room. */
  maxPlayers: number;
  /** How many rounds (one round = everyone draws once). */
  rounds: number;
  /** Seconds each drawer gets. */
  drawTime: number;
  /** How many words the drawer chooses from. */
  wordChoiceCount: number;
  /** How many letters get revealed as hints over time. */
  hintCount: number;
  /** Optional family word list to add to (or replace) the default words. */
  customWords: string[];
  /** If true, only the custom words are used (when there are enough of them). */
  customWordsOnly: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  maxPlayers: 8,
  rounds: 3,
  drawTime: 80,
  wordChoiceCount: 3,
  hintCount: 2,
  customWords: [],
  customWordsOnly: false,
};

/** Allowed ranges for the numeric settings (server enforces these). */
export const SETTINGS_LIMITS = {
  maxPlayers: { min: 2, max: MAX_PLAYERS },
  rounds: { min: 1, max: 10 },
  drawTime: { min: 15, max: 240 },
  wordChoiceCount: { min: 1, max: 5 },
  hintCount: { min: 0, max: 5 },
} as const;

export const CUSTOM_WORD_MAX_LEN = 32;
export const CUSTOM_WORDS_MAX = 1000;

/** A room: a private space identified by a short code. */
export interface Room {
  code: string;
  /** socket id of the current host (room owner). */
  hostId: string;
  phase: RoomPhase;
  players: Player[];
  /** If true, the room is listed publicly so others on the network can join it. */
  isPublic: boolean;

  /* --- game state (public; the secret word is NEVER put here) --- */
  settings: Settings;
  /** Current round number (1-based); 0 while in the lobby. */
  round: number;
  /** socket id of the current drawer, or null. */
  drawerId: string | null;
  /** What guessers see: underscores + revealed letters + spaces. */
  maskedWord: string;
  /** Seconds remaining in the current phase. */
  timeLeft: number;
  /** True when the Super-Admin has paused the game. */
  paused: boolean;
  /**
   * Thumbs votes on the *current* drawer's effort, keyed by voter socket id.
   * Reset every turn. Guessers vote once per round; the drawer can't vote.
   * At reveal, a flat bonus is added to the drawer if the net is positive.
   */
  votes: Record<string, "up" | "down">;
}

/** Flat bonus added to the drawer's score when (ups - downs) > 0 at reveal. */
export const THUMBS_DRAWER_BONUS = 5;

/** A lightweight room entry for the "rooms on your network" list. */
export interface RoomSummary {
  code: string;
  hostName: string;
  playerCount: number;
  phase: RoomPhase;
}

/* ------------------------------------------------------------------ *
 * Drawing — the canvas, tools, and the operations that build a picture.
 *
 * Every client uses the SAME fixed backing resolution below and scales it
 * with CSS, so coordinates mean the same thing on every device.
 * ------------------------------------------------------------------ */

export const CANVAS_WIDTH = 800;
export const CANVAS_HEIGHT = 600;

/** Allowed brush widths (the server rejects anything else). */
export const BRUSH_SIZES = [4, 8, 14, 24, 36];

/** Allowed drawing colors (the server rejects anything else). */
export const DRAW_PALETTE = [
  "#ffffff", "#c1c1c1", "#ef130b", "#ff7100", "#ffe400", "#00cc00", "#00ff91",
  "#00b2ff", "#231fd3", "#a300ba", "#df69a7", "#ffac8e", "#a0522d", "#000000",
  "#505050", "#740b07", "#c23800", "#e8a200", "#004619", "#00785d", "#00569e",
  "#0e0865", "#550069", "#873554", "#cc774d", "#63300d",
];

/** Safety caps so a buggy/hostile client can't exhaust server memory. */
export const MAX_STROKE_POINTS = 800;
export const MAX_CANVAS_OPS = 4000;

/** A single point in canvas space. */
export interface Point {
  x: number;
  y: number;
}

/** One live line segment, streamed while drawing for instant feedback. */
export interface Segment {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  color: string;
  size: number;
}

/** A completed freehand stroke (a path of points). */
export interface StrokeOp {
  type: "stroke";
  points: Point[];
  color: string;
  size: number;
  /** socket id of who drew it (set by the server; used for per-user undo). */
  author: string;
}

/** A flood-fill ("paint bucket") at a point. */
export interface FillOp {
  type: "fill";
  x: number;
  y: number;
  color: string;
  author: string;
}

/** Anything the server stores as part of a room's picture. */
export type DrawOp = StrokeOp | FillOp;

/* ------------------------------------------------------------------ *
 * Chat / guessing.
 * ------------------------------------------------------------------ */

/**
 * A chat line shown to players. `kind` controls styling/meaning:
 *  - normal  : a regular message or wrong guess
 *  - system  : server announcement (e.g. "Round 2!")
 *  - correct : "X guessed the word!"
 *  - close   : "your guess is close" (sent only to the guesser)
 *  - insider : a message visible only to the drawer + those who've guessed
 */
export interface ChatMessage {
  kind: "normal" | "system" | "correct" | "close" | "insider";
  name: string;
  text: string;
}

export const CHAT_MAX = 100;
