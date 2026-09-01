# Recipe: Surf / Kite / Wake Game

Canonical reference: **3JSURF** (`../3jsurf`) — TUBULAR mechanics on Poseidon's FFT ocean, WebGPU.

First-person variant: **BREAKING WAVES** (`../breaking-waves-demo-main`) — parametric breaking wave painted by shader onto an FFT ocean, live Tweakpane knobs, 2D profile plot as witness.

Capabilities:
- ocean/waves -> Poseidon (vendored at a pinned commit, MIT)
- rigged humanoid -> existing project/shared licensed model first (the reference ships two auto-rigged riders + a baked Mixamo clip library)
- board/kite/tow mechanics
- third-person camera + close/shoalder cams placed through the wave's ride surface (stations, not metres)
- trick state machine
- score/combo/landing quality
- shoreline/terrain
- grass/flora -> Gaia/Dryad

Mandatory tooling (from the reference — see the `mechanics-harness` skill):
- headless mechanics check: wave + surfer with no renderer/canvas/DOM; assert ride length/speed/tube time against the build
- feel numbers: face run, crest->trough time, peak face speed per break
- per-frame invariant soak: rider always on the surface, camera never inside the water, plus a console-error net

First vertical slice: catch one wave, ride, jump, perform one trick, land, score, wipe out/retry. Do not build a huge beach before this is fun.

Scaling laws learned the hard way: stations not metres, sqrt(K) steering authority, quadratic drag, swept pickup tests, attach-by-construction (`ridePoint`).
