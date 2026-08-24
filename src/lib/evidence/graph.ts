/*
 * SettleMate AI — Deterministic Evidence Graph Engine
 *
 * Implements an in-memory, O(1) indexed DAG representing relations between
 * financial records (orders, payments, settlements, bank txns, refunds) and
 * contextual evidence (invoices, emails, webhooks, notes).
 */

import type {
  AccessClassification,
  GraphEdge,
  GraphNode,
} from "./types";

const CLASSIFICATION_LEVELS: Record<AccessClassification, number> = {
  PUBLIC: 1,
  CONFIDENTIAL: 2,
  RESTRICTED: 3,
  HIGHLY_RESTRICTED: 4,
};

export class EvidenceGraph {
  private nodesById = new Map<string, GraphNode>();
  private adjacency = new Map<string, Set<GraphEdge>>();
  private reverseAdjacency = new Map<string, Set<GraphEdge>>();

  addNode(node: GraphNode): void {
    this.nodesById.set(node.id, node);
    if (!this.adjacency.has(node.id)) {
      this.adjacency.set(node.id, new Set());
    }
    if (!this.reverseAdjacency.has(node.id)) {
      this.reverseAdjacency.set(node.id, new Set());
    }
  }

  addEdge(edge: GraphEdge): void {
    // Ensure nodes exist or register placeholders
    if (!this.nodesById.has(edge.source)) {
      this.addNode({
        id: edge.source,
        type: "CONTEXTUAL_EVIDENCE",
        label: edge.source,
        classification: "CONFIDENTIAL",
      });
    }
    if (!this.nodesById.has(edge.target)) {
      this.addNode({
        id: edge.target,
        type: "CONTEXTUAL_EVIDENCE",
        label: edge.target,
        classification: "CONFIDENTIAL",
      });
    }

    if (!this.adjacency.has(edge.source)) {
      this.adjacency.set(edge.source, new Set());
    }
    if (!this.reverseAdjacency.has(edge.target)) {
      this.reverseAdjacency.set(edge.target, new Set());
    }

    this.adjacency.get(edge.source)!.add(edge);
    this.reverseAdjacency.get(edge.target)!.add(edge);
  }

  getNode(id: string): GraphNode | undefined {
    return this.nodesById.get(id);
  }

  getOutgoingEdges(nodeId: string): GraphEdge[] {
    const edges = this.adjacency.get(nodeId);
    return edges ? Array.from(edges) : [];
  }

  getIncomingEdges(nodeId: string): GraphEdge[] {
    const edges = this.reverseAdjacency.get(nodeId);
    return edges ? Array.from(edges) : [];
  }

  getAllEdgesForNode(nodeId: string): GraphEdge[] {
    return [...this.getOutgoingEdges(nodeId), ...this.getIncomingEdges(nodeId)];
  }

  /**
   * Bounded BFS subgraph extraction around a root node.
   * Drops nodes exceeding user access clearance.
   */
  getSubgraph(
    rootId: string,
    maxDepth: number = 2,
    userClassification: AccessClassification = "HIGHLY_RESTRICTED"
  ): { nodes: GraphNode[]; edges: GraphEdge[] } {
    const maxLevel = CLASSIFICATION_LEVELS[userClassification];
    const visitedNodes = new Set<string>();
    const collectedEdges = new Set<GraphEdge>();
    const queue: Array<{ id: string; depth: number }> = [{ id: rootId, depth: 0 }];

    while (queue.length > 0) {
      const current = queue.shift()!;
      if (visitedNodes.has(current.id)) continue;

      const node = this.nodesById.get(current.id);
      if (!node) continue;

      // Access boundary check
      if (CLASSIFICATION_LEVELS[node.classification] > maxLevel) {
        continue;
      }

      visitedNodes.add(current.id);

      if (current.depth < maxDepth) {
        const edges = this.getAllEdgesForNode(current.id);
        for (const edge of edges) {
          collectedEdges.add(edge);
          const neighborId = edge.source === current.id ? edge.target : edge.source;
          if (!visitedNodes.has(neighborId)) {
            queue.push({ id: neighborId, depth: current.depth + 1 });
          }
        }
      }
    }

    const nodes: GraphNode[] = [];
    for (const nId of visitedNodes) {
      const n = this.nodesById.get(nId);
      if (n) nodes.push(n);
    }

    // Filter edges whose endpoints are both in authorized visited nodes
    const edges = Array.from(collectedEdges).filter(
      (e) => visitedNodes.has(e.source) && visitedNodes.has(e.target)
    );

    return {
      nodes: nodes.sort((a, b) => a.id.localeCompare(b.id)),
      edges: edges.sort((a, b) =>
        (a.source + a.target + a.relationType).localeCompare(b.source + b.target + b.relationType)
      ),
    };
  }

  clear(): void {
    this.nodesById.clear();
    this.adjacency.clear();
    this.reverseAdjacency.clear();
  }
}
