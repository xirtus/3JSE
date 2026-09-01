# Phase 0 open items 1–3 — status

From `evidence/phase0-summary.md` §"Open items carried into Phase 1" and `BUILD_TASKS.md` 1.0.

## 1. Mid-range-laptop ECS re-measure — **not done, hardware-bound**

`evidence/phase0-spike2-ecs-object3d.md` measured the archetype ECS on Apple Silicon and
flagged that a mid-range Windows/Intel laptop number was not captured. That is still true — no
such machine is available to this session. What *has* changed since:

- The archetype layout the spike proved is now **shipped in `@3jse/runtime`** (Phase 1.1) as an
  index behind `Level.query`, with `Level.archetype.bench.test.ts` running a 20k-entity
  parity + timing check in CI on whatever runner executes it. That bench (indexed
  ~0.06 ms/query vs full-scan ~0.17 ms/query at 20k) is the standing perf regression guard.
- The editor **Profiler panel** now reports real `runtime.getPerf` numbers from the live
  render loop, so a mid-range measurement is now a "open the editor on that machine and read
  the Profiler" task rather than a bespoke benchmark harness.

**Action owed:** run `pnpm --filter @3jse/runtime test` (captures the bench line) and open the
editor Profiler on a representative mid-range Windows laptop; record the numbers here. Bounded,
low-risk — the Phase 0 verdict had ~10× margin at the 10k target.

## 2. Tauri v2 confirmation checklist — **partially discharged; a running shell is still owed**

`evidence/phase0-spike4-editor-shell.md` §"Confirmation checklist" — five items that need a
real Tauri v2 shell (none exists in the repo). Status per item:

| Checklist item | Status |
|---|---|
| `WebGPURenderer` + WebGL2 fallback across Windows/macOS/Linux webviews in a Tauri window | ⬜ needs the shell. The **browser** build is CI-verified on WebGPU-capable Chromium; the SPA is now shell-agnostic (item below) so the Tauri window would run the same code. |
| Read/write a real project folder via `plugin-fs` with a runtime-granted scope | 🟡 the adapter is built (`apps/editor/src/shell/TauriShell.ts` routes to `window.__TAURI__.fs`); it fails loudly until the fs plugin is wired into a `tauri.conf.json` that doesn't exist yet. |
| Float a panel to a second OS window; save/restore layout across restarts | ⬜ needs the shell + a multi-window docking pass; `ShellCapabilities.multiWindow` is the seam. |
| Shared WebGPU context edit↔Play with no process boundary | ✅ already true in the SPA — one `WebGPURenderer`, `World.step()` in the same rAF loop (`Viewport.tsx`); a native shell inherits this unchanged. |
| Rust toolchain in CI produces signed Windows + macOS builds | ⬜ no Rust toolchain / signing certs in this environment. |

## 3. `apps/editor` `shell/` native-call adapter + keep the browser build in CI — **done**

- **`apps/editor/src/shell/`** — `ShellAdapter` interface (`pickDirectory` / `readFile` /
  `writeFile` / `listDir` / `message` / `capabilities`) with three implementations:
  - `BrowserShell` — File System Access API where present (Chromium; the editor's WebGPU
    baseline anyway), download fallback for `writeFile`, no second-window support.
  - `TauriShell` — routes through `window.__TAURI__` at runtime, **zero build-time Tauri
    dependency**, so the browser build compiles and bundles everywhere. Fails loudly if a
    plugin isn't wired, so bring-up gaps are visible.
  - `getShell()` picks Tauri when `window.__TAURI__` is present, `BrowserShell` otherwise.
  - 6 tests (`shell/shell.test.ts`): adapter selection both ways, capability reporting,
    graceful degradation, loud failure when a Tauri plugin is missing.
- **Browser build in CI** — `tools/ci/github-ci.yml` (and `pnpm gate`) run
  `pnpm --filter @3jse/editor build`, the browser build, on every push/PR. It is the primary
  target until the Tauri shell exists; the shell adapter keeps it first-class thereafter.

## Bottom line

Item 3 is closed. Items 1 and 2 are **hardware/toolchain-bound**, not design-bound: the
archetype layout and shell-agnosticism that de-risked them are shipped, the remaining work is
"run it on the target machine / in the real shell", and the Phase 0 fallbacks (WebGL2, Electron)
are intact. These do not block any downstream engine work.
