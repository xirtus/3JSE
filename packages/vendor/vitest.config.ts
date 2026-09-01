import { defineConfig } from "vitest/config";

// Only this package's own tests. `upstream/` holds vendored third-party repos (pinned, MIT-
// verified — see licenses.json); their test files must never run as part of the 3JSE
// workspace gate: they're a different toolchain and pull `vitest run` (hence `pnpm -r test`)
// red for a reason that has nothing to do with 3JSE code.
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    exclude: ["**/node_modules/**", "**/dist/**", "upstream/**"],
  },
});
