import { buildThirdPersonTemplate, type ThirdPersonOptions, type ThirdPersonTemplate } from "./thirdPerson.js";

/**
 * docs/TEMPLATES.md's **First Person** starter. Same wiring as the Third Person template — the
 * only difference is the camera preset: it rides at the player's eye, looking where the
 * character faces (`@3jse/character`'s `firstPerson` CameraRig mode). The character's
 * turn-to-face-movement still applies, so movement keys alone drive a legible first-person
 * view; mouse-look is follow-up work (see CameraRig.ts's doc comment).
 */
export function buildFirstPersonTemplate(opts: ThirdPersonOptions = {}): Promise<ThirdPersonTemplate> {
  return buildThirdPersonTemplate({
    ...opts,
    levelName: opts.levelName ?? "First Person",
    camera: { mode: "firstPerson", eyeHeight: 1.7, forwardOffset: 0.15, ...opts.camera },
  });
}
