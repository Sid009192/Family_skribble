/**
 * socket.ts — our single, shared connection to the server.
 *
 * We create ONE socket for the whole app and import it wherever we need it.
 * (Opening a new connection per component would be wasteful and buggy.)
 *
 * Server URL resolution:
 *   1. In production (deployed on Vercel) we read VITE_SERVER_URL — baked in
 *      at build time — which points at our Render server.
 *      e.g. VITE_SERVER_URL=https://family-scribble.onrender.com
 *   2. In dev we derive it from window.location.hostname so the same code
 *      works on PC (localhost) AND phones on the LAN (192.168.x.x), with no
 *      manual config.
 */

import { io, type Socket } from "socket.io-client";
import type { ClientToServerEvents, ServerToClientEvents } from "@shared/events";

const SERVER_PORT = 3001;
const envUrl = import.meta.env.VITE_SERVER_URL as string | undefined;
const serverUrl =
  envUrl && envUrl.length > 0
    ? envUrl
    : `${window.location.protocol}//${window.location.hostname}:${SERVER_PORT}`;

// The <generics> give us full type-checking + autocomplete on every event.
export const socket: Socket<ServerToClientEvents, ClientToServerEvents> = io(
  serverUrl,
  {
    autoConnect: true,
  }
);
