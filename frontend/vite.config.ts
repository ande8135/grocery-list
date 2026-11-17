import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  server: {
    // `npm run dev` starts the local API on :3001; in production CloudFront does this proxying.
    proxy: { "/api": "http://localhost:3001" },
  },
});
