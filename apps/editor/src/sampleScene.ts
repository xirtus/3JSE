/// <reference types="vite/client" />
import * as THREE from "three/webgpu";
import { World, InputManager, INPUT_RESOURCE, type Level } from "@3jse/runtime";
// Imported from its own subpath, not the "@3jse/runtime" barrel, so the HMR accept below only
// ever needs to re-execute this one small, side-effect-free module (plus Scheduler.js/
// InputManager.js, both type-only or import-free) — accepting the whole barrel would pull in
// every other package's `registerComponent()` side-effect modules through shared re-exports and
// throw "already registered" on the next edit, forcing a full page reload instead of a swap.
import { registerBuiltinSystems } from "@3jse/runtime/systems/builtins";
import { PhysicsWorld, PHYSICS_RESOURCE, createPhysicsSystem } from "@3jse/physics-rapier";
import { CharacterControllerManager, createCharacterControllerSystem, createCameraRigSystem } from "@3jse/character";
import { SaveService, SAVE_RESOURCE } from "@3jse/save";
import { AnimationStateMachineManager, createAnimationSystem, type AnimationGraphDef } from "@3jse/animation";
import { buildCharacterRig, buildLocomotionClips } from "./proceduralCharacter.js";

/**
 * Hand-built starting content — the Phase 1 exit criterion from docs/ROADMAP.md is "hand-build
 * a small scene entirely in-editor," so this stands in for that until the Content Browser and
 * Asset Pipeline (docs/ASSET_PIPELINE.md) exist to import real assets. Everything here is built
 * through the same Entity/Component API the Inspector edits — there is no separate "demo scene"
 * code path.
 *
 * Async because @3jse/physics-rapier's PhysicsWorld.create() awaits Rapier's WASM init
 * (docs/PHYSICS.md) — everything else here is synchronous.
 */
