// Phase 0 spike — archetype ECS storage with an Object3D-backed Transform.
//
// Throwaway de-risking prototype for docs/ROADMAP.md Phase 0:
//   "confirm archetype storage plus a Transform-as-Object3D bridge performs acceptably
//    (target: 10k entities, steady 60fps on a mid-range laptop) and doesn't fight
//    Three.js's own scene-graph update internals."
//
// This is NOT the shipping runtime. packages/runtime today is the Phase-1-honest naive
// Map+full-scan version (its Level.query() filters every entity every call, by design).
// This file exists only to prove the archetype layout the ENTITY_COMPONENT_MODEL.md doc
// promises is real and fast enough before it becomes load-bearing.
//
// Design:
//  - A component is either NUMERIC (SoA columns of Float32Array, one per field) or the
//    special TRANSFORM component whose storage IS a THREE.Object3D (no parallel copy).
//  - An archetype = the set of component types an entity has, keyed by a sorted signature
//    string. Each archetype holds parallel columns + a row->entityId back-index.
//  - Adding/removing a component moves the entity's row to a different archetype
//    (swap-remove from the old table, push onto the new one). Bounded cost, no per-frame
//    allocation once capacity is reached.
//  - query(types) returns the list of archetypes whose signature is a superset — systems
//    then iterate those tables directly (tight loop over typed arrays), never scanning
//    non-matching entities.

import * as THREE from "three/webgpu";

export const TRANSFORM = "Transform";

/** @typedef {{ fields: string[] }} NumericComponentSchema */

export class ArchetypeWorld {
  /** @param {Record<string, NumericComponentSchema | "transform">} schemas */
  constructor(schemas) {
    /** @type {Map<string, NumericComponentSchema | "transform">} */
    this.schemas = new Map(Object.entries(schemas));
    this.schemas.set(TRANSFORM, "transform");
    /** @type {Map<string, Archetype>} signature -> archetype */
    this.archetypes = new Map();
    /** @type {Map<number, { sig: string, row: number }>} entityId -> location */
    this.locations = new Map();
    /** cache of query signature -> matching archetypes, invalidated when a new archetype appears */
    this._queryCache = new Map();
    this._nextId = 1;
    this.scene = new THREE.Scene();
  }

  _sig(types) {
    return [...types].sort().join("|");
  }

  _archetype(types) {
    const sig = this._sig(types);
    let a = this.archetypes.get(sig);
    if (!a) {
      a = new Archetype(sig, types, this.schemas);
      this.archetypes.set(sig, a);
      this._queryCache.clear();
    }
    return a;
  }

  /**
   * Create an entity with the given component types. `init` supplies per-component field
   * values; for Transform it may supply { position:[x,y,z], parent: <entityId> }.
   * @returns {number} entityId
   */
  create(types, init = {}) {
    const id = this._nextId++;
    const a = this._archetype(types);
    const row = a.push(id);
    this.locations.set(id, { sig: a.sig, row });
    for (const t of types) {
      const schema = this.schemas.get(t);
      if (schema === "transform") {
        const obj = a.transform[row];
        const cfg = init[t] || {};
        if (cfg.position) obj.position.fromArray(cfg.position);
        const parent = cfg.parent != null ? this.getObject3D(cfg.parent) : this.scene;
        parent.add(obj);
      } else if (init[t]) {
        for (const [f, v] of Object.entries(init[t])) a.setField(t, f, row, v);
      }
    }
    return id;
  }

  getObject3D(id) {
    const loc = this.locations.get(id);
    const a = this.archetypes.get(loc.sig);
    return a.transform[loc.row];
  }

  has(id, type) {
    const loc = this.locations.get(id);
    return loc ? this.archetypes.get(loc.sig).types.includes(type) : false;
  }

  addComponent(id, type, values = {}) {
    const loc = this.locations.get(id);
    const from = this.archetypes.get(loc.sig);
    if (from.types.includes(type)) return;
    this._move(id, loc, from, [...from.types, type], { [type]: values });
  }

