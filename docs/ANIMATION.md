# Animation

## Foundation

3JSE builds directly on Three.js's `AnimationMixer` and `AnimationClip` for clip playback and blending primitives — the same posture as the rest of the engine toward Three.js (`ARCHITECTURE.md`). What 3JSE adds is the authoring and orchestration layer Three.js deliberately leaves to the application: state machines, blend trees/spaces, retargeting, and IK.

## Animation Graph

A specialized 3JSE Graph scope (`VISUAL_SCRIPTING.md`) built from animation-specific node families sharing the same underlying IR and debugger:

- **State machine nodes**: states hold a clip or blend tree; guarded transitions (typed conditions against Component fields — e.g. `Speed > 0.1`); entry/exit events fire as ordinary 3IR events other graphs can listen to.
- **Blend trees / blend spaces**: 1D (e.g. walk↔run by speed) and 2D (e.g. move-direction blend space) nodes, sampling multiple clips and producing a weighted pose.
- **Sync/event nodes**: notify-style markers on a clip (footstep, hit-frame) surfaced as 3IR events so gameplay graphs can react (spawn a footstep VFX, apply damage on a hit-frame) without polling animation state.
- **IK nodes**: two-bone IK (limbs), look-at (head/torso aim), and foot-placement/ground-adaption solvers, layered on top of the base pose produced by the state machine.

## Skeletal retargeting

A named humanoid bone-mapping standard (root/hips/spine/head/limb chain naming convention, aligned with the character-detection heuristics in `ASSET_PIPELINE.md`) lets a clip authored on one skeleton play on another compatible skeleton via a retarget map — generated automatically when both skeletons match the standard, editable manually when they don't. This is what makes template character controllers (`TEMPLATES.md`) usable with a project's own custom character mesh without hand-rebuilding every clip.

## Editor tooling

The Animation Tools panel (`EDITOR.md`) provides a timeline for clip scrubbing/trimming, the state-machine/blend-tree graph canvas, a skeleton viewer for bone-weight and IK-chain inspection, and live preview against the currently-selected Entity in the Viewport — changes to a blend tree are visible on the actual character immediately, using the same "edit while Play is paused" model described in `EDITOR.md`.

## Performance

Skinning is GPU-driven (bone matrices uploaded to a texture/buffer per Three.js's existing skinning path); the mixer/blend-tree evaluation for many simultaneously-animated Entities (crowds) is a documented target for the WASM emitter path noted in `GAMEPLAY_IR.md` and the instancing strategy in `PERFORMANCE.md`, not a default requirement for typical character counts.
