# 3JSE Atlas
## Semantic Game Atlas, FeelSpec System, and Agent-Native Visual Development Interface

**Status:** Product / architecture specification  
**Project:** 3JSE Harness  
**Purpose:** Replace traditional visual scripting / Blueprint-style authoring with a clearer semantic navigation, tuning, and agent-control system for games built with Three.js / WebGPU and the 3JSE Harness.

---

# 1. Executive Summary

3JSE Atlas is not a visual programming language and should never become one.

Its purpose is to make a game **understandable, navigable, tunable, debuggable, and editable through an AI agent** without forcing the human to work directly in code or reconnect hundreds of execution wires.

Traditional Blueprint systems expose implementation:

> Event → Branch → Variable → Function → Cast → Tick → Set Value

Atlas exposes meaning:

> Player → Movement → Jump → Landing → Camera → Animation → Score

The core distinction is:

- **Code is for agents.**
- **Graphs are for understanding.**
- **FeelSpec is for intent and tuning.**
- **The viewport is a witness.**
- **Tests and runtime probes prove changes.**

Atlas is generated primarily from the real project. It is not the canonical source of program logic. The TypeScript / JavaScript source remains ordinary source code. Atlas builds a semantic model on top of it from:

- declared 3JSE system metadata,
- imports and dependency analysis,
- ECS components,
- events and signals,
- state stores,
- providers,
- assets,
- scene hierarchy,
- tests,
- profiling,
- runtime telemetry,
- FeelSpec,
- recipes,
- mechanic profiles,
- git history,
- agent change history.

The human navigates this model visually, selects a system, and either:

1. directly changes safe exposed parameters, or
2. tells the agent what should change.

The agent receives narrowly scoped context, modifies the real project, runs verification, and Atlas updates automatically.

This is intended to be simpler than Blueprints while still giving the user greater visibility into the game.

---

# 2. Core Design Principles

## 2.1 Atlas must not become another programming language

The graph is not source code.

Never require the user to manually construct low-level execution logic such as:

```text
Tick
→ Branch
→ Get Component
→ Add Vector
→ Set Position
```

If Atlas begins requiring hundreds of interconnected execution nodes, it has failed.

Atlas nodes represent **semantic systems and meaningful design concepts**, for example:

```text
PLAYER
├── Movement
├── Jump
├── Camera
├── Animation
├── Combat
└── Inventory
```

Drilling into `Jump` may reveal:

```text
JUMP
├── Takeoff
├── Air Control
├── Apex
├── Double Jump
└── Landing
```

Drilling into `Landing` may reveal tunable parameters and implementation references.

---

## 2.2 Progressive disclosure is mandatory

The user should see only the amount of detail needed at the current zoom level.

The semantic zoom hierarchy is:

```text
GAME
↓
DOMAIN
↓
SYSTEM
↓
MECHANIC
↓
SUBSYSTEM
↓
TUNING PARAMETERS
↓
FILES / TESTS
↓
CODE
```

Examples:

```text
GAME
→ Traversal
→ Player
→ Jump
→ Landing
→ landingTolerance
→ landing.ts
```

The user should never be forced to start from source files.

---

## 2.3 Atlas is generated from the project

The user should not have to redraw Atlas after code changes.

The Atlas compiler builds its model from:

- `defineSystem()` registrations,
- FeelSpec declarations,
- file ownership,
- static import graph,
- events / signals,
- ECS relationships,
- state store selectors,
- scene registration,
- provider metadata,
- asset registry,
- tests,
- runtime instrumentation.

Manual graph authoring should be exceptional.

---

## 2.4 The viewport is a witness

The viewport answers:

> What does the game currently look and feel like?

Atlas answers:

> What is this game made of?  
> Why did this happen?  
> What controls it?  
> What depends on it?  
> What should I change?

The viewport and Atlas should be linked but conceptually separate.

---

## 2.5 Every meaningful node is an agent control surface

Selecting a node should expose:

- purpose,
- status,
- dependencies,
- dependents,
- provider,
- owned files,
- tests,
- current runtime cost,
- FeelSpec controls,
- recent history,
- agent actions.

Every node should support:

- **Explain**
- **Tune**
- **Ask Agent**
- **Test**
- **Profile**
- **Show Dependencies**
- **Show Events**
- **Show Assets**
- **Show History**
- **Open Files**
- **View Code**
- **Replace Provider** where applicable

---

# 3. Atlas User Model

Atlas assumes three classes of change.

## 3.1 Direct parameter change

Safe, known tuning values can be changed directly.

Examples:

```text
Jump height         1.7 → 2.0
Camera distance     5.5 → 6.2
Drift assist        0.62 → 0.70
Bloom intensity     0.40 → 0.25
Grass density       0.80 → 0.65
```

These should update live where possible.

---

## 3.2 Semantic / structural change

The user describes the goal.

Example:

> Make clean landings preserve almost all momentum, but punish sideways landings much harder.

Atlas scopes the agent to:

```text
player.tricks.landing
player.physics
combo
animation
related tests
current FeelSpec
```

The agent edits source code.

---

## 3.3 Provider change

The user changes a major implementation source.

Example:

