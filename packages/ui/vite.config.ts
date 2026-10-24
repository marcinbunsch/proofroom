import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

// In development the UI is served by Vite, and calls to /rpc are passed on to
// the server (pnpm --filter @proofroom/server dev), so the browser only ever
// talks to one origin.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: "127.0.0.1",
    port: 5790,
    proxy: { "/rpc": process.env.PROOFROOM_SERVER_URL || "http://127.0.0.1:4790" },
  },
})
