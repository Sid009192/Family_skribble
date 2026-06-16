/**
 * socket.ts — our single, shared connection to the server.
 *
 * We create ONE socket for the whole app and import it wherever we need it.
 * (Opening a new connection per component would be wasteful and buggy.)
 *
 * The server URL is derived from whatever host the page was opened on:
 *   - On your PC:    http://localhost:5173  -> connects to http://localhost:3001
 *   - On a phone:    http://192.168.x.x:5173 -> connects to http://192.168.x.x:3001
 * So the same code "just works" on both, with no manual config.
 */

import { io, type Socket } from "socket.io-client";
import type { ClientToServerEvents, ServerToClientEvents } from "@shared/events";

const SERVER_PORT = 3001;
const serverUrl = `${window.location.protocol}//${window.location.hostname}:${SERVER_PORT}`;

// The <generics> give us full type-checking + autocomplete on every event.
export const socket: Socket<ServerToClientEvents, ClientToServerEvents> = io(
  serverUrl,
  {
    autoConnect: true,
  }
);