```text
WATER
Current provider: SimpleWater
Suggested provider: Poseidon
```

Atlas shows:

- expected benefits,
- dependencies,
- compatibility,
- performance impact,
- migration plan,
- affected systems.

The agent performs the migration.

---

# 4. Semantic System Model

Atlas requires a lightweight semantic contract.

A system may declare:

```ts
defineSystem({
  id: "player.tricks",
  label: "Trick System",
  domain: "gameplay",

  purpose: "Controls aerial tricks, landing quality, combo continuity, and scoring.",

  owns: [
    "src/gameplay/tricks/**"
  ],

  requires: [
    "player.physics",
    "input.actions",
    "player.animation"
  ],

  emits: [
    "trick.started",
    "trick.completed",
    "combo.changed"
  ],

  listens: [
    "player.airborne",
    "player.landed"
  ],

  knobs: {
    airControl: {
      type: "number",
      min: 0,
      max: 1,
      default: 0.72,
      category: "air"
    },

    landingTolerance: {
      type: "number",
      min: 5,
      max: 90,
      unit: "degrees",
      default: 32,
      category: "landing"
    }
  },

  tests: [
    "tests/tricks/**"
  ]
})
```

This does not define the implementation.

It defines how Atlas understands the implementation.

---

# 5. Atlas Graph Types

Atlas should provide multiple visual lenses over the same project.

Users switch views rather than trying to encode everything into one graph.

---

## 5.1 System Map

Default view.

Answers:

> What systems exist and how are they connected?

Example:

```text
                    PLAYER
                      │
        ┌─────────────┼────────────┐
        ▼             ▼            ▼
     PHYSICS       ANIMATION      CAMERA
        │
        ▼
      TRICKS
        │
        ▼
      COMBO
```

Node size may communicate importance or runtime cost.

Edges should be typed:

- dependency,
- event,
- state,
- ownership,
- provider,
- asset,
- data flow.

Edges should not all look identical.

---

## 5.2 Gameplay Flow View

Shows player-facing sequence and game design logic.

Example:

```text
LEVEL START
    ↓
SPAWN
    ↓
SURF SECTION
   / | \
  /  |  \
TRICKS FISHING SHARK ATTACK
   \   |   /
      CHECKPOINT
          ↓
       FINISH
```

This is not control flow.

It is **design flow**.

---

## 5.3 State Machine View

Used only where state machines are actually meaningful.

Example:

```text
GROUNDED
   │ jump
   ▼
AIRBORNE
   │ grind
   ▼
GRINDING
   │ detach
   ▼
AIRBORNE
   │ land
   ▼
GROUNDED
```

Transitions show conditions and emitted events.

---

## 5.4 Event / Signal View

Shows event relationships.

Example:

```text
input.jump
    ↓
player.jump.requested
    ↓
player.airborne
    ↓
trick.window.open
    ↓
camera.airborne
```

When live mode is enabled, event pulses animate along the graph.

---

## 5.5 Runtime Trace View

Atlas records the last configurable period of gameplay.

Example:

```text
00:04.21 input.jump
00:04.22 player.airborne
00:04.28 trick.started
00:05.11 collision.detected
00:05.12 landing.failed
00:05.13 combo.cancelled
```

Selecting an event highlights:

- originating system,
- downstream systems,
- relevant state values,
- affected entities.

The user can ask:

> Why did the combo break here?

Atlas prepares the trace and asks the agent.

---

## 5.6 Asset Graph

Shows which assets support which systems.

Example:

```text
SURFER
├── Body GLB
├── Rig
├── Animation Set
├── Board
├── Materials
└── Audio
```

Or:

```text
WORLD
├── Water → Poseidon
├── Trees → Dryad
├── Grass → Gaia
├── City → OSM/map3d
└── Traffic → vehicle library
```

---

## 5.7 Provider Graph

Shows reusable technologies.

Example:

```text
ENVIRONMENT
├── Ocean → Poseidon
├── Grass → Gaia
├── Flora → Dryad
├── Terrain → Demiurge
└── Surface Relief → Apate
```

Selecting a provider displays:

- source,
- license,
- version,
- health,
- capabilities,
- integration skill,
- alternatives,
- dependent systems.

---

## 5.8 Style Graph

Shows the visual identity of the game.

Example:

```text
VISUAL PROFILE
├── Geometry
│   └── PS1/N64 low-poly
├── Shading
│   └── Cel/PBR hybrid
├── Water
│   └── Photoreal Poseidon
├── Vegetation
│   └── Stylized procedural
├── Lighting
│   └── Saturated coastal
└── Post
    ├── Bloom
    ├── Color grade
    └── Pixel treatment
```

This graph is heavily linked to FeelSpec.

---

## 5.9 Performance Graph

Systems can be sized by runtime cost.

Example:

```text
POSEIDON    5.3 ms
DRYAD       2.1 ms
TRAFFIC     1.4 ms
HUD         0.5 ms
```

The user can select Poseidon and ask:

> Reduce this by 25% without noticeably affecting surfing quality.

The agent receives performance data and relevant provider instructions.

---

## 5.10 World Graph

Shows world / region hierarchy.

Example:

