import { describe, expect, it } from "vitest";
import { World, registerComponent, defaultsFromFields, type ComponentField } from "@3jse/runtime";
import { serializeProject } from "@3jse/project";
import { parseTsSubset } from "@3jse/ir";
import {
  encodeSnippet,
  decodeSnippet,
  forkSnippet,
  snippetFromHash,
  snippetToHash,
} from "./snippet.js";

const fields: ComponentField[] = [{ name: "current", type: "number", default: 100 }];
registerComponent({
  type: "PgHealth",
  label: "Health",
  fields,
  createDefault: () => defaultsFromFields(fields) as Record<string, unknown>,
});

function sampleProject() {
  const world = new World();
  const level = world.createLevel("Demo");
  const e = level.createEntity("Ball");
  e.object3D!.position.set(0, 3, 0);
  e.addComponent("PgHealth", { current: 50 });
  return serializeProject(world, {
    name: "Demo",
    engine: "3jse@0.0.0",
    dependencies: {},
    startScene: level.id,
  });
}

const GRAPH = parseTsSubset(`function onHit(amount: number, hp: number): void {
  if (amount > hp) { die(); } else { hurt(amount); }
}`);

describe("@3jse/playground — snippets", () => {
  it("encode → decode round-trips project + graph + code", () => {
    const project = sampleProject();
    const encoded = encodeSnippet(project, { title: "Bouncing Ball", graph: GRAPH, code: "// hi" });
    const s = decodeSnippet(encoded);
    expect(s.title).toBe("Bouncing Ball");
    expect(s.project).toEqual(project);
    expect(s.graph).toEqual(GRAPH);
    expect(s.code).toBe("// hi");
  });

  it("produces a URL-safe string (no +, /, or =)", () => {
    const encoded = encodeSnippet(sampleProject(), { title: "x".repeat(50), graph: GRAPH });
    expect(encoded).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("hash helpers are inverse", () => {
    const encoded = encodeSnippet(sampleProject(), { title: "t" });
    expect(snippetFromHash(snippetToHash(encoded))).toBe(encoded);
  });

  it("fork carries content and records provenance", () => {
    const encoded = encodeSnippet(sampleProject(), { title: "Original", graph: GRAPH });
    const forked = forkSnippet(encoded, "abc123");
    const s = decodeSnippet(forked);
    expect(s.title).toBe("Original (fork)");
    expect(s.forkedFrom).toBe("abc123");
    expect(s.graph).toEqual(GRAPH);
  });

  it("rejects a snippet newer than this Playground", () => {
    const encoded = encodeSnippet(sampleProject(), { title: "future" });
    const bumped = JSON.parse(new TextDecoder().decode(Buffer.from(encoded.replace(/-/g, "+").replace(/_/g, "/"), "base64")));
    bumped.version = 99;
    const reencoded = Buffer.from(JSON.stringify(bumped), "utf8")
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
    expect(() => decodeSnippet(reencoded)).toThrow(/at most/);
  });

  it("rejects a payload with no project", () => {
    const bad = Buffer.from(JSON.stringify({ version: 1, title: "t" }), "utf8")
      .toString("base64url");
    expect(() => decodeSnippet(bad)).toThrow(/no project/);
  });
});
