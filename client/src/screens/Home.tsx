/**
 * Home.tsx — the landing screen, redesigned to match skribbl.io's layout.
 *
 * Top-to-bottom on the panel:
 *   1. Rainbow "Agarwal Skribbl" logo (long-press = admin console).
 *   2. Decorative row of 8 sample avatars.
 *   3. Name input + Privacy pill (Private / Public).
 *   4. Avatar customizer (eyes / mouth / colour arrows + die).
 *   5. Big green "Join" button — opens the Join modal (code + room list).
 *   6. Blue "Create Private Room" button.
 *
 * Name + avatar persist via localStorage between sessions.
 */

import { useEffect, useState } from "react";
import { NAME_MAX, NAME_MIN } from "@shared/types";
import type { Avatar as AvatarType, RoomSummary } from "@shared/types";
import type { JoinResult } from "@shared/events";
import { AvatarPicker } from "../components/AvatarPicker";
import { randomAvatar } from "../components/Avatar";
import { CharacterRow } from "../components/CharacterRow";
import { JoinModal } from "../components/JoinModal";
import { PrivacyToggle } from "../components/PrivacyToggle";
import { Modal } from "../components/Modal";
import { useLongPress } from "../hooks/useLongPress";
import { loadPrefs, savePrefs } from "../prefs";

interface Props {
  connected: boolean;
  notice: string | null;
  roomList: RoomSummary[];
  onCreate: (name: string, avatar: AvatarType, isPublic: boolean) => Promise<JoinResult>;
  onJoin: (code: string, name: string, avatar: AvatarType) => Promise<JoinResult>;
  onDismissNotice: () => void;
  onOpenAdmin: () => void;
}

// Load any saved prefs once; fall back to a random avatar for first-timers.
const saved = loadPrefs();
const HERO_WORDS = ["pancake", "rocket", "rainbow", "castle", "blanket", "popcorn"];
const HERO_STATS = [
  "12 laughs saved",
  "4 wild guesses",
  "7 quick doodles",
  "3 family cheers",
];