```text
ANDREAS ARCHIPELAGO
├── Capital
│   ├── Castle
│   ├── Museum
│   ├── Skyneedle
│   └── City
├── Suburbs
├── Forest
└── Uncanny Valley
```

A region node can expose:

- scene files,
- quests,
- music,
- NPCs,
- environmental providers,
- assets,
- mechanics.

---

## 5.11 Rig Graph

Rigging should receive a dedicated semantic view.

Instead of showing only bones:

```text
HUMANOID RIG
├── Skeleton
│   ├── Spine
│   ├── Arms
│   ├── Legs
│   ├── Hands
│   └── Face
│
├── Motion
│   ├── Locomotion
│   ├── Foot IK
│   ├── Look-at
│   ├── Aim
│   ├── Procedural Lean
│   └── Secondary Motion
│
└── Animation
    ├── Idle
    ├── Walk
    ├── Run
    ├── Jump
    └── Land
```

Rig graph overlays may show:

- active constraints,
- animation blend weights,
- IK contacts,
- bone stress / unexpected rotation,
- missing mappings,
- retarget quality.

The Three.js witness viewport can render the rig alongside the semantic graph.

---

# 6. FeelSpec

FeelSpec is a machine-readable representation of **mechanical and aesthetic intent**.

It exists because game feel is rarely captured by one value.

A jump is not simply jump velocity.

A car is not simply acceleration.

A camera is not simply distance.

FeelSpec describes systems in multidimensional design spaces.

---

# 7. FeelSpec Goals

FeelSpec must:

1. describe game feel in human-understandable dimensions;
2. support reference profiles inspired by well-known game families;
3. allow blending between profiles;
4. preserve protected values during transformations;
5. expose safe direct tuning controls;
6. provide the agent with semantic constraints;
7. support A/B auditioning;
8. create reusable personal / project presets;
9. connect changes to automated tests;
10. remain implementation-independent.

FeelSpec should describe intent.

Source code realizes that intent.

---

# 8. FeelSpec Schema

Example:

```yaml
version: 1

system: vehicle.arcade

profile:
  id: xirtus-arcade-driving-v3
  label: Xirtus Arcade Driving v3

references:
  burnout_like: 0.50
  outrun_like: 0.30
  heavy_openworld_like: 0.20

intent:
  arcadeSimulation: 0.82
  weight: 0.61
  steeringResponse: 0.78
  stability: 0.72
  driftAssist: 0.66
  accelerationDrama: 0.91
  collisionDrama: 0.88
  cameraAggression: 0.76

protected:
  - acceleration.topSpeed
  - acceleration.zeroToSixty

overrides:
  steering.highSpeedDamping: 0.58
  suspension.bodyRoll: 0.62

tests:
  - driving.slalom
  - driving.highSpeed
  - driving.collision
```

---

# 9. Feel Dimensions

Each system type has an associated FeelSpec vocabulary.

---

## 9.1 Driving FeelSpec

Suggested dimensions:

### Steering
- steering response
- low-speed assist
- high-speed damping
- countersteer assist
- steering saturation
- steering return rate

### Grip
- base grip
- lateral grip
- longitudinal grip
- traction breakaway
- drift initiation
- drift recovery

### Weight
- body mass feel
- body roll
- pitch
- suspension travel
- weight transfer
- airborne inertia

### Acceleration
- initial acceleration
- midrange acceleration
- top speed
- throttle response
- boost response

### Braking
- braking strength
- handbrake authority
- lockup behavior
- brake turn assist

### Collision
- collision severity
- momentum retention
- camera impulse
- vehicle deformation abstraction
- recovery assistance

### Air
- air steering
- pitch control
- roll control
- landing stabilization

### Camera
- follow distance
- rotation lag
- velocity lead
- FOV response
- shake
- collision reaction

### Traffic
- traffic density
- unpredictability
- avoidance assistance
- near-miss scoring

---

## 9.2 Platforming FeelSpec

- acceleration
- deceleration
- turn responsiveness
- coyote time
- input buffer
- jump impulse
- time to apex
- apex hang
- fall acceleration
- air control
- double-jump authority
- landing forgiveness
- landing squash
- momentum preservation
- slope behavior
- ledge behavior
- camera response

---

## 9.3 Trick System FeelSpec

- trick input window
- rotation acceleration
- spin damping
- flip authority
- grind snap
- grind balance difficulty
- manual balance difficulty
- combo timeout
- multiplier growth
- landing tolerance
- clean landing reward
- crash severity
- special meter rate
- camera drama

---

## 9.4 Surf FeelSpec

- board looseness
- rail bite
- water coupling
- wave attraction
- carve authority
- pumping power
- tube stability
- aerial launch
- aerial control
- landing forgiveness
- wipeout threshold
- drag
- kite influence if applicable
- tow influence if applicable
- camera aggression

---

## 9.5 Camera FeelSpec

- distance
- height
- pitch
- follow lag
- rotational lag
- look-ahead
- target anticipation
- collision avoidance
- FOV
- speed FOV
- landing impulse
- acceleration impulse
- shake
- lock-on influence
- horizon stabilization

---

## 9.6 Rig / Locomotion FeelSpec

