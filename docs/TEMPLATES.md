# Templates

## Design rule

A 3JSE template is a **working starting point built from real Gameplay Framework systems** (`GAMEPLAY_FRAMEWORK.md`), not a demo scene wired together with one-off hacks that fall apart the moment a developer tries to extend them. The test for whether a template is done: an AI agent, given a one-sentence request (`AI_AGENT_API.md`), should be able to transform it into a materially different game by editing Components, Graphs, and assets — not by rewriting the template's foundations first.

## Third Person — the reference template

Specified in full because every other template follows the same shape:

| Piece | Package / mechanism |
|---|---|
| Character controller (capsule movement, slopes, stairs, jump) | `@3jse/character` |
| Camera (spring-arm third-person rig, collision-avoidance) | `@3jse/character` |
| Gamepad + keyboard/mouse input, remappable | `InputManager` (`GAMEPLAY_FRAMEWORK.md`) |
| Animation controller (locomotion blend tree, jump/land states) | `@3jse/character` + `ANIMATION.md` Animation Graph |
| Interaction system (world prompts, pick-up/use) | `@3jse/interaction` |
| Checkpoints | `@3jse/save` |
| Basic UI (health, interaction prompt) | `@3jse/ui` |
| Save system | `@3jse/save` |

All of it is ordinary Entities/Components/Graphs sitting in a normal project (`PROJECT_FORMAT.md`) — opening the template in the editor shows exactly the same Hierarchy/Inspector/Graph views a hand-built project would, because it *is* one.

## Catalog

| Template | Distinguishing systems on top of the shared base |
|---|---|
| **First Person** | `@3jse/character` FPS variant (head-bob, weapon-viewmodel mount point), `@3jse/combat` |
| **Platformer** | Precision-jump tuning (coyote time, jump buffering), side-view or 3D-platformer camera preset |
| **Racing** | `@3jse/vehicle`, checkpoint/lap-timer objectives (`@3jse/match`) |
| **Surfing** | Buoyancy/water-interaction (`@3jse/water`), momentum-based movement variant of `@3jse/character` |
| **Flight** | Six-degrees-of-freedom controller variant, altitude/speed HUD |
| **RTS** | Top-down camera rig, unit-selection/command Graph patterns, `@3jse/nav` group pathing |
| **RPG** | `@3jse/inventory`, `@3jse/dialogue`, `@3jse/quests`, stat/leveling Components |
| **FPS** | `@3jse/combat` (hitscan/projectile), `@3jse/ai-behavior` enemy patrol/engage patterns |
| **Multiplayer** | `@3jse/networking` wired into whichever base movement template is layered underneath (default: Third Person) |
| **Top Down** | Fixed/rotating top-down camera preset, click-to-move or twin-stick input variant |
| **Side Scroller** | 2.5D constrained-axis movement variant, parallax background setup |
| **VR/XR** | WebXR camera rig, hand/controller input mapping, teleport + smooth-locomotion presets |
| **Mobile** | Touch input mapping, aggressive default quality tier (`PERFORMANCE.md`), UI scaled for small screens |
| **Walking Simulator** | Interaction + Dialogue systems foregrounded, no combat, environmental-storytelling trigger patterns |
| **Open World** | World Partition-configured base Level (`WORLD_SYSTEM.md`), streaming-aware spawn/objective systems |
| **Physics Sandbox** | `@3jse/physics-rapier` exposed directly — grab/throw interaction, constraint-building tools, minimal scripted logic by design |
| **Musical Hopper** | Hop-grammar input (`@3jse/character` variant) + the audio sequencer/quantizer and MIDI/OSC bridge (`AUDIO.md`) — reference: PULSEHOP (`REFERENCE_GAMES.md`) |
| **Endless Hopper** | Unfairness-free deterministic core (constant-velocity lanes, seeded generation, grid-math collision), one-clock time powers, 12 Hz ghost replay, player-agent QA — reference: MANDELHOP (`REFERENCE_GAMES.md`) |
| **Colony Sim** | Simulation-authoritative architecture: pure sim + projection seam, seeded determinism, counterfactual replay, gate-sentence test discipline — reference: DAMN BEAVERS (`REFERENCE_GAMES.md`) |

## Reference implementations

Several templates already have shipping reference games (`REFERENCE_GAMES.md`) whose systems are donation candidates: **Surfing** ← 3JSURF (headless mechanics harness, feel anchors, rigged riders + baked clip library; first-person variant ← BREAKING WAVES' parametric compositor with live Tweakpane knobs), **Racing** ← ZENDRIVE (track-space demand-capacity vehicle model, procedural road/terrain, generative music), **Musical Hopper** ← PULSEHOP, **Endless Hopper** ← MANDELHOP (unfairness-free core, time powers, ghost replay, player-agent QA), **Colony Sim** ← DAMN BEAVERS. The test for a template remains the same — an agent can transform it from a one-sentence request — but for these six the starting point no longer has to be invented.

## What ships in a template package

```
/template-third-person
  /assets            placeholder character, environment kit
  /scenes            a small playable demo Level using the template's systems
  /prefabs           Player prefab, checkpoint prefab, interactable prefab
  /graphs            locomotion animation graph, interaction event graph
  project.json       declares which @3jse/* gameplay packages the template depends on
```

Instantiating a template via the Project/Templates system is a project-scaffold operation (`PROJECT_FORMAT.md`, `@3jse/cli`), not a special editor mode — the resulting project is indistinguishable in structure from a project built up manually package-by-package, which is what keeps templates from becoming a maintenance-diverging special case.

## Genre skill packs for the Agent API

Each template ships a matching skill pack for `@3jse/agent` (`AI_AGENT_API.md`) — vocabulary and worked patterns specific to that genre ("groove meter," "combo chain," and "boost" resolve against the Racing/Surfing template's conventions; "aggro range" and "patrol" resolve against the FPS/RPG templates' `@3jse/ai-behavior` conventions) so natural-language requests land on the right existing systems instead of generic first-principles scaffolding every time.