export function Home({
  connected,
  notice,
  roomList,
  onCreate,
  onJoin,
  onDismissNotice,
  onOpenAdmin,
}: Props) {
  const longPress = useLongPress(onOpenAdmin);
  const [name, setName] = useState(saved?.name ?? "");
  const [avatar, setAvatar] = useState<AvatarType>(saved?.avatar ?? randomAvatar());
  const [privacy, setPrivacy] = useState<"private" | "public">("public");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [joinOpen, setJoinOpen] = useState(false);
  const [heroStep, setHeroStep] = useState(0);

  useEffect(() => {
    savePrefs({ name, avatar });
  }, [name, avatar]);

  useEffect(() => {
    const id = window.setInterval(() => {
      setHeroStep((step) => step + 1);
    }, 2200);
    return () => window.clearInterval(id);
  }, []);

  const trimmedName = name.trim();
  const nameOk = trimmedName.length >= NAME_MIN;
  const canAct = connected && nameOk && !busy;
  const heroWord = HERO_WORDS[heroStep % HERO_WORDS.length];
  const heroStat = HERO_STATS[heroStep % HERO_STATS.length];
  const liveRoomText =
    roomList.length === 0
      ? "Start the first table"
      : `${roomList.length} room${roomList.length === 1 ? "" : "s"} live nearby`;

  async function run(action: () => Promise<JoinResult>) {
    setError(null);
    setBusy(true);
    const res = await action();
    setBusy(false);
    if (!res.ok) setError(res.error ?? "Something went wrong.");
    return res;
  }

  return (
    <main className="home">
      <section className="home-hero">
        <div className="hero-copy">
          <span className="hero-kicker">Family drawing night</span>
          <header className="logo-big" {...longPress}>
            <img src="/img/logo.gif" alt="Agarwal Skribbl" />
          </header>
          <p className="hero-subtitle">
            Sketch, guess, laugh, and keep the room moving with quick rounds made for every age.
          </p>
        </div>

        <div className="hero-showcase" aria-hidden="true">
          <div className="hero-card hero-card-front">
            <span className="hero-card-label">Next word</span>
            <div className="hero-word-row">
              <strong className="hero-word-rotator" aria-label="Sample words">
                <span key={heroWord}>{heroWord}</span>
              </strong>
              <WordDoodle word={heroWord} />
            </div>
          </div>
          <div className="hero-card hero-card-back">
            <img src="/img/trophy.gif" alt="" />
            <span className="hero-stat-rotator" aria-label="Sample game moments">
              <span key={heroStat}>{heroStat}</span>
            </span>
            <i className="hero-spark hero-spark-one" />
            <i className="hero-spark hero-spark-two" />
            <i className="hero-spark hero-spark-three" />
          </div>
        </div>
      </section>

      <CharacterRow />

      <div className="home-chips" aria-label="Game highlights">
        <span>Fast private rooms</span>
        <span>Live guesses</span>
        <span>Warm family mode</span>
      </div>

      <div className="landing-card">
        <div className="landing-card-head">
          <div>
            <span className="section-eyebrow">Set up your player</span>
            <h1>Ready when you are</h1>
          </div>
          <span className={connected ? "live-pill online" : "live-pill offline"}>
            {connected ? liveRoomText : "Connecting"}
          </span>
        </div>

        <div className="name-row">
          <input
            className="text-input"
            type="text"
            placeholder="Enter your name"
            value={name}
            maxLength={NAME_MAX}
            onChange={(e) => setName(e.target.value)}
            spellCheck={false}
          />
          <PrivacyToggle value={privacy} onChange={setPrivacy} />
        </div>

        <AvatarPicker value={avatar} onChange={setAvatar} />

        <button
          className="primary big-action"
          onClick={() => setJoinOpen(true)}
          disabled={!canAct}
        >
          {busy ? "Opening..." : "Join a Room"}
        </button>

        <button
          className="secondary big-action"
          onClick={() =>
            run(() => onCreate(trimmedName, avatar, privacy === "public"))
          }
          disabled={!canAct}
        >
          {busy ? "Creating..." : privacy === "public" ? "Create Public Room" : "Create Private Room"}
        </button>

        <div className="smart-suggestion">
          <span className="suggestion-dot" />
          {nameOk
            ? "Tip: public rooms appear for people on your network."
            : `Names need at least ${NAME_MIN} characters before you can play.`}
        </div>

        {!connected && <p className="hint offline">Connecting to server...</p>}
        {error && <p className="hint error">{error}</p>}
      </div>

      {joinOpen && (
        <JoinModal
          roomList={roomList}
          canJoin={canAct}
          onJoin={async (code) => {
            const res = await run(() => onJoin(code, trimmedName, avatar));
            // Only close on success — failed joins stay in the modal so the
            // user can see the error and try a different room/code.
            if (res.ok) setJoinOpen(false);
            return res;
          }}
          onClose={() => setJoinOpen(false)}
        />
      )}

      {notice && <Modal message={notice} onClose={onDismissNotice} />}
    </main>
  );
}

