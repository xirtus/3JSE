# Recipe: Geospatial Surveillance / Social Simulation

Capabilities:
- map/GIS
- OSM city data
- R3F geographic overlays where needed
- large GPU data layers
- deterministic agents
- social/contact graphs
- event timeline
- dense DOM HUD

Preferred routing:
- city fabric -> map3d / OSM
- map projection -> MapLibre + react-three-map where R3F geographic objects are needed
- huge arcs/heatmaps -> deck.gl or equivalent
- agent-on-map patterns -> AgentMaps reference
- specialized 3D -> Three/R3F

First vertical slice: one neighborhood, one tracked agent, one social handoff, one branching event, one intervention, one deterministic replay.
