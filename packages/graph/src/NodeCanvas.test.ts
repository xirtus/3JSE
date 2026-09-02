import { describe, expect, it } from "vitest";
import { edgePath, type CanvasNode } from "./NodeCanvas.js";

const a: CanvasNode = { id: "a", x: 0, y: 0, width: 100, height: 40, title: "A" };
const b: CanvasNode = { id: "b", x: 200, y: 100, width: 100, height: 40, title: "B" };

describe("edgePath", () => {
  it("value edge: producer right → consumer left, cubic bezier", () => {
    const d = edgePath(a, b, "value");
    // starts at a's right-mid (100, 20)
    expect(d.startsWith("M 100 20 C")).toBe(true);
    // ends at b's left-mid (200, 120)
    expect(d.endsWith("200 120")).toBe(true);
  });

  it("exec edge: bottom-center → top-center", () => {
    const d = edgePath(a, b, "exec");
    expect(d.startsWith("M 50 40 C")).toBe(true); // a bottom-center
    expect(d.endsWith("250 100")).toBe(true); // b top-center
  });

  it("is a valid single-segment cubic path", () => {
    const d = edgePath(a, b, "value");
    expect(d.match(/C/g)).toHaveLength(1);
    expect(d.split(",").length).toBe(3); // 3 control/end coordinate pairs
  });
});
