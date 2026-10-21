import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  // Same as the "@/*" path in tsconfig.json.
  resolve: { alias: { "@": fileURLToPath(new URL("./", import.meta.url)) } },
});
