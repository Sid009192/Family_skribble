/**
 * index.ts — the server's entry point (the "referee").
 *
 *   1. Load secrets from .env (admin key, port, allowed client origin).
 *   2. Start a tiny Express HTTP server (health-check + host for Socket.IO).
 *   3. Attach Socket.IO — the real-time pipe to every connected phone.
 *   4. Handle lobby events: createRoom / joinRoom / leaveRoom / disconnect.
 *
 * Networking lives here; the room *rules* live in rooms.ts; input *cleaning*
 * lives in validate.ts. Each file has one job.
 */

import dotenv from "dotenv";
// override:true so values in server/.env win over any inherited env vars.
// (Some launchers — e.g. the Claude preview MCP — inject PORT=5173 to tell the
//  child which port to bind, but our server has its own port in .env.)
dotenv.config({ override: true });
import http from "node:http";
import express from "express";
import cors from "cors";
import { Server } from "socket.io";

import type {
  ClientToServerEvents,
  InterServerEvents,
  ServerToClientEvents,
  SocketData,
} from "@shared/events";
import {
  addPlayer,
  createRoom,
  deleteRoom,
  getRoom,
  listPublicRooms,
  markDisconnected,
  reconnectPlayer,
  removePlayer,
} from "./rooms.js";
import {
  clearSession,
  clearSessionBySocket,
  generateToken,
  getSessionByToken,
  getTokenBySocket,
  saveSession,
} from "./sessions.js";
import { cleanAvatar, cleanName, cleanRoomCode, cleanSettings } from "./validate.js";
import { verifyAdminKey } from "./admin.js";
import {
  addFill,
  addStroke,
  deleteCanvas,
  getOps,
  redoLast,
  reassignCanvasAuthor,
  resetCanvas,
  sanitizeSegment,
  undoLast,
} from "./canvas.js";
import {
  adminPause,
  adminResume,
  adminRevealWord,
  adminSetDrawer,
  adminSetScore,
  adminSkipTurn,
  chooseWord,
  cleanupGame,
  handleChat,
  initGame,
  onPlayerDisconnected,
  onPlayerJoined,
  onPlayerLeft,
  onPlayerReconnected,
  rateDrawing,
  returnToLobby,
  startGame,
} from "./game.js";

const PORT = Number(process.env.PORT ?? 3001);
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN ?? "http://localhost:5173";
const IS_PROD = process.env.NODE_ENV === "production";

/** How many bad `adminUnlock` tries one socket connection gets before lockout. */
const ADMIN_UNLOCK_MAX_ATTEMPTS = 3;

// When all players in a room disconnect, we wait this long before deleting it.
const EMPTY_ROOM_TTL_MS = 30_000;

// How long the host has to respond to a join request before it auto-denies.
const JOIN_REQUEST_TTL_MS = 30_000;

interface PendingJoinRequest {
  socketId: string;
  name: string;
  avatar: import("@shared/types").Avatar;
  roomCode: string;
  timer: ReturnType<typeof setTimeout>;
}
const pendingJoinRequests = new Map<string, PendingJoinRequest>();
const emptyRoomTimers = new Map<string, ReturnType<typeof setTimeout>>();

function scheduleEmptyRoomCleanup(code: string): void {
  if (emptyRoomTimers.has(code)) return;
  const timer = setTimeout(() => {
    emptyRoomTimers.delete(code);
    const room = getRoom(code);
    if (room && room.players.every((p) => !p.connected)) {
      deleteCanvas(code);
      cleanupGame(code);
      deleteRoom(code);
      broadcastRoomList();
      console.log(`[room] ${code} deleted — all players gone for ${EMPTY_ROOM_TTL_MS / 1000}s`);
    }
  }, EMPTY_ROOM_TTL_MS);
  emptyRoomTimers.set(code, timer);
}

function cancelEmptyRoomCleanup(code: string): void {
  const timer = emptyRoomTimers.get(code);
  if (timer) {
    clearTimeout(timer);
    emptyRoomTimers.delete(code);
  }
}

// CORS = "who is allowed to talk to this server?".
// In production we lock it to our known client origin. In local dev we reflect
// the request origin (`true`) so phones on your WiFi — which arrive as
// http://<your-PC-IP>:5173, NOT localhost — aren't blocked.
const corsOrigin = IS_PROD ? CLIENT_ORIGIN : true;