  removeComponent(id, type) {
    const loc = this.locations.get(id);
    const from = this.archetypes.get(loc.sig);
    if (!from.types.includes(type)) return;
    this._move(id, loc, from, from.types.filter((t) => t !== type), {});
  }

  _move(id, loc, from, newTypes, extraInit) {
    const to = this._archetype(newTypes);
    const newRow = to.push(id);
    // copy shared numeric columns
    for (const t of to.types) {
      if (this.schemas.get(t) === "transform") {
        if (from.types.includes(t)) {
          // move the existing Object3D across (keep scene-graph parent link intact)
          to.transform[newRow] = from.transform[loc.row];
        }
        continue;
      }
      if (from.types.includes(t)) {
        const schema = this.schemas.get(t);
        for (const f of schema.fields) to.setField(t, f, newRow, from.getField(t, f, loc.row));
      } else if (extraInit[t]) {
        for (const [f, v] of Object.entries(extraInit[t])) to.setField(t, f, newRow, v);
      }
    }
    // swap-remove from old archetype
    const movedId = from.swapRemove(loc.row);
    if (movedId != null) this.locations.get(movedId).row = loc.row;
    this.locations.set(id, { sig: to.sig, row: newRow });
  }

  destroy(id) {
    const loc = this.locations.get(id);
    const a = this.archetypes.get(loc.sig);
    if (a.types.includes(TRANSFORM)) a.transform[loc.row].removeFromParent();
    const movedId = a.swapRemove(loc.row);
    if (movedId != null) this.locations.get(movedId).row = loc.row;
    this.locations.delete(id);
  }

  /** @returns {Archetype[]} archetypes whose signature is a superset of `types` */
  query(types) {
    const key = this._sig(types);
    let hit = this._queryCache.get(key);
    if (!hit) {
      hit = [];
      for (const a of this.archetypes.values()) {
        if (types.every((t) => a.types.includes(t))) hit.push(a);
      }
      this._queryCache.set(key, hit);
    }
    return hit;
  }

  get entityCount() {
    return this.locations.size;
  }
}

const INITIAL_CAP = 1024;

export class Archetype {
  constructor(sig, types, schemas) {
    this.sig = sig;
    this.types = [...types];
    this.count = 0;
    this.cap = INITIAL_CAP;
    /** row -> entityId */
    this.ids = new Int32Array(this.cap);
    /** numeric columns: type -> field -> Float32Array */
    this.columns = new Map();
    /** row -> THREE.Object3D (only if this archetype has Transform) */
    this.transform = types.includes(TRANSFORM) ? [] : null;
    for (const t of types) {
      const schema = schemas.get(t);
      if (schema === "transform") continue;
      const cols = {};
      for (const f of schema.fields) cols[f] = new Float32Array(this.cap);
      this.columns.set(t, cols);
    }
  }

  _grow() {
    const cap = this.cap * 2;
    const ids = new Int32Array(cap);
    ids.set(this.ids);
    this.ids = ids;
    for (const cols of this.columns.values()) {
      for (const f of Object.keys(cols)) {
        const next = new Float32Array(cap);
        next.set(cols[f]);
        cols[f] = next;
      }
    }
    this.cap = cap;
  }

  push(id) {
    if (this.count === this.cap) this._grow();
    const row = this.count++;
    this.ids[row] = id;
    if (this.transform) this.transform[row] = new THREE.Object3D();
    return row;
  }

  /** overwrite `row` with the last row; returns the entityId that was moved (or null) */
  swapRemove(row) {
    const last = --this.count;
    if (row === last) {
      if (this.transform) this.transform[last] = undefined;
      return null;
    }
    this.ids[row] = this.ids[last];
    for (const cols of this.columns.values()) {
      for (const f of Object.keys(cols)) cols[f][row] = cols[f][last];
    }
    if (this.transform) {
      this.transform[row] = this.transform[last];
      this.transform[last] = undefined;
    }
    return this.ids[row];
  }

  col(type, field) {
    return this.columns.get(type)[field];
  }
  getField(type, field, row) {
    return this.columns.get(type)[field][row];
  }
  setField(type, field, row, v) {
    this.columns.get(type)[field][row] = v;
  }
}
