/**
 * sessions.ts — maps a per-player token (stored in the browser's localStorage)
 * to enough data to restore them into their room after a network drop.
 *
 * Tokens are never sent to other players or stored on disk — they live only in
 * this in-memory Map and in the player's own localStorage. A server restart
 * clears everything, which is fine: sessions are meant to survive phone sleeps,
 * not deployment cycles.
 */

import { randomBytes } from "node:crypto";
import type { Avatar } from "@shared/types";

interface SessionData {
  /** The socket.id the player had when they last connected. */
  socketId: string;
  name: string;
  avatar: Avatar;
  roomCode: string;
  savedAt: number;
}

const sessions = new Map<string, SessionData>();
// Reverse map so we can look up a token quickly on disconnect (we only have socket.id then).
const socketToToken = new Map<string, string>();

const SESSION_TTL_MS = 60 * 60 * 1000; // 1 hour

export function generateToken(): string {
  return randomBytes(24).toString("hex");
}

export function saveSession(
  token: string,
  socketId: string,
  roomCode: string,
  name: string,
  avatar: Avatar,
): void {
  // Remove the old reverse entry if this socket was already mapped.
  const oldToken = socketToToken.get(socketId);
  if (oldToken && oldToken !== token) sessions.delete(oldToken);

  sessions.set(token, { socketId, roomCode, name, avatar, savedAt: Date.now() });
  socketToToken.set(socketId, token);
}

export function getSessionByToken(token: string): SessionData | undefined {
  const s = sessions.get(token);
  if (!s) return undefined;
  if (Date.now() - s.savedAt > SESSION_TTL_MS) {
    socketToToken.delete(s.socketId);
    sessions.delete(token);
    return undefined;
  }
  return s;
}

export function getTokenBySocket(socketId: string): string | undefined {
  return socketToToken.get(socketId);
}

/** Called on intentional leave / kick — removes the session so reconnect can't happen. */
export function clearSession(token: string): void {
  const s = sessions.get(token);
  if (s) socketToToken.delete(s.socketId);
  sessions.delete(token);
}

export function clearSessionBySocket(socketId: string): void {
  const token = socketToToken.get(socketId);
  if (token) clearSession(token);
}
