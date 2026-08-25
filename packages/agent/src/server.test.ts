import { describe, expect, it, beforeEach } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { World } from "@3jse/runtime";
import { registerBuiltinSystems } from "@3jse/runtime/systems/builtins";
import { createAgentServer, GraphStore, ConsoleSink, type AgentContext } from "./index.js";

// docs/AI_AGENT_API.md: "@3jse/agent... exposed as an MCP-shaped local tool server, so any
// MCP-capable agent... can drive a 3JSE project." This test connects a real MCP `Client` to the
// real `McpServer` over `InMemoryTransport.createLinkedPair()` and calls tools through the
// actual JSON-RPC protocol — proving the "MCP-shaped" claim, not just that the underlying
// handler functions work when called directly (scene.test.ts/graph.test.ts/runtime.test.ts
// already cover that).

async function connectedClient(ctx: AgentContext) {
  const server = createAgentServer(ctx);
  const client = new Client({ name: "test-agent", version: "0.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);
  return { client, server };
}

function textOf(result: Awaited<ReturnType<Client["callTool"]>>): string {
  const content = result.content as { type: string; text?: string }[];
  return content[0]?.text ?? "";
}

describe("@3jse/agent MCP server (real protocol, InMemoryTransport)", () => {
  let ctx: AgentContext;

  beforeEach(() => {
    const world = new World();
    registerBuiltinSystems(world.scheduler);
    ctx = { world, level: world.createLevel("Test"), graphs: new GraphStore(), console: new ConsoleSink() };
  });

  it("lists exactly the tools this slice implements", async () => {
    const { client } = await connectedClient(ctx);
    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name).sort();
    expect(names).toEqual(
      [
        "graph.connect",
        "graph.read",
        "graph.write",
        "runtime.getConsole",
        "runtime.pause",
        "runtime.run",
        "runtime.step",
        "scene.addComponent",
        "scene.createEntity",
        "scene.destroyEntity",
        "scene.query",
        "scene.removeComponent",
        "scene.setProperty",
      ].sort(),
    );
  });

  it("scene.createEntity → scene.addComponent → scene.query round-trips through the real protocol", async () => {
    const { client } = await connectedClient(ctx);

    const created = await client.callTool({ name: "scene.createEntity", arguments: { name: "Shark" } });
    const { id } = JSON.parse(textOf(created));

    await client.callTool({ name: "scene.addComponent", arguments: { entityId: id, type: "Health", overrides: { current: 40 } } });

    const queried = await client.callTool({ name: "scene.query", arguments: { componentTypes: ["Health"] } });
    const entities = JSON.parse(textOf(queried));
    expect(entities).toHaveLength(1);
    expect(entities[0].name).toBe("Shark");
    expect(entities[0].components.Health).toEqual({ current: 40, max: 100 });
  });

  it("an unknown Entity id comes back as a tool error, not a protocol-level failure", async () => {
    const { client } = await connectedClient(ctx);
    const result = await client.callTool({ name: "scene.addComponent", arguments: { entityId: "nope", type: "Health" } });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain('Unknown Entity "nope"');
  });

  it("graph.write → graph.connect → graph.read round-trips a small IR graph through the real protocol", async () => {
    const { client } = await connectedClient(ctx);

    await client.callTool({
      name: "graph.write",
      arguments: {
        graphId: "onTick",
        setNodes: {
          trueLit: { kind: "pure", id: "trueLit", op: "const", inputs: [], value: true, outputType: "boolean" },
          ping: { kind: "call", id: "ping", target: "ping", args: [], next: null },
          branch: { kind: "branch", id: "branch", cond: { node: "" }, then: { node: "ping" }, else: null },
          event: { kind: "event", id: "event", name: "onTick", params: [], next: { node: "branch" } },
        },
        setEntry: "event",
      },
    });

    await client.callTool({ name: "graph.connect", arguments: { graphId: "onTick", from: "trueLit", to: "branch", toSlot: "cond" } });

    const read = await client.callTool({ name: "graph.read", arguments: { graphId: "onTick" } });
    const graph = JSON.parse(textOf(read));
    expect(graph.nodes.branch.cond).toEqual({ node: "trueLit" });
  });

  it("runtime.run then runtime.getConsole reports frames advanced and captured console entries", async () => {
    const { client } = await connectedClient(ctx);
    const cube = ctx.level.createEntity("Cube");
    cube.addComponent("Spin", { degreesPerSecond: 90 });

    const ran = await client.callTool({ name: "runtime.run", arguments: { frames: 30, dt: 1 / 60 } });
    const summary = JSON.parse(textOf(ran));
    expect(summary.frames).toBe(30);
    expect(cube.object3D!.rotation.y).toBeGreaterThan(0);

    const console_ = await client.callTool({ name: "runtime.getConsole", arguments: {} });
    expect(JSON.parse(textOf(console_))).toEqual([]);
  });

  it("build.typecheck/build.runTests are absent when no commandRunner is supplied — apps/editor's Agent Panel posture", async () => {
    const { client } = await connectedClient(ctx);
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name)).not.toContain("build.typecheck");
    expect(tools.map((t) => t.name)).not.toContain("build.runTests");
  });

  it("build.typecheck/build.runTests register and run through the real protocol when a commandRunner is supplied", async () => {
    const calls: { cmd: string; args: string[]; cwd: string }[] = [];
    ctx.commandRunner = {
      run: async (cmd, args, cwd) => {
        calls.push({ cmd, args, cwd });
        return { exitCode: cmd === "pnpm" && args[0] === "typecheck" ? 0 : 1, stdout: "ok", stderr: "" };
      },
    };
    ctx.projectDir = "/fake/project";
    const { client } = await connectedClient(ctx);

    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name)).toEqual(expect.arrayContaining(["build.typecheck", "build.runTests"]));

    const typecheck = await client.callTool({ name: "build.typecheck", arguments: {} });
    expect(typecheck.isError).toBeFalsy();
    expect(JSON.parse(textOf(typecheck))).toEqual({ ok: true, output: "ok" });

    const runTests = await client.callTool({ name: "build.runTests", arguments: {} });
    expect(runTests.isError).toBe(true); // fake runner returns exitCode 1 for anything but typecheck

    expect(calls).toEqual([
      { cmd: "pnpm", args: ["typecheck"], cwd: "/fake/project" },
      { cmd: "pnpm", args: ["test", "--", "--run"], cwd: "/fake/project" },
    ]);
  });
});
