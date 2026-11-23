import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  test: {
    // Only pure functions are unit-tested, so no browser environment is needed.
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