- stride length
- stride frequency
- foot locking
- turn anticipation
- upper-body lag
- pelvis bounce
- lean
- ground adaptation
- slope adaptation
- step height
- jump anticipation
- landing compression
- arm swing
- procedural head tracking
- IK strength
- animation responsiveness

---

## 9.7 AI FeelSpec

- perception radius
- perception certainty
- reaction delay
- memory duration
- prediction
- aggression
- risk tolerance
- group coordination
- flanking preference
- retreat threshold
- persistence
- curiosity
- communication delay

---

# 10. Reference Profiles

FeelSpec may include named reference profiles.

These profiles are not proprietary code copies.

They are documented design approximations derived from:

- gameplay analysis,
- legally available source references,
- measurement,
- timing analysis,
- testing,
- known mechanic structures.

Example:

```yaml
driving_profiles:
  arcade_crash_racer:
    steeringResponse: 0.86
    collisionDrama: 0.95
    stability: 0.76
    bodyRoll: 0.44

  smooth_arcade_tourer:
    steeringResponse: 0.72
    collisionDrama: 0.42
    stability: 0.84
    bodyRoll: 0.52

  heavy_openworld:
    steeringResponse: 0.51
    collisionDrama: 0.68
    stability: 0.56
    bodyRoll: 0.86
```

Atlas may display friendly labels, but implementation metadata should distinguish between:

- exact reusable code,
- legal source reference,
- mechanic analysis,
- aesthetic reference.

---

# 11. Feel Blending

FeelSpec should support weighted blending.

Example:

```text
Arcade Crash Racer   50%
Smooth Tourer        30%
Heavy Openworld      20%
```

The resolver calculates a target feel.

Blending does not necessarily mean linear averaging.

Some parameters may use:

- weighted interpolation,
- categorical resolution,
- bounded curves,
- mutually exclusive rules,
- agent-mediated synthesis.

The system must distinguish:

### Numeric blendable properties
Example:
`cameraLag`

### Structural properties
Example:
`manualTrickSystemEnabled`

Structural conflicts require agent resolution.

---

# 12. Natural-Language Feel Transformations

The user should be able to say:

> More dangerous, heavier body roll, less snap steering, but do not make it slower.

Atlas produces a proposed delta:

```text
Body roll            0.42 → 0.66
High-speed steering  0.81 → 0.69
Collision drama      0.72 → 0.89

Protected:
Acceleration         unchanged
Top speed            unchanged
```

The user can:

- accept,
- reject,
- edit,
- A/B audition.

---

# 13. Protected Intent

FeelSpec supports explicit protected constraints.

Example:

```yaml
protected:
  - topSpeed
  - jumpHeight
  - waveHeight
```

If a requested change would likely violate them, Atlas warns:

```text
Requested transformation may reduce jump height.

Protected parameter:
jumpHeight = 2.1 m

Proceed using alternate tuning?
```

The agent should search for alternate solutions first.

---

# 14. FeelSpec Inheritance

Profiles should support inheritance.

Example:

```text
BASE ARCADE VEHICLE
    ↓
XIRTUS DRIVING BASE
    ↓
KAITOSAFIN SHARK-TOW VEHICLE
```

Only deltas are stored.

This encourages reusable design vocabulary.

---

# 15. Personal Feel Libraries

Users should be able to save:

```text
XIRTUS-ARCADE-DRIVING
XIRTUS-CRASH-CAMERA
XIRTUS-PS1-HUMANOID
XIRTUS-THPS-COMBO
XIRTUS-SURF-FEEL
```

Future projects can reuse them.

The harness gradually becomes a personal game-design instrument.

---

# 16. A/B Auditioning

A/B comparison is a first-class Atlas feature.

Every FeelSpec-compatible system should support snapshots where technically feasible.

Example:

```text
A = current driving
B = proposed driving
```

Instant switch:

```text
[A] [B]
```

The user can respond:

> Keep B's steering but A's suspension.

Atlas generates a merged FeelSpec.

---

# 17. Feel Lab

Atlas should include focused test environments rather than forcing the user to test every mechanic inside a full game.

---

## 17.1 Vehicle Feel Lab

Preset scenarios:

- slalom,
- figure eight,
- high-speed straight,
- hairpin,
- drift circle,
- jump,
- collision,
- traffic lane,
- emergency braking.

Measured outputs:

- 0–60 time,
- braking distance,
- steering latency,
- maximum lateral acceleration,
- drift duration,
- body roll,
- recovery time,
- air rotation,
- collision momentum loss.

---

## 17.2 Character Feel Lab

Scenarios:

- run,
- stop,
- rapid turn,
- jump,
- double jump,
- ledge,
- stairs,
- slope,
- moving platform,
- narrow platform,
- wall collision.

Measured:

- turn time,
- jump arc,
- landing error,
- foot sliding,
- slope stability,
- camera lag.

---

## 17.3 Rig Lab

Scenarios:

- idle,
- walk,
- run,
- sprint,
- crouch,
- reach,
- look-at,
- uneven ground,
- stairs,
- slope,
- jump,
- landing.

Visualization:

