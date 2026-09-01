/// <reference types="vite/client" />
import * as THREE from "three/webgpu";
import { World, type Level } from "@3jse/runtime";
// Imported from its own subpath, not the "@3jse/runtime" barrel, so the HMR accept below only
// ever needs to re-execute this one small, side-effect-free module (plus Scheduler.js/
// InputManager.js, both type-only or import-free) — accepting the whole barrel would pull in
// every other package's `registerComponent()` side-effect modules through shared re-exports and
// throw "already registered" on the next edit, forcing a full page reload instead of a swap.
import { registerBuiltinSystems } from "@3jse/runtime/systems/builtins";
import { buildThirdPersonTemplate } from "@3jse/templates";
import { buildCharacterRig, buildLocomotionClips } from "./proceduralCharacter.js";
import { pluginHost } from "./plugins.js";

/**
 * The editor's starting content is now the **shipped Third Person template**
 * (`@3jse/templates`, docs/TEMPLATES.md), decorated with meshes — not a parallel "demo scene".
 * `buildThirdPersonTemplate` wires input → CharacterController → physics → CameraRig → Animation
 * → Save entirely through the public Entity/Component/System API; `decorate` only attaches the
 * visual Object3Ds and a few extra demo entities the Inspector can then tune. This is Phase 2's
 * exit criterion exercised for real: open the editor and you are looking at the template.
 *
 * Async because @3jse/physics-rapier's PhysicsWorld.create() awaits Rapier's WASM init
 * (docs/PHYSICS.md), which the template does internally.
 */
export async function buildSampleWorld(): Promise<{ world: World; level: Level }> {
  const world = new World();
  // Kept as a direct call (the template also registers them — Scheduler.register upserts by
  // name, so this is a harmless no-op on the second pass) purely to keep the
  // "@3jse/runtime/systems/builtins" module in this file's import graph, so the HMR accept
  // below has a live target. See installHotReload's doc comment.
  registerBuiltinSystems(world.scheduler);
  installHotReload(world);

  // docs/PLUGIN_ARCHITECTURE.md: activate registered plugins (official + community) against the
  // same live World every panel edits. Registers the community/orbit-marker plugin's Component
  // schema + System — see plugins.ts.
  pluginHost.activate({ world });

  const { level } = await buildThirdPersonTemplate({
    world,
    levelName: "Sandbox",
    // Real procedural locomotion clips (Idle/Walk/Run/Jump tracks) instead of the template's
    // headless empty-track stand-ins, so the AnimationSystem blends something visible.
    clips: buildLocomotionClips(),
    decorate: ({ level, player, ground }) => {
      // Template already adds a DirectionalLight "Sun"; add fill light so shadowed sides read.
      const ambient = level.createEntity("Ambient");
      ambient.object3D!.add(new THREE.HemisphereLight(0x8899aa, 0x223322, 1.2));

      // Mesh for the template's ground-collider entity (40×40, matching its Collider).
      const groundMesh = new THREE.Mesh(
        new THREE.PlaneGeometry(40, 40),
        new THREE.MeshStandardMaterial({ color: 0x3a3f4b, roughness: 0.9 }),
      );
      groundMesh.rotation.x = -Math.PI / 2;
      ground.object3D!.add(groundMesh);

      // Visual rig for the template's player entity — CharacterController/CameraRig/Animation
      // components are already on it.
      player.object3D!.add(buildCharacterRig().root);

      // Extra demo content, built through the same API the Inspector edits (there is no
      // privileged path). A spinning cube, a WASD-movable sphere, and a crate that falls and
      // settles on the physics ground.
      const cube = level.createEntity("Cube");
      cube.object3D!.position.set(0, 1, 3);
      cube.object3D!.add(
        new THREE.Mesh(
          new THREE.BoxGeometry(1, 1, 1),
          new THREE.MeshStandardMaterial({ color: 0x5b8cff, roughness: 0.4, metalness: 0.1 }),
        ),
      );
      cube.addComponent("Spin", { degreesPerSecond: 60 });
      cube.addComponent("Health", { current: 75 });

      const sphere = level.createEntity("Sphere");
      sphere.object3D!.position.set(2.5, 0.75, 1);
      sphere.object3D!.add(
        new THREE.Mesh(
          new THREE.SphereGeometry(0.75, 32, 16),
          new THREE.MeshStandardMaterial({ color: 0xe3944f, roughness: 0.3 }),
        ),
      );
      sphere.addComponent("Health");
      sphere.addComponent("Movable", { speed: 3 }); // WASD / arrow keys, via the template's InputManager

      const crate = level.createEntity("Crate");
      crate.object3D!.position.set(-2.5, 5, -1);
      crate.object3D!.add(
        new THREE.Mesh(
          new THREE.BoxGeometry(1, 1, 1),
          new THREE.MeshStandardMaterial({ color: 0x8a5a2f, roughness: 0.8 }),
        ),
      );
      crate.addComponent("RigidBody", { bodyType: "dynamic", mass: 2 });
      crate.addComponent("Collider", { shape: "box", sizeX: 1, sizeY: 1, sizeZ: 1, restitution: 0.3 });
      crate.addComponent("Saveable"); // where it settles persists (docs/GAMEPLAY_FRAMEWORK.md SaveGame)

      // Driven entirely by the community/orbit-marker plugin's Component + System (plugins.ts).
      const orbiter = level.createEntity("Orbiter");
      orbiter.object3D!.position.set(3, 2, 0);
      orbiter.object3D!.add(
        new THREE.Mesh(
          new THREE.IcosahedronGeometry(0.4, 1),
          new THREE.MeshStandardMaterial({ color: 0x9b5de5, roughness: 0.5 }),
        ),
      );
      orbiter.addComponent("OrbitMarker", { radius: 3.5, speed: 0.8 });
    },
  });

  return { world, level };
}

/**
 * docs/RUNTIME.md's hot-reload "function swap": editing SpinSystem/MoveSystem (or any other
 * hand-written System `registerBuiltinSystems` adds) in packages/runtime/src/systems/builtins.ts
 * re-runs this callback with the freshly-transformed module. `Scheduler.register()` upserts by
 * name (see Scheduler.ts), so calling `registerBuiltinSystems` again just replaces those
 * Systems' `run` functions in place — the World, Level, and every Entity's live component data
 * are untouched, so Play-mode state (e.g. a Spin entity's current rotation) survives the edit
 * exactly as EDITOR.md's Modify-while-paused flow requires. Without this `accept`, Vite would
 * fall back to a full page reload, losing all Play-mode state.
 *
 * Deliberately accepts the "@3jse/runtime/systems/builtins" subpath, not the whole
 * "@3jse/runtime" barrel: the barrel re-exports ComponentRegistry, and every package's
 * component-registration file calls registerComponent() at module scope against that same
 * registry — reloading the barrel re-runs those side effects and hits registerComponent()'s
 * "already registered" guard on the very next edit. The systems/builtins.ts subgraph is
 * import-free/type-only, so it's safe to reload on its own.
 */
function installHotReload(world: World): void {
  if (!import.meta.hot) return;
  import.meta.hot.accept("@3jse/runtime/systems/builtins", (mod) => {
    if (!mod) return; // Vite couldn't hot-update the module; it will force a full reload instead.
    (mod.registerBuiltinSystems as typeof registerBuiltinSystems)(world.scheduler);
  });
}
