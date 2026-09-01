import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  appType: "spa",
  server: {
    host: "127.0.0.1", // Spotify OAuth doesn't allow http://localhost
    port: 5173,
  },
});
