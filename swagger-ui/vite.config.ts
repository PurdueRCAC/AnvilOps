import { defineConfig } from "vite";

// https://vite.dev/config/
export default defineConfig({
  base: process.env.BASE_PATH ?? "/",
  server: {
    proxy: {
      "/openapi.yaml": {
        target: "http://localhost:3000",
      },
    },
  },
});
