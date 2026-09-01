import type { ProjectFiles } from "@3jse/project";
import type { IRGraph } from "@3jse/ir";

/**
 * docs/ROADMAP.md Phase 3's "Playground — a shareable-URL sandbox holding a snippet id
 * (scene + graph state), modeled directly on Babylon.js's Playground." The adoption target is
 * the *mechanism*: a snippet id, a save/fork/share flow — not Babylon's implementation.
 *
 * A snippet is self-contained (no server round-trip needed to open one): the whole
 * scene + graph state is encoded into a URL-safe string. A hosted registry can later mint
 * short ids that resolve to the same payload, but the format works offline first.
 */

export const SNIPPET_VERSION = 1;

export interface Snippet {
  version: number;
  /** short human title shown in the Playground tab */
  title: string;
  /** the docs/PROJECT_FORMAT.md virtual filesystem — usually one scene + project.json */
  project: ProjectFiles;
  /** optional 3JSE Graph state being demonstrated */
  graph?: IRGraph;
  /** hand-written TS shown in the Code panel alongside the graph */
  code?: string;
  /** provenance: the snippet id this one was forked from, if any */
  forkedFrom?: string;
}

export interface SnippetMeta {
  title: string;
  graph?: IRGraph;
  code?: string;
  forkedFrom?: string;
}

// base64url of UTF-8 JSON. Dependency-free and stable across Node and the browser; a gzip
// layer is a drop-in later (CompressionStream) without changing the envelope.
function toBase64Url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  const b64 = typeof btoa === "function" ? btoa(bin) : Buffer.from(bin, "binary").toString("base64");
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(s: string): Uint8Array {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4);
  const bin =
    typeof atob === "function" ? atob(b64) : Buffer.from(b64, "base64").toString("binary");
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function encodeSnippet(project: ProjectFiles, meta: SnippetMeta): string {
  const snippet: Snippet = {
    version: SNIPPET_VERSION,
    title: meta.title,
    project,
    ...(meta.graph ? { graph: meta.graph } : {}),
    ...(meta.code ? { code: meta.code } : {}),
    ...(meta.forkedFrom ? { forkedFrom: meta.forkedFrom } : {}),
  };
  const json = JSON.stringify(snippet);
  return toBase64Url(new TextEncoder().encode(json));
}

export function decodeSnippet(encoded: string): Snippet {
  const json = new TextDecoder().decode(fromBase64Url(encoded));
  const snippet = JSON.parse(json) as Snippet;
  if (typeof snippet.version !== "number") throw new Error("Not a 3JSE snippet: missing version.");
  if (snippet.version > SNIPPET_VERSION) {
    throw new Error(
      `Snippet is version ${snippet.version}; this Playground understands at most ${SNIPPET_VERSION}.`,
    );
  }
  if (!snippet.project || !snippet.project["project.json"]) {
    throw new Error("Snippet has no project payload.");
  }
  return snippet;
}

/** Fork: a new snippet string carrying the same content plus a `forkedFrom` back-reference.
 *  `sourceId` is whatever id the caller uses to name the original (a hosted short id, or the
 *  encoded string itself for a purely-offline fork). */
export function forkSnippet(encoded: string, sourceId: string, newTitle?: string): string {
  const s = decodeSnippet(encoded);
  return encodeSnippet(s.project, {
    title: newTitle ?? `${s.title} (fork)`,
    graph: s.graph,
    code: s.code,
    forkedFrom: sourceId,
  });
}

/** `https://play.3jse.dev/#<encoded>` ⇄ encoded. The hash form keeps the payload client-side
 *  (never sent to a server) — same privacy property as Babylon's `#code` fragment. */
export function snippetToHash(encoded: string): string {
  return `#${encoded}`;
}
export function snippetFromHash(hash: string): string {
  return hash.startsWith("#") ? hash.slice(1) : hash;
}
