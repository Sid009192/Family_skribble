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

import "dotenv/config";
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
  getRoom,
  listPublicRooms,
  removePlayer,
} from "./rooms.js";
import { cleanAvatar, cleanName, cleanRoomCode, cleanSettings } from "./validate.js";
import { verifyAdminKey } from "./admin.js";
import {
  addFill,
  addStroke,
  deleteCanvas,
  getOps,
  redoLast,
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
  onPlayerJoined,
  onPlayerLeft,
  returnToLobby,
  startGame,
} from "./game.js";

const PORT = Number(process.env.PORT ?? 3001);
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN ?? "http://localhost:5173";
const IS_PROD = process.env.NODE_ENV === "production";

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
  console.log(`[socket] connected: ${socket.id}`);

  // Send the current room list right away so the Home screen can populate.
  socket.emit("roomList", listPublicRooms());

  socket.on("requestRoomList", () => {
    socket.emit("roomList", listPublicRooms());
  });

  // --- Create a new private room and become its host ---------------------
  socket.on("createRoom", (payload, callback) => {
    const name = cleanName(payload?.name);
    if (!name) return callback({ ok: false, error: "Please enter a valid name." });
    const avatar = cleanAvatar(payload?.avatar);

    const isPublic = payload?.isPublic !== false; // default to public
    const room = createRoom(socket.id, name, avatar, isPublic);
    socket.data.roomCode = room.code;
    socket.join(room.code); // Socket.IO "rooms" let us broadcast to just this group
    console.log(`[room] ${name} created room ${room.code} (${isPublic ? "public" : "private"})`);
    callback({ ok: true, room });
    broadcastRoomList();
  });

  // --- Join an existing room by code -------------------------------------
  socket.on("joinRoom", (payload, callback) => {
    const name = cleanName(payload?.name);
    if (!name) return callback({ ok: false, error: "Please enter a valid name." });
    const code = cleanRoomCode(payload?.code);
    const avatar = cleanAvatar(payload?.avatar);

    const outcome = addPlayer(code, socket.id, name, avatar);
    if (!outcome.ok || !outcome.room) return callback(outcome);

    socket.data.roomCode = code;
    socket.join(code);
    console.log(`[room] ${name} joined room ${code}`);

    callback({ ok: true, room: outcome.room });
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
  socket.on("adminUnlock", (payload, callback) => {
    const ok = verifyAdminKey(payload?.key);
    if (ok) socket.data.isAdmin = true;
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

  // --- Leave / disconnect both funnel through one handler ----------------
  function handleLeave() {
    const code = socket.data.roomCode;
    if (!code) return;
    const result = removePlayer(code, socket.id);
    socket.leave(code);
    socket.data.roomCode = undefined;
    if (result) {
      // Room still exists: broadcast the updated list, and let the game engine
      // react (e.g. skip the turn if the drawer left, or end if too few remain).
      io.to(code).emit("roomState", result.room);
      if (result.promotedHostName) {
        broadcastSystem(code, `${result.promotedHostName} is now the room owner!`);
      }
      onPlayerLeft(code, socket.id);
    } else {
      // Room is now empty: free its canvas + game memory.
      deleteCanvas(code);
      cleanupGame(code);
    }
    broadcastRoomList(); // counts changed, or a room disappeared
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

  socket.on("leaveRoom", handleLeave);

  socket.on("disconnect", (reason) => {
    console.log(`[socket] disconnected: ${socket.id} (${reason})`);
    handleLeave();
  });
});

httpServer.listen(PORT, "0.0.0.0", () => {
  console.log(`\n  Agarwal Family Skribbl server running:`);
  console.log(`    Local:   http://localhost:${PORT}/health`);
  console.log(`    Network: http://<your-PC-IP>:${PORT}/health  (for phones)\n`);
});
