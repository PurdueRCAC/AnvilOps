import { defineConfig } from "vite";

// https://vite.dev/config/
export default defineConfig({
  server: {
    proxy: {
      "/openapi.yaml": {
        target: "http://localhost:3000",
      },
    },
  },
});
