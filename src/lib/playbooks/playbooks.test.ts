/*
 * SettleMate AI — Unit Tests for Automated Playbooks Generator
 */

import {
  getAllPlaybooks,
  generatePlaybook,
  PLAYBOOK_SCENARIO_IDS,
  type PlaybookScenarioId,
} from "./generator";

function assert(condition: boolean, msg: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${msg}`);
  }
}

async function runPlaybooksUnitTests() {
  console.log("\n========================================================");
  console.log("   SETTLEMATE AI — RECONCILIATION PLAYBOOKS UNIT TESTS ");
  console.log("========================================================\n");

  // Test 1: All 5 scenario types have a generated playbook
  console.log("1. Testing coverage for all 5 scenario types...");
  const expectedTypes: PlaybookScenarioId[] = [
    "partial-refund",
    "fee-discrepancy",
    "chargeback",
    "duplicate-payment",
    "delayed-settlement",
  ];

  assert(PLAYBOOK_SCENARIO_IDS.length === 5, "Expected 5 playbook scenario IDs");
  for (const typeId of expectedTypes) {
    assert(PLAYBOOK_SCENARIO_IDS.includes(typeId), `Scenario ${typeId} must be in PLAYBOOK_SCENARIO_IDS`);
  }

  const allPlaybooks = getAllPlaybooks();
  assert(allPlaybooks.length === 5, `Expected 5 playbooks, got ${allPlaybooks.length}`);
  console.log("   ✓ All 5 exception types verified in playbooks registry");

  // Test 2: Playbook details for each exception type
  console.log("\n2. Validating playbook structures and invariants...");
  for (const p of allPlaybooks) {
    // Title & Description
    assert(p.title.length > 5, `Playbook ${p.id} must have valid title`);
    assert(p.description.length > 10, `Playbook ${p.id} must have valid description`);
    assert(["LOW", "MEDIUM", "HIGH", "CRITICAL"].includes(p.severity), `Playbook ${p.id} has invalid severity`);
    assert(p.slaTargetHours > 0, `Playbook ${p.id} SLA target must be positive`);

    // Trigger conditions
    assert(p.triggerConditions.length >= 2, `Playbook ${p.id} must have at least 2 trigger conditions`);
    for (const cond of p.triggerConditions) {
      assert(cond.parameter.length > 0, "Trigger parameter cannot be empty");
      assert(cond.condition.length > 0, "Trigger condition cannot be empty");
      assert(cond.policyReference.length > 0, "Policy reference cannot be empty");
    }

    // Required evidence
    assert(p.requiredEvidence.length >= 2, `Playbook ${p.id} must have at least 2 required evidence items`);
    for (const ev of p.requiredEvidence) {
      assert(ev.sourceType.length > 0, "Source type cannot be empty");
      assert(ev.documentName.length > 0, "Document name cannot be empty");
      assert(ev.integrityProof.length > 0, "Integrity proof cannot be empty");
    }

    // Double-entry journal adjustment & zero-drift invariant
    assert(p.recommendedJournal.debitAccount.length > 0, "Debit account cannot be empty");
    assert(p.recommendedJournal.creditAccount.length > 0, "Credit account cannot be empty");
    assert(p.recommendedJournal.sampleAmountPaise > 0, "Sample amount must be > 0");
    assert(p.recommendedJournal.entries.length >= 2, "Journal must have at least 2 entries (debit & credit)");

    const debitSum = p.recommendedJournal.entries
      .filter((e) => e.type === "DEBIT")
      .reduce((sum, e) => sum + e.amountPaise, 0);
    const creditSum = p.recommendedJournal.entries
      .filter((e) => e.type === "CREDIT")
      .reduce((sum, e) => sum + e.amountPaise, 0);

    assert(debitSum === creditSum, `Zero-drift invariant failed for ${p.id}: Debit ${debitSum} !== Credit ${creditSum}`);
    assert(debitSum === p.recommendedJournal.sampleAmountPaise, `Journal entries sum must match sampleAmountPaise`);

    // Maker / Checker flow
    assert(p.approvalFlow.length >= 3, `Playbook ${p.id} must have at least 3 approval flow steps`);
    const hasSystemGate = p.approvalFlow.some((s) => s.role === "SYSTEM_GATE");
    const hasMaker = p.approvalFlow.some((s) => s.role === "MAKER_ANALYST");
    const hasChecker = p.approvalFlow.some((s) => s.role === "CHECKER_CONTROLLER");
    assert(hasSystemGate && hasMaker && hasChecker, `Playbook ${p.id} must include System Gate, Maker, and Checker roles`);

    // Links to scenario
    assert(p.scenarioRunUrl.includes("/scenarios"), `Scenario run URL must link to /scenarios`);
    assert(p.sampleClaims.length >= 1, `Playbook ${p.id} must have sample non-LLM claims`);

    console.log(`   ✓ Playbook '${p.title}' verified (${p.triggerConditions.length} triggers, ${p.requiredEvidence.length} evidence, ${p.approvalFlow.length} flow steps, balanced journal: ${p.recommendedJournal.sampleFormattedAmount})`);
  }

  // Test 3: Individual playbook generation by ID
  console.log("\n3. Testing generatePlaybook(id) for each ID...");
  for (const id of expectedTypes) {
    const single = generatePlaybook(id);
    assert(single.id === id, `Expected playbook id ${id}, got ${single.id}`);
  }
  console.log("   ✓ Individual playbook generation verified for all 5 IDs");

  console.log("\n========================================================");
  console.log("   ALL PLAYBOOK UNIT TESTS PASSED (3/3)                ");
  console.log("========================================================\n");
}

runPlaybooksUnitTests().catch((err) => {
  console.error("Playbooks test failure:", err);
  process.exit(1);
});
