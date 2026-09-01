import * as THREE from "three/webgpu";
import { World, InputManager, INPUT_RESOURCE, type Entity, type Level } from "@3jse/runtime";
import { registerBuiltinSystems } from "@3jse/runtime/systems/builtins";
import { PhysicsWorld, PHYSICS_RESOURCE, createPhysicsSystem } from "@3jse/physics-rapier";
import {
  CharacterControllerManager,
  createCharacterControllerSystem,
  createCameraRigSystem,
} from "@3jse/character";
import { SaveService, SAVE_RESOURCE } from "@3jse/save";
import {
  AnimationStateMachineManager,
  createAnimationSystem,
  type AnimationGraphDef,
} from "@3jse/animation";

export interface ThirdPersonTemplate {
  world: World;
  level: Level;
  player: Entity;
  ground: Entity;
  input: InputManager;
  physics: PhysicsWorld;
  characterManager: CharacterControllerManager;
}

export interface ThirdPersonOptions {
  /** reuse an existing World (the editor keeps one live) instead of creating one */
  world?: World;
  levelName?: string;
  /** hook to attach visual meshes to entities — omitted for a headless build */
  decorate?: (t: {
    level: Level;
    player: Entity;
    ground: Entity;
    addProp: (name: string, position: [number, number, number]) => Entity;
  }) => void;
  /** real baked clips for the locomotion graph; must include tracks named Idle/Walk/Run/Jump.
   *  Omit for a headless build — trivial empty-track stand-ins are used. */
  clips?: THREE.AnimationClip[];
  /** CameraRig component overrides — the camera *preset* the shared character template uses
   *  (docs/ROADMAP.md Phase 6). `buildTopDownTemplate` / `buildFirstPersonTemplate` are thin
   *  wrappers that set `{ mode: ... }` here. */
  camera?: Partial<{
    mode: "thirdPerson" | "topDown" | "firstPerson" | "orbit";
    distance: number;
    height: number;
    pitchDegrees: number;
    eyeHeight: number;
    forwardOffset: number;
    orbitYawDegrees: number;
  }>;
}

const LOCOMOTION_GRAPH: AnimationGraphDef = {
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

/** Empty-track clips named to match LOCOMOTION_GRAPH so a headless build has a valid clip set
 *  with zero asset import. The editor passes real baked clips via `opts.clips`. */
function stubClips(): THREE.AnimationClip[] {
  return ["Idle", "Walk", "Run", "Jump"].map((name) => new THREE.AnimationClip(name, 1, []));
}

/**
 * docs/TEMPLATES.md's **Third Person** template, and docs/ROADMAP.md Phase 2's exit criterion
 * ("build the Third Person template end-to-end using only Phase 1–2 features"). Everything here
 * is the public Entity/Component/System API — no privileged access — so it doubles as the
 * worked example for how the Gameplay Framework packages compose:
 *
 *   InputManager  ──> CharacterControllerSystem (fixed, kinematic capsule)
 *                 ──> PhysicsSystem (fixed, commits the move, steps Rapier)
 *                 ──> CameraRigSystem (variable, third-person follow)
 *                 ──> AnimationSystem (locomotion blend tree, reads controller speed/grounded)
 *   SaveService   ──> Saveable player + props survive save → reload → load
 *
 * Async only because Rapier's WASM init is (docs/PHYSICS.md). Fully valid headless — pass no
 * `decorate` and it builds gameplay-complete with zero meshes, which is what the mechanics
 * harness (docs/REFERENCE_GAMES.md) asserts against.
 */
export async function buildThirdPersonTemplate(
  opts: ThirdPersonOptions = {},
): Promise<ThirdPersonTemplate> {
  const world = opts.world ?? new World();
  registerBuiltinSystems(world.scheduler);
  const level = world.createLevel(opts.levelName ?? "Third Person");

  const input = new InputManager();
  input.bindAxis("moveForward", ["KeyW", "ArrowUp"], ["KeyS", "ArrowDown"]);
  input.bindAxis("moveRight", ["KeyD", "ArrowRight"], ["KeyA", "ArrowLeft"]);
  input.bindAction("jump", ["Space"]);
  world.setResource(INPUT_RESOURCE, input);

  const physics = await PhysicsWorld.create();
  world.setResource(PHYSICS_RESOURCE, physics);

  const characterManager = new CharacterControllerManager(physics);
  // Registration order within "fixed": character queues its kinematic move BEFORE PhysicsSystem
  // commits it (docs/RUNTIME.md tick stages; @3jse/character systems.ts).
  world.scheduler.register(createCharacterControllerSystem(physics, characterManager));
  world.scheduler.register(createPhysicsSystem(physics));
  world.scheduler.register(createCameraRigSystem());

  const save = new SaveService();
  world.setResource(SAVE_RESOURCE, save);

  const ground = level.createEntity("Ground");
  ground.addComponent("RigidBody", { bodyType: "fixed" });
  ground.addComponent("Collider", { shape: "box", sizeX: 40, sizeY: 0.2, sizeZ: 40 });

  const player = level.createEntity("Player");
  player.object3D!.position.set(0, 2, 0);
  player.addComponent("CharacterController");
  player.addComponent("CameraRig", opts.camera);
  player.addComponent("AnimationController");
  player.addComponent("Saveable");

  const clipSet = opts.clips ?? stubClips();
  const animationManager = new AnimationStateMachineManager();
  world.scheduler.register(
    createAnimationSystem(animationManager, LOCOMOTION_GRAPH, clipSet, (entity) => ({
      speed: characterManager.getHorizontalSpeed(entity.id),
      grounded: characterManager.isGrounded(entity.id) ? 1 : 0,
    })),
  );

  if (opts.decorate) {
    const addProp = (name: string, position: [number, number, number]) => {
      const e = level.createEntity(name);
      e.object3D!.position.set(...position);
      return e;
    };
    // Give the editor a default ground plane + a light if it wants; it can also add its own.
    const sun = level.createEntity("Sun");
    sun.object3D!.add(new THREE.DirectionalLight(0xffffff, 3));
    sun.object3D!.position.set(4, 8, 3);
    opts.decorate({ level, player, ground, addProp });
  }

  return { world, level, player, ground, input, physics, characterManager };
}