// --- HTTP layer (Express) -------------------------------------------------
const app = express();
app.use(cors({ origin: corsOrigin }));

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "family-scribble-server" });
});

const httpServer = http.createServer(app);

// --- Real-time layer (Socket.IO) ------------------------------------------
const io = new Server<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData
>(httpServer, {
  cors: { origin: corsOrigin },
});

// Give the game engine the io instance it needs to broadcast.
initGame(io);

/** Push the latest public room list to everyone (Home screens use it). */
function broadcastRoomList() {
  io.emit("roomList", listPublicRooms());
}

/** Send a `system` chat message to a room (e.g. host promotion notice). */
function broadcastSystem(code: string, text: string) {
  io.to(code).emit("chat", { kind: "system", name: "", text });
}

/**
 * Remove a player from a room and notify everyone. Used by both host-kick and
 * admin-kick (permission is checked by the caller, not here).
 */
function kickFromRoom(code: string, targetId: string, reason: string) {
  const room = getRoom(code);
  if (!room || !room.players.some((p) => p.id === targetId)) return;

  const result = removePlayer(code, targetId);

  const targetSocket = io.sockets.sockets.get(targetId);
  if (targetSocket) {
    clearSessionBySocket(targetId);
    targetSocket.emit("kicked", { reason });
    targetSocket.leave(code);
    targetSocket.data.roomCode = undefined;
  }

  if (result) {
    io.to(code).emit("roomState", result.room);
    if (result.promotedHostName) {
      broadcastSystem(code, `${result.promotedHostName} is now the room owner!`);
    }
    onPlayerLeft(code, targetId); // let the game react (drawer left, etc.)
  } else {
    deleteCanvas(code);
    cleanupGame(code);
  }
  broadcastRoomList();
}

