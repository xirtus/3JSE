# 3JSE Metaspace Capability Architecture

The organizing document for turning Xirtus Mountain from a mountain-sports game
into the first complete Xirtus Metaspace. It supersedes the *framing* of
`docs/mountain-expansion-plan.md` and `docs/mountain-life-metaspace-plan.md`;
those remain authoritative for the mountain-specific field/claim detail.

## Governing rule

> **Xirtus Mountain is not a collection of minigames. It is one persistent
> causal world in which skiing, driving, riding, shooting, building, climbing,
> camping, fighting and adventuring are different ways of inhabiting the same
> physical space.**

Modes change **rules, not worlds**. A cabin built in Builder is a fort in
Battle, an inn in Adventure, a checkpoint in Motor, a social hub in multiplayer.
A tunnel cut for a road race becomes a firefight location. The causal field
(`mountain-core/field/world-field.js`) and the terrain-claim engine
(`src/terrain-opportunity.js`) are the substrate every mode reads and writes
through; nothing ships as a parallel world layer.

## The layered architecture (grounded)

```text
                       XIRTUS METASPACE
                             │
                    (identity/passport)          ← FUTURE, out of scope now
                             │
                    persistent world/player state
                             │
┌──────────────────────────── 3JSE ────────────────────────────┐
│  WORLD FABRIC       terrain · caves · roads · trails ·      │
│                     buildings · biomes                       │
│  CAUSAL FIELD       snow/mud/water/soil/veg/damage/tracks   │
│  ACTOR FABRIC       human · horse · wildlife · vehicle ·    │
│                     creature · NPC                          │
│  ACTION FABRIC      move · mount · drive · shoot · build ·  │
│                     use · climb                             │
│  WORLD SIMULATION   weather · ecology · traffic · towns ·   │
│                     factions                                │
│  ACTIVITY DIRECTOR  races · runs · battles · quests ·       │
│                     camps · RPG events                      │
└──────────────────────────────────────────────────────────────┘
        │              │              │              │
     SPORTS         COMBAT         BUILDER        ADVENTURE
      mode           mode           mode            mode
```

### Where each fabric already lives

The point of this table is that 3JSE is *not* a greenfield rewrite — most
fabrics already have a mature implementation, and the job is to expose contracts
over them, not to re-implement them.

| Fabric | Existing implementation (authoritative) | What's missing |
| --- | --- | --- |
| Causal field | `mountain-core/field/world-field.js` (+ `surface-layers`, `trail-field`, `winter-response`, `response-cards`) | one new channel later (`charge`); structure support provider |
| World fabric | `src/terrain.js`, `src/dark-side/terrain.js`, `src/route-catalog.js`, `src/mountain-life/access-graph.js` | persistent editable geometry (super-terrain port); `BiomeRecipe` authoring |
| Actor fabric | `src/rider.js` (locomotion state machine), `src/athlete.js` (rig), `src/horse/horse-controller.js`, `src/mountain-vehicles.js`, `src/mountain-life/wildlife.js` | `ActorController` contract + `CombatController`; `integrity/health` per entity |
| Action fabric | `src/equipment/` (equip/switch), `src/mountain-vehicles.js` (winch), `src/climbing/`, `src/mountain-life/camp.js` (sit/lie/use) | `shoot`, `build`, `harvest` verbs |
| World simulation | `src/atmosphere.js`, `src/seasons.js`, `mountain-core/field/*` step, `src/mountain-life/wildlife.js` | town/faction sim (red-sands `town/*` donor) |
| Activity director | `src/main.js` mode/equipment/route state, `src/route-catalog.js`, `src/mountain-life/expedition.js` | `Activity` contract (profile toggles sub-controllers) |

### Contracts are adapters, not rewrites

The single most important implementation rule for this architecture:

> **Introduce contracts as thin adapters over existing proven systems. Never
> rewrite a working system to fit a contract.**

`rider.js` (~97 KB) is the locomotion authority and is covered by regression
checks. It stays authoritative. The `ActorController` contract is a narrow
interface (`canUseWeapon`, `aimTransform`, `fire()`, `integrate(dt)`) implemented
by a small adapter that *delegates* to `rider.js`/`athlete.js`. Only the small
surfaces combat actually needs get extracted, method by method, with the
existing checks still passing after each extraction. This honors the harness
rule "existing working systems outrank prose descriptions."

```text
ActorController (interface)
  ├─ LocomotionController   → adapter over rider.js + athlete.js + vehicles
  ├─ EquipmentController    → adapter over src/equipment/
  ├─ CombatController       → NEW (weapon + ballistics + damage), calls the above
  ├─ InteractionController  → adapter over camp.js / climbing / winch
  ├─ MountController        → adapter over horse-controller.js
  └─ AbilityController      → NEW (elemental causes), deferred to Adventure
```

## The five decisions ChatGPT got right (and how they land)

1. **Shooting is a player capability, not a minigame.** `CombatController` is
   mounted on any `ActorController`; it works standing, crouched, sliding,
   skiing, horseback, passenger, driving, climbing, under canopy. Emergent cases
   (biathlon, drive-by, combat snowmobile, wingsuit insertion) fall out of one
   controller with no per-case code.