- skeleton,
- contact points,
- IK targets,
- blend weights,
- root motion,
- joint limits.

---

## 17.4 Surf Lab

Scenarios:

- small wave,
- large wave,
- tube,
- aerial,
- hard carve,
- wipeout,
- tow,
- kite pull,
- variable wind.

---

# 18. Three.js Visual Navigation

Atlas should use Three.js where 3D materially improves understanding.

It should not make every graph 3D merely because Three.js is available.

The interface uses a hybrid:

```text
React / HTML
+
2D graph layer
+
Three.js semantic visualization
+
Three.js witness viewport
```

---

# 19. Visual Navigation Modes

## 19.1 2D Semantic Graph

Primary navigation for ordinary system maps.

Recommended implementation:

- React Flow or equivalent,
- deterministic layout,
- typed edges,
- semantic zoom,
- groups,
- minimap,
- search,
- filters.

2D is superior for dense information.

---

## 19.2 2.5D Atlas Mode

Use Three.js to turn domains into spatial layers.

Example:

```text
           STYLE
             ▲
             │
WORLD ◀── GAME CORE ──▶ GAMEPLAY
             │
             ▼
          PLATFORM
```

Domains can be visually separated in depth without free-floating chaos.

Use constrained axes.

Do not permit arbitrary spaghetti positioning.

---

## 19.3 System Constellation

For large projects, systems can appear as an orderly constellation.

Design rules:

- fixed semantic neighborhoods,
- color-coded domains,
- limited edge visibility,
- focus-based expansion,
- non-selected nodes fade,
- selected node pulls related nodes forward,
- dependencies form arcs,
- runtime pulses travel only on active edges.

Avoid showing the entire dependency graph simultaneously.

---

# 20. Color System

Atlas must be colorful but disciplined.

Suggested semantic colors:

```text
Gameplay      amber/orange
Physics       blue
Animation     violet
World         green
AI            magenta
UI            cyan
Audio         rose
Assets        gold
Providers     teal
Tests         lime
Performance   red/orange
Style         purple
```

Rules:

1. color communicates domain, not decoration;
2. selected nodes may brighten;
3. errors use a separate red state;
4. warnings use amber;
5. passing tests use green;
6. unknown state uses neutral gray;
7. avoid rainbow edges;
8. no more than one dominant hue per node.

---

# 21. Node Design

Every node should be visually simple.

Default node:

```text
┌──────────────────────────┐
│ TRICK SYSTEM             │
│ Gameplay                 │
│                          │
│ ● Healthy     18/18      │
│ 0.21 ms                  │
└──────────────────────────┘
```

Expanded:

```text
┌──────────────────────────┐
│ TRICK SYSTEM             │
│                          │
│ Provider: Custom         │
│ Tests: 18/18             │
│ CPU: 0.21 ms             │
│                          │
│ Air Control       0.72   │
│ Landing Tol.      32°    │
│ Combo Timeout     1.2 s  │
│                          │
│ [Tune] [Ask Agent]       │
└──────────────────────────┘
```

Avoid huge node interiors.

Detail belongs in the inspector panel.

---

# 22. Graph Layout Rules

Atlas should actively prevent chaos.

## Hard rules

- nodes snap to semantic regions;
- automatic layout is default;
- manually moved nodes retain position only when intentional;
- edges bundle when crossing domains;
- dependency direction is consistent;
- hidden nodes collapse into grouped summaries;
- graphs open focused around current selection;
- labels stay horizontal;
- distant nodes simplify;
- no edge animations unless live trace is active.

---

# 23. Semantic Zoom

At far zoom:

```text
PLAYER
WORLD
AI
UI
```

Mid zoom:

```text
PLAYER
├── Movement
├── Camera
└── Animation
```

Close zoom:

```text
MOVEMENT
├── Ground
├── Jump
├── Air
└── Landing
```

Very close:

```text
Landing tolerance 32°
Momentum 0.84
Tests 6/6
```

This is essential to avoiding Blueprint chaos.

---

# 24. Focus Mode

Double-clicking a node enters Focus Mode.

All unrelated systems dim or disappear.

Example:

```text
TRICKS
├── Player Physics
├── Input
├── Animation
├── Combo
└── Camera
```

The user now works in a small comprehensible graph.

Exit returns to project context.

---

# 25. Three.js Witness Integration

The witness viewport and graph should cross-highlight.

Select a system:

`vehicle.suspension`

Viewport highlights:

- selected vehicle,
- suspension bones / wheel contacts,
- force vectors if enabled.

Select:

`dryad.forest`

Viewport highlights:

- generated flora,
- biome region,
- LOD bounds.

Select:

`rig.footIK`

Viewport highlights:

- feet,
- IK targets,
- ground contact rays.

This makes the abstract graph concrete.

---

# 26. Runtime Pulses

Live mode can animate system activity.

Example:

```text
Input
  ↓ pulse
Player
  ↓ pulse
Physics
  ↓ pulse
Animation
```

Pulse density should be aggregated.

Do not render every individual event at full speed.

Use:

- throttling,
- event grouping,
- sampling,
- importance filters.

---

# 27. Time Scrubbing

Atlas runtime history should support a time slider:

