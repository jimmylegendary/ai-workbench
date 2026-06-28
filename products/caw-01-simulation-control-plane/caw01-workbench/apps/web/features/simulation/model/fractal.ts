import type { Edge, Node } from "@xyflow/react";

/**
 * Fractal canvas model (design intent: Ctrl+click a node to descend into its
 * interior, recursively). A React Flow canvas is a map of named levels; "root"
 * is the entry level. A node descends when its `data.drillTo` names another
 * level id. The per-canvas drill path (store) is an array of level ids.
 */
export interface GraphLevel<N extends Node = Node, E extends Edge = Edge> {
  id: string;
  label: string;
  nodes: N[];
  edges: E[];
}

export type FractalGraph<N extends Node = Node, E extends Edge = Edge> = Record<
  string,
  GraphLevel<N, E>
>;

export const ROOT_LEVEL = "root";

/** Resolve the current level + breadcrumb labels from a drill path. */
export function resolveLevel<N extends Node, E extends Edge>(
  graph: FractalGraph<N, E>,
  drill: readonly string[],
): { level: GraphLevel<N, E>; crumbs: { id: string; label: string }[] } {
  const root = graph[ROOT_LEVEL];
  const crumbs = [{ id: ROOT_LEVEL, label: root?.label ?? "root" }];
  let current = root;
  for (const id of drill) {
    const next = graph[id];
    if (next) {
      current = next;
      crumbs.push({ id, label: next.label });
    }
  }
  return { level: current ?? root, crumbs };
}
