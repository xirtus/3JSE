// @galacean/editor-ui@1.2.0 and @galacean/gui@1.2.1's package.json point `types` at
// "types/src/index.d.ts", but the published npm tarball only actually contains `dist/`
// (es + cjs) — no `types/` directory ships. Confirmed by inspecting the installed package
// directly, not assumed: this is a real upstream packaging gap in this release, not something
// worth routing through @3jse/vendor's Tier A/B process (docs/VENDOR_INTEGRATIONS.md) — that's
// for project-facing content plugins, and this is a straight dependency of @3jse/editor itself
// (docs/EDITOR.md). Loosely typed here until upstream ships the types/ directory it already
// declares, or a patched version is published.
declare module "@galacean/editor-ui";
declare module "@galacean/gui";
