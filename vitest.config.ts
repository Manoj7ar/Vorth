import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    reporter: "verbose",
    include: ["**/*.test.ts"],
    exclude: ["**/node_modules/**", "**/.next/**", "**/dist/**"],
  },
});
