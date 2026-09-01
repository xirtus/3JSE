# Recipe: Musical Hopper (Q*bert as an instrument)

Canonical reference: **UBURT / PULSEHOP** (`../uburt/pulsehop`).

Capabilities:
- hop grammar -> intent-relative input: screen directions on a diagonal board, momentum keeps the zigzag, floating key hints on the exact target tiles
- ledge guard -> press toward the void teeters; only a repeated press leaps
- gameplay-as-music -> hops quantized to a 16th-note grid, tiles = scale degrees, combos fade in groove layers, board clear = cadence; MIDI out (ch 1/2/3/10 + clock), OSC-over-WebSocket bridge
- world-as-sim -> voxel terrain from a Mandelbrot terrace, water/lava cellular automaton with Gerstner surfaces, obsidian reaction, seeded trees, living Julia arena
- rhythm boss -> call-and-response: watch the melody light tiles, echo it back
- performance -> everything pooled (particles, rings, text), zero per-frame allocation, half-res bloom, DPR cap 2

First vertical slice: one board, one scale, hop = note, light every tile. Do not build the four worlds before one board grooves.
