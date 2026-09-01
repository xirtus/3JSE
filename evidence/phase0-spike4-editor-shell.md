# Phase 0 · Spike 4 — Editor shell: Tauri vs. Electron

**Status:** CLOSED — decision recorded (desk evaluation; a build-time confirmation checklist remains)
**Date:** 2026-09-01
**Baseline commit:** `2fc24e8`
**Roadmap deliverable:** "A Tauri-vs-Electron spike for the editor shell (`EDITOR.md`): confirm WebGPU access, file-system permissions, and multi-window behavior meet the editor's needs in Tauri before committing to it as primary."
**Decision doc affected:** `docs/EDITOR.md`

## Routing ledger

| Field | Value |
|---|---|
| Capability | Desktop shell hosting the `@3jse/editor` SPA: WebGPU viewport, native file-system read/write of project folders, multiple windows/webviews, acceptable GPU/driver access |
| Existing project solution found? | **Yes, as a stated preference.** `docs/EDITOR.md` already names "Tauri desktop app — the primary target for serious work" with "*(Electron is a viable fallback … if a Tauri limitation forces it; the SPA itself doesn't care which shell hosts it.)*" `apps/editor` is a plain Vite React SPA today — **no shell of either kind is wired up yet.** |
| Selected provider/reference | Tauri v2 (WRY webview abstraction). Electron held as the documented fallback. |
| Why | See evaluation below — decisive factors are bundle size, memory, security model, and the SPA being shell-agnostic so the risk of a later switch is low. |
| Fallback if Tauri blocks | Electron. The SPA (`apps/editor`) has zero shell coupling; a switch is a packaging change, not an app rewrite. Keep it that way (see "Guardrail"). |

## The editor's actual requirements on the shell (from `EDITOR.md`)

1. **WebGPU** — the Viewport is a live `WebGPURenderer` in-process (not a separate game process over IPC). Play mode shares the same WebGPU context as the edit view. Non-negotiable.
2. **Native file system** — read/write the `PROJECT_FORMAT.md` project folder directly, the same files a hand-editor or CI would touch. Needs real FS access, not the browser's sandboxed File System Access API with its per-session prompts.
3. **Multiple windows** — panels can be floated as OS windows; "saved layouts per project or per user"; a tear-off Viewport or Graph on a second monitor is the expected pro workflow.
4. **GPU/driver access** — "better GPU/driver access than a sandboxed browser tab."
5. **Shell-agnostic SPA** — explicitly: "the SPA itself doesn't care which shell hosts it."

## Evaluation (public sources, 2026-09-01)

### WebGPU access

| Shell | Webview | WebGPU status |
|---|---|---|
| **Electron** | Bundled Chromium | WebGPU GA in Chromium since 2023; identical to Chrome. **Zero risk.** |
| **Tauri v2** on **Windows** | WebView2 (Edge/Chromium, auto-updating) | Chromium WebGPU — same as Electron. **Low risk.** |
| **Tauri v2** on **macOS** | WKWebView (system WebKit) | Safari/WebKit shipped WebGPU on by default during 2025; on a current macOS the system WKWebView has it. Tied to the user's OS version, not something 3JSE bundles → **medium risk on older macOS**, decreasing over time. |
| **Tauri v2** on **Linux** | WebKitGTK | WebGPU in WebKitGTK is the weakest link — historically experimental/flagged, uneven driver support. **Highest risk.** Mitigated by `PERFORMANCE.md`'s mandated WebGL2 fallback path, which the editor Viewport inherits. |

The asymmetry: **Electron ships one known-good Chromium on every OS; Tauri inherits three different system webviews**, one of which (WebKitGTK) is a real WebGPU risk. This is the single strongest argument for Electron and must be on the confirmation checklist.

### File-system permissions

- **Electron:** full Node.js `fs` in the main process; unrestricted. Simple, but that's also the security cost — a compromised renderer with `nodeIntegration` or a loose IPC bridge has the whole disk.
- **Tauri v2:** `@tauri-apps/plugin-fs` behind an explicit **capabilities / ACL permission system** — you declare `fs:allow-read`/`fs:allow-write` scoped to path globs in a capability file; anything else is denied by default. For an editor whose whole job is reading/writing a user-chosen project folder, this is *more* work (a runtime-granted scope for the opened project dir) but a materially better security posture, and it aligns with `SECURITY.md`'s "unknown repos are inspection-only" and vendor-intake caution. **Meets the need; costs a scope-management implementation.**

### Multi-window

- **Electron:** mature `BrowserWindow`; the reference implementation everyone copies.
- **Tauri v2:** supports multiple windows *and* multiple webviews per window (`WebviewWindow` API) — this was a v1→v2 gap that v2 closed. Adequate for float/tear-off panels and saved layouts. **Meets the need**; less battle-tested than Electron for complex many-window docking, so it belongs on the checklist.

