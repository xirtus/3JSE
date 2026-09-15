# Xirtus Off-Road Overhaul Plan
## Gaussian causal-field vehicle system for the summer (and winter) mountain sports game

**Status:** Proposed architecture + implementation program
**Repo:** `xirtus/3JSE`
**Builds on:** `docs/GAUSSIAN_CAUSAL_FIELD_PLAN.md` (harness half shipped) · `docs/REFERENCE_GAMES.md` (ZENDRIVE arcade reference) · `docs/3JSE_ATLAS_FULL_PLAN.md` (driving FeelSpec) · `3JSE_Harness_v0.2/` (reuse ladder, mechanics-harness, field skills)

---

# 0. EXECUTIVE DIRECTIVE

Do not build "off-road terrain" as a visual feature.

Build a **causal-field vehicle system** in which:

- A trail is not a mesh — it is a coarse causal field whose cells hold `moisture`, `liquidFraction`, `density`, `compaction`, `temperature`, `height`, and `looseness`.
- Gravel, mud, puddles, and rock are **response cards** evaluated on that field — not named materials.
- The tires sample the field and get back one number set: friction, sink, rolling resistance, adhesion, slip.
- Gaussian splats are the **visual projection** of that same field: a puddle you see is a puddle the tires feel. Gameplay math and render math are the same numbers.
- The rock-crawler's "AAA Forza feel" is **a table of measured numbers** — suspension, torque, grip, weight transfer, tip-over margin — not vibes.

The one-sentence bet:

> **A rigid-body crawler samples a coarse causal field; the field returns surface response; the same numbers drive tire grip, suspension travel, tip-over, splat appearance, and VFX.**

---

# 1. THE CRITICAL INSIGHT: TWO TRACKS + ONE JOIN

"Off-road driving" is two problems that must stay decoupled.

## Track A — the chassis (vehicle feel)

A real rigid-body vehicle: chassis + 4 wheels + suspension + drivetrain + torque
curve + differential + weight transfer. This is a **simulation**, not ZENDRIVE's
track-space arcade model.

- **Reuse rung:** Three.js's official `physics_rapier_vehicle_controller` example
  (raycast wheels, suspension, drivetrain on Rapier) — MIT, part of Three.js,
  already flagged in `packages/vendor/shop-candidates.json`. Wrap it, don't rewrite it.
- **New package:** `@3jse/vehicle` with two modes:
  - `arcade` — ZENDRIVE's demand-vs-capacity track-space model (existing reference).
  - `sim` — rigid-body rock crawler (this plan).
- Rapier stays the rigid-body default (`docs/PHYSICS.md`). The field does **not**
  replace physics; it supplies contact parameters into the physics adapter.

## Track B — the surface (causal field)

Gravel, mud, puddles, rock are **response cards** on the `WorldField` (already
built headless in `experiments/field-world/src/`). State changes; the card
evaluates state → surface response.

## The join: `TireResponse × SurfaceResponse → contact`

This is the load-bearing idea. One surface state produces, from the same source:

- visual: gravel bead scatter / puddle reflection / mud gloss / rock relief (splats)
- mechanical: friction coefficient, sink depth, rolling resistance, adhesion, slip
- VFX: dust, splash, gravel spray, mud fling
- audio: tire slip, gravel crunch, suspension creak

No subsystem keeps its own hidden "how wet is this" variable. One moisture update
drives all of it.

---

# 2. SURFACE TAXONOMY (response cards, not materials)

Each is a walk through the constitutive expert basis (`elastic · granular ·
wet-cohesive · fluid-like`) driven by live state — never a `WetMudMaterial` swap.

| Surface | Dominant experts | Grip | Sink | Rolling resistance | Signature |
|---|---|---|---|---|---|
| Loose gravel | granular | low | low-med | high | bead displacement, dust, slide on throttle |
| Hardpack dirt | elastic+granular | med | low | med | firm, forgiving |
| Mud / puddle | wet-cohesive → fluid-like | collapses with `liquidFraction` | high | high | viscous drag, splash, hydroplane at speed |
| Wet rock | elastic, low µ | very low | none | low | the crawler's real enemy — traction loss on torque |
| Dry rock | elastic, high µ | very high | none | low | crawl heaven — grip with no sink |
| Sand | granular | med-low | high | high | deep sink, momentum death |

