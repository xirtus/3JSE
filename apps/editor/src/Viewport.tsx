import { useEffect, useRef } from "react";
import * as THREE from "three/webgpu";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { TransformControls } from "three/addons/controls/TransformControls.js";
import { INPUT_RESOURCE, type InputManager, type Level, type World } from "@3jse/runtime";
import { CAMERA_FOLLOW_RESOURCE, type CameraPose } from "@3jse/character";
import type { ColliderData } from "@3jse/physics-rapier";
import { fbm, valueNoise2D, sampleSlope, createSplatMap, paintSplat } from "@3jse/terrain";
import { TerrainRenderer, FoliageRenderer, GpuParticleRenderer, terrainSplatMaterial, type TerrainData, type FoliageFieldData } from "@3jse/render";
import { getPerfRecorder } from "./perf.js";
import { particleSystem } from "./vfxScene.js";

interface ViewportProps {
  world: World;
  level: Level;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  playing: boolean;
}

/**
 * The live WebGPU render of the active Level, running the same World the rest of the editor
 * edits — docs/EDITOR.md. WebGPURenderer falls back to its WebGL backend automatically when
 * WebGPU isn't available (docs/RENDERING.md, docs/PERFORMANCE.md); nothing here special-cases it.
 */
export function Viewport({ world, level, selectedId, onSelect, playing }: ViewportProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const transformRef = useRef<TransformControls | null>(null);
  const playingRef = useRef(playing);
  const onSelectRef = useRef(onSelect);
  const selectedIdRef = useRef(selectedId);

  playingRef.current = playing;
  onSelectRef.current = onSelect;
  selectedIdRef.current = selectedId;

  // Mount effect: owns the renderer/camera/controls for the Viewport's whole lifetime.
  // selectedId and playing are read through refs so this never tears the renderer down.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let disposed = false;
    let cancelled = false;
    let frameId = 0;

    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 1000);
    camera.position.set(5, 4, 7);
    camera.lookAt(0, 0.5, 0);

    const renderer = new THREE.WebGPURenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    const grid = new THREE.GridHelper(20, 20, 0x4a5166, 0x2a2f3a);
    level.scene.add(grid);

    const orbit = new OrbitControls(camera, renderer.domElement);
    orbit.target.set(0, 0.5, 0);
    orbit.enableDamping = true;

    const transform = new TransformControls(camera, renderer.domElement);
    const transformHelper = transform.getHelper();
    level.scene.add(transformHelper);
    transform.addEventListener("dragging-changed", (event) => {
      orbit.enabled = !(event as unknown as { value: boolean }).value;
    });
    transformRef.current = transform;

    // docs/PHYSICS.md's Collision Editor gizmo, MVP slice: a live wireframe of the selected
    // Entity's Collider (packages/physics-rapier's PhysicsPanel.tsx edits the same data this
    // reads each frame). Each of the three shapes is a *unit* primitive (radius/half-extent 1)
    // so the Collider's own fields can drive it via plain Object3D.scale — no per-shape geometry
    // rebuild on every edit. Not raycast-picked (added directly to the scene, not under any
    // Entity's object3D — same reason the grid and transformHelper are excluded, see the click
    // handler below). Capsule scaling is a cosmetic approximation (non-uniform scale stretches
    // its hemispherical caps into ellipsoids) — fine for a visual indicator, not claimed as
    // physically exact; the actual Rapier body uses the real radius/halfHeight params.
    const colliderGeoms = {
      box: new THREE.BoxGeometry(1, 1, 1),
      sphere: new THREE.SphereGeometry(1, 16, 12),
      capsule: new THREE.CapsuleGeometry(1, 2, 8, 16),
    };
    const colliderMaterial = new THREE.MeshBasicMaterial({
      color: 0x33ddaa,
      wireframe: true,
      depthTest: false,
      transparent: true,
      opacity: 0.85,
    });
    const colliderHelper = new THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>(
      colliderGeoms.box,
      colliderMaterial,
    );
    colliderHelper.visible = false;
    level.scene.add(colliderHelper);

    // --- @3jse/render bridges (docs/ENGINE_GAP_ANALYSIS.md §6) -------------------------------
    // Build renderers from the authoring components; @3jse/{terrain,foliage,vfx} do the sim.
    const terrainEntity = level.allEntities.find((e) => e.hasComponent("Terrain"));
    let terrainRenderer: TerrainRenderer | undefined;
    if (terrainEntity) {
      const d = terrainEntity.getComponent<TerrainData>("Terrain")!;
      const base = terrainEntity.object3D?.position ?? new THREE.Vector3();
      const sampler = fbm(valueNoise2D(d.seed), 4, 2, 0.5, d.heightScale, d.frequency);
      const shifted = (x: number, z: number) => sampler(x - base.x, z - base.z) + base.y;

      // Splat material: grass base, rock on steep ground, sand in the low flats. Seeded by
      // slope + height so it varies without hand-painting; the editor's brush would edit this.
      const splatWorld = d.chunkSize * (d.ring * 2 + 1);
      const splat = createSplatMap({ resolution: 96, layers: 3, worldSize: splatWorld, originX: base.x - splatWorld / 2, originZ: base.z - splatWorld / 2, baseLayer: 0 });
      for (let i = 0; i < 96; i++) {
        for (let j = 0; j < 96; j++) {
          const wx = base.x - splatWorld / 2 + ((i + 0.5) / 96) * splatWorld;
          const wz = base.z - splatWorld / 2 + ((j + 0.5) / 96) * splatWorld;
          const slope = sampleSlope(shifted, wx, wz, 1);
          if (slope > 0.5) paintSplat(splat, { x: wx, z: wz, radius: splatWorld / 96, layer: 1, strength: Math.min(1, (slope - 0.5) * 2), falloff: 0 });
          else if (shifted(wx, wz) < base.y + d.heightScale * 0.15) paintSplat(splat, { x: wx, z: wz, radius: splatWorld / 96, layer: 2, strength: 0.6, falloff: 0 });
        }
      }
      const solid = (hex: number) => {
        const t = new THREE.DataTexture(new Uint8Array([(hex >> 16) & 255, (hex >> 8) & 255, hex & 255, 255]), 1, 1, THREE.RGBAFormat);
        t.needsUpdate = true;
        return t;
      };
      const splatMat = terrainSplatMaterial({
        splat,
        layers: [solid(0x5c7a3a), solid(0x6b6459), solid(0xc2b280)],
      });

      terrainRenderer = new TerrainRenderer(level.scene, shifted, {
        chunkSize: d.chunkSize,
        ring: d.ring,
        baseResolution: d.baseResolution,
      }, splatMat.material);
    }

    const foliageRenderer = new FoliageRenderer(level.scene);
    const grassSpecies = {
      id: "grass",
      geometry: new THREE.ConeGeometry(0.12, 0.7, 4),
      material: new THREE.MeshStandardMaterial({ color: 0x5c8a3a, roughness: 1 }),
    };

    const particleRenderer = new GpuParticleRenderer(level.scene);
    // --------------------------------------------------------------------------------------------

    // Only Entities' own transforms are pickable — the grid and the gizmo helper were added
    // directly to the scene, not under any Entity's object3D, so they're excluded by construction
    // rather than needing a type-based filter after the fact.
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    function handleClick(event: MouseEvent) {
      if (transform.dragging) return;
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      const targets = level.allEntities
        .map((e) => e.object3D)
        .filter((o): o is THREE.Object3D => o !== null);
      const hit = raycaster.intersectObjects(targets, true)[0];
      const entity = hit ? level.findEntityFromObject3D(hit.object) : undefined;
      onSelectRef.current(entity ? entity.id : null);
    }
    renderer.domElement.addEventListener("click", handleClick);

    // Keyboard input is sampled globally, not scoped to the canvas — matches how a shipped
    // game reads input (docs/GAMEPLAY_FRAMEWORK.md's InputManager), not an editor-only quirk.
    const input = world.getResource<InputManager>(INPUT_RESOURCE);
    const detachInput = input?.attach(window);

    function resize() {
      if (!container) return; // narrowing from the guard above doesn't cross into this
      // nested function declaration, so it's re-checked here rather than asserted away.
      const w = container.clientWidth;
      const h = container.clientHeight;
      if (w === 0 || h === 0) return;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    }
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(container);

    // Tracks a mode transition, not per-frame state — see the doc comment further down for why
    // orbit.enabled is only ever touched *entering or leaving* follow mode, never unconditionally
    // each frame (that would fight TransformControls' own orbit.enabled toggle during a gizmo
    // drag).
    let followingCamera = false;

    let lastTime = performance.now();
    function animate() {
      if (disposed) return;
      frameId = requestAnimationFrame(animate);
      const now = performance.now();
      const dt = Math.min((now - lastTime) / 1000, 0.1);
      lastTime = now;

      if (playingRef.current) {
        // The Profiler panel's numbers (docs/PERFORMANCE.md) are this exact step's real cost —
        // see perf.ts's doc comment on why it's fed here instead of a separate simulated run.
        const perf = getPerfRecorder(world);
        const stepStart = perf ? performance.now() : 0;
        world.step(dt);
        if (perf) perf.record(performance.now() - stepStart);
      }
      input?.endFrame();

      // A CameraRig-carrying Entity (docs/GAMEPLAY_FRAMEWORK.md's CameraRig, @3jse/character)
      // publishes a desired pose here each tick it runs — i.e. only while playing. Hand the
      // render camera fully to it when present; free OrbitControls navigation otherwise. Known,
      // accepted gap: dragging the transform gizmo *while* the follow camera is active would
      // fight this on drag-release (see TransformControls' dragging-changed listener above) —
      // an unusual enough combination not to be worth a bigger state machine for yet.
      const followPose = playingRef.current
        ? world.getResource<CameraPose>(CAMERA_FOLLOW_RESOURCE)
        : undefined;
      if (followPose) {
        if (!followingCamera) {
          orbit.enabled = false;
          followingCamera = true;
        }
        camera.position.set(followPose.position.x, followPose.position.y, followPose.position.z);
        camera.lookAt(followPose.lookAt.x, followPose.lookAt.y, followPose.lookAt.z);
      } else {
        if (followingCamera) {
          orbit.enabled = true;
          followingCamera = false;
        }
        orbit.update();
      }

      // @3jse/render: stream the headless cores' output into the scene each frame.
      const focus = followPose ? followPose.lookAt : orbit.target;
      terrainRenderer?.update(focus.x, focus.z);
      const meadow = level.allEntities.find((e) => e.hasComponent("FoliageField"));
      if (meadow) {
        const fd = meadow.getComponent<FoliageFieldData>("FoliageField")!;
        const c = meadow.object3D!.position;
        const half = fd.areaSize / 2;
        foliageRenderer.set(
          grassSpecies,
          { minX: c.x - half, minZ: c.z - half, maxX: c.x + half, maxZ: c.z + half },
          {
            density: fd.density,
            seed: fd.seed,
            ground: terrainRenderer ? (x, z) => terrainRenderer!.heightAt(x, z) : () => 0,
            constraints: { slopeMax: fd.slopeMax },
          },
          `${fd.seed}:${fd.density}:${fd.areaSize}:${c.x},${c.z}`,
        );
      }
      particleRenderer.sync(particleSystem.pools);

      const selEntity = selectedIdRef.current ? level.getEntity(selectedIdRef.current) : undefined;
      const collider = selEntity?.object3D ? selEntity.getComponent<ColliderData>("Collider") : undefined;
      if (collider && selEntity?.object3D) {
        colliderHelper.visible = true;
        colliderHelper.geometry = colliderGeoms[collider.shape as keyof typeof colliderGeoms] ?? colliderGeoms.box;
        selEntity.object3D.getWorldPosition(colliderHelper.position);
        selEntity.object3D.getWorldQuaternion(colliderHelper.quaternion);
        if (collider.shape === "sphere") colliderHelper.scale.setScalar(collider.radius);
        else if (collider.shape === "capsule") colliderHelper.scale.set(collider.radius, collider.halfHeight, collider.radius);
        else colliderHelper.scale.set(collider.sizeX, collider.sizeY, collider.sizeZ);
      } else {
        colliderHelper.visible = false;
      }

      renderer.render(level.scene, camera);
    }

    renderer.init().then(() => {
      if (cancelled) return;
      container.appendChild(renderer.domElement);
      resize();
      animate();
    });

    return () => {
      disposed = true;
      cancelled = true;
      transformRef.current = null;
      cancelAnimationFrame(frameId);
      resizeObserver.disconnect();
      detachInput?.();
      renderer.domElement.removeEventListener("click", handleClick);
      orbit.dispose();
      transform.dispose();
      terrainRenderer?.dispose();
      foliageRenderer.dispose();
      particleRenderer.dispose();
      grassSpecies.geometry.dispose();
      (grassSpecies.material as THREE.Material).dispose();
      level.scene.remove(grid, transformHelper, colliderHelper);
      grid.geometry.dispose();
      (grid.material as THREE.Material).dispose();
      colliderGeoms.box.dispose();
      colliderGeoms.sphere.dispose();
      colliderGeoms.capsule.dispose();
      colliderMaterial.dispose();
      renderer.domElement.remove();
      renderer.dispose();
    };
  }, [level, world]);

  // Keeps the gizmo attached to whichever Entity is selected, independent of the render loop.
  useEffect(() => {
    const transform = transformRef.current;
    if (!transform) return;
    const entity = selectedId ? level.getEntity(selectedId) : undefined;
    if (entity?.object3D) {
      transform.attach(entity.object3D);
    } else {
      transform.detach();
    }
  }, [selectedId, level]);

  return <div ref={containerRef} style={{ width: "100%", height: "100%", position: "relative" }} />;
}