```text
00:00 ─────────────●──────────── 00:10
```

Scrubbing updates:

- graph activity,
- entity state,
- selected metrics,
- witness viewport where replay state is available.

The user can inspect failures after they happen.

---

# 28. Agent Integration

Atlas should never dump the entire project into the agent context.

Selecting a node creates a scoped context package.

Example:

```json
{
  "system": "player.tricks.landing",
  "intent": "Make clean landings preserve more momentum.",
  "neighbors": [
    "player.physics",
    "player.animation",
    "combo"
  ],
  "files": [
    "src/gameplay/tricks/landing.ts",
    "src/player/movement.ts"
  ],
  "tests": [
    "tests/tricks/landing.spec.ts"
  ],
  "feelSpec": "profiles/player-tricks.yaml",
  "runtimeEvidence": "traces/trace-0042.json"
}
```

The agent gets only what it needs plus access to the harness if it needs more.

---

# 29. Agent Actions

Atlas should support standard actions.

## Explain

> Explain how this system currently works.

## Modify

> Change behavior while preserving protected constraints.

## Tune

> Suggest parameter changes only.

## Optimize

> Reduce runtime cost while preserving visual / gameplay targets.

## Repair

> Diagnose failing tests or runtime errors.

## Replace

> Swap provider or implementation.

## Compare

> Compare this system to another FeelSpec/reference profile.

## Document

> Update semantic contract / docs.

---

# 30. Change Preview

Before significant structural changes, Atlas can show:

```text
PROPOSED CHANGE

Modify:
player.tricks.landing

Affected:
player.physics
combo
animation

Files:
3

Tests:
8

Protected FeelSpec:
jumpHeight
topSpeed

Estimated risk:
LOW
```

Then execute.

For ordinary low-risk changes, this can be automatic depending on user preference.

---

# 31. Verification

Every agent task should close a verification loop.

Minimum:

```text
BUILD
TYPECHECK
TESTS
CONSOLE
```

When applicable:

```text
GAMEPLAY TEST
VISUAL CAPTURE
PERFORMANCE
FEELSPEC CONSTRAINTS
```

Atlas displays results directly on the node.

Example:

```text
TRICK SYSTEM

Build       PASS
Tests       18/18
Gameplay    PASS
Performance 0.22 ms
Visual      PASS
```

---

# 32. Atlas Health States

Nodes should have clear health.

```text
Healthy
Warning
Failing
Unknown
Modified
Untested
Profiling
Agent Working
```

Health must be derived from evidence.

---

# 33. Git / History Integration

Every system can show history.

Example:

```text
TRICK SYSTEM

Recent:
+ landing momentum preservation
+ shark tow scoring
- old spin limiter

Commits:
...
```

The user can ask:

> Revert only the spin limiter change.

The agent receives semantic ownership and git context.

---

# 34. Provider Swapping

Provider nodes should support swap workflows.

Example:

```text
OCEAN

Current:
Simple Water

Candidate:
Poseidon

Benefits:
+ spectral waves
+ underwater optics
+ foam

Costs:
+ WebGPU
+ higher GPU budget

Affected:
Surfing
Boats
Weather
Underwater Camera

[Ask Agent to Migrate]
```

The harness should use provider skills and capabilities registry.

---

# 35. Style Profiles

Atlas should treat style as a structured system.

Example:

```yaml
style:
  geometry:
    profile: ps1_n64_modern

  shading:
    profile: cel_pbr_hybrid

  water:
    provider: poseidon
    style: photoreal

  lighting:
    saturation: 0.76
    contrast: 0.62

  post:
    bloom: 0.25
    chromaticAberration: 0.02
    pixelTreatment: 0.18
```

The user can say:

> Keep the realistic water but make the rest more Crash 2.

Atlas scopes the agent to relevant style systems.

---

# 36. Asset Provenance

Every asset node should expose:

- source,
- creator,
- license,
- attribution,
- imported date,
- modifications,
- poly count,
- texture resolution,
- rig,
- animation set,
- usage.

Example:

```text
SURFER BODY

Source      Sketchfab
License     CC-BY
Rigged      Yes
Triangles   28k
Textures    2k
Used by     Player / NPC surfers
```

---

# 37. Mechanics Registry Integration

FeelSpec should connect to the 3JSE mechanic registry.

Example:

```text
CAR DRIVING
├── Xirtus Arcade Driving
├── Crash Racer Reference
├── Smooth Tourer Reference
└── Heavy Openworld Reference
```

A mechanic profile contains:

- dimensions,
- reference notes,
- tests,
- implementation patterns,
- known examples,
- tuning constraints.

---

# 38. Atlas as Project Navigation

Atlas should eventually replace much of manual file navigation.

A user should be able to think:

> I want to change shark towing.

Search:

```text
shark tow
```

Atlas returns:

```text
Mechanic: Shark Tow
System: Grappling
System: Surf Physics
System: Scoring
Asset: Shark Rig
Tests: shark-tow/*
```

Much easier than knowing file names.

---

# 39. Search

Universal search indexes:

- systems,
- mechanics,
- FeelSpec parameters,
- providers,
- assets,
- scenes,
- entities,
- tests,
- files,
- recent changes,
- events.

