# Recipe: Colony Simulation (systemic depth, Dwarf Fortress-class)

Canonical reference: **DAMN BEAVERS** (`../dambeavers`).

Capabilities:
- simulation-authoritative architecture -> renderer/animation/UI/audio/particles/chronicle OBSERVE sim state; the sim makes sense headlessly
- systems, not scripted outcomes -> implement water + pressure + flow + obstruction + permeability, never DamFloodEvent; events record, they never secretly cause
- ECS core -> typed component tokens, JSON-plain values, snapshot/restore with versioning, stable persistent EntityIds, fixed-tick clock with speed bounds
- determinism + replay -> seeded RNG everywhere; counterfactual replay (fork/alter/diff over snapshots)
- hydrology/ecology/economy -> WaterField, Flow, Dam, Gate, Ice, Erosion, Watershed; Recipe/Good/Container/Craft/Invention/TechKnowledge
- test pyramid -> unit / simulation / benchmark / replay / visual / GATE; each phase ends with a written gate sentence and a composed gate test
- projection seam -> sim/ is pure; presentation/projection maps entity -> render -> chunk

First vertical slice (from the reference's Milestone 0): seven beavers arrive beside a stream. Everything after that is rings of depth, each ring leaving a playable game.
