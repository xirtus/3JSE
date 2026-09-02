// @3jse/vfx — CPU particle simulation + a ParticleEmitter component/system (docs/EDITOR.md
// Particle Editor, docs/ENGINE_GAP_ANALYSIS.md §9). Headless, seeded, deterministic; buffers()
// feeds a Points/InstancedMesh. A GPU compute path (three-vfx, vendored in @3jse/extras) is
// the drop-in for large counts.

export {
  ParticlePool,
  type EmitterDef,
} from "./system.js";
export {
  sampleCurve,
  sampleGradient,
  type CurveKey,
  type GradientKey,
} from "./curve.js";
export {
  createParticleSystem,
  type ParticleEmitterData,
  type ParticleSystemDef,
} from "./components.js";

// Registers ParticleEmitter as an import side effect.
import "./components.js";
