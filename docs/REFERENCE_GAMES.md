# Reference Games — what the projects teach the plan

Six games built on the 3JSE stack already exist as working laboratories: **3JSURF** (`../3jsurf`), **ZENDRIVE** (`../zendrive`), **UBURT / PULSEHOP** (`../uburt`), **DAMN BEAVERS** (`../dambeavers`), **BREAKING WAVES** (`../breaking-waves-demo-main`), and **MANDELHOP** (`../mendalhop`). Together they validate most of this design package's riskiest claims — and they donate working systems, measured feel anchors, harness tooling, and reusable rigs/animation/asset kits. This page records what each one teaches and where each lesson lands.

The short answer to "can any of this accelerate the project": yes — five things specifically. (1) The **headless mechanics-harness pattern** (3jsurf's `mechcheck.mjs`, zendrive's headless races, dambeavers' simulation tests, mendalhop's player agents) is the engine's `runtime.run --headless` and the Agent API's verify step, already proven in production. (2) **Feel measured as numbers** (3jsurf's `feel.mjs`) gives FeelSpec real anchors instead of guesses. (3) **Reference implementations** for vehicle physics, hop-grammar input, parametric surf, and systemic simulation collapse the risk on four Gameplay Framework packages. (4) **Rigs, animation clip libraries, and model kits** seed the Shop and templates. (5) Damn Beavers' **gate sentences** formalize the harness's evidence gate exactly the way `build.runTests` needs it.

---

## 1. 3JSURF — surf mechanics on a spectral ocean

The mechanics of TUBULAR running on Poseidon's WebGPU FFT ocean: 8 breaks from 30 m to 300 m faces, 5 riders, sharks, rival AI, barrel riding. `src/render/poseidon/` is vendored (MIT) exactly the way `VENDOR_INTEGRATIONS.md` prescribes.

### What it proves

- **Headless mechanics harness.** `tools/mechcheck.mjs` runs the wave and the surfer with *no renderer, no canvas, no DOM* — stand-in `scene`/`particles`/`char` stubs, pure JS logic — and its numbers must match the WebGL build ("ride length 26.7s vs 27.6s"). Gameplay logic that is renderer-independent by construction. This is `RUNTIME.md`'s headless mode and `AI_AGENT_API.md`'s verify loop, working today.
- **Feel as numbers.** `tools/feel.mjs` measures face run, crest→trough time, and peak face speed per break — feel as a table of measurements, not vibes. This is FeelSpec's measurement posture with real anchors: Pen Gu Bay 7.3 m/s peak, Cosmic Reef 19.8 m/s.
- **Invariant soak.** `tools/soak.mjs` drives a scripted pilot through 60-second sessions and samples *two invariants every frame*: the rider is always on the surface, the camera is never inside the water (`riderSunkPct` / `camBuriedPct` ≈ 0.0–0.1%), plus a console-error net. This is the harness's gameplay/visual/performance gates as an executable.
- **Debug isolation.** `WAVEDBG=1..7` renders one shading term at a time (body, reflection, backlit, glitter, foam, normal, raw attributes) — every "what is painting that?" question answered by a screenshot, not ten guesses. This is the methodology behind Atlas's runtime-trace lens and the Profiler's per-pass attribution.

### Design lessons (mechanics-registry knowledge)

- **Stations, not metres.** Every threshold (stall, foam-ball floater, "over the falls") was a metre count that *meant* a height on the face. On a 300 m wave the metres mean something else entirely, so thresholds live in `wave.stations` — fractions of the wave's geometry. Bare metres do not survive a change of scale *or* of face shape.
- **Scaling laws, not scale multipliers.** Steering authority scales with √K, drag is quadratic (which is what water does), terminal velocity follows damping time — letting go leaves a rail-hold glide instead of a runaway. World scale is one wrapper (`setWorldScale`), not a rewrite of every placement.
- **Attach by construction, not by lookup.** The rider used two different formulas for the same quantity (x-placement + height lookup); on a 150 m wave they disagreed by metres — "surfer inside the wave." `wave.ridePoint` inverts the profile once and takes *both* coordinates from that point.
- **Pickup tests must be swept, not sampled.** At 200 km/h the board covers a metre per frame; a sphere test is a coin flip.
- **State bugs are geometry bugs.** A stale `stats.inTube` flag (written only in `_riding`, never cleared on wipeout) disabled the exact camera clearance needed during the state where the rider is in the water. Camera burial went 2.7% → 0 when cleared.

### WebGPU port lessons (`RENDERING.md`, `PERFORMANCE.md`)

- The wave had to be shaded in **face space** (`aface` attribute: metres of arc down the cross-section × along the wall) — world-XZ UVs smear into vertical streaks on a near-vertical face. The parameterisation is isometric however the face pitches.
- **Particles are billboards, not points** under WebGPU — and the old **26-pixel cap** was load-bearing (fine mist vs. whited-out barrel); it's reproduced in world units.
- The barrel interior is a **liquid volume** (~80 lines of GLSL → TSL): god-ray fan, caustic webs, counter-flow, sea smoke, a "am I seeing this from underneath" per-fragment test — and the FFT ocean drops its sky reflection when the camera is in the pit (inside a barrel there is no sky overhead).
- **One photograph, eight breaks**: each break's palette is applied as a grade *inside* `skyColor()`, so dome, ocean fresnel, and aerial-perspective fog can never disagree. The Cosmic Reef replaces it outright with a procedural nebula, starfield, and a real gravitational-lensing black hole (deflection ≈ rs/A — three dot products and a normalize).

### Reusable assets (Shop kit: "TUBULAR rider kit")

`public/assets/`: `skeleton_rig.glb`, `man_rigged.glb` (two auto-rigged riders), `surf_anims.glb` (baked Mixamo clip library — paddle, pop, ride, trim, air, airfwd, airbig, flip, spin, cartwheel, kick, slip, tuck, crouch, land, wipeout, swim, fistpump, dance, victory, taunt…), three sharks incl. hammerhead (`shark.glb`, `realistic_shark.glb`, `model_73a_-_great_hammerhead_shark.glb`), three floaties (`flamingofloatie`, `duckfloatie`, `sharkfloatie`), `buoy.glb`, sky panoramas. Licensing: Mixamo clips (baked), Sketchfab exports, KSPS mechanics public domain, Poseidon MIT.

### Where it lands

`RUNTIME.md` headless · `PERFORMANCE.md` instancing/billboards · `RENDERING.md` face-space/volume · `ATLAS` surf FeelSpec + Feel Lab scenarios · harness `mechanics-harness` skill and surf recipe · Shop kit.

---

## 2. ZENDRIVE — serene velocity racer

Pole Position × zen garden × vaporwave mixtape. Four procedural roads, zero authored assets, and a generative soundtrack that *listens to your driving*.

### What it proves

- **Track-space vehicle physics** — the reference implementation for `@3jse/vehicle`'s arcade mode. Cars live in `(s = distance along track, x = lateral)` coordinates on a self-closing spline with pure-pursuit homing. Corners apply a **demand-vs-capacity** model: `demand = curv · v² · curvePush` vs. the steer authority you actually provide — if demand exceeds capacity you slide wide, brake, or commit to the drift. This is a whole, proven arcade-feel model in ~120 lines, and its axes map 1:1 onto Atlas's driving FeelSpec dimensions (`steeringResponse`, `driftAssist`, `stability`, `collisionDrama`…). The `xirtus-arcade-driving-v3` profile in `3JSE_ATLAS_FULL_PLAN.md` could be *calibrated from this code*.
- **The provider strategy works.** The README credits the techniques: shader ocean ported from **poseidon** (WebGL-toon counterpart — vertex-displaced bands, shore heightmap baked from the track's own terrain function, fresnel mirroring the exact sky gradient, two-scale sun glitter, Snell-window backface), wind grass from **gaia** (one instanced mesh, per-vertex sway weights, one draw call for thousands of tufts), trees from **dryad**, surfaces from **apate** (world-scaled UV grain, moisture/slope-based terrain blending). `VENDOR_INTEGRATIONS.md`'s wrap-don't-build policy, demonstrated.
- **Generative music that listens.** Pads/arp/bass/drums scheduled per-16th with swing; **speed opens the filter and thickens the arp, drifting bends the tape like a warbling cassette, checkpoints ring FM bells**; engine = detuned saws through a load-sensitive lowpass; optional Web MIDI note-out. Gameplay state *is* the composer's controller data.
- **Headless sim tests.** `npm test` = loop closure + full GP/ZEN races to completion, headless. `dev/tour.mjs`, `dev/themes2.mjs`, `shots*.mjs` = Playwright visual-regression tours of all four roads. `?safe` and `?reset` boot flags = cheap resilience.
- **Deterministic rival AI.** Racing line + rubber band, skill/aggro traits, `mulberry32` seeded per grid slot — `RUNTIME.md`'s per-machine determinism used for AI, so races reproduce.
- **HOOD cam cockpit.** First-person bodywork is hidden (it yawed into the lens mid-drift); a camera-locked dash takes its place — impossible to clip. The "witness camera" discipline in miniature.

### Where it lands

`GAMEPLAY_FRAMEWORK.md` (`@3jse/vehicle` arcade mode) · `ATLAS` driving FeelSpec anchors + Vehicle Feel Lab · `AUDIO.md` generative section · `TEMPLATES.md` Racing · `PERFORMANCE.md` procedural/instancing precedents · harness racing recipe.

---

## 3. UBURT / PULSEHOP — Q*bert rebuilt as a musical instrument

The fundamental tile-hopping spatial grammar of Q*bert, rebuilt so that **playing well *is* the music**. Three.js + raw WebAudio, no samples, no build step.

### What it proves

- **Gameplay-as-music.** Every hop is quantized to the 16th-note grid (you can only ever play "in time"); tiles map to scale degrees (rows = octaves, columns walk the scale); fresh tiles are the lead voice, completing one is a chord stab, combos fade in groove layers (kick/hats/snare/bass/echo arps); board clear = ascending glissando + cadence. **MIDI out** on ch 1/2/3/10 with MIDI clock, and an **OSC-over-WebSocket bridge** (`/pulsehop/note`, `/pulsehop/combo`, `/pulsehop/bpm`…) — the game literally sequences a DAW. This is the far end of `AUDIO.md`'s event-driven triggering: not "sounds respond to events" but "the gameplay IS the score." An Atlas **Audio/Style lens** should look like this.
- **Intent-relative input on diagonal boards.** WASD means *screen directions*, not board directions — Left always moves you leftward on screen, momentum keeps you zigzagging, glowing key letters float over the exact tile each key takes you to. Ledge guard: one press toward the void makes Pip teeter, only a repeated press leaps. Input UX patterns for isometric games worth a mechanics-registry entry.
- **World-as-sim inside an arcade game.** WORLD I is an infinite Mandelbrot-terraced voxel sandbox: water/lava flow downhill as a **live cellular automaton** with Gerstner-wave surfaces, water + lava = obsidian, grass wears swaying tufts (gaia technique), trees are procedurally seeded (dryad technique), ice slides you, lava bounces you, column height = pitch. WORLD III is a bounded arena of instanced cubes driven by a **living Julia set** — the terrain breathes as you play. `WORLD_SYSTEM.md`'s "one mechanism, five shapes" proven at the small end.
- **Performance discipline.** Everything pooled (particles, rings, text sprites) — **zero per-frame allocation** in the hot loop; bloom at half resolution; DPR capped at 2.
- **Call-and-response boss.** The Conductor lights a melody, you echo it back — rhythm mechanics as a game system, not a minigame bolted on.

### Where it lands

`AUDIO.md` generative/musical section · `GAMEPLAY_FRAMEWORK.md` (hop grammar, rhythm/sequencer systems) · `WORLD_SYSTEM.md` small-world precedent · `PERFORMANCE.md` pooling · new template **"Musical Hopper"** · harness recipe.

---

## 4. DAMN BEAVERS — Dwarf Fortress-class systemic simulation

A systemic beaver-civilization simulator: hydrology, ecology, engineering, economy, culture, history. 11 phases, 183 tasks, 1,534 tests across 256 files, 9 composed gate tests — all green.

### What it proves (the architectural laws, in working code)

- **The simulation is authoritative.** The renderer, animation system, UI, audio, particles, and Chronicle *observe* simulation state; they do not own truth. "A mesh is not a tree. A shader is not water. An animation is not work. A particle is not an item. A UI icon is not inventory." The simulation must make sense headlessly. This is `RUNTIME.md`'s headless mode, `ENTITY_COMPONENT_MODEL.md`'s data-first components, and Atlas's "viewport is a witness" — stated as a law and enforced for a year of development.
- **Systems, not scripted outcomes.** `DamFloodEvent` and `BeaverGetsDrunk` are *forbidden*; you implement water + pressure + flow + obstruction + permeability, liquid composition + ingestion + metabolism + motor control, and the events emerge. "Events may **record** what happened. Events must not secretly make it happen."
- **A working ECS that validates the object model almost line-for-line.** `ComponentStore` with typed component tokens (`defineComponent<T>` — identity is the token reference, duplicate names deliberately non-interfering and *surfaced*), a **JSON-plain value contract** (primitives, arrays, plain objects, EntityId round-trips as numbers — no functions/Maps/class instances), snapshot/restore with versioning. `EntityId` registry: stable persistent identity for every important entity. `SimulationClock`: fixed ticks, nanosecond precision, a **MAX_SPEED_MULTIPLIER bound** so a UI bug can't turn one `advance()` into hundreds of millions of ticks, and corrupted-snapshot rejection on restore. These are the exact choices `ENTITY_COMPONENT_MODEL.md` and `PROJECT_FORMAT.md` spec — with the edge cases already discovered.
- **Determinism + counterfactual replay, proven.** Seeded `Random`, and P11-13 implements fork/alter/diff over snapshots — "what would have happened if the dam had held" as a testable query. `RUNTIME.md`'s per-machine determinism + save/replay, demonstrated in production.
- **Gate sentences.** Every phase ends with a *written gate sentence* ("The parity matrix has no unexplained red rows…") and a composed gate test that proves both halves — including the honesty rule that non-covered rows are re-marked rather than papered over. This is the harness's evidence gate formalized; `build.runTests` should adopt the pattern.
- **The test pyramid.** unit / simulation / benchmark (14-family × 7-seed emergence suite) / replay / visual / gate — the full `BUILD_DEPLOYMENT.md` `build.runTests` vision, already running.
- **Projection architecture.** `sim/` is pure; `presentation/projection/` maps entity → render → chunk. Clean separation that made rendering *replaceable* while the sim kept passing — the same seam the engine draws between layers 0–1 and everything above.
- **Grounded explanation with a no-fabrication proof.** P11-12: natural-language explanation of sim state that is *structurally* unable to invent causes. This is exactly what Atlas's **Explain** action and the Agent API's grounded `scene.query` are for.
- **Concentric-rings roadmap.** "Every completed phase must leave behind a playable game" — the roadmap discipline `ROADMAP.md`'s exit criteria are written in.

### Where it lands

`ENTITY_COMPONENT_MODEL.md` validation · `RUNTIME.md` determinism/replay · `WORLD_SYSTEM.md` watershed streaming · `PLUGIN_ARCHITECTURE.md` references for `@3jse/water`/`@3jse/terrain` · harness gate-sentence discipline · `ATLAS` Explain/witness · new template **"Colony Sim"**.

---

## 5. BREAKING WAVES — parametric first-person surf

A standalone TypeScript demo of the **parametric breaking-wave + FFT ocean** technology from finalsurf: WebGPU renderer, orbit camera, EXR skybox, Tweakpane controls, and a 2D real-time visualization of the leading wave's parametric profile. This is the first-person counterpart to 3JSURF's third-person game.

### What it proves

- **Parametric breaking waves composited onto an FFT ocean.** The breaking wave is *painted by shader, not meshed by hand*: a storage buffer holds up to `MAX_WAVES` slots; `composeWaves` runs a winner-take-all loop over active slots; `waveProfile` blends a trochoidal swell into a breaking shape, **rotates the lip, and shrinks the front face inward to open the barrel cavity** — returning `vec4(dx, dy, dz, foamMask)` as the single entry point used by displacement. A full wave timeline (lip onset → geometry fades back to swell → residual → fade-out) lives in shader constants. This is `RENDERING.md`'s "orchestration over Three.js" applied to the hardest surface in web 3D, and the natural upstream for `@3jse/water`'s breaking-wave authoring.
- **Tweakpane = FeelSpec knobs, already working.** Every meaningful parameter — amplitude, wavelength, peel strength, lip thickness, face steepness, curl amount, foam onset, inner-shrink — is a live tweakable control. This is exactly Atlas's "direct parameter change, updated live where possible," running today as a demo rather than a spec.
- **The profile visualization is a witness.** A 2D real-time plot of the leading wave's cross-section sits beside the 3D view — the abstract graph and the rendered surface cross-checking each other. Atlas's witness doctrine in miniature.
- **WebGPU adapter-limit engineering.** The assemble pass needs 8 simultaneous storage textures (4 cascades × 2 layers), so the demo requests `requiredLimits: { maxStorageTexturesPerShaderStage: 8 }` explicitly — adapters that default lower would otherwise fail to compile. A real, shipped lesson for the render-graph's WebGPU init path (`PERFORMANCE.md`).
- **Demo ergonomics.** The spawn line is kept close to the break point so the first lip throws within ~7 seconds; the scheduler enforces minimum lateral separation of one wavelength so waves never overlap; each wave retires through a fade-out lifecycle rather than a pop.

### Where it lands

`RENDERING.md` wave compositing · `PERFORMANCE.md` WebGPU limits · Atlas live-tuning + witness · `@3jse/water` upstream · surf recipe (first-person variant).

---

## 6. MANDELHOP — the infinite frogger descent

An endless frogger journey into a recursive psychedelic garden — then a full temporal platforming campaign (9 worlds × 4 stages + Guardian bosses, 8 progressive powers, 5 time powers). ~120 fps on Apple Silicon, three.js vendored, no internet needed.

### What it proves

- **Deterministic, unfairness-free core.** The stated technique: *"all lanes are constant-velocity with seeded generation per run; water waves, bobbing, pulse visuals are render-only. Collision uses grid math on the same numbers you see."* Gameplay math and render math are the same numbers — the generalization of 3jsurf's attach-by-construction lesson — and every kill must be reactable (complications unlock with depth, each announced by a banner the first time it can appear). This is `RUNTIME.md`'s determinism posture and the harness's "no unfair deaths" QA rule as a design principle.
- **Progressive complication unlocks.** Dragonflies at depth 40, sinking lilies at 60, non-Euclidean torus portal rows at 90, sheared space at 120, mirror zones at 150, Mandelbrot-pulse lane speeds at 200, chompers at 250 — difficulty as *repertoire*, taught one mechanic at a time.
- **Time powers through one clock.** SLOW / FREEZE / PHASE SHIFT / REVERSE / ACCELERATE all route through `worldDt = dt * scale` — frog responsive, world scaled, one source of time. The runtime's fixed-step accumulator with a time-scale is exactly this; REVERSE (rebuild fallen ruins) is the counterfactual replay of dambeavers as a *player power*.
- **12 Hz ghost replay.** TIME RUN records every run at 12 Hz and replays the best as a translucent frog with a fractal ribbon. Ghost racing, replays, and time-travel debugging need nothing fancier — recorded input/state at 12 Hz is enough (`RUNTIME.md`'s save/replay claims, demonstrated).
- **Player agents as QA.** `qa/bot.mjs` drives the *real game* with heuristic hoppers (new/pro skill), reports deaths, completion, and — critically — classifies whether any death was **"unfair" (camera/system fault)** vs. the player's own mistake. A QA suite of 26 scripts: smoke error sweep, screenshot tours, boss kill-path E2E, state traces. This is the harness's gameplay-qa gate with teeth, and a pattern the `mechanics-harness` skill should adopt everywhere.
- **Model third-party notices.** `LICENSES.md` documents the two adapted techniques (poseidon spectral water, gaia grass genomes/wind) with the MIT text reproduced and the adaptation described — the exact provenance discipline `VENDOR_INTEGRATIONS.md` and `SECURITY.md` require.
- **Infinite generation on a budget.** Rows generated 45 ahead / pooled 25 behind; vegetation in 24-row chunks keyed to biome genomes; water as one world-anchored plane masked per-row by a sliding 128-row DataTexture; biomes cross-fade sky, water, flora, traffic, and the music's root every 30 rows. `WORLD_SYSTEM.md`'s streaming, at arcade scale.
- **Generative audio as progression.** Hops climb a pentatonic ladder, biome crossings swell, dragonfly telegraphs glissando, wormholes swoop, checkpoints resolve the phrase — and FLOW STATE turns rhythm-chained landings into generative percussion with score ×2. No recordings.

### Where it lands

`RUNTIME.md` determinism/time-scale/replay · `WORLD_SYSTEM.md` streaming · `AUDIO.md` generative section · harness `mechanics-harness` skill (player-agent pattern) + frogger recipe · new template "Endless Hopper" (`TEMPLATES.md`).

---

## What the harness incorporates now

The following are *already incorporated* into `3JSE_Harness_v0.1/`:

- **Mechanics registry** (`mechanics.json`) — six new entries: `surf_feel` (3jsurf's measured numbers + scaling laws), `first_person_surf` (breaking-waves' parametric compositing + live knobs), `arcade_racing` (zendrive's demand-capacity model + drift feel), `hop_grammar` (pulsehop's intent-relative input + rhythm), `endless_hopper` (mendalhop's unfairness-free core + time powers + ghost replay), `systemic_sim` (dambeavers' laws: sim-authoritative, systems-not-scripts, gate sentences).
- **Recipes** — four new: `arcade-racer.md` (zendrive), `musical-hopper.md` (pulsehop), `frogger-endless.md` (mendalhop), `colony-sim.md` (dambeavers); `surf-game.md` updated to cite 3jsurf as its canonical reference implementation and breaking-waves as the first-person variant.
- **New skill** `mechanics-harness` — the reference-game tooling promoted to standard practice: a headless mechanics check (gameplay logic runs with no renderer/canvas/DOM and its numbers are asserted), feel measured as numbers, per-frame invariant soaks with a scripted pilot, single-term debug isolation, and **heuristic player agents** (mendalhop's `bot.mjs` pattern: drive the real game, report deaths, classify "unfair" deaths as system faults). Applies to every project, not just surf games.
- `docs/FILE_INDEX.txt` updated; `node scripts/verify-harness.mjs` remains green.

## What this means for Atlas

- **Driving FeelSpec** has real anchors: zendrive's demand-vs-capacity model *is* the `stability`/`driftAssist`/`steeringResponse` axes, and its PROG/palette system is a Style Graph dataset.
- **Surf FeelSpec** has measured anchors: 3jsurf's `feel.mjs` table (face run, crossing time, peak speed per break) is the measurement the Feel Lab should produce.
- **Feel Lab scenarios** already exist as executables: 3jsurf's `feel.mjs`/`soak.mjs`/`tubeshot.mjs` and zendrive's `dev/` tours are exactly the "focused test environments" `3JSE_ATLAS_FULL_PLAN.md` §17 specifies.
- **The witness** is already real: dambeavers proves the sim-authoritative seam, 3jsurf's soak invariants prove per-frame witness checks catch the bugs screenshots miss, and breaking-waves' live 2D profile plot is the witness beside the viewport.
- **Live tuning and replays** are already real: breaking-waves' Tweakpane panel is Atlas's direct-parameter-change tier, and mendalhop's 12 Hz ghost replay is the time-scrubbing/history lens with a fraction of the machinery.

## Asset inventory — what can be shared today

| Asset | Source | Notes |
|---|---|---|
| Surf rig + baked clip library | 3jsurf `public/assets/` (`skeleton_rig.glb`, `man_rigged.glb`, `surf_anims.glb`) | Mixamo clips baked; retarget-ready per `ANIMATION.md`'s humanoid standard |
| Sharks ×3, floaties ×3, buoy | 3jsurf `public/assets/` | Sketchfab exports — license/attribution ledger required per `SECURITY.md` |
| Sky panoramas ×2 | 3jsurf `public/sky/` | Baked HDRI-style |
| Poseidon ocean (vendored) | 3jsurf `src/render/poseidon/` | MIT — already matches `VENDOR_INTEGRATIONS.md`'s pinned-vendor policy |
| Arcade vehicle model | zendrive `js/physics.js` | ~120-line track-space physics — reference for `@3jse/vehicle` |
| Shader ocean / wind grass / trees / surfaces | zendrive `js/` | WebGL-toon ports of the Owen pantheon — reference implementations |
| Sequencer + MIDI/OSC bridge | pulsehop `js/audio/` | Gameplay-as-music architecture |
| Voxel CA fluids, living-fractal world | pulsehop `js/world/` | World-as-sim patterns |
| ECS core (ComponentStore/Clock/EntityId) | dambeavers `src/sim/core/` | The object-model spec, already implemented |
| Hydrology/economy sims | dambeavers `src/sim/` | Reference for `@3jse/water`/economy gameplay packages |
| Parametric breaking-wave compositor | breaking-waves `src/ocean/` | TypeScript/TSL — storage-buffer wave slots, lip rotation, barrel cavity; upstream for `@3jse/water` |
| EXR skybox + fallback | breaking-waves `assets/skybox.exr` | Gradient fallback path |
| Time powers / ghost replay / player-agent QA | mendalhop `js/timemagic.js` `js/ghost.js` `qa/` | One-clock time scaling, 12 Hz replay, unfair-death classification |
| Infinite-track generation | mendalhop `js/world.js` `js/flow.js` | 45-ahead/25-behind pooling, biome genomes, DataTexture water mask |

The six projects are not merely demos — they are the plan's Phase 1–4 exit criteria running ahead of schedule: the harness is the development system, these games are the evidence, and the engine's job is to make both first-class.
