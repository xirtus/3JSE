import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { World, Level } from "@3jse/runtime";
import { sceneQuery, sceneCreateEntity, sceneDestroyEntity, sceneAddComponent, sceneRemoveComponent, sceneSetProperty } from "./scene.js";
import { GraphStore, graphRead, graphWrite, graphConnect } from "./graph.js";
import {
  ConsoleSink,
  PerfRecorder,
  runtimeRun,
  runtimePause,
  runtimeStep,
  runtimeGetConsole,
  runtimeGetPerf,
  runtimeCaptureState,
} from "./runtime.js";
import { buildTypecheck, buildRunTests, type CommandRunner } from "./build.js";

export interface AgentContext {
  world: World;
  level: Level;
  graphs: GraphStore;
  console: ConsoleSink;
  /** Optional shared perf recorder for `runtime.getPerf`. When omitted, the server creates its
   *  own with the same lifetime as `console`. Pass one to inspect timings outside the tool calls. */
  perf?: PerfRecorder;
  /** `build.typecheck`/`build.runTests` only register when this is supplied — it needs a real
   *  subprocess (buildRunner.ts's `createNodeCommandRunner()`, Node-only), so apps/editor's
   *  browser-hosted Agent Panel simply never provides one and those two tools don't appear in
   *  its `listTools()` (server.test.ts covers both the "provided" and "omitted" cases). */
  commandRunner?: CommandRunner;
  /** Working directory `build.typecheck`/`build.runTests` run in — required only when
   *  `commandRunner` is provided. */
  projectDir?: string;
}

function json(value: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }] };
}

function errorResult(err: unknown) {
  return { content: [{ type: "text" as const, text: err instanceof Error ? err.message : String(err) }], isError: true };
}

/**
 * docs/AI_AGENT_API.md: "@3jse/agent... exposed as an MCP-shaped local tool server, so any
 * MCP-capable agent... can drive a 3JSE project." Real `McpServer` from the actual MCP SDK, not
 * a shape that merely resembles one — see server.test.ts, which connects a real `Client` over
 * `InMemoryTransport` and calls these tools through the protocol, not by importing the handler
 * functions directly. Every tool here is a thin wrapper over scene.ts/graph.ts/runtime.ts, which
 * is the point: "the tool surface *is* the editor's own command API," not a parallel one.
 *
 * `build.typecheck`/`build.runTests` only register when `ctx.commandRunner`+`ctx.projectDir` are
 * supplied (AgentContext's own doc comment) — Node-only, so the browser-hosted Agent Panel omits
 * them.
 *
 * `runtime.getPerf` reports real measured CPU/simulation timing over a headless run (not a GPU
 * profile — see runtime.ts). `runtime.captureState` is the headless-honest stand-in for
 * `runtime.captureFrame`: the authoritative simulation state, deterministically serialized,
 * rather than a faked pixel grab.
 *
 * Not implemented in this slice (see each module's own doc comments for why): `assets.import`,
 * `materials.create`, `codegen.writeFile`, `project.settings.get/.set`, and a true
 * `runtime.captureFrame` pixel capture — these need the Asset Pipeline, Material Graph, a
 * project file-tree convention, and a real renderer, none of which exist yet (docs/ROADMAP.md's
 * own phase ordering: several of those are Phase 5+). The trust-tier gating
 * (Suggest/Co-pilot/Autonomous) and undo-history integration are also real future work — every
 * tool here acts immediately, at what amounts to "Co-pilot" trust with no scope limiter yet.
 */
