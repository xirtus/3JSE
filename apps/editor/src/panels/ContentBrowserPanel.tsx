import { useState } from "react";
import { Button } from "@galacean/editor-ui";
import { importAsset, type ImportSuggestion } from "@3jse/assets";
import type { EditorContext } from "./types.js";

const SEVERITY_LABEL: Record<string, string> = { error: "Error", warning: "Warning", info: "Info" };

/**
 * docs/ASSET_PIPELINE.md's Content Browser panel, analysis half: pick a `.glb`/`.gltf`, run
 * `@3jse/assets`'s real headless-safe analysis pass, and show exactly what it found — metadata,
 * the validation checklist's warnings, and the character-detection result — as *suggestions*,
 * per that doc's "suggestions, not silent automatic mutation": nothing lands in the scene until
 * "Create Entity" is clicked.
 *
 * Deliberately not built here (real future work, same gaps `@3jse/assets`'s own doc comments
 * flag): thumbnail rendering, actual mesh/texture loading into the Viewport (`@3jse/assets`
 * never decodes pixel data or geometry — see gltfContainer.ts's doc comment on why), and
 * LOD/collider suggestion. "Create Entity" therefore creates a real Entity with a Transform and
 * the components the analysis suggests (`AnimationController` + `CharacterController` for a
 * detected character), but with **no visible mesh** yet — an honest placeholder, not a claim
 * this imports a renderable model end-to-end.
 */
export function ContentBrowserPanel({ ctx }: { ctx: EditorContext }) {
  const [fileName, setFileName] = useState<string | null>(null);
  const [suggestion, setSuggestion] = useState<ImportSuggestion | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleFile(file: File) {
    setBusy(true);
    setFileName(file.name);
    setSuggestion(null);
    try {
      const bytes = await file.arrayBuffer();
      const result = await importAsset(bytes);
      setSuggestion(result);
      ctx.pushLog(
        result.hasErrors ? "error" : "info",
        `Analyzed "${file.name}": ${result.warnings.length} warning(s), ${result.metadata.triangleCount} triangles.`,
      );
    } catch (err) {
      ctx.pushLog("error", `Failed to analyze "${file.name}": ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusy(false);
    }
  }

  function createEntity() {
    if (!suggestion || !fileName) return;
    const name = fileName.replace(/\.(glb|gltf)$/i, "");
    const entity = ctx.level.createEntity(name);
    if (suggestion.character.likelyCharacter) {
      entity.addComponent("AnimationController");
      entity.addComponent("CharacterController");
    }
    ctx.refresh();
    ctx.setSelectedId(entity.id);
    ctx.pushLog("info", `Created "${name}" from import (no mesh yet — analysis only, see panel doc comment).`);
  }

  return (
    <div className="content-browser-panel">
      <label className="content-browser-picker">
        <input
          type="file"
          accept=".glb,.gltf"
          disabled={busy}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void handleFile(file);
          }}
        />
      </label>

      {busy && <p className="panel-empty-inline">Analyzing…</p>}

      {suggestion && fileName && (
        <div className="content-browser-result">
          <div className="component-title">
            <span>{fileName}</span>
            <Button size="xs" onClick={createEntity}>
              Create Entity
            </Button>
          </div>

          <section className="component-block">
            <div className="component-title">Metadata</div>
            <div className="field-row">
              <span className="field-label">Triangles</span>
              <span>{suggestion.metadata.triangleCount}</span>
            </div>
            <div className="field-row">
              <span className="field-label">Materials</span>
              <span>{suggestion.metadata.materialCount}</span>
            </div>
            <div className="field-row">
              <span className="field-label">Bones</span>
              <span>{suggestion.metadata.boneCount}</span>
            </div>
            <div className="field-row">
              <span className="field-label">Nodes</span>
              <span>{suggestion.metadata.nodeCount}</span>
            </div>
            {suggestion.metadata.localBounds && (
              <div className="field-row">
                <span className="field-label">Bounds</span>
                <span className="content-browser-mono">
                  [{suggestion.metadata.localBounds.min.map((n) => n.toFixed(2)).join(", ")}] → [
                  {suggestion.metadata.localBounds.max.map((n) => n.toFixed(2)).join(", ")}]
                </span>
              </div>
            )}
            <div className="field-row">
              <span className="field-label">Hash</span>
              <span className="content-browser-mono">{suggestion.metadata.sourceHash.slice(0, 16)}…</span>
            </div>
          </section>

          <section className="component-block">
            <div className="component-title">Character Detection</div>
            <p className="panel-empty-inline">
              {suggestion.character.likelyCharacter
                ? `Likely a character (matched: ${suggestion.character.matchedCategories.join(", ")}) — will add AnimationController + CharacterController.`
                : "Not detected as a character."}
            </p>
          </section>

          {suggestion.warnings.length > 0 && (
            <section className="component-block">
              <div className="component-title">Validation ({suggestion.warnings.length})</div>
              <ul className="content-browser-warnings">
                {suggestion.warnings.map((w, i) => (
                  <li key={i} className={`content-browser-warning content-browser-warning-${w.severity}`}>
                    <span className="content-browser-warning-severity">{SEVERITY_LABEL[w.severity]}</span> {w.message}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}

      {!suggestion && !busy && <p className="panel-empty-inline">Pick a .glb/.gltf file to analyze it.</p>}
    </div>
  );
}
