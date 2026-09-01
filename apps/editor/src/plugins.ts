import { PluginHost, PACKAGE_CATALOG, type Plugin } from "@3jse/plugins";
import { registerComponent, getComponentSchema, type SystemDef } from "@3jse/runtime";

/**
 * docs/PLUGIN_ARCHITECTURE.md's "third-party packages are genuinely first-class" — proven, not
 * asserted. `community/orbit-marker` is a *third-party-shaped* plugin (community/ id, no
 * privilege gap): it registers a Component schema and a System through the exact `PluginHost`
 * an official package would, and the editor activates it against the same live `World` every
 * panel edits. An entity tagged `OrbitMarker` orbits the origin — visible in the Viewport,
 * inspectable in the Inspector, no special-casing anywhere.
 */
const orbitMarkerPlugin: Plugin = {
  manifest: {
    id: "community/orbit-marker",
    version: "1.0.0",
    description: "Orbits every entity tagged OrbitMarker around the world origin.",
    capabilities: ["demo", "movement"],
    api: { components: 1, systems: 1 },
  },
  contributions: {
    components: () => {
      if (!getComponentSchema("OrbitMarker")) {
        registerComponent({
          type: "OrbitMarker",
          label: "Orbit Marker",
          fields: [
            { name: "radius", type: "number", default: 3, min: 0.5, max: 20, step: 0.5 },
            { name: "speed", type: "number", default: 1, min: 0, max: 10, step: 0.1 },
          ],
          createDefault: () => ({ radius: 3, speed: 1 }),
        });
      }
    },
    systems: (): SystemDef[] => [
      {
        name: "OrbitMarkerSystem",
        stage: "variable",
        query: ["OrbitMarker"],
        run: (entities, { dt }) => {
          for (const e of entities) {
            const d = e.getComponent<{ radius: number; speed: number; _t?: number }>("OrbitMarker");
            if (!d || !e.object3D) continue;
            d._t = (d._t ?? 0) + dt * d.speed;
            e.object3D.position.set(Math.cos(d._t) * d.radius, e.object3D.position.y, Math.sin(d._t) * d.radius);
          }
        },
      },
    ],
  },
};

/** The editor's plugin host — official + community plugins register here identically. */
export const pluginHost = new PluginHost();
pluginHost.register(orbitMarkerPlugin);

/** For the Packages panel. */
export { PACKAGE_CATALOG };