export async function buildSampleWorld(): Promise<{ world: World; level: Level }> {
  const world = new World();
  registerBuiltinSystems(world.scheduler);
  installHotReload(world);
  const level = world.createLevel("Sandbox");

  const input = new InputManager();
  input.bindAxis("moveForward", ["KeyW", "ArrowUp"], ["KeyS", "ArrowDown"]);
  input.bindAxis("moveRight", ["KeyD", "ArrowRight"], ["KeyA", "ArrowLeft"]);
  input.bindAction("jump", ["Space"]);
  world.setResource(INPUT_RESOURCE, input);

  const physics = await PhysicsWorld.create();
  world.setResource(PHYSICS_RESOURCE, physics);
  // Registration order matters within the "fixed" stage (docs/RUNTIME.md): the character
  // controller must queue its kinematic movement before PhysicsSystem's physics.step() commits
  // it — see @3jse/character's systems.ts and @3jse/physics-rapier's systems.ts doc comments.
  // Built explicitly (rather than letting createCharacterControllerSystem construct its own)
  // so the locomotion AnimationSystem below can read the same manager's getHorizontalSpeed()/
  // isGrounded() — see @3jse/character's systems.ts doc comment on why that parameter exists.
  const characterManager = new CharacterControllerManager(physics);
  world.scheduler.register(createCharacterControllerSystem(physics, characterManager));
  world.scheduler.register(createPhysicsSystem(physics));
  world.scheduler.register(createCameraRigSystem());

  const save = new SaveService();
  world.setResource(SAVE_RESOURCE, save);

  const sun = level.createEntity("Sun");
  sun.object3D!.position.set(4, 6, 3);
  const directional = new THREE.DirectionalLight(0xffffff, 3);
  sun.object3D!.add(directional);

  const ambient = level.createEntity("Ambient");
  const hemi = new THREE.HemisphereLight(0x8899aa, 0x223322, 1.2);
  ambient.object3D!.add(hemi);

  const ground = level.createEntity("Ground");
  const groundMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(20, 20),
    new THREE.MeshStandardMaterial({ color: 0x3a3f4b, roughness: 0.9 }),
  );
  groundMesh.rotation.x = -Math.PI / 2;
  ground.object3D!.add(groundMesh);
  ground.addComponent("RigidBody", { bodyType: "fixed" });
  ground.addComponent("Collider", { shape: "box", sizeX: 20, sizeY: 0.2, sizeZ: 20 });

  const cube = level.createEntity("Cube");
  cube.object3D!.position.set(0, 1, 0);
  const cubeMesh = new THREE.Mesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshStandardMaterial({ color: 0x5b8cff, roughness: 0.4, metalness: 0.1 }),
  );
  cube.object3D!.add(cubeMesh);
  cube.addComponent("Spin", { degreesPerSecond: 60 });
  cube.addComponent("Health", { current: 75 });

  const sphere = level.createEntity("Sphere");
  sphere.object3D!.position.set(2.5, 0.75, 1);
  const sphereMesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.75, 32, 16),
    new THREE.MeshStandardMaterial({ color: 0xe3944f, roughness: 0.3 }),
  );
  sphere.object3D!.add(sphereMesh);
  sphere.addComponent("Health");
  sphere.addComponent("Movable", { speed: 3 }); // WASD / arrow keys, via InputManager above

  // A physics-only demonstration, deliberately separate from Cube/Sphere above: neither of
  // those combines cleanly with a Rapier body yet (Spin's manual rotateY() and Movable's manual
  // position writes both happen in the "variable" stage, after PhysicsSystem's "fixed"-stage
  // writeTransform() already overwrote the pose from the simulation that frame — combining them
  // needs kinematic-body position driving, not built yet). This crate just falls and settles.
  const crate = level.createEntity("Crate");
  crate.object3D!.position.set(-2.5, 5, -1);
  const crateMesh = new THREE.Mesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshStandardMaterial({ color: 0x8a5a2f, roughness: 0.8 }),
  );
  crate.object3D!.add(crateMesh);
  crate.addComponent("RigidBody", { bodyType: "dynamic", mass: 2 });
  crate.addComponent("Collider", { shape: "box", sizeX: 1, sizeY: 1, sizeZ: 1, restitution: 0.3 });
  crate.addComponent("Saveable"); // docs/GAMEPLAY_FRAMEWORK.md's SaveGame — where it settled persists

  // The real CharacterController + CameraRig demo (docs/GAMEPLAY_FRAMEWORK.md) — WASD/arrows to
  // move, Space to jump, camera trails behind in Play mode (see Viewport.tsx's CAMERA_FOLLOW_
  // RESOURCE handling). Spawned a little above the ground so its own gravity integration visibly
  // settles it on first Play, the same "drops in, lands" beat as Crate.
  const player = level.createEntity("Player");
  player.object3D!.position.set(3, 2, 3);
  const rig = buildCharacterRig();
  player.object3D!.add(rig.root);
  player.addComponent("CharacterController");
  player.addComponent("CameraRig");
  player.addComponent("Saveable"); // where the player ended up survives Save → reload → Load

  // Animation Graph MVP (docs/ANIMATION.md): a "Locomotion" state blending Idle→Walk by speed,
  // crossfading to a one-shot "Jump" pose while airborne. CharacterController's speed is
  // currently binary (0 or moveSpeed — no acceleration ramp), so the live blend only ever
  // resolves to pure Idle or pure Walk; the blend *math* itself is exhaustively unit-tested in
  // @3jse/animation with interpolated values a continuous speed parameter would actually hit.
  player.addComponent("AnimationController");
  const animationManager = new AnimationStateMachineManager();
  const locomotionClips = buildLocomotionClips();
  const locomotionGraph: AnimationGraphDef = {
    states: [
      {
        name: "Locomotion",
        loop: true,
        blendTree: [
          { clip: "Idle", threshold: 0 },
          { clip: "Walk", threshold: 5 },
          { clip: "Run", threshold: 10 },
        ],
      },
      { name: "Jump", clip: "Jump", loop: false },
    ],
    transitions: [
      { from: "Locomotion", to: "Jump", conditions: [{ param: "grounded", op: "==", value: 0 }], duration: 0.15 },
      { from: "Jump", to: "Locomotion", conditions: [{ param: "grounded", op: "==", value: 1 }], duration: 0.2 },
    ],
    entryState: "Locomotion",
  };
  world.scheduler.register(
    createAnimationSystem(animationManager, locomotionGraph, locomotionClips, (entity) => ({
      speed: characterManager.getHorizontalSpeed(entity.id),
      grounded: characterManager.isGrounded(entity.id) ? 1 : 0,
    })),
  );

  return { world, level };
}

/**
 * docs/RUNTIME.md's hot-reload "function swap", first real use: editing SpinSystem/MoveSystem
 * (or any other hand-written System `registerBuiltinSystems` adds) in
 * packages/runtime/src/systems/builtins.ts re-runs this callback with the freshly-transformed
 * module. `Scheduler.register()` upserts by name (see Scheduler.ts), so calling
 * `registerBuiltinSystems` again just replaces those Systems' `run` functions in place — the
 * World, Level, and every Entity's live component data are untouched, so Play-mode state (e.g.
 * a Spin entity's current rotation) survives the edit exactly as EDITOR.md's Modify-while-paused
 * flow requires. Without this `accept`, Vite would fail to hot-update the module (nothing in the
 * import chain claims it) and fall back to a full page reload, losing all Play-mode state.
 *
 * Deliberately accepts the "@3jse/runtime/systems/builtins" subpath, not the whole "@3jse/runtime"
 * barrel: the barrel re-exports ComponentRegistry, and every package's component-registration
 * file (@3jse/character, @3jse/save, …) calls registerComponent() at module scope against that
 * same registry — reloading the barrel re-runs those side effects and hits registerComponent()'s
 * "already registered" guard on the very next edit. The systems/builtins.ts subgraph is import-
 * free/type-only (see its own imports), so it's safe to reload on its own.
 */
function installHotReload(world: World): void {
  if (!import.meta.hot) return;
  import.meta.hot.accept("@3jse/runtime/systems/builtins", (mod) => {
    if (!mod) return; // Vite couldn't hot-update the module; it will force a full reload instead.
    (mod.registerBuiltinSystems as typeof registerBuiltinSystems)(world.scheduler);
  });
}
