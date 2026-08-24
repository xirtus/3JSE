import * as THREE from "three/webgpu"; // see the note in @3jse/runtime's Entity.ts
import type { Entity } from "@3jse/runtime";
import {
  evaluateConditions,
  getState,
  stateClipWeights,
  type AnimationGraphDef,
  type AnimationParams,
} from "./AnimationGraph.js";

interface ActiveStateEntry {
  name: string;
  weight: number;
  fadeTarget: 0 | 1;
  fadeSpeed: number; // weight units per second
}

interface PerCharacterAnimState {
  mixer: THREE.AnimationMixer;
  actions: Map<string, THREE.AnimationAction>;
  activeStates: ActiveStateEntry[];
}

const MIN_DURATION = 0.0001;

/**
 * Drives a Three.js `AnimationMixer` from an AnimationGraphDef — docs/ANIMATION.md's state
 * machine + blend-tree combination. Deliberately doesn't use `AnimationAction.crossFadeTo()`:
 * that API only manages a two-action fade, and a blend-tree state already needs several actions
 * blended together internally (Idle/Walk/Run), so this manages every action's
 * `setEffectiveWeight()` by hand every tick instead — one weight-composition model for both
 * "which state is active" and "which clips within that state," rather than two different ones
 * fighting each other. Every action is `.play()`-ing continuously in the background the whole
 * time; visibility is entirely a matter of weight, the standard Three.js technique for blending
 * more than two simultaneous animations.
 */
export class AnimationStateMachineManager {
  private readonly characters = new Map<string, PerCharacterAnimState>();

  private ensure(entity: Entity, graph: AnimationGraphDef, clips: THREE.AnimationClip[]): PerCharacterAnimState {
    const existing = this.characters.get(entity.id);
    if (existing) return existing;

    const mixer = new THREE.AnimationMixer(entity.object3D!);
    const actions = new Map<string, THREE.AnimationAction>();
    for (const clip of clips) {
      const action = mixer.clipAction(clip);
      const owningState = graph.states.find((s) => s.clip === clip.name || s.blendTree?.some((b) => b.clip === clip.name));
      if (owningState && !owningState.loop) {
        action.setLoop(THREE.LoopOnce, 1);
        action.clampWhenFinished = true;
      }
      action.play();
      action.setEffectiveWeight(0);
      actions.set(clip.name, action);
    }

    const state: PerCharacterAnimState = {
      mixer,
      actions,
      activeStates: [{ name: graph.entryState, weight: 1, fadeTarget: 1, fadeSpeed: 0 }],
    };
    this.characters.set(entity.id, state);
    return state;
  }

  step(entity: Entity, graph: AnimationGraphDef, clips: THREE.AnimationClip[], params: AnimationParams, dt: number): void {
    if (!entity.object3D) return;
    const state = this.ensure(entity, graph, clips);
    state.mixer.update(dt);

    const primary = state.activeStates.find((s) => s.fadeTarget === 1);
    if (primary) {
      const candidates = graph.transitions.filter(
        (t) => (t.from === primary.name || t.from === "*") && t.to !== primary.name,
      );
      const fired = candidates.find((t) => evaluateConditions(t.conditions, params));
      if (fired) {
        const fadeSpeed = 1 / Math.max(fired.duration ?? 0.2, MIN_DURATION);
        primary.fadeTarget = 0;
        primary.fadeSpeed = fadeSpeed;

        const existingTarget = state.activeStates.find((s) => s.name === fired.to);
        if (existingTarget) {
          existingTarget.fadeTarget = 1;
          existingTarget.fadeSpeed = fadeSpeed;
        } else {
          state.activeStates.push({ name: fired.to, weight: 0, fadeTarget: 1, fadeSpeed });
        }
      }
    }

    for (const entry of state.activeStates) {
      if (entry.fadeTarget === 1) entry.weight = Math.min(1, entry.weight + entry.fadeSpeed * dt);
      else entry.weight = Math.max(0, entry.weight - entry.fadeSpeed * dt);
    }
    state.activeStates = state.activeStates.filter((s) => !(s.weight === 0 && s.fadeTarget === 0));

    const finalWeights = new Map<string, number>();
    for (const entry of state.activeStates) {
      const stateDef = getState(graph, entry.name);
      if (!stateDef) continue;
      for (const { clip, weight } of stateClipWeights(stateDef, params)) {
        finalWeights.set(clip, (finalWeights.get(clip) ?? 0) + entry.weight * weight);
      }
    }
    for (const [clipName, action] of state.actions) {
      action.setEffectiveWeight(finalWeights.get(clipName) ?? 0);
    }
  }

  /** The state currently fading in or fully active (as opposed to one still fading out) —
   *  what an Inspector or a gameplay condition ("is the player in the Jump state") would want. */
  getCurrentStateName(entityId: string): string | undefined {
    return this.characters.get(entityId)?.activeStates.find((s) => s.fadeTarget === 1)?.name;
  }
}
