/**
 * game.ts — the game loop "referee" (server-authoritative).
 *
 * Owns the SECRET state (word, who guessed, timer) that clients must never see.
 * Public state (phase, round, masked word, scores, time, paused) lives on the
 * Room and is broadcast via "roomState"; private bits go to specific players.
 *
 * TIMER MODEL: one interval per game ticks once a second and drives whatever
 * phase is active via room.timeLeft. This makes pause trivial (skip the tick)
 * and "skip turn" easy (jump the phase). Phases:
 *   choosing -> drawing -> reveal -> (next turn) ... -> gameover
 */

import type { Server } from "socket.io";
import type {
  ClientToServerEvents,
  InterServerEvents,
  ServerToClientEvents,
  SocketData,
} from "@shared/events";
import type { ChatMessage, Room } from "@shared/types";
import { THUMBS_DRAWER_BONUS } from "@shared/types";
import { getOps, resetCanvas } from "./canvas.js";
import { getRoom } from "./rooms.js";
import { cleanChat } from "./validate.js";
import { DEFAULT_WORDS } from "./words.js";

type IO = Server<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData
>;

const CHOOSE_SECONDS = 15; // time the drawer has to pick a word
const REVEAL_SECONDS = 5; // how long the end-of-turn reveal shows
const MAX_SCORE = 999999;

interface GameState {
  word: string;
  choices: string[];
  revealed: Set<number>;
  order: string[]; // draw order (socket ids)
  turnIndex: number;
  guessed: Set<string>;
  gained: Map<string, number>;
  paused: boolean;
  ticker?: ReturnType<typeof setInterval>;
}

const games = new Map<string, GameState>();

let io: IO;
export function initGame(server: IO): void {
  io = server;
}

/* ------------------------------------------------------------------ *
 * Public entry points.
 * ------------------------------------------------------------------ */

export function startGame(code: string): void {
  const room = getRoom(code);
  if (!room) return;
  if (room.phase !== "lobby" && room.phase !== "gameover") return;
  if (room.players.length < 2) {
    // Surface the reason as a system chat message so the host gets feedback,
    // instead of the Start button looking like it does nothing.
    io.to(code).emit("chat", {
      kind: "system",
      name: "",
      text: "You need at least 2 players to start the game!",
    });
    return;
  }

  for (const p of room.players) {
    p.score = 0;
    p.hasGuessed = false;
  }
  const g: GameState = {
    word: "",
    choices: [],
    revealed: new Set(),
    order: room.players.map((p) => p.id),
    turnIndex: 0,
    guessed: new Set(),
    gained: new Map(),
    paused: false,
  };
  games.set(code, g);
  room.round = 1;
  room.paused = false;
  g.ticker = setInterval(() => tick(code), 1000);
  beginTurn(code);
}

/** Host returns the room to the lobby (e.g. after a game). */
export function returnToLobby(code: string): void {
  const room = getRoom(code);
  cleanupGame(code);
  if (!room) return;
  room.phase = "lobby";
  room.round = 0;
  room.drawerId = null;
  room.maskedWord = "";
  room.timeLeft = 0;
  room.paused = false;
  room.votes = {};
  for (const p of room.players) p.hasGuessed = false;
  resetCanvas(code);
  io.to(code).emit("canvasState", []);
  broadcast(room);
}

/**
 * Record a guesser's thumbs vote on the current drawer.
 * - drawing phase only (you can't rate before/after)
 * - guessers only (the drawer can't pad their own bonus)
 * - one-shot: once cast this round, the vote can't be changed
 */
export function rateDrawing(id: string, code: string, kind: unknown): void {
  const room = getRoom(code);
  if (!room) return;
  if (room.phase !== "drawing") return;
  if (!room.drawerId || room.drawerId === id) return;
  if (!room.players.some((p) => p.id === id)) return;
  if (room.votes[id]) return; // first vote locks
  if (kind !== "up" && kind !== "down") return;
  room.votes[id] = kind;
  broadcast(room);
}

export function chooseWord(id: string, code: string, word: unknown): void {
  const room = getRoom(code);
  const g = games.get(code);
  if (!room || !g) return;
  if (room.phase !== "choosing" || room.drawerId !== id) return;
  if (typeof word !== "string" || !g.choices.includes(word)) return;
  startDrawing(code, word);
}

