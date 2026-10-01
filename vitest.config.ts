import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";
export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: {
    fileParallelism: false,
    testTimeout: 15_000,
    env: { BILLING_ENABLED: "false" },
  },
});