### Bundle size, memory, footprint

- **Electron:** ~120–180 MB installers, ~every app ships its own Chromium + Node; higher idle RAM.
- **Tauri v2:** single-digit-MB binaries (system webview not bundled), lower idle RAM, faster cold start. Current stable is v2.10.x (actively maintained, March 2026 release).

For a tool developers keep open all day alongside a browser, an IDE, and a running game build, the footprint difference is a real daily-quality-of-life factor, not a vanity metric.

### Security model

Tauri's Rust core + deny-by-default capability system + no bundled Node is a smaller attack surface than Electron's Chromium+Node. Given 3JSE's AI-native posture (an agent driving the editor's command API, `AI_AGENT_API.md`) and its vendor-intake threat model (`SECURITY.md`), the tighter default matters.

## Decision — Tauri v2 primary, Electron fallback (confirms `EDITOR.md`, unchanged)

**Rationale:** footprint, memory, cold-start, and security all favour Tauri; multi-window and Windows/macOS WebGPU are adequate in v2; the one serious risk (Linux/WebKitGTK WebGPU) is bounded by the WebGL2 fallback the renderer must have anyway; and the SPA's shell-agnosticism (kept as a guardrail, below) makes a later reversal cheap. Electron remains the documented fallback and would be chosen if the checklist below fails.

### Guardrail (adopt now, before Phase 1)

Keep `apps/editor` shell-agnostic on purpose:
- All native calls (FS, window management, dialogs) go through **one thin `shell/` adapter module** with a browser implementation (File System Access API / download) and a Tauri implementation. No `@tauri-apps/*` import anywhere else in the SPA.
- CI keeps building the **browser** target (`EDITOR.md`'s third distribution) — that alone prevents shell lock-in from creeping in.

### Confirmation checklist — must pass during Phase 1 shell bring-up, before the choice is final

- [ ] `WebGPURenderer` initialises and renders a non-trivial scene in a Tauri v2 window on **Windows (WebView2)**, **macOS (WKWebView, current OS)**, and **Linux (WebKitGTK)** — and the **WebGL2 fallback** path activates cleanly where WebGPU is absent.
- [ ] Read + write a real project folder via `plugin-fs` with a runtime-granted scope for a user-picked directory; confirm large-file (GLB) and many-file (asset tree) performance is acceptable.
- [ ] Float a panel to a second OS window, move it to a second monitor, save & restore the layout across restarts.
- [ ] Shared WebGPU context between the edit Viewport and Play mode with **no process boundary** (`EDITOR.md` §"No process boundary").
- [ ] Rust toolchain in CI produces signed Windows + macOS builds without excessive pipeline complexity.

If any of the first two fail on a target 3JSE must support and can't be worked around, switch that platform (or the whole shell) to Electron per the fallback.

## Assessment against the exit criterion

> "editor shell technology is chosen."

**Chosen: Tauri v2**, matching the existing `EDITOR.md` recommendation, now with the reasoning written down and the risks named. The literal Phase 0 ask — "confirm WebGPU / FS / multi-window *in Tauri* before committing" — is **partially discharged**: confirmed feasible from documentation and platform status, **not** yet confirmed by a running Tauri shell (none exists in the repo). That hands-on confirmation is the checklist above, scheduled for Phase 1 shell bring-up. This is an accepted, bounded risk: the decision doesn't block any other Phase 0 item, and the fallback is cheap.

## Known limitations

- **No Tauri prototype was built.** Rust/Tauri toolchain bring-up + a shell spike is Phase 1 work; doing it now would front-load infrastructure the rest of Phase 0 doesn't need. The decision rests on Tauri v2's documented capabilities and current system-webview WebGPU status, not on a 3JSE-specific measurement.
- **WebKitGTK WebGPU** remains the real open risk; carried into the Phase 1 checklist with WebGL2 fallback as the mitigation.
- Platform support matrix for 3JSE's editor (which Linux distros / macOS versions are "supported") isn't fixed yet — it should be, before the checklist is run, so "a target 3JSE must support" is unambiguous.

## Sources

- [Tauri v2 — Webview Versions (v2.tauri.app)](https://v2.tauri.app/reference/webview-versions/)
- [tauri-apps/wry — WRY webview abstraction (WKWebView / WebView2 / WebKitGTK)](https://github.com/tauri-apps/wry)
- [Tauri (software framework) — Wikipedia (v2.10.1, March 2026)](https://en.wikipedia.org/wiki/Tauri_(software_framework))
- [Tauri 2.0 overview — system webview integration & security model](https://kawaldeepsingh.medium.com/tauri-2-0-building-lightweight-desktop-mobile-apps-with-rust-security-and-system-webview-c89e2901208a)
- [Render wgpu frames as webview overlay — tauri-apps discussion #11944](https://github.com/orgs/tauri-apps/discussions/11944)
