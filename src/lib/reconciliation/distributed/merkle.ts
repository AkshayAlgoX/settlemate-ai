/*
 * Distributed Reconciliation — Merkle Audit Lineage & Batch Aggregation
 *
 * Implements:
 *   1. Partition-level cryptographic audit hashing
 *   2. Binary Merkle Tree aggregation across all partitions (O(K) build, O(log K) proof)
 *   3. Merkle inclusion proof generation and verification
 *   4. Tamper detection on individual partition results
 */

import { createHash } from "node:crypto";
import type { MerkleNode, MerkleProof, MerkleProofStep } from "./types";

export function sha256(data: string): string {
  return createHash("sha256").update(data, "utf8").digest("hex");
}

/**
 * Compute a reproducible cryptographic hash for a single partition execution.
 * Projects only deterministic attributes (partitionId, strategy, relationships, matched count).
 */
export function computePartitionAuditHash(output: {
  partitionId: string;
  strategy: string;
  matchedCount: number;
  relationships: Array<{
    type: string;
    settlementIds: string[];
    bankTxnIds: string[];
    differencePaise: number;
    confidenceScore: number;
    reasonCode: string;
  }>;
}): string {
  const projected = {
    partitionId: output.partitionId,
    strategy: output.strategy,
    matchedCount: output.matchedCount,
    relationships: output.relationships.map((r) => ({
      type: r.type,
      settlementIds: [...r.settlementIds].sort(),
      bankTxnIds: [...r.bankTxnIds].sort(),
      differencePaise: r.differencePaise,
      confidenceScore: r.confidenceScore,
      reasonCode: r.reasonCode,
    })),
  };
  return sha256(JSON.stringify(projected));
}

/**
 * Build a deterministic binary Merkle Tree over all partition audit hashes.
 * Leaves are ordered by partitionId ascending.
 */
export function buildBatchMerkleTree(
  leaves: Array<{ partitionId: string; hash: string }>,
): { rootHash: string; rootNode: MerkleNode } {
  if (leaves.length === 0) {
    const emptyHash = sha256("GENESIS_EMPTY_BATCH");
    return {
      rootHash: emptyHash,
      rootNode: { hash: emptyHash, isLeaf: true },
    };
  }

  // Sort leaves deterministically by partitionId
  const sortedLeaves = [...leaves].sort((a, b) => (a.partitionId < b.partitionId ? -1 : a.partitionId > b.partitionId ? 1 : 0));

  let currentLevel: MerkleNode[] = sortedLeaves.map((l) => ({
    hash: l.hash,
    partitionId: l.partitionId,
    isLeaf: true,
  }));

  while (currentLevel.length > 1) {
    const nextLevel: MerkleNode[] = [];

    for (let i = 0; i < currentLevel.length; i += 2) {
      const left = currentLevel[i]!;
      const right = i + 1 < currentLevel.length ? currentLevel[i + 1]! : left; // Duplicate last if odd

      const parentHash = sha256(left.hash + right.hash);
      nextLevel.push({
        hash: parentHash,
        left,
        right: i + 1 < currentLevel.length ? right : undefined,
        isLeaf: false,
      });
    }

    currentLevel = nextLevel;
  }

  return {
    rootHash: currentLevel[0]!.hash,
    rootNode: currentLevel[0]!,
  };
}

/**
 * Generate a cryptographic Merkle proof for a given partitionId.
 */
export function generateMerkleProof(
  leaves: Array<{ partitionId: string; hash: string }>,
  targetPartitionId: string,
): MerkleProof | null {
  const sorted = [...leaves].sort((a, b) => (a.partitionId < b.partitionId ? -1 : a.partitionId > b.partitionId ? 1 : 0));
  const targetIndex = sorted.findIndex((l) => l.partitionId === targetPartitionId);
  if (targetIndex === -1) return null;

  const targetLeaf = sorted[targetIndex]!;
  const steps: MerkleProofStep[] = [];

  let currentLevel = sorted.map((l) => ({ ...l }));
  let currentIndex = targetIndex;

  while (currentLevel.length > 1) {
    const isRight = currentIndex % 2 === 1;
    const siblingIndex = isRight ? currentIndex - 1 : currentIndex + 1;

    if (siblingIndex < currentLevel.length) {
      steps.push({
        position: isRight ? "left" : "right",
        hash: currentLevel[siblingIndex]!.hash,
      });
    } else {
      // Sibling is itself when level length is odd
      steps.push({
        position: "right",
        hash: currentLevel[currentIndex]!.hash,
      });
    }

    const nextLevel: Array<{ partitionId: string; hash: string }> = [];
    for (let i = 0; i < currentLevel.length; i += 2) {
      const left = currentLevel[i]!;
      const right = i + 1 < currentLevel.length ? currentLevel[i + 1]! : left;
      nextLevel.push({
        partitionId: `${left.partitionId}:${right.partitionId}`,
        hash: sha256(left.hash + right.hash),
      });
    }

    currentLevel = nextLevel;
    currentIndex = Math.floor(currentIndex / 2);
  }

  const { rootHash } = buildBatchMerkleTree(leaves);

  return {
    leafHash: targetLeaf.hash,
    partitionId: targetPartitionId,
    rootHash,
    steps,
  };
}

/**
 * Verify a Merkle proof against a known root hash in O(log K) steps.
 */
export function verifyMerkleProof(proof: MerkleProof): boolean {
  let currentHash = proof.leafHash;

  for (const step of proof.steps) {
    if (step.position === "left") {
      currentHash = sha256(step.hash + currentHash);
    } else {
      currentHash = sha256(currentHash + step.hash);
    }
  }

  return currentHash === proof.rootHash;
}
