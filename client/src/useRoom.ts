/**
 * useRoom.ts — the one hook that owns our socket connection and all derived
 * client state (room, room list, chat, game phase bits, admin status), plus the
 * actions screens call. Keeping it central means there's exactly one set of
 * socket listeners.
 */

import { useEffect, useState } from "react";
import { socket } from "./socket";
import type { Avatar, ChatMessage, Room, RoomSummary } from "@shared/types";
import type { JoinResult, SettingsUpdate } from "@shared/events";

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

  useEffect(() => {
    const onConnect = () => {
      setConnected(true);
      socket.emit("requestRoomList");
    };
    const onDisconnect = () => setConnected(false);

    const onRoomState = (next: Room) => {
      setRoom(next);
      setTimeLeft(next.timeLeft);
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
    const onGameTick = (t: number) => setTimeLeft(t);
    const onTurnReveal = (p: { word: string; gained: Record<string, number> }) => setReveal(p);
    const onChat = (msg: ChatMessage) =>
      setMessages((prev) => [...prev, msg].slice(-MAX_MESSAGES));

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
  function createRoom(name: string, avatar: Avatar, isPublic: boolean): Promise<JoinResult> {
    setNotice(null);
    setMessages([]);
    return new Promise((resolve) => {
      socket.emit("createRoom", { name, avatar, isPublic }, (res) => {
        if (res.ok && res.room) setRoom(res.room);
        resolve(res);
      });
    });
  }
  function joinRoom(code: string, name: string, avatar: Avatar): Promise<JoinResult> {
    setNotice(null);
    setMessages([]);
    return new Promise((resolve) => {
      socket.emit("joinRoom", { code, name, avatar }, (res) => {
        if (res.ok && res.room) setRoom(res.room);
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
    adminUnlock,
    admin,
  };
}

export type RoomApi = ReturnType<typeof useRoom>;
