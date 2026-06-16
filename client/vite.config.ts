import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      // Lets us write `import ... from "@shared/types"` in the client.
      "@shared": path.resolve(__dirname, "../shared/src"),
    },
  },
  server: {
    // host:true exposes the dev server on your LAN so phones can open it
    // at http://<your-PC-IP>:5173
    host: true,
    port: 5173,
    fs: {
      // Allow importing files from the sibling `shared/` folder (outside client/).
      allow: [".."],
    },
  },
});
