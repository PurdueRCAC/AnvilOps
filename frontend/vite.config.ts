import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { defineConfig } from "vite";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    proxy: {
      "/api": {
        target: "http://localhost:3000",
      },
    },
  },
  build: {
    rollupOptions: {
      output: {
        assetFileNames: ({ name }) =>
          name?.endsWith(".css")
            ? "assets/global.css"
            : "assets/[name]-[hash][ext]",
      },
    },
  },
});