State channels driving the transition: `moisture`, `liquidFraction`, `density`,
`compaction`, `height` (unevenness), `looseness` (gravel bead displacement).

---

# 3. DIFFICULTY — "LAYING INTO IT" AS NUMBERS

Difficulty is not "harder terrain." It is trail sections that push these
**measured margins** near — and past — their limits, and weather that moves them.

| Metric | Formula (headless-testable) | What it gates |
|---|---|---|
| Grip budget | `µ(surface) × normalForce(weightTransfer)` per wheel | traction limit; wheel slip |
| Required torque | `m·g·sin(θ)·r_wheel` + rolling resistance | can it climb the obstacle |
| Tip-over margin | lateral `g` vs `trackWidth / (2·centerOfMassHeight)` | rollover |
| Clearance | approach / departure / breakover angles | getting hung up |
| Wheel slip | `ω·r_wheel` vs ground speed | spinning out on gravel/mud |

"Laying into the difficulty" concretely:

- **Gravel climb**: low grip + high rolling resistance → you must manage throttle to
  avoid wheelspin; lock the diff, keep momentum, or slide back.
- **Puddle section**: high `liquidFraction` → grip collapse + viscous drag; at speed
  you hydroplane; slow and steady you sink.
- **Rock crawl**: dry rock = grip; wet rock = traction loss; torque management +
  articulation + tip-over are the whole game.
- **Rain weather input**: shifts every surface toward wet (gravel → slick, dirt →
  mud, rock → wet rock), pushing grip budgets below required torque.

---

# 4. ROCK-CRAWLER "AAA FORZA FEEL" AS A MEASUREMENT TABLE

"Forza feel" is adopted as **polish references** (weight transfer, camera, audio,
haptics), not copied code. "Rock crawler" is a different regime than Forza's
high-speed arcade-sim — the feel reference stack is Forza (polish) + SnowRunner /
MudRunner (deformable-surface grip management) + BeamNG.drive (weight transfer).

Feel dimensions (each maps to an Atlas `vehicle.sim` FeelSpec, calibrated as numbers):

| Dimension | What we measure (lab, not scene) |
|---|---|
| Suspension | spring rate, damping, per-axle travel (articulation), anti-roll |
| Drivetrain | engine torque curve, gear ratios, low-range crawler gear, engine braking |
| Differentials | open / limited-slip / locked — when each wheel gets torque |
| Tire | friction circle (longitudinal+lateral), slip curve, grip vs surface µ |
| Weight transfer | center-of-mass height, roll/pitch coupling, load shift under accel/brake/climb |
| Steering | low-speed steering authority, Ackermann, crawl-speed responsiveness |
| Camera | chase + hood + wheel witness cams, low-speed framing that reads articulation |
| Audio | engine load, tire slip squeal, gravel crunch, mud fling, suspension creak |

Each becomes a **headless invariant test** (mechanics-harness doctrine):

- "crawler climbs a defined rock step of height H at torque T without wheelspin"
- "crawler tips over at lateral g > X on dry rock, but not below"
- "crawler stalls/spins at grip µ < Z on wet rock, engine-brakes on descent"

---

# 5. GAUSSIAN SPLAT PROJECTION (the visual half, same numbers)

| Field state | Splat projection |
|---|---|
| `looseness` / `compaction` | gravel bead splats displace/scatter as tires pass; ruts form from compaction |
| `liquidFraction` | puddle splats gain reflection/specular; splash + tire-spray VFX (`@3jse/vfx`) |
| `height` / `density` | uneven trail → splat covariance/opacity; roughness reads as relief |
| `moisture` | mud gloss/darkening; wet rock specular |

The field is authoritative; the splats are witnesses. The splat *count* is
independent of the field *cell count* (dual-resolution gate, already proven headless
in `exp02`). No per-splat JS loop; projection runs cluster-level / GPU.

---

# 6. REUSE LADDER (routing ledger — mandatory)

