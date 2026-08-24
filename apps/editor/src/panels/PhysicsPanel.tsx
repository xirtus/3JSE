import { useState } from "react";
import * as THREE from "three/webgpu";
import { InputNumber, Button } from "@galacean/editor-ui";
import type { ColliderData } from "@3jse/physics-rapier";
import type { EditorContext } from "./types.js";

const SHAPES = [
  { value: "box", label: "Box" },
  { value: "sphere", label: "Sphere" },
  { value: "capsule", label: "Capsule" },
];

/**
 * docs/PHYSICS.md's Collision Editor, MVP slice: shape switching, shape-specific numeric
 * fields, and "Fit to Mesh Bounds" (a stand-in for the asset pipeline's collider suggestions,
 * which don't exist yet — this computes the same AABB-from-mesh idea directly from the
 * Entity's rendered geometry instead). The live wireframe gizmo that mirrors these fields in
 * the Viewport lives in Viewport.tsx, not here — this panel is the "exact numeric entry" half
 * of docs/PHYSICS.md's "gizmo-first, with exact numeric entry in the Inspector."
 *
 * Deliberately not built here yet: drag-to-resize handles on the gizmo itself, convex-hull
 * (needs the asset pipeline's mesh analysis, docs/ASSET_PIPELINE.md — not built), compound
 * colliders, and constraints/joints. All real future work, not faked.
 */
export function PhysicsPanel({ ctx }: { ctx: EditorContext }) {
  const [, forceTick] = useState(0);
  const entity = ctx.selectedEntity;

  if (!entity) {
    return (
      <div className="panel-empty">
        <p>Select an Entity to edit its collider.</p>
      </div>
    );
  }

  const collider = entity.getComponent<ColliderData>("Collider");

  if (!collider) {
    return (
      <div className="panel-empty">
        <p>"{entity.name}" has no Collider.</p>
        <Button
          size="xs"
          onClick={() => {
            entity.addComponent("Collider");
            ctx.refresh();
            forceTick((n) => n + 1);
          }}
        >
          Add Collider
        </Button>
      </div>
    );
  }

  function set<K extends keyof ColliderData>(key: K, value: ColliderData[K]) {
    collider![key] = value;
    forceTick((n) => n + 1);
  }

  function fitToMeshBounds() {
    const box = new THREE.Box3();
    let found = false;
    for (const child of entity!.object3D?.children ?? []) {
      if (!(child instanceof THREE.Mesh)) continue;
      box.expandByObject(child);
      found = true;
    }
    if (!found) {
      ctx.pushLog("warn", `"${entity!.name}" has no mesh to fit a collider to.`);
      return;
    }
    const size = box.getSize(new THREE.Vector3());
    if (collider!.shape === "sphere") {
      set("radius", Math.max(size.x, size.y, size.z) / 2);
    } else if (collider!.shape === "capsule") {
      const radius = Math.max(size.x, size.z) / 2;
      set("radius", radius);
      set("halfHeight", Math.max(size.y / 2 - radius, 0.01));
    } else {
      set("sizeX", size.x);
      set("sizeY", size.y);
      set("sizeZ", size.z);
    }
    ctx.pushLog("info", `Fit "${entity!.name}"'s collider to its mesh bounds.`);
  }

  return (
    <div className="settings-panel">
      <div className="component-title">
        <span>{entity.name} — Collider</span>
      </div>

      <div className="field-row">
        <span className="field-label">Shape</span>
        <select value={collider.shape} onChange={(e) => set("shape", e.target.value)}>
          {SHAPES.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
      </div>

      {collider.shape === "box" && (
        <>
          <NumberField label="Size X" value={collider.sizeX} min={0.01} max={100} step={0.1} onChange={(v) => set("sizeX", v)} />
          <NumberField label="Size Y" value={collider.sizeY} min={0.01} max={100} step={0.1} onChange={(v) => set("sizeY", v)} />
          <NumberField label="Size Z" value={collider.sizeZ} min={0.01} max={100} step={0.1} onChange={(v) => set("sizeZ", v)} />
        </>
      )}
      {collider.shape === "sphere" && (
        <NumberField label="Radius" value={collider.radius} min={0.01} max={50} step={0.05} onChange={(v) => set("radius", v)} />
      )}
      {collider.shape === "capsule" && (
        <>
          <NumberField label="Radius" value={collider.radius} min={0.01} max={50} step={0.05} onChange={(v) => set("radius", v)} />
          <NumberField
            label="Half Height"
            value={collider.halfHeight}
            min={0.01}
            max={50}
            step={0.05}
            onChange={(v) => set("halfHeight", v)}
          />
        </>
      )}

      <NumberField label="Friction" value={collider.friction} min={0} max={2} step={0.05} onChange={(v) => set("friction", v)} />
      <NumberField
        label="Restitution"
        value={collider.restitution}
        min={0}
        max={1}
        step={0.05}
        onChange={(v) => set("restitution", v)}
      />

      <Button size="xs" variant="outline" onClick={fitToMeshBounds}>
        Fit to Mesh Bounds
      </Button>

      <p className="panel-empty-inline" style={{ marginTop: 10 }}>
        Editing these fields updates the Entity's data immediately; the live Rapier body only
        picks up a shape/size change the next time it's (re)created — docs/PHYSICS.md.
      </p>
    </div>
  );
}

function NumberField({
  label,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="field-row">
      <span className="field-label">{label}</span>
      <InputNumber size="xs" value={value} min={min} max={max} step={step} onValueChange={onChange} />
    </div>
  );
}
