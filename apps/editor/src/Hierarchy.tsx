import { useState } from "react";
import { Button, TreeGroup, TreeItemContent, TreeItemRoot } from "@galacean/editor-ui";
import type { Entity, Level, Prefab } from "@3jse/runtime";

interface HierarchyProps {
  level: Level;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  prefabs: Prefab[];
  onInstantiatePrefab: (prefab: Prefab) => void;
  onRefresh: () => void;
}

/**
 * The Entity tree for the active Level, plus the Prefab library (in-memory only for now — see
 * Prefab.ts's doc comment) — docs/EDITOR.md. Built on @galacean/editor-ui's Tree primitives
 * (`TreeItemRoot`/`TreeItemContent`/`TreeGroup`) rather than a plain list: that library
 * deliberately ships no ready-made `<Tree data={...}/>` (confirmed from its own source/story
 * comments — "a set of low-level styled components... combine these according to your actual
 * requirement"), so the recursion, expand/select state, and rename wiring below are this
 * project's, the row chrome (chevron, selection highlight, inline rename) is theirs.
 */
export function Hierarchy({
  level,
  selectedId,
  onSelect,
  prefabs,
  onInstantiatePrefab,
  onRefresh,
}: HierarchyProps) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  function toggleExpanded(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function renderEntity(entity: Entity, depth: number) {
    const children = entity.getChildEntities();
    const isExpanded = expanded.has(entity.id);
    return (
      // TreeItemContent's own `onSelect` only fires from its context-menu handler (confirmed
      // from @galacean/editor-ui's source — it's not wired to a left click at all, matching the
      // "low-level primitives, compose them yourself" framing this library documents itself
      // with). The primary left-click-to-select gesture is this project's to add, on the row
      // TreeItemRoot renders.
      <TreeItemRoot key={entity.id} onClick={() => onSelect(entity.id)}>
        <TreeItemContent
          id={entity.id}
          name={entity.name}
          level={depth}
          isExpandable={children.length > 0}
          isExpanded={isExpanded}
          isSelected={entity.id === selectedId}
          onSelect={() => onSelect(entity.id)}
          onExpand={() => toggleExpanded(entity.id)}
          renamable
          onRename={(_id: string, newName: string) => {
            entity.name = newName;
            if (entity.object3D) entity.object3D.name = newName;
            onRefresh();
          }}
          endSlot={
            entity.prefabInstance ? (
              <span className="hierarchy-prefab-badge" title={`Instance of "${entity.prefabInstance.prefabName}"`}>
                ◆
              </span>
            ) : undefined
          }
        />
        {isExpanded && children.length > 0 && (
          <TreeGroup>{children.map((child) => renderEntity(child, depth + 1))}</TreeGroup>
        )}
      </TreeItemRoot>
    );
  }

  return (
    <div className="hierarchy-panel">
      <div className="hierarchy-tree">
        {level.rootEntities().map((entity) => renderEntity(entity, 0))}
      </div>

      {prefabs.length > 0 && (
        <>
          <div className="panel-header">Prefabs</div>
          <ul className="hierarchy-list">
            {prefabs.map((prefab) => (
              <li key={prefab.id} className="prefab-row">
                <span className="prefab-row-name">{prefab.name}</span>
                <Button size="xs" variant="outline" onClick={() => onInstantiatePrefab(prefab)}>
                  Instantiate
                </Button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
