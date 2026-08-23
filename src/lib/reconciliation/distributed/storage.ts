/*
 * Distributed Reconciliation — Storage & Staging Layer
 *
 * Implements:
 *   1. StorageAdapter abstraction (InMemory / File / Object Storage compatible)
 *   2. StreamingRecordReader: Bounded memory chunk iterator for 1M -> 100M+ datasets
 *   3. Bulk result staging buffer
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { PartitionExecutionOutput, PartitionPayload, StorageAdapter } from "./types";

export class InMemoryStorageAdapter implements StorageAdapter {
  private payloads = new Map<string, PartitionPayload>();
  private results = new Map<string, PartitionExecutionOutput[]>();

  async stagePayload(key: string, payload: PartitionPayload): Promise<string> {
    this.payloads.set(key, payload);
    return `mem://${key}`;
  }

  async readPayload(key: string): Promise<PartitionPayload> {
    const data = this.payloads.get(key);
    if (!data) throw new Error(`Payload not found in storage: ${key}`);
    return data;
  }

  async stageResults(key: string, results: PartitionExecutionOutput[]): Promise<string> {
    let existing = this.results.get(key);
    if (!existing) {
      existing = [];
      this.results.set(key, existing);
    }
    for (const r of results) {
      existing.push(r);
    }
    return `mem://${key}`;
  }

  async readResults(key: string): Promise<PartitionExecutionOutput[]> {
    return this.results.get(key) ?? [];
  }

  clear(): void {
    this.payloads.clear();
    this.results.clear();
  }
}

export class FileStagingAdapter implements StorageAdapter {
  constructor(private baseDir: string) {
    mkdirSync(this.baseDir, { recursive: true });
    mkdirSync(path.join(this.baseDir, "payloads"), { recursive: true });
    mkdirSync(path.join(this.baseDir, "results"), { recursive: true });
  }

  async stagePayload(key: string, payload: PartitionPayload): Promise<string> {
    const filePath = path.join(this.baseDir, "payloads", `${encodeURIComponent(key)}.json`);
    writeFileSync(filePath, JSON.stringify(payload), "utf8");
    return `file://${filePath.replace(/\\/g, "/")}`;
  }

  async readPayload(key: string): Promise<PartitionPayload> {
    const filePath = path.join(this.baseDir, "payloads", `${encodeURIComponent(key)}.json`);
    const content = readFileSync(filePath, "utf8");
    return JSON.parse(content) as PartitionPayload;
  }

  async stageResults(key: string, results: PartitionExecutionOutput[]): Promise<string> {
    const filePath = path.join(this.baseDir, "results", `${encodeURIComponent(key)}.ndjson`);
    const lines = results.map((r) => JSON.stringify(r)).join("\n") + "\n";
    writeFileSync(filePath, lines, { flag: "a", encoding: "utf8" });
    return `file://${filePath.replace(/\\/g, "/")}`;
  }

  async readResults(key: string): Promise<PartitionExecutionOutput[]> {
    const filePath = path.join(this.baseDir, "results", `${encodeURIComponent(key)}.ndjson`);
    try {
      const content = readFileSync(filePath, "utf8");
      return content
        .split("\n")
        .filter((l) => l.trim().length > 0)
        .map((l) => JSON.parse(l) as PartitionExecutionOutput);
    } catch {
      return [];
    }
  }
}

/**
 * Streaming record generator for massive datasets.
 * Emits batches of items in bounded memory windows without materializing
 * the entire dataset on heap simultaneously.
 */
export async function* streamRecordChunks<T>(
  source: () => AsyncGenerator<T[], void, unknown> | Generator<T[], void, unknown>,
): AsyncGenerator<T[], void, unknown> {
  for await (const chunk of source()) {
    yield chunk;
  }
}