function WordDoodle({ word }: { word: string }) {
  return (
    <svg
      className={`hero-word-doodle doodle-${word}`}
      key={word}
      viewBox="0 0 96 96"
      aria-hidden="true"
    >
      <defs>
        <filter id={`soft-shadow-${word}`} x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="5" stdDeviation="4" floodColor="#0b2447" floodOpacity="0.16" />
        </filter>
      </defs>
      <circle cx="48" cy="48" r="40" fill="#f7fbff" opacity="0.92" />
      {word === "pancake" && (
        <g filter={`url(#soft-shadow-${word})`}>
          <ellipse cx="48" cy="64" rx="31" ry="10" fill="#c8792e" />
          <ellipse cx="48" cy="56" rx="33" ry="12" fill="#f3ad4f" />
          <ellipse cx="48" cy="46" rx="29" ry="11" fill="#ffd77a" />
          <rect x="42" y="28" width="14" height="13" rx="3" fill="#ffad3d" transform="rotate(-8 49 34)" />
          <path d="M29 55c11 5 27 5 38 0" fill="none" stroke="#fff4bf" strokeWidth="5" strokeLinecap="round" />
          <path d="M23 71h50" stroke="#16213d" strokeWidth="5" strokeLinecap="round" opacity="0.9" />
        </g>
      )}
      {word === "rocket" && (
        <g filter={`url(#soft-shadow-${word})`}>
          <path d="M48 12c14 12 19 31 11 51H37c-8-20-3-39 11-51Z" fill="#ffffff" stroke="#16213d" strokeWidth="5" strokeLinejoin="round" />
          <circle cx="48" cy="35" r="8" fill="#8bd3ff" stroke="#16213d" strokeWidth="4" />
          <path d="M37 58 22 72l17-2M59 58l15 14-17-2" fill="#ff6b6b" stroke="#16213d" strokeWidth="5" strokeLinejoin="round" />
          <path d="M42 63h12l-6 20Z" fill="#ffd166" stroke="#16213d" strokeWidth="5" strokeLinejoin="round" />
          <path d="M42 19c-4 8-5 19-2 31" fill="none" stroke="#ff6b6b" strokeWidth="4" strokeLinecap="round" opacity="0.8" />
        </g>
      )}
      {word === "rainbow" && (
        <g filter={`url(#soft-shadow-${word})`}>
          <path d="M16 68a32 32 0 0 1 64 0" fill="none" stroke="#ff6b6b" strokeWidth="12" strokeLinecap="round" />
          <path d="M29 68a19 19 0 0 1 38 0" fill="none" stroke="#ffd166" strokeWidth="12" strokeLinecap="round" />
          <path d="M42 68a6 6 0 0 1 12 0" fill="none" stroke="#35d07f" strokeWidth="12" strokeLinecap="round" />
          <circle cx="25" cy="70" r="10" fill="#ffffff" />
          <circle cx="71" cy="70" r="10" fill="#ffffff" />
        </g>
      )}
      {word === "castle" && (
        <g filter={`url(#soft-shadow-${word})`}>
          <path d="M21 39h12V26h12v13h8V26h12v13h10v40H21Z" fill="#b8c7ff" stroke="#16213d" strokeWidth="5" strokeLinejoin="round" />
          <path d="M39 79V61c0-10 18-10 18 0v18" fill="#ffb15a" stroke="#16213d" strokeWidth="5" />
          <path d="M28 51h10M58 51h10" stroke="#16213d" strokeWidth="5" strokeLinecap="round" />
          <path d="M27 33h12M47 33h12M67 44h8" stroke="#ffffff" strokeWidth="4" strokeLinecap="round" opacity="0.75" />
        </g>
      )}
      {word === "blanket" && (
        <g filter={`url(#soft-shadow-${word})`}>
          <path d="M23 24h50c7 0 10 5 8 12l-8 41H25l-8-41c-1-7 0-12 6-12Z" fill="#8bd3ff" stroke="#16213d" strokeWidth="5" strokeLinejoin="round" />
          <path d="M25 43h52M24 59h50" stroke="#ffffff" strokeWidth="5" strokeLinecap="round" />
          <path d="M39 27l-5 48M58 27l-5 48" stroke="#ffffff" strokeWidth="5" strokeLinecap="round" />
          <path d="M26 77h46" stroke="#ff6b6b" strokeWidth="5" strokeLinecap="round" />
          <circle cx="69" cy="35" r="4" fill="#ffd166" />
        </g>
      )}
      {word === "popcorn" && (
        <g filter={`url(#soft-shadow-${word})`}>
          <path d="M31 41h34l-6 40H37Z" fill="#ff6b6b" stroke="#16213d" strokeWidth="5" strokeLinejoin="round" />
          <path d="M42 44v34M54 44v34" stroke="#ffffff" strokeWidth="6" />
          <path d="M30 39c-9-8 5-18 14-10 4-14 21-10 20 3 12-5 20 10 8 17-12 7-32 5-42-10Z" fill="#fff3bf" stroke="#16213d" strokeWidth="5" strokeLinejoin="round" />
          <circle cx="45" cy="30" r="5" fill="#ffe49a" />
          <circle cx="61" cy="35" r="5" fill="#ffe49a" />
        </g>
      )}
    </svg>
  );
}
