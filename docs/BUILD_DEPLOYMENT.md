# Build + Deployment

## The claim

This is the area 3JSE can beat Unreal outright, not just match it, because the web platform's distribution model is structurally better than a desktop engine's — no multi-gigabyte installer, no platform-store review cycle standing between a build and a player for the default target. 3JSE's job is not inventing this advantage; it's not squandering it by making deployment feel like a traditional engine's export pipeline bolted onto a web target as an afterthought.

## Play

Pressing Play in the editor never triggers a build. `RUNTIME.md`'s in-process execution model means Play boots the current World directly in the same WebGPU context the editor uses — this is instant by construction, not something a build pipeline is optimized to make fast.

## Publish

Publish *does* produce a real, optimized build — separate from Play specifically because Play's priority (instant iteration) and Publish's priority (smallest, fastest, most compatible output) are different problems:

1. **Tree-shaking**: only the `@3jse/*` packages and Gameplay Framework systems a project actually uses are bundled (`PLUGIN_ARCHITECTURE.md`'s "a game depends only on the systems it uses" is enforced here, not just aspirational).
2. **Asset finalization**: textures transcode to the target's optimal compressed format (`ASSET_PIPELINE.md`), meshes get Draco/meshopt compression, unused LOD tiers for the selected quality-tier range are dropped.
3. **Graph compilation**: every 3JSE Graph compiles to its JS/TS backend output (`GAMEPLAY_IR.md`) — the shipped build contains zero interpreter, zero visual-scripting runtime tax.
4. **Code bundling**: standard modern bundler (esbuild/rollup-class) output — minified, code-split by Level/sublevel where `WORLD_SYSTEM.md`'s streaming applies, so a large project's initial download isn't the whole game.
5. **Manifest generation**: a build manifest records exact asset hashes/versions for CDN cache-busting and for the Agent API's build-verification tooling (`AI_AGENT_API.md`'s `build.typecheck`/`build.runTests` operate against this same pipeline headless).
6. **Third-party notices**: a `THIRD_PARTY_NOTICES` file is generated from every installed `@3jse/vendor` Tier A package's registry entry (`VENDOR_INTEGRATIONS.md`) — source, license, author. Publish **fails**, not just warns, if anything shipping in the bundle traces back to an unresolved Tier B staged import (`/plugins/_vendor/`) that was never promoted to a proper attributed plugin — a project can prototype with staged open-source code, but can't accidentally ship it unattributed.

## Target matrix

| Target | Mechanism | Status posture |
|---|---|---|
| **Static web** | Plain bundled output, deployable to any static host/CDN | Primary target, day one |
| **PWA** | Static web output + generated manifest/service-worker for offline play and install-to-homescreen | Near-term, low incremental cost over static web |
| **Desktop (macOS/Windows/Linux)** | Tauri shell wrapping the static web build, native file-system/save access | Near-term — reuses the same shell technology as the editor itself |
| **Steam wrapper** | Desktop build + Steamworks SDK integration (achievements/cloud-save bridged to `@3jse/achievements`/`@3jse/save`) | Mid-term, once desktop packaging is proven |
| **Mobile wrappers (iOS/Android)** | Tauri-mobile or Capacitor-class WebView wrapper around the static build, with the Mobile template's aggressive default quality tier (`PERFORMANCE.md`) | Mid-term — gated on WebGPU/WebGL2 mobile support maturity, honestly tracked rather than promised early |
| **XR** | WebXR directly from the static web build — no wrapper needed for browser-based XR; store-distributed XR follows the same wrapper path as mobile | Near-term for browser WebXR, mid-term for store distribution |

A 3JSE game remains distributable as normal web technology at every tier above "static web" — the desktop/mobile/Steam targets are **wrappers around the same build**, not divergent platform-specific codepaths a developer has to maintain separately. This is the concrete meaning of "the browser is not a limitation to apologize for" from `VISION.md`: every non-web target is additive packaging on top of a build that already works, not a prerequisite the web target was a stepping stone toward.

Babylon Native — a C++/JSI shell that runs the *same* Babylon.js scene code inside a native host instead of a WebView, used for their iOS/Android/Windows/UWP native targets — is worth naming here as the alternative this table's Tauri/Capacitor-class wrapper approach deliberately isn't taking. It's a real, proven path for squeezing out WebView overhead, and it's evidence for the mobile row's "gated on WebGPU/WebGL2 mobile support maturity" caveat being a genuine tradeoff rather than an oversight: a JSI-style native shell is the mechanism to reach for specifically if WebView-hosted WebGPU/WebGL2 mobile performance turns out not to be good enough once real projects hit that ceiling — sharpening the Tauri bet's failure mode rather than replacing it preemptively with more native-shell complexity before there's project evidence it's needed.

## Quality tiers as a build concern

The quality-tier system (`PERFORMANCE.md`) is resolved partly at build time — target-specific texture formats, LOD ranges, and default tier selection per deployment target are baked into that target's build variant, so a mobile build isn't shipping desktop-resolution textures it will never use, and a desktop build isn't capped at mobile settings by default.
