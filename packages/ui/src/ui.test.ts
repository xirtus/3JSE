import { describe, expect, it } from "vitest";
import { World } from "@3jse/runtime";
import "@3jse/runtime"; // side-effect: registers Health/Spin/Movable builtins
import {
  panel, text, bar, button,
  computeLayout, hitTest, resolveTree, NullRenderer, HUDManager,
  type HUD,
} from "./index.js";

if (!(globalThis as { structuredClone?: unknown }).structuredClone) {
  (globalThis as { structuredClone: unknown }).structuredClone = (v: unknown) => JSON.parse(JSON.stringify(v));
}

describe("computeLayout (flexbox subset)", () => {
  it("column: fixed + flex children fill the height with gaps", () => {
    const root = panel("root", { direction: "column", gap: 10, padding: 20 }, [
      panel("top", { height: 40 }, []),
      panel("mid", { height: { flex: 1 } }, []),
      panel("bot", { height: 60 }, []),
    ]);
    const L = computeLayout(root, { width: 200, height: 400 });
    expect(L.top).toEqual({ x: 20, y: 20, w: 160, h: 40 });
    // inner height 360, minus 40+60 fixed, minus 2 gaps (20) => 240 for the flex child
    expect(L.mid!.h).toBeCloseTo(240, 5);
    expect(L.mid!.y).toBeCloseTo(70, 5); // 20 pad + 40 + 10 gap
    expect(L.bot!.y).toBeCloseTo(320, 5);
  });

  it("row with justify:space-between spreads fixed children edge to edge", () => {
    const root = panel("hud", { direction: "row", justify: "space-between" }, [
      text("score", "0", { width: 50 }),
      text("time", "0", { width: 50 }),
    ]);
    const L = computeLayout(root, { width: 300, height: 30 });
    expect(L.score!.x).toBe(0);
    expect(L.time!.x).toBe(250);
  });

  it("percent width resolves against the parent", () => {
    const root = panel("root", { direction: "row" }, [panel("half", { width: "50%" }, [])]);
    const L = computeLayout(root, { width: 400, height: 100 });
    expect(L.half!.w).toBe(200);
  });
});

describe("hitTest", () => {
  it("returns the button under a point, null otherwise", () => {
    const root = panel("root", { direction: "column", gap: 0 }, [
      button("play", "Play", "game.start", { height: 40 }),
      text("label", "hi", { height: 20 }),
    ]);
    const L = computeLayout(root, { width: 100, height: 100 });
    expect(hitTest(L, root, { x: 10, y: 10 })).toBe("play");
    expect(hitTest(L, root, { x: 10, y: 50 })).toBeNull(); // over the text, not a button
  });
});

describe("data binding", () => {
  it("resolves resource + entity.component.field paths into text / fill / visible", () => {
    const world = new World();
    world.setResource("Score", 1234);
    const level = world.createLevel("L");
    const player = level.createEntity("P", { id: "p1" });
    player.addComponent("Health", { current: 30, max: 100 }); // Health is a runtime builtin

    const hud: HUD["root"] = panel("root", {}, [
      text("score", "", undefined, [{ path: "resource:Score", to: "text", format: "Score: %d" }]),
      bar("hp", { width: 100 }, [{ path: "entity:p1.Health.current", to: "fill", range: { min: 0, max: 100 } }]),
      text("dead", "YOU DIED", undefined, [{ path: "resource:GameOver", to: "visible" }]),
    ]);
    const resolved = resolveTree(hud, world);
    const kids = resolved.children!;
    expect(kids[0]!.text).toBe("Score: 1234");
    expect(kids[1]!.style!.fill).toBeCloseTo(0.3, 5);
    expect(kids[2]!.visible).toBe(false); // GameOver resource undefined
  });
});

describe("HUDManager", () => {
  it("update() resolves, lays out, and paints; click() fires the action under the point", () => {
    const world = new World();
    world.setResource("Score", 7);
    const hud: HUD = {
      name: "hud",
      root: panel("root", { direction: "column", gap: 0 }, [
        text("score", "", { height: 24 }, [{ path: "resource:Score", to: "text", format: "%d" }]),
        button("restart", "Restart", "game.restart", { height: 40 }),
      ]),
    };
    const renderer = new NullRenderer();
    const mgr = new HUDManager(hud, world, renderer, { width: 200, height: 100 });
    mgr.update();

    const ops = renderer.ops();
    expect(ops.find((o) => o.id === "score")!.text).toBe("7");
    expect(ops.find((o) => o.id === "restart")!.action).toBe("game.restart");

    expect(mgr.click({ x: 10, y: 30 })).toBe("game.restart");
    expect(mgr.click({ x: 10, y: 5 })).toBeNull();
  });
});
