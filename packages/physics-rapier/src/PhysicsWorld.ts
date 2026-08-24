import RAPIER from "@dimforge/rapier3d-compat";
import type { Entity } from "@3jse/runtime";
import type { ColliderData, RigidBodyData } from "./components.js";

/** The Resource key PhysicsWorld registers itself under — mirrors InputManager's
 *  INPUT_RESOURCE pattern (docs/RUNTIME.md's Resource registry). */
export const PHYSICS_RESOURCE = "Physics";

function bodyDescFor(bodyType: string): RAPIER.RigidBodyDesc {
  switch (bodyType) {
    case "fixed":
      return RAPIER.RigidBodyDesc.fixed();
    case "kinematic":
      return RAPIER.RigidBodyDesc.kinematicPositionBased();
    default:
      return RAPIER.RigidBodyDesc.dynamic();
  }
}

function colliderDescFor(collider: ColliderData): RAPIER.ColliderDesc {
  let desc: RAPIER.ColliderDesc;
  switch (collider.shape) {
    case "sphere":
      desc = RAPIER.ColliderDesc.ball(collider.radius);
      break;
    case "capsule":
      desc = RAPIER.ColliderDesc.capsule(collider.halfHeight, collider.radius);
      break;
    default:
      desc = RAPIER.ColliderDesc.cuboid(collider.sizeX / 2, collider.sizeY / 2, collider.sizeZ / 2);
  }
  return desc.setFriction(collider.friction).setRestitution(collider.restitution);
}

/**
 * Wraps a Rapier `RAPIER.World` and the Entity↔RigidBody mapping — the runtime-side half of
 * docs/PHYSICS.md's "physics bodies are Components... after stepping, a sync System writes
 * resulting transforms back to each Entity's Object3D." Rapier requires an async WASM init
 * (`RAPIER.init()`), which is why this is a static `create()` rather than a plain constructor —
 * everything else about it is synchronous, matching @3jse/runtime's System model.
 */
export class PhysicsWorld {
  private readonly world: RAPIER.World;
  private readonly bodies = new Map<string, RAPIER.RigidBody>();

  private constructor(world: RAPIER.World) {
    this.world = world;
  }

  static async create(gravity: { x: number; y: number; z: number } = { x: 0, y: -9.81, z: 0 }): Promise<PhysicsWorld> {
    await RAPIER.init();
    return new PhysicsWorld(new RAPIER.World(gravity));
  }

  /** Creates the Rapier body+collider for `entity` the first time it's seen with both RigidBody
   *  and Collider components; a no-op afterward. Recreating a body when its fields change later
   *  (e.g. switching shape) is real future work — see docs/PHYSICS.md — not built yet. */
  ensureBody(entity: Entity): void {
    if (this.bodies.has(entity.id) || !entity.object3D) return;
    const rigidBody = entity.getComponent<RigidBodyData>("RigidBody");
    const collider = entity.getComponent<ColliderData>("Collider");
    if (!rigidBody || !collider) return;

    const desc = bodyDescFor(rigidBody.bodyType)
      .setTranslation(entity.object3D.position.x, entity.object3D.position.y, entity.object3D.position.z)
      .setLinearDamping(rigidBody.linearDamping)
      .setAngularDamping(rigidBody.angularDamping);
    const body = this.world.createRigidBody(desc);
    if (rigidBody.bodyType === "dynamic") body.setAdditionalMass(rigidBody.mass, true);

    this.world.createCollider(colliderDescFor(collider), body);
    this.bodies.set(entity.id, body);
  }

  hasBody(entityId: string): boolean {
    return this.bodies.has(entityId);
  }

  /** Escape hatch to the underlying `RAPIER.World`, for physics-adjacent plugins that need more
   *  than the generic RigidBody/Collider component pattern gives them — @3jse/character's
   *  kinematic capsule controller and, later, a vehicle controller both build their own bodies
   *  and query the world directly (raycasts, `KinematicCharacterController`), the same way a
   *  real Rapier integration does outside this engine too. Not for casual use from gameplay
   *  code — that's what RigidBody/Collider components and PhysicsSystem are for. */
  raw(): RAPIER.World {
    return this.world;
  }

  removeEntity(entityId: string): void {
    const body = this.bodies.get(entityId);
    if (!body) return;
    this.world.removeRigidBody(body);
    this.bodies.delete(entityId);
  }

  /** dt in seconds — matches World.step()'s convention elsewhere in @3jse/runtime
   *  (docs/RUNTIME.md), not Rapier's own default 60Hz-fixed-timestep assumption. */
  step(dt: number): void {
    this.world.timestep = dt;
    this.world.step();
  }

  /** Writes the simulated pose back onto the Entity's Object3D — the "sync System" half of
   *  docs/PHYSICS.md's design. */
  writeTransform(entity: Entity): void {
    const body = this.bodies.get(entity.id);
    if (!body || !entity.object3D) return;
    const t = body.translation();
    const r = body.rotation();
    entity.object3D.position.set(t.x, t.y, t.z);
    entity.object3D.quaternion.set(r.x, r.y, r.z, r.w);
  }
}
