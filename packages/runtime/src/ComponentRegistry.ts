// Component schemas are the single source of truth an Inspector, a serializer, or an AI
// agent uses to understand a component type — see docs/ENTITY_COMPONENT_MODEL.md.
// This is intentionally the whole contract for Phase 1: no archetype/SoA storage yet
// (docs/ROADMAP.md Phase 0 flags that as a separate, unproven performance spike).

export type FieldType =
  | "number"
  | "boolean"
  | "string"
  | "vector3"
  | "color"
  | "entityRef";

export interface ComponentField {
  name: string;
  type: FieldType;
  default: unknown;
  min?: number;
  max?: number;
  step?: number;
}

export interface ComponentSchema<T extends Record<string, unknown> = Record<string, unknown>> {
  type: string;
  label: string;
  fields: ComponentField[];
  createDefault: () => T;
}

const registry = new Map<string, ComponentSchema>();

export function registerComponent<T extends Record<string, unknown>>(
  schema: ComponentSchema<T>,
): void {
  if (registry.has(schema.type)) {
    throw new Error(`Component "${schema.type}" is already registered.`);
  }
  registry.set(schema.type, schema as ComponentSchema);
}

export function getComponentSchema(type: string): ComponentSchema | undefined {
  return registry.get(type);
}

export function listComponentSchemas(): ComponentSchema[] {
  return Array.from(registry.values());
}

/** Builds a schema's default data object from its field definitions. */
export function defaultsFromFields(fields: ComponentField[]): Record<string, unknown> {
  const data: Record<string, unknown> = {};
  for (const field of fields) {
    data[field.name] = field.default;
  }
  return data;
}