export function handleChat(id: string, code: string, rawText: unknown): void {
  const room = getRoom(code);
  if (!room) return;
  const player = room.players.find((p) => p.id === id);
  if (!player) return;

  const text = cleanChat(rawText);
  if (!text) return;
  if (player.muted) return; // muted players' messages are hidden from everyone

  const g = games.get(code);

  if (room.phase === "drawing" && g) {
    if (g.paused) return; // game frozen — ignore guesses/chat to avoid leaks

    const isDrawer = id === room.drawerId;
    const alreadyGuessed = g.guessed.has(id);

    if (!isDrawer && !alreadyGuessed) {
      if (isCorrectGuess(rawText, g.word)) {
        registerCorrectGuess(code, room, g, id, player.name);
        return;
      }
      if (isClose(rawText, g.word)) {
        io.to(id).emit("chat", { kind: "close", name: "", text: `"${text}" is close!` });
      }
      io.to(code).emit("chat", { kind: "normal", name: player.name, text });
      return;
    }

    // Drawer or someone who already guessed: only insiders see it (no spoilers).
    sendToInsiders(room, g, { kind: "insider", name: player.name, text });
    return;
  }

  io.to(code).emit("chat", { kind: "normal", name: player.name, text });
}

export function onPlayerLeft(code: string, id: string): void {
  const room = getRoom(code);
  const g = games.get(code);
  if (!room || !g) return;

  if (room.players.length < 2) {
    endGame(code);
    return;
  }
  if (room.phase === "choosing" && id === room.drawerId) {
    nextTurn(code);
  } else if (room.phase === "drawing") {
    if (id === room.drawerId) endTurn(code);
    else {
      g.guessed.delete(id);
      if (everyoneGuessed(room, g)) endTurn(code);
    }
  }
}

export function onPlayerJoined(code: string, id: string): void {
  const g = games.get(code);
  if (g && !g.order.includes(id)) g.order.push(id);
}

export function cleanupGame(code: string): void {
  const g = games.get(code);
  if (g?.ticker) clearInterval(g.ticker);
  games.delete(code);
}

/* ------------------------------------------------------------------ *
 * Super-Admin (godmode) actions — permission is checked in index.ts.
 * ------------------------------------------------------------------ */

export function adminPause(code: string): void {
  const room = getRoom(code);
  const g = games.get(code);
  if (!room || !g || g.paused) return;
  g.paused = true;
  room.paused = true;
  broadcast(room);
}

export function adminResume(code: string): void {
  const room = getRoom(code);
  const g = games.get(code);
  if (!room || !g || !g.paused) return;
  g.paused = false;
  room.paused = false;
  broadcast(room);
}

export function adminSkipTurn(code: string): void {
  const room = getRoom(code);
  const g = games.get(code);
  if (!room || !g) return;
  if (room.phase === "drawing") endTurn(code);
  else nextTurn(code); // choosing or reveal: just move on
}

export function adminSetDrawer(code: string, targetId: string): void {
  const room = getRoom(code);
  const g = games.get(code);
  if (!room || !g) return;
  if (!room.players.some((p) => p.id === targetId)) return;
  startTurnForDrawer(code, targetId); // one-off override; normal rotation resumes after
}

export function adminRevealWord(code: string, adminId: string): void {
  const g = games.get(code);
  if (!g || !g.word) return;
  io.to(adminId).emit("chat", { kind: "system", name: "", text: `🔒 The word is "${g.word}"` });
}

export function adminSetScore(code: string, targetId: string, score: unknown): void {
  const room = getRoom(code);
  if (!room) return;
  const player = room.players.find((p) => p.id === targetId);
  if (!player) return;
  const n = Math.round(Number(score));
  if (!Number.isFinite(n)) return;
  player.score = Math.min(MAX_SCORE, Math.max(0, n));
  broadcast(room);
}

/* ------------------------------------------------------------------ *
 * Turn lifecycle.
 * ------------------------------------------------------------------ */

function beginTurn(code: string): void {
  const room = getRoom(code);
  const g = games.get(code);
  if (!room || !g) return;
  if (room.players.length < 2) return endGame(code);

  while (g.turnIndex < g.order.length && !room.players.some((p) => p.id === g.order[g.turnIndex])) {
    g.turnIndex++;
  }
  if (g.turnIndex >= g.order.length) {
    if (room.round >= room.settings.rounds) return endGame(code);
    room.round++;
    g.turnIndex = 0;
    return beginTurn(code);
  }
  startTurnForDrawer(code, g.order[g.turnIndex]);
}