Search results open relevant Atlas view.

---

# 40. Atlas Data Model

Suggested internal model:

```ts
type AtlasNode = {
  id: string
  type: AtlasNodeType
  label: string
  domain: string

  purpose?: string

  status: HealthStatus

  owns?: string[]
  requires?: string[]
  dependents?: string[]

  emits?: string[]
  listens?: string[]

  assets?: string[]
  providers?: string[]
  tests?: string[]

  feelSpec?: string

  metrics?: RuntimeMetrics

  position?: SemanticPosition
}
```

Edges:

```ts
type AtlasEdge = {
  source: string
  target: string

  kind:
    | "dependency"
    | "event"
    | "state"
    | "asset"
    | "provider"
    | "ownership"
    | "runtime"

  strength?: number
}
```

---

# 41. Atlas Compiler

The compiler builds Atlas from multiple sources.

Pipeline:

```text
Project
↓
Static analysis
↓
System metadata
↓
FeelSpec
↓
Provider registry
↓
Asset registry
↓
Tests
↓
Scene metadata
↓
Runtime instrumentation
↓
Git history
↓
Atlas Graph Model
```

---

# 42. Static Analysis

Extract where possible:

- imports,
- exports,
- function references,
- event registrations,
- Zustand stores,
- ECS component systems,
- scene ownership,
- asset imports,
- test coverage relationships.

Do not rely exclusively on static analysis for semantics.

---

# 43. Runtime Instrumentation

Instrumentation can record:

```text
system start/end
events
entity state transitions
performance
exceptions
selected variables
provider status
```

Instrumentation should have minimal overhead and configurable detail levels.

---

# 44. Atlas Manifest

Each 3JSE project can include:

```text
atlas/
  systems/
  feelspec/
  views/
  traces/
  profiles/
```

Example:

```text
atlas/systems/player.yaml
atlas/feelspec/driving.yaml
atlas/profiles/xirtus-camera.yaml
```

---

# 45. Three.js Rendering Architecture

Recommended:

```text
Atlas Shell
├── React
├── React Flow / graph UI
├── Three.js Atlas Canvas
└── Three.js Witness Canvas
```

Do not force Atlas graph rendering into the same canvas as the game.

Independent canvases permit:

- independent camera controls,
- independent performance,
- clean DOM inspectors,
- independent post processing.

---

# 46. Three.js Semantic Scene

The Three.js Atlas scene may contain:

- domain islands,
- system nodes,
- dependency arcs,
- runtime pulses,
- miniature asset previews,
- miniature rigs,
- miniature world maps.

But it must remain constrained.

Avoid unrestricted 3D node placement.

---

# 47. Spatial Metaphors

Useful metaphors:

### Islands
Domains are stable islands.

### Floors
Implementation depth is vertical.

```text
Design
↓
Mechanics
↓
Systems
↓
Code
```

### Constellations
Subsystems cluster around parent systems.

### Rivers
Event streams animate as paths.

### Heat
Performance / runtime pressure appears as glow or temperature.

Choose metaphors deliberately, not simultaneously.

---

# 48. Orderliness Rules for 3D Atlas

1. camera defaults to an isometric / slightly perspective strategic view;
2. domains occupy stable world positions;
3. node depth communicates hierarchy only;
4. automatic layout controls position;
5. no unconstrained force graph as default;
6. connection density is aggressively filtered;
7. edges disappear at distant zoom;
8. labels use billboards / HTML overlays;
9. semantic color stays consistent between 2D and 3D;
10. clicking a node smoothly frames it.

---

# 49. Animation Principles

Atlas animations should help comprehension.

Use animation for:

- selection,
- focus,
- event propagation,
- state change,
- provider replacement,
- performance change,
- graph expansion/collapse.

Avoid ambient motion that makes the graph harder to read.

---

# 50. Rigging Visualization in Three.js

Rig mode should support:

```text
Skeleton
Mesh
Weights
IK Targets
Contact Points
Root Motion
Retarget Mapping
Blend Weights
```

Atlas semantics appear alongside the 3D rig.

Example:

```text
LEFT FOOT IK
Healthy
Contact: true
Offset: 1.2 cm
Weight: 0.94
```

Clicking it highlights the exact rig elements.

---

# 51. Mechanics Visualization in Three.js

Driving:

- tire force vectors,
- velocity,
- grip,
- slip angle,
- suspension travel,
- center of mass,
- camera target.

Jumping:

- predicted trajectory,
- apex,
- current input authority,
- landing window.

Surfing:

- wave force,
- board normal,
- water velocity,
- kite force,
- tow force.

These visualizations are optional witnesses, not permanent HUD clutter.

---

# 52. Atlas Modes

Suggested top navigation:

```text
GAME
SYSTEM
FLOW
STATE
EVENTS
WORLD
RIG
ASSETS
STYLE
FEEL
PERF
HISTORY
```

---

# 53. Default Layout

