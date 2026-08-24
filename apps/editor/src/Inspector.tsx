import { useEffect, useRef, useState } from "react";
import { Button, InputNumber } from "@galacean/editor-ui";
import {
  diffPrefabOverrides,
  getComponentSchema,
  listComponentSchemas,
  type ComponentField,
  type Entity,
  type Prefab,
} from "@3jse/runtime";

const RAD2DEG = 180 / Math.PI;
const DEG2RAD = Math.PI / 180;

interface Vec3 {
  x: number;
  y: number;
  z: number;
}

interface InspectorProps {
  entity: Entity | null;
  prefabs: Prefab[];
  onSaveAsPrefab: (entity: Entity) => void;
}

/**
 * Generated directly from each Component's schema (docs/ENTITY_COMPONENT_MODEL.md,
 * docs/PLUGIN_ARCHITECTURE.md's "Inspector field renderers" extension point) — there is no
 * hand-written Health/Spin-specific UI here, only a dispatch on ComponentField.type.
 */
export function Inspector({ entity, prefabs, onSaveAsPrefab }: InspectorProps) {
  const [, forceTick] = useState(0);

  // Polls the live Object3D each frame so the panel reflects gizmo drags and running Systems
  // (e.g. SpinSystem) instead of only updating on explicit field edits.
  useEffect(() => {
    if (!entity) return;
    let frame = requestAnimationFrame(function loop() {
      forceTick((n) => n + 1);
      frame = requestAnimationFrame(loop);
    });
    return () => cancelAnimationFrame(frame);
  }, [entity]);

  if (!entity) {
    return (
      <div className="panel panel-inspector panel-empty">
        <p>Select an Entity to inspect it.</p>
      </div>
    );
  }

  const object3D = entity.object3D;
  const sourcePrefab = entity.prefabInstance
    ? prefabs.find((p) => p.id === entity.prefabInstance!.prefabId)
    : undefined;
  const overrides = sourcePrefab ? diffPrefabOverrides(entity, sourcePrefab) : [];

  return (
    <div className="panel panel-inspector">
      <div className="entity-header-row">
        <div>
          <h3 className="entity-title">{entity.name}</h3>
          <div className="entity-id">{entity.id}</div>
        </div>
        <Button size="xs" variant="outline" onClick={() => onSaveAsPrefab(entity)}>
          Save As Prefab
        </Button>
      </div>

      {sourcePrefab && (
        <div className="prefab-overrides">
          Instance of <strong>{sourcePrefab.name}</strong>
          {overrides.length > 0 && (
            <div>
              {overrides.map((path) => (
                <code key={path}>{path}</code>
              ))}
            </div>
          )}
        </div>
      )}

      {object3D && (
        <section className="component-block">
          <div className="component-title">Transform</div>
          <VectorField
            label="Position"
            value={object3D.position}
            onChange={(v) => object3D.position.set(v.x, v.y, v.z)}
          />
          <VectorField
            label="Rotation"
            value={{
              x: object3D.rotation.x * RAD2DEG,
              y: object3D.rotation.y * RAD2DEG,
              z: object3D.rotation.z * RAD2DEG,
            }}
            onChange={(v) => object3D.rotation.set(v.x * DEG2RAD, v.y * DEG2RAD, v.z * DEG2RAD)}
          />
          <VectorField
            label="Scale"
            value={object3D.scale}
            onChange={(v) => object3D.scale.set(v.x, v.y, v.z)}
          />
        </section>
      )}

      {entity.listComponentTypes().map((type) => {
        const schema = getComponentSchema(type);
        const data = entity.getComponent<Record<string, unknown>>(type);
        if (!schema || !data) return null;
        return (
          <section className="component-block" key={type}>
            <div className="component-title">
              <span>{schema.label}</span>
              <Button
                size="xs"
                variant="subtle"
                critical
                onClick={() => {
                  entity.removeComponent(type);
                  forceTick((n) => n + 1);
                }}
              >
                Remove
              </Button>
            </div>
            {schema.fields.map((field) => (
              <FieldRow
                key={field.name}
                field={field}
                value={data[field.name]}
                onChange={(v) => {
                  data[field.name] = v;
                }}
              />
            ))}
          </section>
        );
      })}

      <AddComponentRow key={entity.id} entity={entity} onAdded={() => forceTick((n) => n + 1)} />
    </div>
  );
}

function VectorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: Vec3;
  onChange: (v: Vec3) => void;
}) {
  return (
    <div className="field-row">
      <span className="field-label">{label}</span>
      <div className="vector-inputs">
        {(["x", "y", "z"] as const).map((axis) => (
          <InputNumber
            key={axis}
            size="xs"
            value={round2(value[axis])}
            step={0.1}
            onValueChange={(v: number) => onChange({ ...value, [axis]: v })}
          />
        ))}
      </div>
    </div>
  );
}

function FieldRow({
  field,
  value,
  onChange,
}: {
  field: ComponentField;
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  if (field.type === "number") {
    return (
      <div className="field-row">
        <span className="field-label">{field.name}</span>
        <InputNumber
          size="xs"
          value={value as number}
          min={field.min}
          max={field.max}
          step={field.step ?? 1}
          onValueChange={onChange}
        />
      </div>
    );
  }
  if (field.type === "boolean") {
    return (
      <div className="field-row">
        <span className="field-label">{field.name}</span>
        <input
          type="checkbox"
          checked={Boolean(value)}
          onChange={(e) => onChange(e.target.checked)}
        />
      </div>
    );
  }
  // vector3 / color / entityRef / string: not exercised by the two builtin components yet
  // (docs/ROADMAP.md Phase 2+ grows the Gameplay Framework's field vocabulary) — shown
  // read-only rather than silently dropped.
  return (
    <div className="field-row">
      <span className="field-label">{field.name}</span>
      <span className="field-value-readonly">{JSON.stringify(value)}</span>
    </div>
  );
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function AddComponentRow({ entity, onAdded }: { entity: Entity; onAdded: () => void }) {
  const selectRef = useRef<HTMLSelectElement>(null);
  const available = listComponentSchemas().filter((s) => !entity.hasComponent(s.type));

  if (available.length === 0) return null;

  return (
    <div className="add-component-row">
      <select ref={selectRef} defaultValue={available[0]!.type}>
        {available.map((s) => (
          <option key={s.type} value={s.type}>
            {s.label}
          </option>
        ))}
      </select>
      <Button
        size="xs"
        onClick={() => {
          const type = selectRef.current?.value;
          if (type) {
            entity.addComponent(type);
            onAdded();
          }
        }}
      >
        Add Component
      </Button>
    </div>
  );
}
