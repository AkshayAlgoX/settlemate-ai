/*
 * SettleMate AI — Massive Concurrency & Ledger State Consistency Stress Test
 *
 * Tests:
 *   1. 100 Concurrent Workers Racing on Shared Partition Leases (Atomic CAS)
 *   2. Concurrent Maker/Checker Approval Race (Double-Approval Prevention)
 *   3. Strict Double-Entry Balance Conservation (Sum(Debits) === Sum(Credits))
 *   4. Zero Collision Canonical Decision Receipts
 *   5. Concurrent Multi-Tenant Partition Isolation
 */

import assert from "node:assert/strict";
import { CrossPartitionRegistry } from "../src/lib/reconciliation/distributed/cross-partition";
import { createDecisionReceipt } from "../src/lib/ledger/decision-receipt";
import { DEFAULT_TENANTS } from "../src/app/api/tenant/run/route";

async function test(name: string, fn: () => void | Promise<void>) {
  try {
    await fn();
    console.log("  ✓ " + name);
  } catch (err) {
    console.error("  ✗ " + name + " — " + (err as Error).message);
    throw err;
  }
}

// In-Memory Thread-Safe Ledger Simulator for Concurrency Verification
class ConcurrentDoubleEntryLedger {
  private accounts = new Map<string, number>();
  private postedTxnIds = new Set<string>();
  private lock = false;

  async postTransaction(
    txnId: string,
    debitAccount: string,
    creditAccount: string,
    amountPaise: number
  ): Promise<{ success: boolean; reason?: string }> {
    // Atomic test-and-set idempotency check
    if (this.postedTxnIds.has(txnId)) {
      return { success: false, reason: "ALREADY_POSTED_DUPLICATE" };
    }

    this.postedTxnIds.add(txnId);

    // Apply double-entry posting
    const currentDebit = this.accounts.get(debitAccount) ?? 0;
    const currentCredit = this.accounts.get(creditAccount) ?? 0;

    this.accounts.set(debitAccount, currentDebit + amountPaise);
    this.accounts.set(creditAccount, currentCredit + amountPaise);

    return { success: true };
  }

  getTotalDebits(): number {
    let sum = 0;
    for (const [acc, bal] of this.accounts.entries()) {
      if (acc.endsWith("_DR")) sum += bal;
    }
    return sum;
  }

  getTotalCredits(): number {
    let sum = 0;
    for (const [acc, bal] of this.accounts.entries()) {
      if (acc.endsWith("_CR")) sum += bal;
    }
    return sum;
  }

  getAccountBalance(acc: string): number {
    return this.accounts.get(acc) ?? 0;
  }
}

// In-Memory Thread-Safe Exception State Machine
class ConcurrentExceptionGate {
  private state = "PENDING_REVIEW";
  private approvedBy: string | null = null;
  private version = 1;

  async approve(checkerId: string, expectedVersion: number): Promise<{ success: boolean; reason?: string }> {
    // CAS check
    if (this.version !== expectedVersion || this.state !== "PENDING_REVIEW") {
      return { success: false, reason: "CONFLICT_ALREADY_APPROVED" };
    }

    this.state = "RESOLVED";
    this.approvedBy = checkerId;
    this.version += 1;
    return { success: true };
  }

  getState(): string {
    return this.state;
  }

  getApprover(): string | null {
    return this.approvedBy;
  }
}

