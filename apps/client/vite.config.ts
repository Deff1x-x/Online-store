import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    target: "es2020",
    cssCodeSplit: true,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules/react") || id.includes("node_modules/react-dom") || id.includes("node_modules/react-router")) {
            return "react-vendor";
          }
          if (id.includes("packages/ui") || id.includes("@koz/ui")) {
            return "koz-ui";
          }
          if (id.includes("packages/api") || id.includes("@koz/api")) {
            return "koz-api";
          }
        },
      },
    },
  },
});