/** Set up the "choosing" phase for a specific drawer. */
function startTurnForDrawer(code: string, drawerId: string): void {
  const room = getRoom(code);
  const g = games.get(code);
  if (!room || !g) return;

  g.word = "";
  g.revealed = new Set();
  g.guessed = new Set();
  g.gained = new Map();
  g.choices = pickWords(room);

  room.drawerId = drawerId;
  room.phase = "choosing";
  room.maskedWord = "";
  room.timeLeft = CHOOSE_SECONDS;
  // Wipe last turn's thumbs votes; guessers get a fresh ballot per drawer.
  room.votes = {};
  for (const p of room.players) p.hasGuessed = false;

  resetCanvas(code);
  io.to(code).emit("canvasState", []);
  broadcast(room);
  io.to(drawerId).emit("wordChoices", g.choices);
}

function startDrawing(code: string, word: string): void {
  const room = getRoom(code);
  const g = games.get(code);
  if (!room || !g || room.phase !== "choosing") return;
  g.word = word;
  g.revealed = new Set();
  room.phase = "drawing";
  room.timeLeft = room.settings.drawTime;
  room.maskedWord = maskWord(word, g.revealed);
  broadcast(room);
  if (room.drawerId) io.to(room.drawerId).emit("yourWord", word);
}

function tick(code: string): void {
  const room = getRoom(code);
  const g = games.get(code);
  if (!room || !g) return;
  if (g.paused) return; // frozen by the Super-Admin
  if (room.phase !== "choosing" && room.phase !== "drawing" && room.phase !== "reveal") return;

  room.timeLeft = Math.max(0, room.timeLeft - 1);
  io.to(code).emit("gameTick", room.timeLeft);
  if (room.phase === "drawing") maybeRevealHint(room, g);

  if (room.timeLeft <= 0) {
    if (room.phase === "choosing") {
      startDrawing(code, g.choices[Math.floor(Math.random() * g.choices.length)]);
    } else if (room.phase === "drawing") {
      endTurn(code);
    } else {
      nextTurn(code);
    }
  }
}

function endTurn(code: string): void {
  const room = getRoom(code);
  const g = games.get(code);
  if (!room || !g || room.phase !== "drawing") return;

  // Drawer earns the guessers' average scaled by participation, i.e.
  // (total guesser points / number of potential guessers).
  const totalGuesserPoints = [...g.gained.values()].reduce((a, b) => a + b, 0);
  const potentialGuessers = room.players.filter((p) => p.id !== room.drawerId).length;
  let drawerPoints = 0;
  if (totalGuesserPoints > 0 && room.drawerId && potentialGuessers > 0) {
    drawerPoints = Math.round(totalGuesserPoints / potentialGuessers);
  }

  // Thumbs bonus: if guessers as a whole liked the drawing (ups > downs),
  // tack on a flat THUMBS_DRAWER_BONUS. No penalty for net-negative — the user
  // explicitly opted out of negative score adjustments.
  if (room.drawerId) {
    let ups = 0;
    let downs = 0;
    for (const v of Object.values(room.votes)) {
      if (v === "up") ups++;
      else if (v === "down") downs++;
    }
    if (ups > downs) drawerPoints += THUMBS_DRAWER_BONUS;
  }

  if (drawerPoints > 0 && room.drawerId) {
    const drawer = room.players.find((p) => p.id === room.drawerId);
    if (drawer) {
      drawer.score += drawerPoints;
      g.gained.set(room.drawerId, drawerPoints);
    }
  }

  room.phase = "reveal";
  room.timeLeft = REVEAL_SECONDS;
  broadcast(room);
  io.to(code).emit("turnReveal", { word: g.word, gained: Object.fromEntries(g.gained) });
}

function nextTurn(code: string): void {
  const g = games.get(code);
  if (!g) return;
  g.turnIndex++;
  beginTurn(code);
}

