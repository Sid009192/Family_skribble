/**
 * validate.ts — never trust data from the client.
 *
 * Anything arriving over the socket could be malformed, oversized, or hostile
 * (someone editing the page, a buggy client, etc.). These helpers turn raw,
 * untrusted input into clean, safe values — or reject it. This is a core part
 * of "no security holes": the server decides what's acceptable, not the client.
 */

import {
  AVATAR_OPTIONS,
  CHAT_MAX,
  CUSTOM_WORD_MAX_LEN,
  CUSTOM_WORDS_MAX,
  DIFFICULTIES,
  NAME_MAX,
  NAME_MIN,
  SETTINGS_LIMITS,
} from "@shared/types";
import type { Avatar, Settings } from "@shared/types";
import type { SettingsUpdate } from "@shared/events";
import { censorProfanity } from "./profanity.js";

// Matches ASCII control characters (0x00–0x1F and 0x7F) — invisible chars that
// are sometimes abused in names. Built via RegExp so no literal control chars
// live in this source file.
const CONTROL_CHARS = new RegExp("[\\u0000-\\u001F\\u007F]", "g");

/**
 * Clean a player-supplied name:
 * - strips control characters,
 * - collapses runs of whitespace into single spaces,
 * - trims the ends,
 * - enforces length limits.
 * Returns the clean name, or null if it's unusable.
 */
export function cleanName(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const cleaned = raw
    .replace(CONTROL_CHARS, "")
    .replace(/\s+/g, " ")
    .trim();
  if (cleaned.length < NAME_MIN || cleaned.length > NAME_MAX) return null;
  // Censor profanity last, so the length check sees the real typed length.
  return censorProfanity(cleaned);
}

/**
 * Coerce a player-supplied avatar into valid option indexes.
 * Out-of-range or garbage values are wrapped into a valid range, so a bad
 * avatar can never crash the game or point at a non-existent option.
 */
export function cleanAvatar(raw: unknown): Avatar {
  const a = (raw ?? {}) as Partial<Record<keyof Avatar, unknown>>;
  const wrap = (value: unknown, count: number): number => {
    const n = Number(value);
    if (!Number.isFinite(n)) return 0;
    return ((Math.floor(n) % count) + count) % count; // always lands in [0, count)
  };
  return {
    color: wrap(a.color, AVATAR_OPTIONS.colors),
    eyes: wrap(a.eyes, AVATAR_OPTIONS.eyes),
    mouth: wrap(a.mouth, AVATAR_OPTIONS.mouths),
  };
}

/** Normalize a room code to the canonical form we store (UPPERCASE, no spaces). */
export function cleanRoomCode(raw: unknown): string {
  if (typeof raw !== "string") return "";
  return raw.replace(/\s+/g, "").toUpperCase();
}

/** Parse the raw custom-words textarea into a clean, capped word array. */
export function parseCustomWords(raw: unknown): string[] {
  if (typeof raw !== "string") return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const piece of raw.split(",")) {
    const word = piece.replace(CONTROL_CHARS, "").replace(/\s+/g, " ").trim();
    if (word.length === 0 || word.length > CUSTOM_WORD_MAX_LEN) continue;
    const key = word.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(word);
    if (out.length >= CUSTOM_WORDS_MAX) break;
  }
  return out;
}

/**
 * Produce a new, fully-validated Settings object by applying an update on top
 * of the current settings. Numbers are clamped to allowed ranges; unknown or
 * out-of-type fields are ignored (so the current value is kept).
 */
export function cleanSettings(current: Settings, update: SettingsUpdate): Settings {
  const clampInt = (
    value: unknown,
    limit: { min: number; max: number },
    fallback: number
  ): number => {
    const n = Math.round(Number(value));
    if (!Number.isFinite(n)) return fallback;
    return Math.min(limit.max, Math.max(limit.min, n));
  };

  return {
    maxPlayers:
      update.maxPlayers === undefined
        ? current.maxPlayers
        : clampInt(update.maxPlayers, SETTINGS_LIMITS.maxPlayers, current.maxPlayers),
    rounds:
      update.rounds === undefined
        ? current.rounds
        : clampInt(update.rounds, SETTINGS_LIMITS.rounds, current.rounds),
    drawTime:
      update.drawTime === undefined
        ? current.drawTime
        : clampInt(update.drawTime, SETTINGS_LIMITS.drawTime, current.drawTime),
    wordChoiceCount:
      update.wordChoiceCount === undefined
        ? current.wordChoiceCount
        : clampInt(update.wordChoiceCount, SETTINGS_LIMITS.wordChoiceCount, current.wordChoiceCount),
    hintCount:
      update.hintCount === undefined
        ? current.hintCount
        : clampInt(update.hintCount, SETTINGS_LIMITS.hintCount, current.hintCount),
    customWordsOnly:
      typeof update.customWordsOnly === "boolean"
        ? update.customWordsOnly
        : current.customWordsOnly,
    customWords:
      update.customWords === undefined
        ? current.customWords
        : parseCustomWords(update.customWords),
    difficulty:
      typeof update.difficulty === "string" &&
      (DIFFICULTIES as string[]).includes(update.difficulty)
        ? (update.difficulty as Settings["difficulty"])
        : current.difficulty,
  };
}

/**
 * Clean a chat message: strip control chars, trim, length-limit, censor.
 * Returns null if empty/unusable. NOTE: censoring is for DISPLAY; guess-matching
 * happens against the raw text before this, so censorship can't block a guess.
 */
export function cleanChat(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const cleaned = raw.replace(CONTROL_CHARS, "").replace(/\s+/g, " ").trim();
  if (cleaned.length === 0 || cleaned.length > CHAT_MAX) return null;
  return censorProfanity(cleaned);
}
