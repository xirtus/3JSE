// Phase 0 spike — the naive baseline: entities as heterogeneous objects, components in a
// per-entity Map, and every system re-scans the full entity array each tick (filter by
// `hasAll`). This mirrors packages/runtime/src/Level.ts's current query() exactly — the
// point is to measure what the archetype layout buys over the shipping Phase-1 code.

import * as THREE from "three/webgpu";

export class NaiveWorld {
  constructor() {
    this.entities = [];
    this.scene = new THREE.Scene();
    this._nextId = 1;
  }

  create(types, init = {}) {
    const e = { id: this._nextId++, components: new Map(), object3D: null };
    for (const t of types) {
      if (t === "Transform") {
        e.object3D = new THREE.Object3D();
        const cfg = init[t] || {};
        if (cfg.position) e.object3D.position.fromArray(cfg.position);
        (cfg.parent ? cfg.parent.object3D : this.scene).add(e.object3D);
      } else {
        e.components.set(t, { ...(init[t] || {}) });
      }
    }
    this.entities.push(e);
    return e;
  }

  hasAll(e, types) {
    return types.every((t) => (t === "Transform" ? e.object3D : e.components.has(t)));
  }

  query(types) {
    return this.entities.filter((e) => this.hasAll(e, types));
  }

  get entityCount() {
    return this.entities.length;
  }
}
