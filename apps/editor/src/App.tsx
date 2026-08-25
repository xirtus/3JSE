import { useEffect, useState } from "react";
import { Button } from "@galacean/editor-ui";
import { createPrefab, instantiatePrefab, type Entity, type Level, type Prefab, type World } from "@3jse/runtime";
import { DockLayout } from "./panels/DockLayout.js";
import type { EditorContext, LogEntry } from "./panels/types.js";
import { buildSampleWorld } from "./sampleScene.js";
import { buildDoorTriggerGraph } from "./sampleGraph.js";
import "./App.css";

let nextLogId = 1;

/** Top-level: owns the one async step in the whole editor session — Rapier's WASM init, inside
 *  buildSampleWorld() (docs/PHYSICS.md). Everything past that point is synchronous, so the rest
 *  of the app (EditorShell) never has to think about loading state. */
export function App() {
  const [built, setBuilt] = useState<{ world: World; level: Level } | null>(null);

  useEffect(() => {
    let cancelled = false;
    buildSampleWorld().then((result) => {
      if (!cancelled) setBuilt(result);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!built) {
    return (
      <div className="app-shell app-loading">
        <p>Loading physics…</p>
      </div>
    );
  }

  return <EditorShell world={built.world} level={built.level} />;
}

function EditorShell({ world, level }: { world: World; level: Level }) {
  // The live World every panel reads and mutates through the same Entity/Component API
  // (docs/EDITOR.md, docs/ARCHITECTURE.md principle 3: "everything the editor can do, code
  // can do").
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [prefabs, setPrefabs] = useState<Prefab[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  // Level.allEntities is a live snapshot read fresh on every render; creating/instantiating an
  // Entity outside React state still needs *some* state change to trigger a re-render.
  const [, bumpRefresh] = useState(0);

  // docs/ROADMAP.md Phase 3's 3JSE Graph demo content — see sampleGraph.ts's doc comment. Built
  // once per EditorShell mount, not per render.
  const [graph] = useState(() => buildDoorTriggerGraph());
  const [selectedGraphNodeId, setSelectedGraphNodeId] = useState<string | null>(null);
  const [debugVisitedNodeIds, setDebugVisitedNodeIds] = useState<string[]>([]);

  const selectedEntity = selectedId ? (level.getEntity(selectedId) ?? null) : null;

  function pushLog(logLevel: LogEntry["level"], message: string) {
    setLogs((prev) => [...prev, { id: nextLogId++, time: Date.now(), level: logLevel, message }]);
  }

  function togglePlay() {
    if (playing) {
      world.pause();
      setPlaying(false);
      pushLog("info", "Paused.");
    } else {
      world.play();
      setPlaying(true);
      pushLog("info", "Play started.");
    }
  }

  function handleSaveAsPrefab(entity: Entity) {
    const prefab = createPrefab(entity.name, entity);
    setPrefabs((prev) => [...prev, prefab]);
    pushLog("info", `Saved "${entity.name}" as prefab "${prefab.name}".`);
  }

  function handleInstantiatePrefab(prefab: Prefab) {
    const instance = instantiatePrefab(level, prefab);
    setSelectedId(instance.id);
    bumpRefresh((n) => n + 1);
    pushLog("info", `Instantiated "${prefab.name}" → ${instance.id}.`);
  }

  const ctx: EditorContext = {
    world,
    level,
    selectedId,
    setSelectedId,
    selectedEntity,
    playing,
    togglePlay,
    prefabs,
    onSaveAsPrefab: handleSaveAsPrefab,
    onInstantiatePrefab: handleInstantiatePrefab,
    logs,
    pushLog,
    refresh: () => bumpRefresh((n) => n + 1),
    graph,
    selectedGraphNodeId,
    setSelectedGraphNodeId,
    debugVisitedNodeIds,
    setDebugVisitedNodeIds,
  };

  return (
    <div className="app-shell">
      <header className="app-toolbar">
        <span className="app-title">3JSE — {level.name}</span>
        <Button size="sm" variant={playing ? "solid" : "soft"} onClick={togglePlay}>
          {playing ? "Pause" : "Play"}
        </Button>
      </header>
      <div className="app-body">
        <DockLayout ctx={ctx} />
      </div>
    </div>
  );
}
