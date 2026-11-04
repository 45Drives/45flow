import { fileURLToPath } from "node:url";
import { defineConfig, configDefaults } from "vitest/config";
import Path from "path";
import vue from "@vitejs/plugin-vue";

export default defineConfig({
  plugins: [vue()],
  root: Path.join(__dirname, "src"),
  test: {
    environment: "jsdom",
    exclude: [...configDefaults.exclude, "e2e/**", "houston-common/**", "build/**", '**/*.spec.ts', '**/*.test.ts'],
    root: fileURLToPath(new URL("./", import.meta.url)),
  },
});
