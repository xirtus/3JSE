# Visual QA Gate

A fresh-eyes visual pass is mandatory for polished work. Capture representative screenshots and inspect framing, hierarchy, scale, lighting, clipping, obvious repetition, placeholder geometry, UI readability, water/terrain seams, character grounding, and broken shaders. Record failures before fixes and final evidence after fixes.

## Headed only

Visual evidence comes from a headed (visible-window) browser — the user's real browser, or Playwright with `headless: false` against a normal dev server. Never a headless or software-GL frame: headless results mislead and must never ground a "looks right" claim. A typecheck or a build is not visual verification.

## Frames prove; they do not debug

A screenshot is evidence that something works, not an instrument for finding out why it does not. When a visual fault is reported, find it in the code first — grep who already does the thing, read the arithmetic, reason the mechanism — then confirm with one headed frame. What the user reports seeing is a fact until proven otherwise: take it as given and go find the cause.