| Capability | Existing solution found? | Selected provider/reference | Why | Fallback |
|---|---|---|---|---|
| Rigid-body vehicle chassis | No `@3jse/vehicle` yet | Three.js `physics_rapier_vehicle_controller` (MIT) | Official Rapier raycast-suspension example; wrap, don't rewrite | Hand-build raycast suspension on `@3jse/physics-rapier` |
| Causal field + surface response | Yes — `experiments/field-world/` (headless) | Promote to `@3jse/field` (evidenced) | Field/ResponseCard/contact already proven headless | Keep in experiment pkg |
| Gaussian splat renderer | No (headless projection only) | Three-native GS or Brush (license-verify first) | Standard glTF path (`KHR_gaussian_splatting`) | Custom WebGPU splat backend |
| Dust/splash/gravel VFX | Yes — `@3jse/vfx` | `@3jse/vfx` particle system | Existing pooled particles | — |
| Trail terrain mesh | Yes — `@3jse/terrain` + `@3jse/render` | Existing chunk mesher + TSL splat material | Height field drives terrain; field drives surface | — |
| Vehicle camera | Yes — `@3jse/character` CameraRig | Vehicle-specific rig (chase/hood/wheel) | Reuse rig pattern | — |

---

# 7. VERTICAL SLICE (smallest playable loop)

One sector, one rock crawler, four sections:

```
gravel climb  →  mud / puddle section  →  rock crawl  →  downhill descent
```

- Weather input: **rain** makes the mud wetter, the rock slicker, the gravel looser.
- Playable loop: drive the whole trail; three genuinely different feels; difficulty
  emerges from the field, not scripted events.
- The same field later serves the winter sports (ski/board/snowmobile) and MTB — the
  surface is shared, the season is a climate input (`GAUSSIAN_CAUSAL_FIELD_PLAN.md` §24–25).

---

# 8. GATES (field-qa + gameplay-qa + mechanics-harness)

1. **Cross-projection invariant** — one moisture update drives visual puddle + tire
   grip loss + splash, from one source. No hidden wetness variable anywhere.
2. **Dual-resolution** — field step scales with field cells, not splat count;
   changing visual density does not change the drive result (`exp02`).
3. **Headless** — chassis + contact + surface response run and are asserted without
   a renderer; the field state dump is the evidence.
4. **Feel-as-numbers** — the §4 invariant tests pass in a lab, not a playable scene.
5. **No scripted outcome** — no `UseMudMaterial`, no `TriggerStuckEvent`; grep the
   experiment for forbidden verbs.
6. **Visual** — headed capture of gravel scatter, puddle reflection, mud gloss, rock
   relief against a real Gaussian backend.
7. **Performance** — measure field step, physics step, splat render, draw calls.

---

# 9. COMMIT SEQUENCE

1. `docs:` this plan (already present as this file).
2. `vendor:` license-verify + vendor a Gaussian backend (Three-native GS / Brush).
3. `vehicle:` `@3jse/vehicle` sim mode — rigid-body chassis from the Rapier vehicle
   controller example, headless-tested (suspension/drivetrain/differential/weight transfer).
4. `field:` promote `@3jse/field` from `experiments/field-world/` once evidenced;
   add `looseness`/`height` channels + gravel/mud/puddle/rock ResponseCards.
5. `contact:` the join — `TireResponse × SurfaceResponse → contact` — headless
   invariant tests (µ, sink, rolling resistance, slip).
6. `splat:` Gaussian gravel/puddle/uneven projection driven by field state.
7. `slice:` the four-section vertical slice + rain weather input.
8. `feel:` Forza-feel pass — suspension/torque/camera/audio calibrated as numbers.
9. `evidence:` field-qa + gameplay-qa + performance gates recorded.

---

# 10. DO NOT DO

1. Do not build the crawler on ZENDRIVE's track-space model (it is arcade).
2. Do not replace Rapier with a custom physics engine.
3. Do not make gravel/mud/puddle named materials with per-surface gameplay scripts.
4. Do not make the visual splats authoritative over the field.
5. Do not claim "AAA Forza feel" without fresh, measured evidence.
6. Do not put a per-splat physics loop in the hot path (dual-resolution).
7. Do not vendor a Gaussian backend without license + provenance review.
8. Do not build both a winter and a summer terrain system — one field, two climates.
