/**
 * sounds.ts — preloads the seven game sounds via the WebAudio API and exposes
 * a single play(name) function. Files live in client/public/audio/*.ogg and
 * are served by Vite.
 *
 * Why WebAudio instead of HTMLAudioElement: a fresh `new Audio().play()` —
 * even with the file cached — runs through a media-element pipeline that adds
 * 100–300ms of latency on most browsers. WebAudio plays a pre-decoded
 * AudioBuffer through an AudioBufferSourceNode, which starts within a few
 * milliseconds. That's exactly what game tick / guess sounds need.
 *
 * Browsers gate audio behind a user gesture: the AudioContext starts
 * "suspended" until the first click/tap. We resume it on the first pointer
 * event and decode all files once at startup so the first real play is
 * already-warm.
 */

export type SoundName =
  | "roundStart"
  | "roundEndSuccess"
  | "roundEndFailure"
  | "join"
  | "leave"
  | "playerGuessed"
  | "tick";

const FILES: Record<SoundName, string> = {
  roundStart: "/audio/roundStart.ogg",
  roundEndSuccess: "/audio/roundEndSuccess.ogg",
  roundEndFailure: "/audio/roundEndFailure.ogg",
  join: "/audio/join.ogg",
  leave: "/audio/leave.ogg",
  playerGuessed: "/audio/playerGuessed.ogg",
  tick: "/audio/tick.ogg",
};

let ctx: AudioContext | null = null;
const buffers: Partial<Record<SoundName, AudioBuffer>> = {};

function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    // Safari still ships only webkitAudioContext on older versions.
    const Ctor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();
  }
  return ctx;
}

async function loadOne(c: AudioContext, name: SoundName): Promise<void> {
  try {
    const res = await fetch(FILES[name]);
    const bytes = await res.arrayBuffer();
    buffers[name] = await c.decodeAudioData(bytes);
  } catch {
    // If a file is missing or decode fails, the sound just won't play; we
    // don't want one bad file to take down the rest of the game.
  }
}

if (typeof window !== "undefined") {
  const c = getCtx();
  if (c) {
    // Fire-and-forget — these resolve as the files arrive; play() is a no-op
    // until then.
    for (const n of Object.keys(FILES) as SoundName[]) loadOne(c, n);

    // Unlock on the first user gesture. The handler removes itself so we
    // don't keep listening forever.
    const unlock = () => {
      if (c.state === "suspended") c.resume();
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
    window.addEventListener("pointerdown", unlock, { once: false });
    window.addEventListener("keydown", unlock, { once: false });
  }
}

export function play(name: SoundName) {
  const c = ctx;
  const buf = buffers[name];
  if (!c || !buf) return;
  // If we're called before the first user gesture, ctx is still suspended —
  // attempt a resume (a no-op if already running) and proceed.
  if (c.state === "suspended") c.resume().catch(() => {});
  const src = c.createBufferSource();
  src.buffer = buf;
  src.connect(c.destination);
  src.start(0);
}