export function createAgentServer(ctx: AgentContext): McpServer {
  const server = new McpServer({ name: "3jse-agent", version: "0.0.0" });
  // One recorder per server, same lifetime as ctx.console: runtime.run fills it, runtime.getPerf
  // reads it. Callers that want to share/inspect it can pass their own via ctx.perf.
  const perf = ctx.perf ?? new PerfRecorder();

  server.registerTool(
    "scene.query",
    { description: "Read entities/components matching a filter.", inputSchema: { componentTypes: z.array(z.string()).optional() } },
    async ({ componentTypes }) => {
      try {
        return json(sceneQuery(ctx.level, { componentTypes }));
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  server.registerTool(
    "scene.createEntity",
    { description: "Create a new Entity in the current Level.", inputSchema: { name: z.string() } },
    async ({ name }) => {
      try {
        return json(sceneCreateEntity(ctx.level, name));
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  server.registerTool(
    "scene.destroyEntity",
    { description: "Destroy an Entity by id.", inputSchema: { entityId: z.string() } },
    async ({ entityId }) => {
      try {
        sceneDestroyEntity(ctx.level, entityId);
        return json({ ok: true });
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  server.registerTool(
    "scene.addComponent",
    {
      description: "Add a Component to an Entity — schema-validated, same path as the Inspector.",
      inputSchema: { entityId: z.string(), type: z.string(), overrides: z.record(z.string(), z.unknown()).optional() },
    },
    async ({ entityId, type, overrides }) => {
      try {
        return json(sceneAddComponent(ctx.level, entityId, type, overrides));
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  server.registerTool(
    "scene.removeComponent",
    { description: "Remove a Component from an Entity.", inputSchema: { entityId: z.string(), type: z.string() } },
    async ({ entityId, type }) => {
      try {
        sceneRemoveComponent(ctx.level, entityId, type);
        return json({ ok: true });
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  server.registerTool(
    "scene.setProperty",
    {
      description: "Set one field on one Component of one Entity.",
      inputSchema: { entityId: z.string(), componentType: z.string(), field: z.string(), value: z.unknown() },
    },
    async ({ entityId, componentType, field, value }) => {
      try {
        return json(sceneSetProperty(ctx.level, entityId, componentType, field, value));
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  server.registerTool(
    "graph.read",
    { description: "Read a 3JSE Graph's IR directly.", inputSchema: { graphId: z.string() } },
    async ({ graphId }) => {
      try {
        return json(graphRead(ctx.graphs, graphId));
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  server.registerTool(
    "graph.write",
    {
      description: "Patch a 3JSE Graph's IR — upsert/remove nodes, set the entry node.",
      inputSchema: {
        graphId: z.string(),
        setNodes: z.record(z.string(), z.unknown()).optional(),
        removeNodes: z.array(z.string()).optional(),
        setEntry: z.string().optional(),
      },
    },
    async ({ graphId, setNodes, removeNodes, setEntry }) => {
      try {
        return json(
          graphWrite(ctx.graphs, graphId, {
            setNodes: setNodes as GraphWritePatchNodes,
            removeNodes,
            setEntry,
          }),
        );
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  server.registerTool(
    "graph.connect",
    {
      description: "Wire two node pins, type-checked against 3IR's type system at call time.",
      inputSchema: { graphId: z.string(), from: z.string(), to: z.string(), toSlot: z.string() },
    },
    async ({ graphId, from, to, toSlot }) => {
      try {
        return json(graphConnect(ctx.graphs, graphId, { from, to, toSlot }));
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  server.registerTool(
    "runtime.run",
    {
      description: "Boot the game headless for N fixed-step frames.",
      inputSchema: { frames: z.number().int().positive(), dt: z.number().positive().optional() },
    },
    async ({ frames, dt }) => {
      try {
        runtimeRun(ctx.world, ctx.console, frames, dt, perf);
        return json({ ok: true, frames, consoleEntries: ctx.console.length, perfFrames: perf.frames });
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  server.registerTool("runtime.pause", { description: "Pause the World." }, async () => {
    runtimePause(ctx.world);
    return json({ ok: true });
  });

  server.registerTool(
    "runtime.step",
    { description: "Advance the World by one fixed step.", inputSchema: { dt: z.number().positive().optional() } },
    async ({ dt }) => {
      runtimeStep(ctx.world, dt);
      return json({ ok: true });
    },
  );

  server.registerTool(
    "runtime.getConsole",
    { description: "Pull captured console entries since a given index.", inputSchema: { since: z.number().int().nonnegative().optional() } },
    async ({ since }) => {
      return json(runtimeGetConsole(ctx.console, since));
    },
  );

  server.registerTool(
    "runtime.getPerf",
    {
      description:
        "Measured CPU/simulation timing over the headless run so far, plus a scene census. Not a GPU profile.",
    },
    async () => {
      return json(runtimeGetPerf(ctx.world, perf));
    },
  );

  server.registerTool(
    "runtime.captureState",
    {
      description:
        "Deterministic snapshot of authoritative simulation state (transforms + components) — the headless stand-in for captureFrame.",
      inputSchema: { precision: z.number().int().min(0).max(12).optional() },
    },
    async ({ precision }) => {
      return json(runtimeCaptureState(ctx.world, { precision }));
    },
  );

  if (ctx.commandRunner && ctx.projectDir) {
    const runner = ctx.commandRunner;
    const projectDir = ctx.projectDir;

    server.registerTool("build.typecheck", { description: "Run the TS/IR type checker without a full build." }, async () => {
      const result = await buildTypecheck(runner, projectDir);
      return { ...json(result), isError: !result.ok };
    });

    server.registerTool("build.runTests", { description: "Run the project's automated test suite." }, async () => {
      const result = await buildRunTests(runner, projectDir);
      return { ...json(result), isError: !result.ok };
    });
  }

  return server;
}

// graph.write's inputSchema takes node values as z.unknown() (an IRNode's shape varies by
// `kind`, and re-declaring that whole discriminated union as a Zod schema here would duplicate
// types.ts) — cast at the call site instead, same "runtime string/object, validated by the
// caller" posture graph.ts's graphConnect doc comment already takes for `toSlot`.
type GraphWritePatchNodes = Parameters<typeof graphWrite>[2]["setNodes"];
