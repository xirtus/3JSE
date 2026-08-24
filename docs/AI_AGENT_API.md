# AI Agent API

## The constraint that shapes everything here

3JSE is built in the era where a meaningful share of its own use — and a meaningful share of its own future development — will be done by an AI agent, not a human moving a mouse. That means the Agent API cannot be a bolted-on chat feature with its own bespoke access path into the engine. It has to be **the same command surface the editor itself is built on** (`ARCHITECTURE.md` principle 3: "everything the editor can do, code can do"). An agent that can only act by simulating mouse coordinates is fragile, unauditable, and slow. An agent that calls `scene.mutate` is doing exactly what a human dragging a slider in the Inspector caused to happen, through the identical code path, landing in the identical undo history.

## Tool surface

Exposed as an MCP-shaped local tool server (`@3jse/agent`), so any MCP-capable agent — not just a bespoke in-editor chatbot — can drive a 3JSE project.

| Tool | Does |
|---|---|
| `scene.query` | Read entities/components matching a filter; returns the same JSON shape `ENTITY_COMPONENT_MODEL.md` describes |
| `scene.createEntity` / `scene.destroyEntity` | Add/remove an Entity, optionally from a Prefab |
| `scene.addComponent` / `scene.removeComponent` / `scene.setProperty` | Mutate Component data — schema-validated, same path as the Inspector |
| `assets.import` | Run the Asset Pipeline (`ASSET_PIPELINE.md`) against a file, headless |
| `materials.create` | Build a Material Graph node tree (`RENDERING.md`) |
| `graph.read` / `graph.write` | Read or patch a 3JSE Graph's IR directly (`GAMEPLAY_IR.md`) — the agent edits the same JSON the Graph editor renders, never "draws" nodes via simulated interaction |
| `graph.connect` | Wire two node pins, type-checked against 3IR's type system at call time |
| `codegen.writeFile` | Create/modify a TypeScript file under the project's `systems/` tree |
| `project.settings.get` / `.set` | Read/write Project Settings (`EDITOR.md`) |
| `runtime.run` | Boot the game headless or windowed (`RUNTIME.md`'s headless mode) |
| `runtime.pause` / `.step` | Control execution for inspection |
| `runtime.getConsole` | Pull captured logs/errors/warnings since a given point |
| `runtime.getPerf` | Pull a frame-timing/draw-call report (`PERFORMANCE.md`) |
| `runtime.captureFrame` | Screenshot the viewport for visual verification |
| `build.typecheck` | Run the TS/IR type checker without a full build |
| `build.runTests` | Run the project's automated test suite (`BUILD_DEPLOYMENT.md`) |

Every tool call is schema-validated against the same Component/IR type system the editor UI enforces (`GAMEPLAY_IR.md`) — a malformed call fails fast with a structured error, not a silent bad state.

## The loop: plan → modify → run → inspect → diagnose → repair → test

```
 OBSERVE  scene.query + runtime.getConsole + runtime.getPerf + last screenshot
    │
 PLAN     step list, surfaced to the human for non-trivial changes
    │
 ACT      graph.write / scene.mutate / codegen.writeFile / assets.import …
    │
 VERIFY   build.typecheck → runtime.run(headless) → runtime.getConsole
          → runtime.captureFrame → compare against expectation
    │
    ├── passes ──► report diff + screenshot to human, land in history
    └── fails  ──► DIAGNOSE (read the specific console error / perf
                   regression / screenshot mismatch) ──► repeat ACT
```

The **verify** step is the difference between "code that compiles" and "a change that actually works," and it's why the loop always includes an actual headless run, not just a type check — a change can typecheck cleanly and still throw at runtime, render a blank viewport, or silently do nothing, and all three are things `runtime.getConsole`, `runtime.getPerf`, and `runtime.captureFrame` respectively are positioned to catch before a human ever sees the failure.

## Worked example: the shark

> *"Make this shark patrol this area until it sees the player, then chase them. If it gets harpooned, allow it to tow the player."*

1. `scene.query` — inspect the `Shark` entity's current components.
2. `scene.addComponent(shark, Perception)` and `scene.addComponent(shark, NavAgent)` from `@3jse/ai-behavior` / `@3jse/nav` (`GAMEPLAY_FRAMEWORK.md`).
3. `graph.write` — construct a Behavior Tree: `Patrol(area)` → `Selector` gated by `Perception.canSee(player)` → `Chase(player)`.
4. `graph.connect` — wire a `Harpoon.onHit(shark)` event into a new `Tow` state that reparents the player's tow-point to the shark and reduces the shark's max speed.
5. `graph.write` — wire the Animation Graph transitions (`ANIMATION.md`) for patrol/chase/towed states.
6. `scene.addComponent(shark, RigidBody)` with tow-appropriate physics constraints (`PHYSICS.md`).
7. `runtime.run(headless)` — boot the level.
8. `runtime.getConsole` — catch, e.g., a missing animation-state reference.
9. `graph.write` — repair the missing transition.
10. `runtime.run` again, `runtime.captureFrame` at a moment the shark should be visibly chasing, report the plan, the diff, and the screenshot to the human.

At every step the agent used tools a human could have triggered from the Inspector, the Graph editor, or the Console — nothing here required a capability the GUI doesn't also expose.

## Natural-language project creation

The same loop, run once at project-creation scope instead of feature scope: parse intent → select the closest genre Template (`TEMPLATES.md`) as a starting point rather than an empty World → decompose into the same ACT/VERIFY steps as the shark example, applied across scene setup, asset import/generation, Component wiring, graph construction, physics/input configuration, and UI — then hand the result to the human exactly as authored: real Entities, real Components, real Graphs, browsable and editable in the ordinary editor, never a black box the editor can display but not decompose. **This is a hard constraint, not an aspiration**: any AI output that can't be inspected and edited through the same panels a human uses is treated as an Agent API bug, because it violates the founding premise in `VISION.md` that all four ways of working edit the same underlying game.

## Trust tiers and safety

| Tier | Behavior |
|---|---|
| **Suggest** | Every change is proposed as a diff/graph patch; nothing lands without explicit approval |
| **Co-pilot** | Free to make local, additive, reversible edits (new entities, new components, new graph nodes, new files); deletions, breaking API changes, and new package dependencies still require approval |
| **Autonomous** | For CI-style batch jobs on a sandboxed branch; output lands as a change-proposal merged through the normal Git workflow (`EDITOR.md`'s Source Control panel), never a silent direct commit |

Structural guarantees, independent of tier:

- Every Agent-initiated mutation goes through `scene.mutate`/`graph.write`/etc. and therefore lands in the **same undo/version history** as a manual edit (`EDITOR.md`) — nothing an agent does is a special, unrevertable category of change.
- Generated TypeScript executes in a capability-scoped sandbox: no network access, no filesystem access outside the project tree, enforced by the tool server rather than assumed from good behavior.
- Secrets and environment values are excluded from the context an agent can read, by construction of what `scene.query`/`project.settings.get` are allowed to return.
- Scope limits (files touched, entities mutated per turn) are configurable per trust tier, so a Suggest-tier session reviewing "fix this one bug" can't accidentally touch two hundred files without that being a visible, flagged deviation from plan.

## Why this doesn't need a second engine

Because the tool surface *is* the editor's own command API, there was no temptation — and no need — to build a parallel "AI scripting language" or a simulated-input automation layer. The Agent API's entire job is exposing `ARCHITECTURE.md` principle 3 over a stable, typed, MCP-shaped interface. Everything hard about making that reliable (typed validation, headless verification, undo-integrated history) was already required by the rest of the engine; the Agent API mostly assembles those pieces into a loop rather than inventing new ones.
