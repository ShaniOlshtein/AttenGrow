import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Unit tests run in node; component / hook tests opt into a DOM with `// @vitest-environment jsdom`.
export default defineConfig({
  plugins: [react()],
  test: {
    include: ["src/**/*.test.{ts,tsx}"],
    // onnxruntime-web hides "./wasm" from the node condition; tests mock it, they only need it resolvable
    alias: {
      "onnxruntime-web/wasm": fileURLToPath(new URL("./node_modules/onnxruntime-web/dist/ort.wasm.min.mjs", import.meta.url)),
    },
    restoreMocks: true,
    coverage: {
      provider: "v8",
      include: ["src/**/*.{ts,tsx}"],
      exclude: ["src/**/*.test.{ts,tsx}", "src/main.tsx", "src/test/**"],
      reporter: ["text", "html"],
      reportsDirectory: "coverage",
    },
  },
});
