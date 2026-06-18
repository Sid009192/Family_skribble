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
import { saveToken } from "./prefs";

export interface IncomingJoinRequest {
  requestId: string;
  name: string;
  avatar: Avatar;
}

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

  // Ref tracking "oldId → newId" pairs for reconnects that are mid-flight.
  // Prevents the roomState diff from firing spurious leave+join sounds when a
  // player's socket id changes on reconnect.
  const reconnectPairs = useRef<Map<string, string>>(new Map());

  // Drawer-disconnect state: set when we receive drawerDisconnecting, cleared
  // when the room unpauses (drawer came back or turn was skipped).
  const [drawerDisconnected, setDrawerDisconnected] = useState<{
    name: string;
    since: number;
    seconds: number;
  } | null>(null);
  const prevPaused = useRef<boolean>(false);

  // Set when the server tells us our previous room ended while we were away.
  const [gameEndedWhileAway, setGameEndedWhileAway] = useState(false);

  // Pending host-approval join (we requested to join an active game).
  const [pendingApproval, setPendingApproval] = useState(false);
  // Join requests that this socket (as host/admin) needs to approve or deny.
  const [incomingJoinRequests, setIncomingJoinRequests] = useState<IncomingJoinRequest[]>([]);

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
          if (!prevPlayerIds.current.has(id)) {
            // New id — but don't play join if it's just a reconnect socket swap.
            const isReconnect = [...reconnectPairs.current.values()].includes(id);
            if (!isReconnect) playSound("join");
          }
        }
        for (const id of prevPlayerIds.current) {
          if (!nextIds.has(id)) {
            // Gone id — don't play leave if the player reconnected under a new id.
            if (reconnectPairs.current.has(id)) {
              reconnectPairs.current.delete(id);
            } else {
              playSound("leave");
            }
          }
        }
      }
      prevPlayerIds.current = nextIds;

      // Clear the drawer-disconnect overlay when the game resumes (either the
      // drawer came back and the timer was cancelled, or the turn was skipped).
      if (prevPaused.current && !next.paused) {
        setDrawerDisconnected(null);
      }
      prevPaused.current = next.paused;

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

    const onSessionToken = (token: string) => {
      saveToken(token);
      // Keep the socket's auth up-to-date so auto-reconnects include the token.
      socket.auth = { token };
    };

    const onPlayerDisconnected = (_payload: { name: string }) => {
      playSound("leave");
    };

    const onPlayerReconnected = (payload: { oldId: string; newId: string; name: string }) => {
      // Record the id swap so the roomState diff doesn't fire spurious sounds.
      reconnectPairs.current.set(payload.oldId, payload.newId);
      playSound("join");
    };

    const onDrawerDisconnecting = (payload: { name: string; seconds: number }) => {
      setDrawerDisconnected({ name: payload.name, seconds: payload.seconds, since: Date.now() });
    };

    const onGameEndedWhileAway = () => {
      setGameEndedWhileAway(true);
    };

    // Host/admin: someone wants to join the active game.
    const onJoinRequest = (payload: IncomingJoinRequest) => {
      setIncomingJoinRequests((prev) => [...prev, payload]);
    };
    // Us: the host approved our join request.
    const onJoinApproved = (payload: { room: Room }) => {
      setPendingApproval(false);
      setRoom(payload.room);
      seedPlayerIds(payload.room);
      setMessages([]);
    };
    // Us: the host denied our join request.
    const onJoinDenied = (payload: { reason: string }) => {
      setPendingApproval(false);
      setNotice(payload.reason);
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
    socket.on("sessionToken", onSessionToken);
    socket.on("playerDisconnected", onPlayerDisconnected);
    socket.on("playerReconnected", onPlayerReconnected);
    socket.on("drawerDisconnecting", onDrawerDisconnecting);
    socket.on("gameEndedWhileAway", onGameEndedWhileAway);
    socket.on("joinRequest", onJoinRequest);
    socket.on("joinApproved", onJoinApproved);
    socket.on("joinDenied", onJoinDenied);

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
      socket.off("sessionToken", onSessionToken);
      socket.off("playerDisconnected", onPlayerDisconnected);
      socket.off("playerReconnected", onPlayerReconnected);
      socket.off("drawerDisconnecting", onDrawerDisconnecting);
      socket.off("gameEndedWhileAway", onGameEndedWhileAway);
      socket.off("joinRequest", onJoinRequest);
      socket.off("joinApproved", onJoinApproved);
      socket.off("joinDenied", onJoinDenied);
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

  /* --- join-active actions --- */
  function requestJoinActive(code: string, name: string, avatar: Avatar): Promise<JoinResult> {
    setNotice(null);
    setMessages([]);
    return new Promise((resolve) => {
      socket.emit("requestJoinActive", { code, name, avatar }, (res) => {
        if (res.ok && res.room) {
          setRoom(res.room);
          seedPlayerIds(res.room);
        } else if (res.pending) {
          setPendingApproval(true);
        }
        resolve(res);
      });
    });
  }
  function respondJoinRequest(requestId: string, approved: boolean) {
    socket.emit("respondJoinRequest", { requestId, approved });
    setIncomingJoinRequests((prev) => prev.filter((r) => r.requestId !== requestId));
  }

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
    drawerDisconnected,
    gameEndedWhileAway,
    dismissGameEndedWhileAway: () => setGameEndedWhileAway(false),
    pendingApproval,
    cancelPendingApproval: () => setPendingApproval(false),
    incomingJoinRequests,
    createRoom,
    joinRoom,
    requestJoinActive,
    respondJoinRequest,
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
