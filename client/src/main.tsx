/**
 * main.tsx — the client's entry point.
 *
 * React needs one "root" DOM node to render into (the <div id="root"> in
 * index.html). We mount our top-level <App /> component there.
 *
 * <StrictMode> is a dev-only helper that surfaces common React mistakes.
 */

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./styles/global.css";

const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("Could not find #root element in index.html");

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>
);
