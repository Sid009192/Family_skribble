/**
 * ChatToasts — floating chat bubbles in the bottom-right of the canvas, so
 * players don't have to keep one eye on the side panel to read messages.
 *
 * Behaviour:
 *   • Up to MAX_VISIBLE toasts stacked, newest at the bottom.
 *   • Each toast auto-dismisses after LIFETIME_MS.
 *   • Slides in from the right; slides out to the right with a fade.
 *   • Mirrors the same `kind` styling as the side panel (system / correct /
 *     close / insider) so the colour cues match.
 *
 * Why a separate component (vs. inlining into Game.tsx): toast queue + timers
 * are self-contained state; keeping them here means Game.tsx stays declarative
 * and we get one isolated piece to test/tweak.
 */

import { useEffect, useRef, useState } from "react";
import type { ChatMessage } from "@shared/types";

const MAX_VISIBLE = 2;
const LIFETIME_MS = 4000;

interface ToastEntry {
  /** Monotonic id so React keys stay stable as the queue shifts. */
  id: number;
  msg: ChatMessage;
  /** Set when the auto-dismiss timer fires — triggers the slide-out CSS. */
  leaving: boolean;
}

export function ChatToasts({ messages }: { messages: ChatMessage[] }) {
  const [toasts, setToasts] = useState<ToastEntry[]>([]);

  // Track how far we've consumed the messages array. On mount, skip whatever
  // is already there (we don't want to flash old history as toasts when the
  // user transitions lobby → game).
  const seenCountRef = useRef<number>(messages.length);
  const nextIdRef = useRef<number>(1);

  useEffect(() => {
    if (messages.length <= seenCountRef.current) {
      // No new arrivals (or messages got sliced — still nothing new).
      seenCountRef.current = messages.length;
      return;
    }
    const fresh = messages.slice(seenCountRef.current);
    seenCountRef.current = messages.length;

    setToasts((prev) => {
      const added = fresh.map((m) => ({
        id: nextIdRef.current++,
        msg: m,
        leaving: false,
      }));
      // Cap to MAX_VISIBLE; older toasts get bumped immediately rather than
      // overlapping. Their dismiss timers will still fire and remove them
      // from the list, which is fine because we cap on top of that.
      return [...prev, ...added].slice(-MAX_VISIBLE);
    });
  }, [messages]);

  // Per-toast lifecycle: schedule a leaving flag at LIFETIME_MS, then a real
  // removal a bit later so the slide-out animation has time to play.
  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    for (const t of toasts) {
      if (t.leaving) continue;
      timers.push(
        setTimeout(() => {
          setToasts((prev) =>
            prev.map((p) => (p.id === t.id ? { ...p, leaving: true } : p)),
          );
          // Remove after the slide-out animation finishes (matches CSS dur).
          setTimeout(() => {
            setToasts((prev) => prev.filter((p) => p.id !== t.id));
          }, 320);
        }, LIFETIME_MS),
      );
    }
    return () => {
      for (const id of timers) clearTimeout(id);
    };
    // We only need to schedule when the set of *non-leaving* ids changes —
    // re-running on every toasts mutation is cheap (≤2 entries).
  }, [toasts]);

  if (toasts.length === 0) return null;

  return (
    <div className="chat-toasts" aria-live="polite" aria-atomic="false">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={
            "chat-toast chat-toast-" + t.msg.kind + (t.leaving ? " chat-toast-leaving" : "")
          }
        >
          {t.msg.kind === "system" ? (
            // System messages don't have a "name:" prefix — they read as
            // standalone announcements ("Sid joined the room!").
            <span className="chat-toast-text">{t.msg.text}</span>
          ) : (
            <>
              <span className="chat-toast-name">{t.msg.name}:</span>{" "}
              <span className="chat-toast-text">{t.msg.text}</span>
            </>
          )}
        </div>
      ))}
    </div>
  );
}