2. **Two building systems + one generative third, all producing one
   `BuildEntity`.** `ConstructionGraph` is the shared structural model (§
   below); `TacticalBuildTool` (fast, grid, combat), `WorldBuildTool`
   (terrain-aware, persistent, structural), `GenerativeBuildTool` (intent
   anchors → procedural complex → editable pieces). All three write the *same*
   structure field; only their UX and time scale differ.
3. **`super-terrain` becomes the 3JSE Terrain Kernel.** Authoritative
   `TerrainDocument` (recipe + sculpt layers + CSG modifiers + splines + cave
   volumes + biome fields + build entities + causal surface fields) → compile →
   render geometry *and* physics geometry. `BufferGeometry` is compiled output,
   never authoring state.
4. **Biomes share one field language.** `BiomeRecipe` (climate, elevation/slope
   range, geology, soil, moisture, hydrology, vegetation, wildlife, materials,
   weather, audio, settlements, traversal affordances, encounter tables) derives
   from the same fields, so one slope *knows* snowDepth=0.74, skiQuality=0.91,
   buildability=0.18, coverQuality=0.73 at once — the exact predicate set
   `evaluateTerrainClaim` already aggregates.
5. **Vehicle combat is an adapter, not a new vehicle.** `VehicleCombatAdapter`
   adds hardpoints/turret/passenger weapons/armor zones/ammo to the *existing*
   `car-controller`/`crawler-controller`; the drivetrain/suspension/tire model
   stays authoritative, so a blown tire in a muddy ravine still matters.

## Corrections and scope notes (grounded in the code)

- **Do not do an up-front full refactor.** Introduce contracts as adapters over
  the proven systems (§ above). A big-bang refactor of `rider.js` would regress
  a heavily-checked system and violate the reuse-first rule.
- **`super-terrain` is WebGPU-only; Xirtus is WebGL2.** It enters 3JSE as a
  **reference implementation** (tier B, like `demiurge`/`minos`): port the
  algorithms (editable sections, modifier stack, exact CSG tunnels, forest-as-
  field, worker compilation), do not import its renderer. If the project later
  adopts `WebGPURenderer`, this port is the migration path. Its license must be
  verified before any derivative ships (the README did not surface a license in
  the fetched copy).
- **"Matrix Passport / Identity" is future work.** There is no identity/account
  system in the tree today; persistence is device-local (`WorldField.serialize`,
  `localStorage`). It is noted as a horizon, not a Phase-1 dependency.
- **Red Sands is a donor library, not an import.** Its `Weapon.js`,
  `CameraRig.js`, `Player.js`, `Horse.js`, `town/*`, `terrain/*`, `sim/*` are
  extraction sources (the pattern already used for `Horse` and `Wildlife`). Its
  *methodology* — deterministic capture, image regression, motion-artifact
  tests, adversarial camera scout — is the seed of a **3JSE Quality Harness**;
  Xirtus already runs this pattern (`scripts/*-check.mjs`, `review.mjs`,
  `scout-terrain`), so the work is to generalize it, not build it fresh.

## Mode profiles (rules, not worlds)

| Profile | Systems on |
| --- | --- |
| Freeride | ski, snowboard, paraglide, wingsuit |
| Motor | 4×4, motocross, snowmobile, racing |
| Outdoor | horse, hike, climb, camp, hunt |
| Combat | FPS/TPS, combatant AI, destructibles |
| Battle | combat + vehicles + tactical building |
| Builder | structural + generative building + terrain editing |
| Adventure | NPCs, dialogue, melee, magic, quests, dungeons |
| Everything | the actual Metaspace |

Each profile is an `Activity` that toggles a subset of an `ActorController`'s
sub-controllers and enables/disabled `INTERVENTIONS` budgets — the same way the
existing `mode` and `sport` state already gate equipment and vehicles in
`src/main.js`.

## Implementation order (corrected)

1. **Contracts as adapters** — `Actor`, `Action`, `WorldEntity`, `Activity`,
   `TerrainDocument`, `WorldState` interfaces over the existing systems. No
   rewrites. (Small; unblocks everything.)
2. **Combat slice** — extract Red Sands `Weapon`/`CameraRig` concepts; FPS then
   TPS presentation over one `WeaponSystem` + `ballistics` + `damage`. See
   `docs/combat-slice-plan.md`.
3. **`ConstructionGraph`** — ghost/snap/rotate/parent-child/damage/repair first,
   then Fortnite-fast controls; `BuildEntity` as the single structural type.
4. **Terrain Kernel** — `TerrainDocument` + compiler over a `super-terrain`
   reference port; preserve the causal field above the mesh (mesh = geometry/
   topology; field = physical state/response).
5. **Biome Compiler** — `BiomeRecipe` feeding terrain/ecology/forests/weather/
   wildlife/settlements from common fields.
6. **Generative construction** — Florence-style intent anchors → procedural
   complex → editable pieces.
7. **`VehicleCombatAdapter`** — hardpoints/turret/armor on existing vehicles;
   no drivetrain changes except damage-driven physical state.
8. **Adventure Mode** — last; inherits horses, weather, camps, cities, caves,
   building, weapons, climbing, vehicles, skiing, multiplayer identity; only
   quests/dialogue/factions/melee/magic/party/encounter-direction are new.
9. **Multiplayer** — authoritative server + field-delta replication over the
   field's existing fixed-step + operations log; sequenced last.

The detailed mountain-specific field mapping (which interface each feature
writes through) lives in `docs/mountain-life-metaspace-plan.md`.
