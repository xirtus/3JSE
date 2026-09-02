// Package registry / discovery surface — docs/ROADMAP.md Phase 6, docs/PLUGIN_ARCHITECTURE.md
// "Package examples". The canonical list of official @3jse/* packages with what each provides
// and which extension points it uses — what an editor "Packages" panel or a `3jse add` CLI
// enumerates. Third-party plugins register through PluginHost and are merged in at runtime.

import type { ExtensionPoint } from "./manifest.js";

export interface PackageEntry {
  id: string;
  capability: string;
  /** roadmap phase the package belongs to */
  phase: number;
  status: "shipped" | "partial" | "planned";
  /** extension points the package contributes to */
  points: ExtensionPoint[];
  official: true;
}

/** Keep in sync with the engine-package skill's rung-0 table. */
export const PACKAGE_CATALOG: PackageEntry[] = [
  { id: "@3jse/runtime", capability: "World/Level/Entity/Component/Scheduler/Prefab/Input + entity handles + snapshot", phase: 1, status: "shipped", points: ["components", "systems", "resources"], official: true },
  { id: "@3jse/ir", capability: "Gameplay IR: frontend + interpreter + JS emitter + source map", phase: 3, status: "shipped", points: ["graphNodes"], official: true },
  { id: "@3jse/graph", capability: "Node canvas over the IR", phase: 3, status: "partial", points: ["editorPanels"], official: true },
  { id: "@3jse/assets", capability: "glTF/GLB import, thumbnails, metadata, character detection", phase: 1, status: "shipped", points: ["importers"], official: true },
  { id: "@3jse/project", capability: "Project save/load in the PROJECT_FORMAT tree", phase: 1, status: "shipped", points: [], official: true },
  { id: "@3jse/character", capability: "Character controller + camera rig (thirdPerson/topDown/firstPerson/orbit presets)", phase: 2, status: "shipped", points: ["components", "systems"], official: true },
  { id: "@3jse/animation", capability: "Animation state machine + blend tree + TwoBoneIK + clip retargeting", phase: 2, status: "shipped", points: ["components", "systems"], official: true },
  { id: "@3jse/physics-rapier", capability: "Rapier physics integration", phase: 2, status: "shipped", points: ["components", "systems", "resources"], official: true },
  { id: "@3jse/save", capability: "Save games (tagged-component snapshots)", phase: 2, status: "shipped", points: ["components"], official: true },
  { id: "@3jse/spawning", capability: "Spawn points + object pooling", phase: 2, status: "shipped", points: ["components", "systems"], official: true },
  { id: "@3jse/templates", capability: "Starter templates (Third Person, Top-Down, First Person)", phase: 6, status: "partial", points: [], official: true },
  { id: "@3jse/networking", capability: "Netcode: replication, authority, prediction, RPC, priority/bandwidth model, lag compensation, WebSocket transport", phase: 6, status: "partial", points: ["components", "systems"], official: true },
  { id: "@3jse/cinematics", capability: "Timeline / sequencer runtime", phase: 5, status: "shipped", points: ["components", "systems"], official: true },
  { id: "@3jse/playground", capability: "Shareable-URL snippet sandbox", phase: 3, status: "partial", points: [], official: true },
  { id: "@3jse/replay", capability: "Input recording + deterministic replay", phase: 5, status: "shipped", points: [], official: true },
  { id: "@3jse/agent", capability: "MCP-shaped agent tool server + headless perf/state probes", phase: 4, status: "partial", points: ["agentTools"], official: true },
  { id: "@3jse/atlas", capability: "Semantic system model / FeelSpec / Atlas graph compiler / agent-scoping", phase: 5, status: "partial", points: ["editorPanels"], official: true },
  { id: "@3jse/plugins", capability: "Plugin manifest, host, extension-point versioning, package catalog", phase: 6, status: "shipped", points: [], official: true },
  { id: "@3jse/packaging", capability: "Publish pipeline: tree-shake, asset finalize, manifest, third-party notices, static-host files", phase: 8, status: "shipped", points: ["buildTargets"], official: true },
  { id: "@3jse/audio", capability: "Bus mixer, AudioSource/Listener/ReverbZone, event router, musical grid + MIDI/OSC, WebAudioBackend", phase: 4, status: "shipped", points: ["components", "systems"], official: true },
  { id: "@3jse/ui", capability: "UI/HUD: retained widget tree, flexbox-subset layout, data binding to World state, hit-test, renderer seam", phase: 4, status: "partial", points: ["components"], official: true },
  { id: "@3jse/materials", capability: "Material Graph -> Three.js TSL codegen + CPU reference evaluator + graph validation", phase: 5, status: "shipped", points: ["materialNodes", "editorPanels"], official: true },
  { id: "@3jse/terrain", capability: "Heightfield sampling, chunk mesher, LOD selection, bounded-residency streamer", phase: 5, status: "partial", points: ["components", "systems"], official: true },
  { id: "@3jse/foliage", capability: "Deterministic field scatter -> InstancedMesh instance data (slope/height/exclusion/spline constraints)", phase: 5, status: "partial", points: ["components", "systems"], official: true },
  { id: "@3jse/nav", capability: "Grid nav bake / A* + string-pull / flow field / NavAgent + a PolyNavMesh seam adapting recast-navigation-js", phase: 6, status: "shipped", points: ["components", "systems"], official: true },
  { id: "@3jse/vfx", capability: "CPU particle sim (SoA, seeded), size/color curves over life, ParticleEmitter component/system", phase: 5, status: "shipped", points: ["components", "systems", "editorPanels"], official: true },
  { id: "@3jse/cli", capability: "3jse command: publish (runs @3jse/packaging + esbuild-or-build.mjs), info (package catalog)", phase: 8, status: "partial", points: ["buildTargets"], official: true },
  { id: "@3jse/render", capability: "THREE bridge: terrain chunk BufferGeometry / foliage InstancedMesh / particle Points from @3jse/{terrain,foliage,vfx}", phase: 5, status: "partial", points: ["components", "systems"], official: true },
  { id: "@3jse/extras", capability: "Vendored MIT ecosystem libs (mesh-bvh, troika text, postprocessing…)", phase: 5, status: "shipped", points: [], official: true },
  { id: "@3jse/vendor", capability: "Vendor registry + fetcher; Tier A wraps (poseidon/gaia/dryad/demiurge)", phase: 5, status: "partial", points: [], official: true },
  { id: "@3jse/water-poseidon", capability: "WebGPU spectral ocean (wraps owenyuwono/poseidon)", phase: 5, status: "partial", points: ["components", "systems"], official: true },
  { id: "@3jse/foliage-gaia", capability: "Procedural grass (wraps owenyuwono/gaia)", phase: 5, status: "partial", points: ["components", "systems"], official: true },
  { id: "@3jse/flora-dryad", capability: "Procedural trees (wraps owenyuwono/dryad)", phase: 5, status: "partial", points: ["components", "systems"], official: true },
  { id: "@3jse/terrain-demiurge", capability: "Procedural terrain (adapts owenyuwono/demiurge)", phase: 5, status: "partial", points: ["components", "systems"], official: true },
];

export function findPackage(id: string): PackageEntry | undefined {
  return PACKAGE_CATALOG.find((p) => p.id === id);
}

export function packagesForPhase(phase: number): PackageEntry[] {
  return PACKAGE_CATALOG.filter((p) => p.phase === phase);
}

export function packagesByStatus(status: PackageEntry["status"]): PackageEntry[] {
  return PACKAGE_CATALOG.filter((p) => p.status === status);
}
