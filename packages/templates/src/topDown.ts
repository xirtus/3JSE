import { buildThirdPersonTemplate, type ThirdPersonOptions, type ThirdPersonTemplate } from "./thirdPerson.js";

/**
 * docs/TEMPLATES.md's **Top-Down** starter (twin-stick / overhead action). Identical wiring to
 * the Third Person template — input → CharacterController → physics → CameraRig → Animation →
 * Save — only the camera preset differs: an overhead rig tilted `pitchDegrees` toward the
 * player. No new System; `@3jse/character`'s CameraRig gained camera *presets* for exactly this
 * (docs/ROADMAP.md Phase 6).
 */
export function buildTopDownTemplate(opts: ThirdPersonOptions = {}): Promise<ThirdPersonTemplate> {
  return buildThirdPersonTemplate({
    ...opts,
    levelName: opts.levelName ?? "Top Down",
    camera: { mode: "topDown", distance: 16, pitchDegrees: 25, ...opts.camera },
  });
}
