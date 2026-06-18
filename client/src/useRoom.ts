/**
 * useRoom.ts — the one hook that owns our socket connection and all derived
 * client state (room, room list, chat, game phase bits, admin status), plus the
 * actions screens call. Keeping it central means there's exactly one set of
 * socket listeners.
 */

import { useEffect, useRef, useState } from "react";
import { socket } from "./socket";
import type { Avatar, ChatMessage, Room, RoomSummary } from "@shared/types";
import type { JoinResult, SettingsUpdate } from "@shared/events";
import { play as playSound } from "./sounds";

const MAX_MESSAGES = 200;

export function useRoom() {
  const [room, setRoom] = useState<Room | null>(null);
  const [connected, setConnected] = useState(socket.connected);
  const [notice, setNotice] = useState<string | null>(null);
  const [roomList, setRoomList] = useState<RoomSummary[]>([]);

  // Game-specific transient state.
  const [timeLeft, setTimeLeft] = useState(0);
  const [wordChoices, setWordChoices] = useState<string[]>([]);
  const [yourWord, setYourWord] = useState<string | null>(null);
  const [reveal, setReveal] = useState<{ word: string; gained: Record<string, number> } | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);

  // Super-Admin status (this device proved the key this session).
  const [isAdmin, setIsAdmin] = useState(false);

  // Refs for diffing previous state — used by the sound triggers so we can
  // fire on transitions (e.g. phase changed, player joined) rather than on
  // every render. Refs (not state) because we don't want re-renders for these.
  const prevPlayerIds = useRef<Set<string> | null>(null);
  const prevPhase = useRef<Room["phase"] | null>(null);
  const prevTimeLeft = useRef<number>(0);

  useEffect(() => {
    const onConnect = () => {
      setConnected(true);
      socket.emit("requestRoomList");
    };
    const onDisconnect = () => setConnected(false);

    const onRoomState = (next: Room) => {
      // --- Sound: join / leave by diffing the player set.
      // Skip the very first roomState (prev is null) so we don't play join
      // for every player already in the room when we walk in.
      const nextIds = new Set(next.players.map((p) => p.id));
      if (prevPlayerIds.current) {
        for (const id of nextIds) {
          if (!prevPlayerIds.current.has(id)) playSound("join");
        }
        for (const id of prevPlayerIds.current) {
          if (!nextIds.has(id)) playSound("leave");
        }
      }
      prevPlayerIds.current = nextIds;

      // --- Sound: roundStart on transition into the drawing phase.
      if (next.phase === "drawing" && prevPhase.current !== "drawing") {
        playSound("roundStart");
      }
      prevPhase.current = next.phase;

      setRoom(next);
      setTimeLeft(next.timeLeft);
      prevTimeLeft.current = next.timeLeft;
      // Reset transient bits on phase changes.
      if (next.phase === "choosing") {
        setReveal(null);
        setYourWord(null);
      } else if (next.phase === "drawing") {
        setWordChoices([]);
        setReveal(null);
      } else if (next.phase === "lobby" || next.phase === "gameover") {
        setWordChoices([]);
        setYourWord(null);
        setReveal(null);
      }
    };

    const onRoomList = (rooms: RoomSummary[]) => setRoomList(rooms);
    const onKicked = (payload: { reason: string }) => {
      setRoom(null);
      setNotice(payload.reason);
    };
    const onWordChoices = (words: string[]) => setWordChoices(words);
    const onYourWord = (word: string) => setYourWord(word);
    const onGameTick = (t: number) => {
      // --- Sound: tick once per second for the last 10s of the drawing phase.
      // Fire only on the second-boundary crossing (prev !== next) so a stale
      // duplicate tick from the server doesn't double-beep.
      if (
        prevPhase.current === "drawing" &&
        t > 0 &&
        t <= 10 &&
        t !== prevTimeLeft.current
      ) {
        playSound("tick");
      }
      prevTimeLeft.current = t;
      setTimeLeft(t);
    };
    const onTurnReveal = (p: { word: string; gained: Record<string, number> }) => {
      // --- Sound: success if anyone gained points (someone guessed), else failure.
      const anyoneGuessed = Object.values(p.gained).some((g) => g > 0);
      playSound(anyoneGuessed ? "roundEndSuccess" : "roundEndFailure");
      setReveal(p);
    };
    const onChat = (msg: ChatMessage) => {
      // --- Sound: someone got the word right.
      if (msg.kind === "correct") playSound("playerGuessed");
      setMessages((prev) => [...prev, msg].slice(-MAX_MESSAGES));
    };

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("roomState", onRoomState);
    socket.on("roomList", onRoomList);
    socket.on("kicked", onKicked);
    socket.on("wordChoices", onWordChoices);
    socket.on("yourWord", onYourWord);
    socket.on("gameTick", onGameTick);
    socket.on("turnReveal", onTurnReveal);
    socket.on("chat", onChat);

    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("roomState", onRoomState);
      socket.off("roomList", onRoomList);
      socket.off("kicked", onKicked);
      socket.off("wordChoices", onWordChoices);
      socket.off("yourWord", onYourWord);
      socket.off("gameTick", onGameTick);
      socket.off("turnReveal", onTurnReveal);
      socket.off("chat", onChat);
    };
  }, []);

  /* --- room actions --- */
  // When the server hands us a room via the create/join callback, seed the
  // player-id ref so the NEXT roomState (e.g. when someone else joins) has
  // a baseline to diff against — otherwise the join sound never fires.
  function seedPlayerIds(r: Room) {
    prevPlayerIds.current = new Set(r.players.map((p) => p.id));
    prevPhase.current = r.phase;
  }
  function createRoom(name: string, avatar: Avatar, isPublic: boolean): Promise<JoinResult> {
    setNotice(null);
    setMessages([]);
    return new Promise((resolve) => {
      socket.emit("createRoom", { name, avatar, isPublic }, (res) => {
        if (res.ok && res.room) {
          setRoom(res.room);
          seedPlayerIds(res.room);
        }
        resolve(res);
      });
    });
  }
  function joinRoom(code: string, name: string, avatar: Avatar): Promise<JoinResult> {
    setNotice(null);
    setMessages([]);
    return new Promise((resolve) => {
      socket.emit("joinRoom", { code, name, avatar }, (res) => {
        if (res.ok && res.room) {
          setRoom(res.room);
          seedPlayerIds(res.room);
        }
        resolve(res);
      });
    });
  }
  function leaveRoom() {
    socket.emit("leaveRoom");
    setRoom(null);
  }
  function clearNotice() {
    setNotice(null);
  }
  function kick(targetId: string) {
    socket.emit("kickPlayer", { targetId });
  }

  /* --- game actions --- */
  const startGame = () => socket.emit("startGame");
  const returnToLobby = () => socket.emit("returnToLobby");
  const updateSettings = (u: SettingsUpdate) => socket.emit("updateSettings", u);
  const chooseWord = (word: string) => socket.emit("chooseWord", { word });
  const sendChat = (text: string) => socket.emit("chat", { text });
  const rateDrawing = (kind: "up" | "down") => socket.emit("rateDrawing", { kind });

  /* --- admin actions --- */
  function adminUnlock(key: string): Promise<boolean> {
    return new Promise((resolve) => {
      socket.emit("adminUnlock", { key }, (res) => {
        if (res.ok) setIsAdmin(true);
        resolve(res.ok);
      });
    });
  }
  const admin = {
    pause: () => socket.emit("adminPause"),
    resume: () => socket.emit("adminResume"),
    skipTurn: () => socket.emit("adminSkipTurn"),
    revealWord: () => socket.emit("adminRevealWord"),
    setDrawer: (targetId: string) => socket.emit("adminSetDrawer", { targetId }),
    setScore: (targetId: string, score: number) => socket.emit("adminSetScore", { targetId, score }),
    kick: (targetId: string) => socket.emit("adminKick", { targetId }),
    mute: (targetId: string) => socket.emit("adminMute", { targetId }),
  };

  return {
    room,
    connected,
    notice,
    roomList,
    timeLeft,
    wordChoices,
    yourWord,
    reveal,
    messages,
    isAdmin,
    createRoom,
    joinRoom,
    leaveRoom,
    clearNotice,
    kick,
    startGame,
    returnToLobby,
    updateSettings,
    chooseWord,
    sendChat,
    rateDrawing,
    adminUnlock,
    admin,
  };
}

export type RoomApi = ReturnType<typeof useRoom>;