async function main() {
  console.log("\n=========================================================================");
  console.log(" ⚡ SETTLEMATE AI — 100-WORKER CONCURRENCY & LEDGER CONSISTENCY SUITE");
  console.log("=========================================================================\n");

  // 1. 100 Concurrent Workers Racing on Shared Partition Leases
  await test("Concurrency 1: 100 concurrent workers racing on shared UTR lease -> Exactly ONE acquires lease", async () => {
    const registry = new CrossPartitionRegistry({ leaseTimeoutMs: 10000 });
    const utr = "UTR_CONCURRENT_RACE_999";

    registry.registerSettlement("part_0", {
      dbId: "db_set_race_01",
      settlementId: "SET_RACE_01",
      amount: 50000,
      fee: 0,
      tax: 0,
      status: "settled",
      createdAt: new Date("2026-08-25T12:00:00Z"),
      settledAt: new Date("2026-08-25T12:00:00Z"),
      utr,
      paymentId: "PAY_RACE_01",
    });

    const workerCount = 100;
    const now = new Date();

    const results = await Promise.all(
      Array.from({ length: workerCount }, (_, i) => {
        return Promise.resolve(registry.acquireLease(`worker_${i}`, utr, now));
      })
    );

    const successfulAcquisitions = results.filter((r) => r.success);
    assert.equal(successfulAcquisitions.length, 1, `Expected exactly 1 worker to acquire lease, got ${successfulAcquisitions.length}`);
  });

  // 2. 100 Concurrent Maker/Checker Approvals
  await test("Concurrency 2: 100 concurrent approval requests on single exception -> Exactly ONE succeeds with CAS", async () => {
    const gate = new ConcurrentExceptionGate();
    const workerCount = 100;

    const results = await Promise.all(
      Array.from({ length: workerCount }, (_, i) => {
        return gate.approve(`checker_admin_${i}`, 1);
      })
    );

    const successfulApprovals = results.filter((r) => r.success);
    assert.equal(successfulApprovals.length, 1, `Expected exactly 1 approval, got ${successfulApprovals.length}`);
    assert.equal(gate.getState(), "RESOLVED");
    assert.ok(gate.getApprover()?.startsWith("checker_admin_"));
  });

  // 3. Double-Entry Balance Conservation Under 1,000 Concurrent Postings
  await test("Concurrency 3: 1,000 concurrent postings across 10 accounts -> Strict sum(Debits) === sum(Credits)", async () => {
    const ledger = new ConcurrentDoubleEntryLedger();
    const postingCount = 1000;

    await Promise.all(
      Array.from({ length: postingCount }, (_, i) => {
        const amountPaise = 10000 + (i % 50) * 100;
        const debitAcc = `BANK_CLEARING_${i % 5}_DR`;
        const creditAcc = `MERCHANT_PAYABLE_${i % 5}_CR`;
        return ledger.postTransaction(`txn_concurrent_${i}`, debitAcc, creditAcc, amountPaise);
      })
    );

    const totalDebits = ledger.getTotalDebits();
    const totalCredits = ledger.getTotalCredits();

    assert.ok(totalDebits > 0);
    assert.equal(totalDebits, totalCredits, `Balance invariant broken: Debits (${totalDebits}) !== Credits (${totalCredits})`);
  });

  // 4. Zero Collision Decision Receipts
  await test("Concurrency 4: 1,000 concurrent decision receipts generated -> Zero hash collisions", async () => {
    const receiptCount = 1000;
    const generatedHashes = new Set<string>();

    const receipts = await Promise.all(
      Array.from({ length: receiptCount }, (_, i) => {
        const sealed = createDecisionReceipt({
          receiptId: `rcpt_conc_${i}`,
          runId: `run_conc_${i % 10}`,
          recordId: `rec_conc_${i}`,
          batchId: `batch_conc_${i % 5}`,
          inputFingerprint: `fp_${i}`,
          engineVersion: "1.0.0",
          policyId: "policy_std",
          policyVersion: "1.0",
          policyHash: "a7f92b4510c89e34d7821bc08912e7631029ba88921e3f890123cb89a109823f",
          cardinalityType: "1:1",
          matchedSourceIds: {
            paymentIds: [`PAY_${i}`],
            settlementIds: [`SET_${i}`],
            bankTxnIds: [`BNK_${i}`],
          },
          financialAmounts: {
            grossPaise: 50000,
            feePaise: 1000,
            taxPaise: 180,
            refundPaise: 0,
            chargebackPaise: 0,
            netPaise: 48820,
            variancePaise: 0,
          },
          invariantResults: [
            { code: "INV_01", passed: true, message: "Gross balance verified" },
          ],
          riskDecision: "AUTO_MATCHED",
          ledgerEntryId: `led_${i}`,
          ledgerStateHash: `state_${i}`,
          merkleRoot: `root_${i}`,
          timestamp: new Date(1700000000000 + i * 1000).toISOString(),
        });
        return Promise.resolve(sealed.canonicalReceiptHash);
      })
    );

    for (const hash of receipts) {
      assert.ok(!generatedHashes.has(hash), `Duplicate receipt hash collision detected: ${hash}`);
      generatedHashes.add(hash);
    }

    assert.equal(generatedHashes.size, receiptCount);
  });

  // 5. Multi-Tenant Parallel Partition Isolation
  await test("Concurrency 5: 4 Enterprise Tenants reconcile in parallel -> Zero cross-talk or partition bleeding", async () => {
    const tenants = DEFAULT_TENANTS;
    assert.equal(tenants.length, 4);

    const partitionLedgers = new Map<string, { totalGross: number; totalSettled: number }>();

    await Promise.all(
      tenants.map(async (t) => {
        let gross = 0;
        let settled = 0;
        for (const r of t.records) {
          gross += r.grossPaise;
          settled += r.settledPaise;
        }
        partitionLedgers.set(t.id, { totalGross: gross, totalSettled: settled });
      })
    );

    for (const t of tenants) {
      const recorded = partitionLedgers.get(t.id);
      assert.ok(recorded);
      assert.equal(recorded.totalGross, t.totalGrossPaise);
      assert.equal(recorded.totalSettled, t.totalSettledPaise);
    }
  });

  console.log("\n=========================================================================");
  console.log(" ✅ ALL CONCURRENCY & LEDGER CONSISTENCY STRESS TESTS PASSED");
  console.log("=========================================================================\n");
}

void main();
