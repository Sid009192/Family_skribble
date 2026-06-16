/**
 * Home.tsx — the landing screen: pick a name + avatar, then create or join
 * (by code, or from the live network room list). Remembers your name + avatar.
 */

import { useEffect, useState } from "react";
import { NAME_MAX, NAME_MIN, ROOM_CODE_LENGTH } from "@shared/types";
import type { Avatar as AvatarType, RoomSummary } from "@shared/types";
import type { JoinResult } from "@shared/events";
import { AvatarPicker } from "../components/AvatarPicker";
import { randomAvatar } from "../components/Avatar";
import { RoomList } from "../components/RoomList";
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

// Load any saved name/avatar once, falling back to a random avatar.
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
  const [code, setCode] = useState("");
  const [isPublic, setIsPublic] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Persist name + avatar whenever they change, so next session remembers them.
  useEffect(() => {
    savePrefs({ name, avatar });
  }, [name, avatar]);

  const trimmedName = name.trim();
  const nameOk = trimmedName.length >= NAME_MIN;
  const canCreate = connected && nameOk && !busy;
  const canJoinCode = canCreate && code.trim().length === ROOM_CODE_LENGTH;

  async function run(action: () => Promise<JoinResult>) {
    setError(null);
    setBusy(true);
    const res = await action();
    setBusy(false);
    if (!res.ok) setError(res.error ?? "Something went wrong.");
  }

  return (
    <main className="home">
      <h1 {...longPress}>Family Scribble</h1>

      <AvatarPicker value={avatar} onChange={setAvatar} />

      <input
        className="text-input"
        type="text"
        placeholder="Enter your name"
        value={name}
        maxLength={NAME_MAX}
        onChange={(e) => setName(e.target.value)}
        spellCheck={false}
      />

      <RoomList
        rooms={roomList}
        canJoin={canCreate}
        onJoin={(c) => run(() => onJoin(c, trimmedName, avatar))}
      />

      <div className="join-row">
        <input
          className="text-input code-input"
          type="text"
          placeholder="ROOM CODE"
          value={code}
          maxLength={ROOM_CODE_LENGTH}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          spellCheck={false}
          autoCapitalize="characters"
        />
        <button
          className="secondary"
          onClick={() => run(() => onJoin(code, trimmedName, avatar))}
          disabled={!canJoinCode}
        >
          Join
        </button>
      </div>

      <button
        className="primary"
        onClick={() => run(() => onCreate(trimmedName, avatar, isPublic))}
        disabled={!canCreate}
      >
        Create Room
      </button>

      <label className="checkbox-row">
        <input
          type="checkbox"
          checked={isPublic}
          onChange={(e) => setIsPublic(e.target.checked)}
        />
        Show my room on the network (others can join without a code)
      </label>

      {!connected && <p className="hint offline">Connecting to server…</p>}
      {error && <p className="hint error">{error}</p>}

      {notice && <Modal message={notice} onClose={onDismissNotice} />}
    </main>
  );
}
