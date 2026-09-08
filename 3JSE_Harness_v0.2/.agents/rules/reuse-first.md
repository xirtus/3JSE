# Reuse-First Rule

Before creating a primitive or subsystem, answer:

1. Does the project already contain it?
2. Does the 3JSE registry contain a preferred provider?
3. Is there a legal reusable asset/reference?
4. Is there a procedural provider?
5. Why is custom implementation superior here?

Examples:

- large outdoor ocean -> Poseidon before `PlaneGeometry + MeshPhysicalMaterial`
- grass -> Gaia before instanced crossed planes written from scratch
- trees -> Dryad before ad hoc cones/cylinders
- real city -> OSM/map3d before hand-built skyline boxes