function endGame(code: string): void {
  const room = getRoom(code);
  cleanupGame(code);
  if (!room) return;
  room.phase = "gameover";
  room.drawerId = null;
  room.maskedWord = "";
  room.timeLeft = 0;
  room.paused = false;
  broadcast(room);
}

/* ------------------------------------------------------------------ *
 * Guessing + scoring.
 * ------------------------------------------------------------------ */

function registerCorrectGuess(
  code: string,
  room: Room,
  g: GameState,
  id: string,
  name: string
): void {
  g.guessed.add(id);
  const player = room.players.find((p) => p.id === id);
  if (player) player.hasGuessed = true;

  const frac = room.timeLeft / room.settings.drawTime;
  const points = Math.max(100, Math.round(100 + 400 * frac)); // 100..500
  if (player) player.score += points;
  g.gained.set(id, points);

  io.to(code).emit("chat", { kind: "correct", name, text: `${name} guessed the word!` });
  broadcast(room);

  if (everyoneGuessed(room, g)) endTurn(code);
}

function everyoneGuessed(room: Room, g: GameState): boolean {
  const nonDrawers = room.players.filter((p) => p.id !== room.drawerId);
  return nonDrawers.length > 0 && nonDrawers.every((p) => g.guessed.has(p.id));
}

function sendToInsiders(room: Room, g: GameState, msg: ChatMessage): void {
  const insiders = new Set<string>(g.guessed);
  if (room.drawerId) insiders.add(room.drawerId);
  for (const id of insiders) io.to(id).emit("chat", msg);
}

function maybeRevealHint(room: Room, g: GameState): void {
  const letterIndexes = [...g.word].map((c, i) => (c === " " ? -1 : i)).filter((i) => i >= 0);
  const maxHints = Math.min(room.settings.hintCount, Math.max(0, letterIndexes.length - 1));
  if (maxHints <= 0) return;

  const elapsed = room.settings.drawTime - room.timeLeft;
  const due = Math.floor((elapsed / room.settings.drawTime) * (maxHints + 1));
  let changed = false;
  while (g.revealed.size < Math.min(due, maxHints)) {
    const hidden = letterIndexes.filter((i) => !g.revealed.has(i));
    if (hidden.length === 0) break;
    g.revealed.add(hidden[Math.floor(Math.random() * hidden.length)]);
    changed = true;
  }
  if (changed) {
    room.maskedWord = maskWord(g.word, g.revealed);
    broadcast(room);
  }
}

/* ------------------------------------------------------------------ *
 * Pure helpers.
 * ------------------------------------------------------------------ */

function broadcast(room: Room): void {
  io.to(room.code).emit("roomState", room);
}

/** Build the word pool from settings (custom-only when there are enough words). */
function pickWords(room: Room): string[] {
  const n = room.settings.wordChoiceCount;
  const custom = room.settings.customWords;
  const useOnly = room.settings.customWordsOnly && custom.length >= n;

  let pool: string[];
  if (useOnly) {
    pool = [...custom];
  } else {
    pool = [...DEFAULT_WORDS];
    const seen = new Set(DEFAULT_WORDS.map((w) => w.toLowerCase()));
    for (const w of custom) {
      if (!seen.has(w.toLowerCase())) {
        pool.push(w);
        seen.add(w.toLowerCase());
      }
    }
  }

  const out: string[] = [];
  for (let i = 0; i < n && pool.length > 0; i++) {
    out.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
  }
  return out;
}

function maskWord(word: string, revealed: Set<number>): string {
  return [...word].map((ch, i) => (ch === " " ? " " : revealed.has(i) ? ch : "_")).join("");
}

function normalize(s: unknown): string {
  return typeof s === "string" ? s.toLowerCase().trim().replace(/\s+/g, " ") : "";
}

function isCorrectGuess(guess: unknown, word: string): boolean {
  const g = normalize(guess);
  const w = normalize(word);
  return g === w || g.replace(/\s/g, "") === w.replace(/\s/g, "");
}

function isClose(guess: unknown, word: string): boolean {
  const g = normalize(guess);
  const w = normalize(word);
  return w.length > 3 && levenshtein(g, w) === 1;
}

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (Math.abs(m - n) > 1) return 2;
  const prev = new Array<number>(n + 1);
  const curr = new Array<number>(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    for (let j = 0; j <= n; j++) prev[j] = curr[j];
  }
  return prev[n];
}
