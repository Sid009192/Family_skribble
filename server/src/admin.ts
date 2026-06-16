/**
 * admin.ts — verifying the Super-Admin secret key.
 *
 * The key lives only in the server's environment (.env, git-ignored) and is
 * never sent to the browser. A client proves it knows the key ONCE (adminUnlock);
 * we then flag that socket as admin and never ask again.
 *
 * We compare using a constant-time check on SHA-256 digests, so the comparison
 * takes the same time whether the guess is right or wrong (defends against
 * timing attacks). Hashing first also means we never compare raw secrets and the
 * inputs are always equal length, which timingSafeEqual requires.
 */

import { createHash, timingSafeEqual } from "node:crypto";

function sha256(value: string): Buffer {
  return createHash("sha256").update(value, "utf8").digest();
}

export function verifyAdminKey(candidate: unknown): boolean {
  const expected = process.env.ADMIN_KEY;
  // If no key is configured, godmode is disabled entirely.
  if (!expected || typeof candidate !== "string" || candidate.length === 0) {
    return false;
  }
  return timingSafeEqual(sha256(candidate), sha256(expected));
}