```text
┌──────────────────────────────────────────────────────────────┐
│ 3JSE ATLAS    GAME SYSTEM FLOW FEEL ASSET PERF HISTORY      │
├────────────────────────────────────────┬─────────────────────┤
│                                        │                     │
│                                        │ Selected System     │
│             ATLAS VIEW                 │                     │
│                                        │ purpose             │
│                                        │ status              │
│                                        │ knobs               │
│                                        │ tests               │
│                                        │                     │
│                                        │ [Ask Agent]         │
├────────────────────────────────────────┴─────────────────────┤
│ Live Trace / Timeline / Test Results                         │
└──────────────────────────────────────────────────────────────┘
```

Optional split:

```text
Atlas | Witness
```

---

# 54. MVP Scope

Atlas v0.1 should not attempt everything.

Minimum useful version:

1. system registry;
2. semantic system map;
3. node inspector;
4. FeelSpec numeric tuning;
5. system search;
6. agent-scoped task generation;
7. test links;
8. provider links;
9. asset links;
10. runtime health badges;
11. basic witness linking.

---

# 55. Atlas v0.2

Add:

- runtime event pulses,
- trace recording,
- performance graph,
- A/B FeelSpec,
- Feel Lab,
- state machine view,
- world graph,
- style graph.

---

# 56. Atlas v0.3

Add:

- rig graph,
- rig witness,
- provider swapping,
- visual regression,
- time scrubber,
- git semantic history,
- asset provenance UI.

---

# 57. Atlas v1.0

A successful Atlas 1.0 should allow a non-programmer to:

1. open a complex 3JSE game;
2. understand its major systems within minutes;
3. locate a mechanic without knowing filenames;
4. understand what controls that mechanic;
5. change simple tuning values directly;
6. ask the agent for a structural change;
7. watch the agent scope the task correctly;
8. see verification;
9. A/B the new feel;
10. revert or keep the result.

---

# 58. Anti-Goals

Atlas is not:

- Blender,
- Unreal Editor,
- Unity Editor,
- a general-purpose visual programming language,
- a source-code replacement,
- a node-based shader editor initially,
- an unrestricted graph drawing tool,
- a level editor by default,
- a giant inspector for every variable.

---

# 59. Failure Conditions

Atlas has failed if:

- graphs routinely exceed comprehensible density;
- users need to manually connect low-level execution nodes;
- graph metadata becomes harder to maintain than source code;
- semantics drift from implementation;
- users must understand file structure to navigate;
- changes cannot be verified;
- FeelSpec becomes a collection of meaningless sliders;
- named reference profiles become vague marketing labels;
- 3D navigation is harder to understand than 2D;
- visual richness reduces readability.

---

# 60. Core Doctrine

Atlas should carry these rules prominently:

> **The graph is not the program. The graph is the explanation of the program.**

> **The human edits intent. The agent edits implementation.**

> **Expose systems before files, mechanics before functions, and feel before constants.**

> **Use progressive disclosure to make complexity navigable.**

> **Color communicates meaning; movement communicates change.**

> **Never recreate Blueprint spaghetti in a different color palette.**

> **Every change must be witnessed and verified.**

---

# 61. Final Product Vision

A user opens a game.

Atlas initially shows:

```text
WORLD
PLAYER
GAMEPLAY
AI
STYLE
AUDIO
UI
```

The user enters `PLAYER`.

```text
Movement
Camera
Animation
Tricks
Combat
```

They open `Tricks`.

```text
Air
Grind
Landing
Combo
```

They select `Landing`.

Atlas shows:

```text
Landing tolerance    32°
Momentum retention   0.84
Hard landing         7.5
Tests                 6/6
```

The witness viewport shows the player landing a trick.

The user says:

> Keep the existing jump exactly as it is. Make clean landings feel much faster and more satisfying, but sideways landings should punish momentum more.

Atlas creates the scoped agent task.

The agent modifies the implementation.

Tests run.

A/B appears.

```text
A Current
B Proposed
```

The user tries both.

> Keep B.

Atlas stores the new FeelSpec profile and project state.

No Blueprint graph was authored.

No source file had to be found.

No physics constant was changed blindly.

The user interacted with the game at the level of **meaning and feel**.

That is the intended role of 3JSE Atlas.

---

# 62. Relationship to the 3JSE Harness

Atlas is the visual intelligence layer over the existing harness.

```text
USER
↓
ATLAS
↓
FeelSpec / Semantic Selection
↓
3JSE Director
↓
Capability Resolver
↓
Vendor Router
↓
Agent
↓
Project
↓
Tests / Runtime / Witness
↓
ATLAS
```

The harness remains capable of working headlessly.

Atlas is not required to build games.

Atlas makes the harness understandable and controllable.

---

# 63. Recommended First Implementation Task

The best first implementation is not the full 3D Atlas.

Build:

### Atlas Semantic Core

- `defineSystem()`
- Atlas graph compiler
- FeelSpec parser
- React Flow system map
- node inspector
- direct knob editing
- agent task context exporter
- test status
- provider metadata
- asset metadata
- simple runtime health

Then apply it to one existing 3JSE game.

Use the pain points from that real project to decide which 3D visualizations are genuinely useful.

Only after the semantic core proves useful should the Three.js Atlas navigation layer expand.

The Three.js layer should amplify comprehension, not merely demonstrate that Atlas itself uses Three.js.
