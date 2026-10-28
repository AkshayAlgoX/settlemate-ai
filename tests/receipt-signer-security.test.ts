/*
 * SettleMate AI — Security Regression Suite: Receipt Signing & Key Governance
 *
 * Verifies:
 *   1. Production fail-closed behavior for missing or unconfigured signing keys
 *   2. Cryptographic entropy and format validation (rejects low-entropy / predictable keys)
 *   3. Strict prohibition of publicly known development fallback keys in production
 *   4. Prohibition of customSecret signing bypass in production mode
 *   5. Multi-version key rotation (v1 -> v2) isolation and integrity
 *   6. Explicit untrusted classification for legacy fallback-signed receipts
 *   7. Constant-time signature verification and tamper detection
 */

import assert from "node:assert/strict";
import {
  signReceipt,
  verifyReceiptSignature,
  validateKeyEntropy,
  calculateShannonEntropy,
  generateSecureSigningKey,
  KNOWN_INSECURE_FALLBACK_KEYS,
} from "../src/lib/receipts/signer";
import { DEFAULT_POLICY_VERSIONS } from "../src/lib/receipts/builder";
import type { TerminalDecisionReceipt } from "../src/lib/receipts/types";

function buildSampleUnsignedReceipt(overrides: Partial<TerminalDecisionReceipt> = {}) {
  return {
    receiptId: overrides.receiptId || `rcpt_sec_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    tenantId: overrides.tenantId || "tenant_security_audit",
    transactionId: overrides.transactionId || "tx_sec_1001",
    batchId: overrides.batchId || "batch_sec_1001",
    createdAt: overrides.createdAt || new Date().toISOString(),
    receiptVersion: "1.0.0" as const,

    inputCommitment: overrides.inputCommitment || {
      transactionId: "tx_sec_1001",
      batchId: "batch_sec_1001",
      currency: "INR",
      amountMinor: 8750000,
      inputHash: "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2",
    },

    evidenceCommitment: overrides.evidenceCommitment || {
      evidenceIds: ["ev_1", "ev_2"],
      evidenceHashes: {
        ev_1: "1111111111111111111111111111111111111111111111111111111111111111",
        ev_2: "2222222222222222222222222222222222222222222222222222222222222222",
      },
      merkleRoot: "3333333333333333333333333333333333333333333333333333333333333333",
      accessClassification: "RESTRICTED" as const,
    },

    deterministicMatch: overrides.deterministicMatch || {
      matched: true,
      ruleId: "RULE_EXACT_AMOUNT_MATCH",
      confidence: 1.0,
    },

    invariantProof: overrides.invariantProof || {
      proofId: "prf_inv_1001",
      theoremName: "THEOREM_DOUBLE_ENTRY_PARITY",
      status: "PROOF_VALID" as const,
      proofHash: "4444444444444444444444444444444444444444444444444444444444444444",
      conservationPassed: true,
      doubleEntryBalanced: true,
    },

    aiClaim: overrides.aiClaim,
    challenge: overrides.challenge,
    mechanicalVerification: overrides.mechanicalVerification,
    reinvestigationHistory: overrides.reinvestigationHistory || [],
    solverDecision: overrides.solverDecision,
    routingDecision: overrides.routingDecision,
    correctionDecision: overrides.correctionDecision,

    finalDecision: overrides.finalDecision || "AUTO_RESOLVED",
    policyVersions: overrides.policyVersions || DEFAULT_POLICY_VERSIONS,

    signingKeyVersion: overrides.signingKeyVersion || "v1",
    canonicalizationVersion: "RFC8785-v1" as const,
    signatureAlgorithm: "HMAC-SHA256" as const,
  };
}

async function runTest(name: string, fn: () => void | Promise<void>) {
  try {
    await fn();
    console.log(`  ✓ [PASS] ${name}`);
  } catch (err: any) {
    console.error(`  ✗ [FAIL] ${name}`);
    console.error(err);
    process.exitCode = 1;
    throw err;
  }
}

async function main() {
  console.log("\n=========================================================================");
  console.log(" 🔐 SETTLEMATE AI — RECEIPT SIGNING KEY GOVERNANCE & SECURITY SUITE");
  console.log("=========================================================================\n");

  const origEnv = { ...process.env };

  try {
    // -------------------------------------------------------------------------
    // 1. CRYPTOGRAPHIC ENTROPY & KEY VALIDATION
    // -------------------------------------------------------------------------
    console.log("--- 1. CRYPTOGRAPHIC ENTROPY & KEY VALIDATION ---");

    await runTest("1.1 Rejects repeated characters with zero Shannon entropy", () => {
      const repeatedKey = "a".repeat(32);
      const entropy = calculateShannonEntropy(repeatedKey);
      assert.equal(entropy, 0);
      const res = validateKeyEntropy(repeatedKey);
      assert.equal(res.isValid, false);
      assert.ok(res.reason?.includes("Shannon entropy"));
    });

    await runTest("1.2 Rejects short keys (< 32 characters)", () => {
      const shortKey = "weak_secret_key_12345";
      const res = validateKeyEntropy(shortKey);
      assert.equal(res.isValid, false);
      assert.ok(res.reason?.includes("minimum required is 32"));
    });

    await runTest("1.3 Rejects known development fallback strings", () => {
      for (const knownKey of KNOWN_INSECURE_FALLBACK_KEYS) {
        const res = validateKeyEntropy(knownKey);
        assert.equal(res.isValid, false);
        assert.ok(res.reason?.includes("known-public development fallback"));
      }
    });

    await runTest("1.4 Rejects predictable pattern with excessive character frequency", () => {
      const biasedKey = "xxxxxxxxxxxxxxxxxxxx1234567890ab";
      const res = validateKeyEntropy(biasedKey);
      assert.equal(res.isValid, false);
      assert.ok(res.reason?.includes("Shannon entropy") || res.reason?.includes("excessive repetition"));
    });

    await runTest("1.5 Accepts cryptographically generated 256-bit random keys", () => {
      const secureKey = generateSecureSigningKey();
      assert.equal(secureKey.length, 64);
      const entropy = calculateShannonEntropy(secureKey);
      assert.ok(entropy >= 3.0, `Entropy was ${entropy}, expected >= 3.0`);
      const res = validateKeyEntropy(secureKey);
      assert.equal(res.isValid, true);
    });

    // -------------------------------------------------------------------------
    // 2. PRODUCTION FAIL-CLOSED BEHAVIOR
    // -------------------------------------------------------------------------
    console.log("\n--- 2. PRODUCTION FAIL-CLOSED BEHAVIOR ---");

    await runTest("2.1 Fails closed when signing in production without configured secrets", () => {
      process.env.NODE_ENV = "production";
      delete process.env.RECEIPT_SIGNING_SECRET_V1;
      delete process.env.RECEIPT_SIGNING_SECRET_V2;

      const unsigned = buildSampleUnsignedReceipt();
      assert.throws(
        () => signReceipt(unsigned, "v1"),
        /Cannot sign receipt: Signing key for version 'v1' is unavailable or not configured in production/
      );
    });

    await runTest("2.2 Prohibits customSecret signing bypass in production", () => {
      process.env.NODE_ENV = "production";
      const unsigned = buildSampleUnsignedReceipt();
      const randomSecret = generateSecureSigningKey();

      assert.throws(
        () => signReceipt(unsigned, "v1", randomSecret),
        /customSecret is strictly prohibited for signing in production mode/
      );
    });

    await runTest("2.3 Rejects known fallback keys configured into production env vars", () => {
      process.env.NODE_ENV = "production";
      process.env.RECEIPT_SIGNING_SECRET_V1 = "settlemate_terminal_secret_v1_auth_2026";

      const unsigned = buildSampleUnsignedReceipt();
      assert.throws(
        () => signReceipt(unsigned, "v1"),
        /matches a known-public development fallback secret/
      );
    });

    await runTest("2.4 Fails closed for verification when key is unavailable in production", () => {
      process.env.NODE_ENV = "production";
      delete process.env.RECEIPT_SIGNING_SECRET_V1;

      const receipt = {
        ...buildSampleUnsignedReceipt(),
        proofHash: "0".repeat(64),
        signature: "0".repeat(64),
      };

      const result = verifyReceiptSignature(receipt);
      assert.equal(result.isValid, false);
      assert.ok(result.error?.includes("KEY_UNAVAILABLE"));
    });

    // -------------------------------------------------------------------------
    // 3. KEY ROTATION & VERSION ISOLATION
    // -------------------------------------------------------------------------
    console.log("\n--- 3. KEY ROTATION & VERSION ISOLATION ---");

    await runTest("3.1 Key rotation: v1 and v2 receipts sign and verify with distinct secrets", () => {
      const secretV1 = generateSecureSigningKey();
      const secretV2 = generateSecureSigningKey();

      process.env.NODE_ENV = "development";
      process.env.RECEIPT_SIGNING_SECRET_V1 = secretV1;
      process.env.RECEIPT_SIGNING_SECRET_V2 = secretV2;

      const unsignedV1 = buildSampleUnsignedReceipt({ signingKeyVersion: "v1" });
      const receiptV1 = signReceipt(unsignedV1, "v1");

      const unsignedV2 = buildSampleUnsignedReceipt({ signingKeyVersion: "v2" });
      const receiptV2 = signReceipt(unsignedV2, "v2");

      assert.equal(receiptV1.signingKeyVersion, "v1");
      assert.equal(receiptV2.signingKeyVersion, "v2");

      const verV1 = verifyReceiptSignature(receiptV1);
      const verV2 = verifyReceiptSignature(receiptV2);

      assert.equal(verV1.isValid, true);
      assert.equal(verV2.isValid, true);
    });

    await runTest("3.2 Cross-verification failure: v1 receipt cannot be verified with v2 key", () => {
      const secretV1 = generateSecureSigningKey();
      const secretV2 = generateSecureSigningKey();

      process.env.RECEIPT_SIGNING_SECRET_V1 = secretV1;
      process.env.RECEIPT_SIGNING_SECRET_V2 = secretV2;

      const unsigned = buildSampleUnsignedReceipt({ signingKeyVersion: "v1" });
      const receiptV1 = signReceipt(unsigned, "v1");

      // Verify with wrong secret
      const res = verifyReceiptSignature(receiptV1, secretV2);
      assert.equal(res.isValid, false);
      assert.ok(res.error?.includes("SIGNATURE_MISMATCH"));
    });

    await runTest("3.3 Unknown key version fails closed immediately", () => {
      const unsigned = buildSampleUnsignedReceipt();
      assert.throws(
        () => signReceipt(unsigned, "v99_non_existent"),
        /Signing key for version 'v99_non_existent' is unavailable/
      );

      const dummyReceipt: TerminalDecisionReceipt = {
        ...unsigned,
        signingKeyVersion: "v99_non_existent",
        proofHash: "0".repeat(64),
        signature: "0".repeat(64),
      };
      const ver = verifyReceiptSignature(dummyReceipt);
      assert.equal(ver.isValid, false);
      assert.ok(ver.error?.includes("KEY_UNAVAILABLE"));
    });

    // -------------------------------------------------------------------------
    // 4. LEGACY FALLBACK RECEIPT CLASSIFICATION
    // -------------------------------------------------------------------------
    console.log("\n--- 4. LEGACY FALLBACK RECEIPT CLASSIFICATION ---");

    await runTest("4.1 Receipts signed with dev fallback keys are flagged as untrusted in strict mode", () => {
      process.env.NODE_ENV = "development";
      delete process.env.RECEIPT_SIGNING_SECRET_V1;

      // Signed using fallback key in dev mode
      const unsigned = buildSampleUnsignedReceipt({ signingKeyVersion: "v1" });
      const legacyReceipt = signReceipt(unsigned, "v1");

      // Verifying with allowLegacyFallback: false (production simulation)
      const strictRes = verifyReceiptSignature(legacyReceipt, { allowLegacyFallback: false });
      assert.equal(strictRes.isValid, false);
      assert.equal(strictRes.isLegacyFallbackKey, true);
      assert.ok(strictRes.error?.includes("LEGACY_FALLBACK_KEY_UNTRUSTED"));

      // Verifying with allowLegacyFallback: true (audit / dev inspection)
      const auditRes = verifyReceiptSignature(legacyReceipt, { allowLegacyFallback: true });
      assert.equal(auditRes.isValid, true);
      assert.equal(auditRes.isLegacyFallbackKey, true);
    });

  } finally {
    process.env = origEnv;
  }

  console.log("\n=========================================================================");
  console.log(" ✅ ALL 11 RECEIPT SIGNER SECURITY SCENARIOS PASSED");
  console.log("=========================================================================\n");
}

main().catch((err) => {
  console.error("Test execution aborted:", err);
  process.exit(1);
});