io.on("connection", (socket) => {
  socket.data.isAdmin = false;

  // --- Reconnect path ---------------------------------------------------
  // If the client sends a token (from localStorage), try to restore them into
  // their previous room without going through create/join again.
  const authToken = (socket.handshake.auth as { token?: unknown })?.token;
  if (typeof authToken === "string" && authToken) {
    const session = getSessionByToken(authToken);
    if (session) {
      const room = getRoom(session.roomCode);
      const player = room?.players.find((p) => p.id === session.socketId);
      if (room && player) {
        // Someone is coming back — cancel any pending room deletion.
        cancelEmptyRoomCleanup(session.roomCode);
        const oldId = session.socketId;
        const updatedRoom = reconnectPlayer(session.roomCode, oldId, socket.id);
        if (updatedRoom) {
          reassignCanvasAuthor(session.roomCode, oldId, socket.id);
          saveSession(authToken, socket.id, session.roomCode, session.name, session.avatar);
          socket.data.roomCode = session.roomCode;
          socket.join(session.roomCode);
          onPlayerReconnected(session.roomCode, oldId, socket.id);
          // Notify everyone in the room (sound + chat + updated player list).
          io.to(session.roomCode).emit("playerReconnected", {
            oldId,
            newId: socket.id,
            name: player.name,
          });
          broadcastSystem(session.roomCode, `${player.name} reconnected!`);
          io.to(session.roomCode).emit("roomState", updatedRoom);
          // Give the rejoiner their current canvas.
          socket.emit("canvasState", getOps(session.roomCode));
          broadcastRoomList();
          console.log(`[reconnect] ${player.name} back in ${session.roomCode} (${oldId} → ${socket.id})`);
        }
      } else if (!room) {
        // Their room is gone (game ended, server restarted).
        socket.emit("gameEndedWhileAway");
        clearSession(authToken);
      }
      // If room exists but player slot is gone (shouldn't normally happen),
      // fall through to normal new-player flow below.
    }
  }

  // --- Normal / new connection ------------------------------------------
  if (!socket.data.roomCode) {
    console.log(`[socket] connected: ${socket.id}`);
    socket.emit("roomList", listPublicRooms());
  }

  socket.on("requestRoomList", () => {
    socket.emit("roomList", listPublicRooms());
  });

  // --- Create a new private room and become its host ---------------------
  socket.on("createRoom", (payload, callback) => {
    const name = cleanName(payload?.name);
    if (!name) return callback({ ok: false, error: "Please enter a valid name." });
    const avatar = cleanAvatar(payload?.avatar);

    // A socket can only be in one room at a time. If they bypass the normal
    // "leave first" client flow (e.g. via DevTools), evict them from the old
    // room before placing them in the new one — otherwise the old room ends
    // up with a ghost player that the system never cleans up.
    if (socket.data.roomCode) handleLeave();

    const isPublic = payload?.isPublic !== false; // default to public
    const room = createRoom(socket.id, name, avatar, isPublic);
    socket.data.roomCode = room.code;
    socket.join(room.code); // Socket.IO "rooms" let us broadcast to just this group
    // Issue a reconnect token so this player can reclaim their slot if they drop.
    const tok = generateToken();
    saveSession(tok, socket.id, room.code, name, avatar);
    console.log(`[room] ${name} created room ${room.code} (${isPublic ? "public" : "private"})`);
    callback({ ok: true, room });
    socket.emit("sessionToken", tok);
    broadcastRoomList();
  });

  // --- Join an existing room by code -------------------------------------
  socket.on("joinRoom", (payload, callback) => {
    const name = cleanName(payload?.name);
    if (!name) return callback({ ok: false, error: "Please enter a valid name." });
    const code = cleanRoomCode(payload?.code);
    const avatar = cleanAvatar(payload?.avatar);

    // Same single-room invariant as createRoom — evict from any existing
    // room first so a tampered client can't end up in two rooms at once.
    if (socket.data.roomCode && socket.data.roomCode !== code) handleLeave();

    const outcome = addPlayer(code, socket.id, name, avatar);
    if (!outcome.ok || !outcome.room) return callback(outcome);

    socket.data.roomCode = code;
    socket.join(code);
    // Issue a reconnect token.
    const tok = generateToken();
    saveSession(tok, socket.id, code, name, avatar);
    console.log(`[room] ${name} joined room ${code}`);

    callback({ ok: true, room: outcome.room });
    socket.emit("sessionToken", tok);
    // Tell EVERYONE in the room (including the joiner) the new player list.
    io.to(code).emit("roomState", outcome.room);
    broadcastRoomList(); // player counts changed

    // If a game is already running, fold the newcomer into the draw order.
    if (outcome.room.phase !== "lobby") onPlayerJoined(code, socket.id);
    // Give the joiner the current canvas right away.
    socket.emit("canvasState", getOps(code));
  });

  // --- Drawing -----------------------------------------------------------
  // Helper: the room code only if this socket is actually in a room.
  const myRoom = () => socket.data.roomCode;

  // Drawing is allowed in the lobby (shared sketchpad) or, during a game, ONLY
  // by the current drawer. Returns the room code if allowed, else null.
  const drawCode = (): string | null => {
    const code = socket.data.roomCode;
    if (!code) return null;
    const room = getRoom(code);
    if (!room) return null;
    if (room.phase === "lobby") return code;
    if (room.phase === "drawing" && room.drawerId === socket.id) return code;
    return null;
  };

  socket.on("requestCanvas", () => {
    const code = myRoom();
    if (code) socket.emit("canvasState", getOps(code));
  });

  socket.on("liveSegment", (segment) => {
    const code = drawCode();
    if (!code) return;
    const clean = sanitizeSegment(segment);
    if (!clean) return;
    // Relay to everyone else in the room (not back to the drawer).
    socket.to(code).emit("liveSegment", clean);
  });

  socket.on("commitStroke", (payload) => {
    const code = drawCode();
    if (!code) return;
    // Store for history/undo. Multi-point strokes were already shown to peers
    // via liveSegment, so we don't resend them. But a SINGLE-point stroke (a
    // dot/tap) produced no segments — peers never saw it — so broadcast those.
    const op = addStroke(code, payload, socket.id);
    if (op && op.points.length === 1) socket.to(code).emit("opCommitted", op);
  });

  socket.on("fillCanvas", (payload) => {
    const code = drawCode();
    if (!code) return;
    const op = addFill(code, payload, socket.id);
    if (op) socket.to(code).emit("opCommitted", op);
  });

  socket.on("undoDraw", () => {
    const code = drawCode();
    if (!code) return;
    if (undoLast(code, socket.id)) io.to(code).emit("canvasState", getOps(code));
  });

  socket.on("redoDraw", () => {
    const code = drawCode();
    if (!code) return;
    if (redoLast(code, socket.id)) io.to(code).emit("canvasState", getOps(code));
  });

  socket.on("clearCanvas", () => {
    const code = drawCode();
    if (!code) return;
    resetCanvas(code);
    io.to(code).emit("canvasState", []);
  });

  // --- Game events -------------------------------------------------------
  socket.on("startGame", () => {
    const code = myRoom();
    if (!code) return;
    const room = getRoom(code);
    if (!room || room.hostId !== socket.id) return; // host only
    startGame(code);
  });

  socket.on("chooseWord", (payload) => {
    const code = myRoom();
    if (code) chooseWord(socket.id, code, payload?.word);
  });

  socket.on("chat", (payload) => {
    const code = myRoom();
    if (code) handleChat(socket.id, code, payload?.text);
  });

  socket.on("rateDrawing", (payload) => {
    const code = myRoom();
    if (code) rateDrawing(socket.id, code, payload?.kind);
  });

  socket.on("returnToLobby", () => {
    const code = myRoom();
    if (!code) return;
    const room = getRoom(code);
    // Host, or the Super-Admin, may return the room to the lobby.
    if (!room || (room.hostId !== socket.id && !socket.data.isAdmin)) return;
    returnToLobby(code);
    broadcastRoomList();
  });

  // Change settings: the host may do this in the lobby; the Super-Admin any time.
  socket.on("updateSettings", (payload) => {
    const code = myRoom();
    if (!code) return;
    const room = getRoom(code);
    if (!room) return;
    const allowed =
      socket.data.isAdmin || (room.hostId === socket.id && room.phase === "lobby");
    if (!allowed) return;
    room.settings = cleanSettings(room.settings, payload ?? {});
    io.to(code).emit("roomState", room);
  });

  // --- Super-Admin (godmode) --------------------------------------------
  // Unlock: prove the secret key ONCE; we then flag this socket as admin and
  // never ask again. Every admin action below re-checks the flag.
  //
  // Brute-force defense: each socket gets ADMIN_UNLOCK_MAX_ATTEMPTS tries
  // before further attempts are refused without even checking the key. The
  // counter is per-connection, so an attacker would have to keep opening
  // fresh socket connections — which the legitimate user never needs to do.
  socket.on("adminUnlock", (payload, callback) => {
    if (socket.data.isAdmin) return callback({ ok: true }); // already unlocked
    const attempts = socket.data.adminUnlockAttempts ?? 0;
    if (attempts >= ADMIN_UNLOCK_MAX_ATTEMPTS) {
      console.warn(`[admin] socket ${socket.id} refused (>= ${ADMIN_UNLOCK_MAX_ATTEMPTS} attempts)`);
      return callback({ ok: false });
    }
    const ok = verifyAdminKey(payload?.key);
    if (ok) {
      socket.data.isAdmin = true;
    } else {
      socket.data.adminUnlockAttempts = attempts + 1;
      console.warn(`[admin] socket ${socket.id} bad key (attempt ${attempts + 1}/${ADMIN_UNLOCK_MAX_ATTEMPTS})`);
    }
    callback({ ok });
  });

  /** Run an admin action only if this socket is a verified admin and in a room. */
  function asAdmin(action: (code: string) => void) {
    if (!socket.data.isAdmin) return;
    const code = myRoom();
    if (code) action(code);
  }

  socket.on("adminPause", () => asAdmin((code) => adminPause(code)));
  socket.on("adminResume", () => asAdmin((code) => adminResume(code)));
  socket.on("adminSkipTurn", () => asAdmin((code) => adminSkipTurn(code)));
  socket.on("adminRevealWord", () => asAdmin((code) => adminRevealWord(code, socket.id)));
  socket.on("adminSetDrawer", (p) =>
    asAdmin((code) => {
      if (typeof p?.targetId === "string") adminSetDrawer(code, p.targetId);
    })
  );
  socket.on("adminSetScore", (p) =>
    asAdmin((code) => {
      if (typeof p?.targetId === "string") adminSetScore(code, p.targetId, p.score);
    })
  );
  socket.on("adminMute", (p) =>
    asAdmin((code) => {
      const room = getRoom(code);
      const target = room?.players.find((pl) => pl.id === p?.targetId);
      if (room && target) {
        target.muted = !target.muted;
        io.to(code).emit("roomState", room);
      }
    })
  );
  socket.on("adminKick", (p) =>
    asAdmin((code) => {
      if (typeof p?.targetId === "string") kickFromRoom(code, p.targetId, "An admin removed you.");
    })
  );

  // --- Intentional leave (leaveRoom event or kick) -----------------------
  function handleLeave() {
    const code = socket.data.roomCode;
    if (!code) return;
    // Clear the session so a stale token can't re-admit them.
    clearSessionBySocket(socket.id);
    const leavingId = socket.id;
    const result = removePlayer(code, leavingId);
    socket.leave(code);
    socket.data.roomCode = undefined;
    if (result) {
      io.to(code).emit("roomState", result.room);
      if (result.promotedHostName) {
        broadcastSystem(code, `${result.promotedHostName} is now the room owner!`);
      }
      onPlayerLeft(code, leavingId);
    } else {
      deleteCanvas(code);
      cleanupGame(code);
    }
    broadcastRoomList();
  }

  // --- Host kicks a player -----------------------------------------------
  // Permission is enforced HERE on the server — never trust the client. The
  // host may kick during the lobby; mid-game, only newcomers (players who
  // joined after the game started, i.e. not in the original draw order).
  socket.on("kickPlayer", (payload) => {
    const targetId = payload?.targetId;
    if (typeof targetId !== "string") return;
    const code = socket.data.roomCode;
    if (!code) return;
    const room = getRoom(code);
    if (!room) return;

    if (room.hostId !== socket.id) return; // only the host
    if (targetId === socket.id) return; // can't kick yourself
    if (room.phase !== "lobby") return; // (mid-game host-kick of newcomers: future)

    kickFromRoom(code, targetId, "The host removed you from the room.");
  });

  // --- Join an active (in-progress) game -----------------------------------
  socket.on("requestJoinActive", (payload, callback) => {
    const code = cleanRoomCode(payload?.code);
    const name = cleanName(payload?.name);
    if (!name) return callback({ ok: false, error: "Please enter a valid name." });
    const avatar = cleanAvatar(payload?.avatar);

    const room = getRoom(code);
    if (!room) return callback({ ok: false, error: "Room not found." });
    if (!room.isPublic) return callback({ ok: false, error: "Room not found." });

    // Already in a different room — evict first.
    if (socket.data.roomCode && socket.data.roomCode !== code) handleLeave();

    // Case A: a disconnected slot with the same name → auto-reconnect.
    const slot = room.players.find(
      (p) => !p.connected && p.name.toLowerCase() === name.toLowerCase()
    );
    if (slot) {
      const oldId = slot.id;
      const updatedRoom = reconnectPlayer(code, oldId, socket.id);
      if (updatedRoom) {
        const tok = generateToken();
        saveSession(tok, socket.id, code, slot.name, slot.avatar);
        socket.data.roomCode = code;
        socket.join(code);
        onPlayerReconnected(code, oldId, socket.id);
        io.to(code).emit("playerReconnected", { oldId, newId: socket.id, name: slot.name });
        broadcastSystem(code, `${slot.name} reconnected!`);
        io.to(code).emit("roomState", updatedRoom);
        socket.emit("canvasState", getOps(code));
        socket.emit("sessionToken", tok);
        broadcastRoomList();
        console.log(`[rejoin] ${slot.name} reconnected to active game ${code}`);
        return callback({ ok: true, room: updatedRoom });
      }
      return callback({ ok: false, error: "Reconnect failed." });
    }

    // Case B: lobby room — just add them normally.
    if (room.phase === "lobby") {
      const outcome = addPlayer(code, socket.id, name, avatar);
      if (!outcome.ok || !outcome.room) return callback(outcome);
      socket.data.roomCode = code;
      socket.join(code);
      const tok = generateToken();
      saveSession(tok, socket.id, code, name, avatar);
      socket.emit("sessionToken", tok);
      io.to(code).emit("roomState", outcome.room);
      socket.emit("canvasState", getOps(code));
      broadcastRoomList();
      return callback({ ok: true, room: outcome.room });
    }

    // Case C: active game, new player — ask the host.
    const cap = Math.min(room.settings.maxPlayers, 12);
    const connected = room.players.filter((p) => p.connected).length;
    if (connected >= cap) return callback({ ok: false, error: "Room is full." });

    const requestId = generateToken().slice(0, 16);
    const timer = setTimeout(() => {
      pendingJoinRequests.delete(requestId);
      io.to(socket.id).emit("joinDenied", { reason: "Host did not respond in time." });
    }, JOIN_REQUEST_TTL_MS);
    pendingJoinRequests.set(requestId, { socketId: socket.id, name, avatar, roomCode: code, timer });

    // Notify the host and every admin in the room.
    io.to(room.hostId).emit("joinRequest", { requestId, name, avatar });
    for (const [sid, s] of io.sockets.sockets) {
      if (s.data.isAdmin && s.data.roomCode === code && sid !== room.hostId) {
        s.emit("joinRequest", { requestId, name, avatar });
      }
    }

    callback({ ok: false, pending: true });
  });

  // --- Host / admin responds to a join request ----------------------------
  socket.on("respondJoinRequest", (payload) => {
    const requestId = payload?.requestId;
    const approved = payload?.approved;
    if (typeof requestId !== "string") return;

    const req = pendingJoinRequests.get(requestId);
    if (!req) return;

    const room = getRoom(req.roomCode);
    if (!room || (room.hostId !== socket.id && !socket.data.isAdmin)) return;

    clearTimeout(req.timer);
    pendingJoinRequests.delete(requestId);

    if (!approved) {
      io.to(req.socketId).emit("joinDenied", { reason: "The host declined your request." });
      return;
    }

    const requesterSocket = io.sockets.sockets.get(req.socketId);
    if (!requesterSocket) return; // they left while waiting

    const outcome = addPlayer(req.roomCode, req.socketId, req.name, req.avatar);
    if (!outcome.ok || !outcome.room) {
      io.to(req.socketId).emit("joinDenied", { reason: outcome.error ?? "Couldn't add you to the room." });
      return;
    }

    requesterSocket.data.roomCode = req.roomCode;
    requesterSocket.join(req.roomCode);
    const tok = generateToken();
    saveSession(tok, req.socketId, req.roomCode, req.name, req.avatar);
    requesterSocket.emit("sessionToken", tok);
    io.to(req.roomCode).emit("roomState", outcome.room);
    requesterSocket.emit("joinApproved", { room: outcome.room });
    requesterSocket.emit("canvasState", getOps(req.roomCode));
    if (outcome.room.phase !== "lobby") onPlayerJoined(req.roomCode, req.socketId);
    broadcastSystem(req.roomCode, `${req.name} joined the game!`);
    broadcastRoomList();
    console.log(`[join-active] ${req.name} approved into ${req.roomCode}`);
  });

  socket.on("leaveRoom", handleLeave);

  socket.on("disconnect", (reason) => {
    console.log(`[socket] disconnected: ${socket.id} (${reason})`);
    const code = socket.data.roomCode;
    if (!code) return;

    const room = getRoom(code);
    const player = room?.players.find((p) => p.id === socket.id);

    if (player) {
      // Soft disconnect: keep the player's slot so they can reconnect.
      // Ensure a session exists for them (it should, from create/join).
      const existingToken = getTokenBySocket(socket.id);
      if (!existingToken) {
        // Safety net: session was somehow missing; create one now.
        const tok = generateToken();
        saveSession(tok, socket.id, code, player.name, player.avatar);
      }
      markDisconnected(code, socket.id);
      socket.leave(code);
      socket.data.roomCode = undefined;

      io.to(code).emit("roomState", room!);
      broadcastSystem(code, `${player.name} lost connection...`);
      io.to(code).emit("playerDisconnected", { name: player.name });
      onPlayerDisconnected(code, socket.id);

      // If everyone is now disconnected, schedule the room for deletion.
      if (room!.players.every((p) => !p.connected)) {
        scheduleEmptyRoomCleanup(code);
      }

      broadcastRoomList();
    } else {
      // Not in a room — nothing to do.
    }

    // Clean up any pending join request this socket had (they disconnected while waiting).
    for (const [requestId, req] of pendingJoinRequests) {
      if (req.socketId === socket.id) {
        clearTimeout(req.timer);
        pendingJoinRequests.delete(requestId);
      }
    }
  });
});

httpServer.listen(PORT, "0.0.0.0", () => {
  console.log(`\n  Agarwal Family Skribbl server running:`);
  console.log(`    Local:   http://localhost:${PORT}/health`);
  console.log(`    Network: http://<your-PC-IP>:${PORT}/health  (for phones)\n`);
});
