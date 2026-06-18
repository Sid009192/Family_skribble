/**
 * ThumbsBar.tsx — skribbl-style 👍 / 👎 vote chips floating over the canvas.
 *
 * In real skribbl, guessers can like or dislike the drawer's effort. We don't
 * have the voting backend wired yet — this is the visual layer ready for it.
 * Clicks no-op for now (logged so we can see them firing). Hidden for the
 * drawer themselves (they can't vote on their own work).
 */

interface Props {
  /** True while we should hide the bar (e.g. the user IS the drawer). */
  hidden?: boolean;
  /** Optional hook for once vote events are wired server-side. */
  onVote?: (kind: "up" | "down") => void;
}

export function ThumbsBar({ hidden, onVote }: Props) {
  if (hidden) return null;
  const click = (kind: "up" | "down") => {
    // eslint-disable-next-line no-console
    console.log(`[thumbs] ${kind}`);
    onVote?.(kind);
  };
  return (
    <div className="thumbs-bar" role="group" aria-label="rate the drawer">
      <button
        type="button"
        className="thumb-btn thumb-up"
        title="Like this drawing"
        onClick={() => click("up")}
      >
        <img src="/img/thumbsup.gif" alt="like" />
      </button>
      <button
        type="button"
        className="thumb-btn thumb-down"
        title="Dislike this drawing"
        onClick={() => click("down")}
      >
        <img src="/img/thumbsdown.gif" alt="dislike" />
      </button>
    </div>
  );
}
