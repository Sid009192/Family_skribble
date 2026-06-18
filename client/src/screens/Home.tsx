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

  useEffect(() => {
    savePrefs({ name, avatar });
  }, [name, avatar]);

  const trimmedName = name.trim();
  const nameOk = trimmedName.length >= NAME_MIN;
  const canAct = connected && nameOk && !busy;

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
      <header className="logo-big" {...longPress}>
        <img src="/img/logo.gif" alt="Agarwal Skribbl" />
      </header>

      <CharacterRow />

      <div className="landing-card">
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
          Join!
        </button>

        <button
          className="secondary big-action"
          onClick={() =>
            run(() => onCreate(trimmedName, avatar, privacy === "public"))
          }
          disabled={!canAct}
        >
          Create Private Room
        </button>

        {!connected && <p className="hint offline">Connecting to server…</p>}
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
