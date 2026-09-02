# RESUME — pick-up point after 2026-09-02c

Branch **`main`**, pushed. Working tree: only the long-standing vendored-`chiro` untracked tree
(pre-existing, unrelated). All gates green.

```
pnpm verify:harness   # PASS (also gates the repo-root .claude/skills mirror)
pnpm gate             # verify:harness + typecheck + test + editor build — all green
pnpm -r typecheck     # clean, 36 projects
pnpm -r test          # 433 passing across the workspace + apps/editor
```

## What this session did (`SESSION_REPORT-2026-09-02c.md`)

Closed the "install + polish tail" from the last RESUME — all reuse-first:

- **`@3jse/cli` bundles for real** — `esbuild` (`^0.24.2`, MIT) is a real dep now; `3jse
  publish` runs `esbuild.build` (stdin entry, `three*` external) instead of a hand-run
  `build.mjs`. (`86f885f`)
- **`@3jse/nav-recast`** (new package) — `bakeRecastNavMesh(meshes, config?)` runs
  recast-navigation-js `threeToSoloNavMesh` + `NavMeshQuery` → `@3jse/nav` `PolyNavMesh`. Kept
  separate so `@3jse/nav` stays WASM-free/three-free. 6 tests incl. a real WASM bake. (`86f885f`)
- **`@3jse/render` `GpuParticleRenderer`** — drop-in for `ParticleRenderer` (same `sync(pools)`);
  `PointsNodeMaterial`, per-particle size + soft sprite in TSL, storage buffers. `@3jse/vfx`
  stays the headless sim authority. Editor Viewport uses it. (`198eeeb`)
- **Atlas Trace time scrubber** in `AtlasPanel` — play/pause rAF sweep + seek slider over
  `TraceRecorder.span`, `◉` pulse on nodes fired <0.3 s ago, `pulseCounts` density strip.
  (`198eeeb`)  The §5 data-side lenses (world/style/trace/rig) landed in `9acf95c`.
- Provenance: `licenses.json` recast + esbuild rows → `installed-package-json` (`bd36355`).

`BUILD_TASKS.md` rows A.4, G.15 updated; G.16–G.19 added.

## What's left — both genuinely blocked

1. **Live LLM planning** behind Atlas "Ask agent" — needs an actual LLM. The §28 scoped-context
   export + §30 change preview are real and wired to the log + clipboard; the planning loop is
   deliberately not faked (same posture as `AI_AGENT_API.md`'s PLAN stage).
2. **Phase 0 items 1–2** — a mid-range Windows laptop for the perf-floor capture; a Rust
   toolchain + a running Tauri shell for the desktop-shell smoke test. Hardware-bound.

## Notes for next time

- CI workflow still parked at `tools/ci/github-ci.yml` — the push credential lacks the GitHub
  `workflow` scope. `git mv` it to `.github/workflows/ci.yml` from a `workflow`-scoped login.
- `tools/license-scan.mjs` **rewrites `licenses.json` destructively** — it drops the
  hand-curated `vendored-upstream` / `vendor-registry` rows. Use it to read MIT fields; hand-edit
  the file. Don't commit its output wholesale.
- Editor bundle is ~8 MB (one chunk). Code-splitting is a known, unstarted optimisation.
