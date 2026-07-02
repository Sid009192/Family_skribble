/**
 * rooms.ts — the in-memory registry of all active rooms.
 *
 * The server is the single source of truth: it owns the real player list, who
 * the host is, etc. Clients only ever receive copies. We keep rooms in a simple
 * Map for now (lives in memory; cleared on restart — fine for Stage 1).
 *
 * Every function here returns plain data; actually *sending* updates to clients
 * happens in index.ts. Keeping "game state" and "networking" separate keeps
 * each file focused and easy to reason about.
 */

import { randomBytes } from "node:crypto";
import { DEFAULT_SETTINGS, MAX_PLAYERS, ROOM_CODE_LENGTH } from "@shared/types";
import type { Avatar, Player, Room, RoomSummary } from "@shared/types";

/** All live rooms, keyed by their code. */
const rooms = new Map<string, Room>();

// Code alphabet without easily-confused characters (no 0/O, 1/I, etc.).
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/** Generate a short, unique, unambiguous room code using a secure RNG. */
function generateUniqueCode(): string {
  let code = "";
  do {
    const bytes = randomBytes(ROOM_CODE_LENGTH);
    code = "";
    for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
      code += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
    }
  } while (rooms.has(code));
  return code;
}

/** Build a fresh Player object with sensible defaults. */
function makePlayer(
  id: string,
  name: string,
  avatar: Avatar,
  isHost: boolean
): Player {
  return {
    id,
    name,
    avatar,
    score: 0,
    isHost,
    muted: false,
    connected: true,
    hasGuessed: false,
  };
}

/** Create a new room with the given player as host. Returns the room. */
export function createRoom(
  id: string,
  name: string,
  avatar: Avatar,
  isPublic: boolean
): Room {
  const code = generateUniqueCode();
  const room: Room = {
    code,
    hostId: id,
    phase: "lobby",
    players: [makePlayer(id, name, avatar, true)],
    isPublic,
    settings: { ...DEFAULT_SETTINGS },
    round: 0,
    drawerId: null,
    maskedWord: "",
    timeLeft: 0,
    paused: false,
    votes: {},
  };
  rooms.set(code, room);
  return room;
}

export function getRoom(code: string): Room | undefined {
  return rooms.get(code);
}

/**
 * The public rooms others can join, most-populated first, capped to `limit`.
 * Only lobby-phase public rooms are listed.
 */
export function listPublicRooms(limit = 5): RoomSummary[] {
  const summaries: RoomSummary[] = [];
  for (const room of rooms.values()) {
    if (!room.isPublic) continue;
    const host = room.players.find((p) => p.id === room.hostId);
    summaries.push({
      code: room.code,
      hostName: host?.name ?? "Someone",
      playerCount: room.players.length,
      phase: room.phase,
    });
  }
  summaries.sort((a, b) => b.playerCount - a.playerCount);
  return summaries.slice(0, limit);
}

/** Result of attempting to join a room. */
export interface JoinOutcome {
  ok: boolean;
  error?: string;
  room?: Room;
}

/** Add a player to an existing room. */
export function addPlayer(
  code: string,
  id: string,
  name: string,
  avatar: Avatar
): JoinOutcome {
  const room = rooms.get(code);
  if (!room) return { ok: false, error: "Room not found." };
  // Already in this room (e.g. duplicate event)? Just return current state.
  if (room.players.some((p) => p.id === id)) return { ok: true, room };
  // Cap is the room's own setting, clamped server-side to MAX_PLAYERS so a
  // tampered client can never grow the room past the hard ceiling.
  const cap = Math.min(room.settings.maxPlayers, MAX_PLAYERS);
  if (room.players.length >= cap) {
    return { ok: false, error: "This room is full." };
  }
  room.players.push(makePlayer(id, name, avatar, false));
  return { ok: true, room };
}

/**
 * Remove a player from a room.
 * - If the room becomes empty, it's deleted and `undefined` is returned.
 * - If the host left, the next player is promoted to host.
 * - Otherwise returns the updated room.
 */
export interface RemoveResult {
  room: Room;
  /** Name of the newly promoted host, if the leaver was the previous host. */
  promotedHostName?: string;
}

/**
 * Mark a player as disconnected without removing them from the room.
 * Their slot is held so they can rejoin with the same name/score.
 */
export function markDisconnected(code: string, id: string): void {
  const room = rooms.get(code);
  if (!room) return;
  const p = room.players.find((pl) => pl.id === id);
  if (p) p.connected = false;
}

/**
 * Restore a reconnecting player: swap their old socket id for the new one,
 * mark them connected again, and fix up hostId/drawerId if needed.
 * Returns the updated room, or undefined if not found.
 */
export function reconnectPlayer(
  code: string,
  oldId: string,
  newId: string,
): Room | undefined {
  const room = rooms.get(code);
  if (!room) return undefined;
  const p = room.players.find((pl) => pl.id === oldId);
  if (!p) return undefined;
  p.id = newId;
  p.connected = true;
  if (room.hostId === oldId) room.hostId = newId;
  if (room.drawerId === oldId) room.drawerId = newId;
  // Move the reconnected player to the end of the list so they appear at the
  // bottom of the player row (they'll re-earn their visual position next game).
  const idx = room.players.indexOf(p);
  if (idx !== -1 && idx !== room.players.length - 1) {
    room.players.splice(idx, 1);
    room.players.push(p);
  }
  return room;
}

/** Hard-delete a room entirely (used when all players abandon it). */
export function deleteRoom(code: string): void {
  rooms.delete(code);
}

export function removePlayer(code: string, id: string): RemoveResult | undefined {
  const room = rooms.get(code);
  if (!room) return undefined;

  room.players = room.players.filter((p) => p.id !== id);

  if (room.players.length === 0) {
    rooms.delete(code);
    return undefined;
  }

  // If the host left, promote the first remaining player. We expose the new
  // host's name so the caller can broadcast a "X is now the room owner!"
  // system chat message without re-reading the room state.
  let promotedHostName: string | undefined;
  if (room.hostId === id) {
    const newHost = room.players[0];
    newHost.isHost = true;
    room.hostId = newHost.id;
    promotedHostName = newHost.name;
  }

  return { room, promotedHostName };
}
