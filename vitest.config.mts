import { defineConfig } from "vitest/config";
import path from "node:path";

const root = import.meta.dirname;

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
  resolve: {
    alias: {
      "@": path.resolve(root, "src"),
      // "server-only" throws outside Next's server bundle; it's a no-op for tests.
      "server-only": path.resolve(root, "tests/fixtures/empty.ts"),
    },
  },
});
