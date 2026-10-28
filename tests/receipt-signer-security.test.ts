/*
 * SettleMate AI — Security regression suite: receipt signing trust policy
 *
 * Exercises src/lib/receipts/signer.ts and its consumers under explicit
 * environments. Each case states the trust decision it protects:
 *
 *   1. Key configuration fails closed (missing, short, placeholder, public,
 *      reused, malformed active version) in production and outside it.
 *   2. Signing and verification share one key ring; callers cannot inject keys.
 *   3. Rotation: old versions keep verifying, only the active version signs in
 *      production, removed versions stop verifying.
 *   4. Tampering and version substitution are detected.
 *   5. Receipts signed with the publicly known legacy secrets are classified
 *      LEGACY_PUBLIC_KEY and never trusted.
 *   6. Development keys are ephemeral and their receipts are never trusted.
 *   7. Downstream: verification report, readiness check and the verify route.
 *
 * Secrets used here are generated at runtime; none are real.
 */

import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { NextRequest } from "next/server";
import {
  KNOWN_PUBLIC_LEGACY_KEYS,
  ReceiptKeyConfigError,
  checkKeyMaterial,
  generateSigningKey,
  getActiveSigningKeyVersion,
  loadReceiptKeyRing,
  resetReceiptKeyRingForTests,
  signReceipt,
  verifyReceiptSignature,
} from "../src/lib/receipts/signer";
import { canonicalizeReceiptForSigning } from "../src/lib/receipts/canonicalizer";
import { verifyTerminalReceipt } from "../src/lib/receipts/verifier";
import { DEFAULT_POLICY_VERSIONS } from "../src/lib/receipts/builder";
import { TerminalReceiptRepository } from "../src/lib/receipts/repository";
import { validateStartupConfig } from "../src/lib/config/startup-validation";
import { SESSION_COOKIE, createSessionToken } from "../src/lib/auth/session";
import { POST as verifyRoutePost } from "../src/app/api/receipts/[id]/verify/route";
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

const env = process.env as Record<string, string | undefined>;
const ORIGINAL_ENV = { ...process.env };
const KEY_A = generateSigningKey();
const KEY_B = generateSigningKey();

/** Replace receipt-related environment variables and reload the key ring. */
function useEnv(vars: Record<string, string | undefined>) {
  for (const name of Object.keys(env)) {
    if (name.startsWith("RECEIPT_SIGNING_")) delete env[name];
  }
  delete env.NODE_ENV;
  for (const [k, v] of Object.entries(vars)) {
    if (v === undefined) delete env[k];
    else env[k] = v;
  }
  resetReceiptKeyRingForTests();
}

function signedReceipt(overrides: Partial<TerminalDecisionReceipt> = {}, version?: string): TerminalDecisionReceipt {
  return signReceipt(buildSampleUnsignedReceipt(overrides), version);
}

/** Re-sign a receipt body with an arbitrary secret, as a forger or a legacy deployment would. */
function resignWith(receipt: TerminalDecisionReceipt, secret: string): TerminalDecisionReceipt {
  const signature = createHmac("sha256", secret).update(canonicalizeReceiptForSigning(receipt), "utf8").digest("hex");
  return { ...receipt, signature };
}

function expectConfigError(fn: () => unknown, pattern: RegExp) {
  assert.throws(fn, (err: unknown) => err instanceof ReceiptKeyConfigError && pattern.test((err as Error).message));
}

let passed = 0;
let failed = 0;

async function test(name: string, fn: () => void | Promise<void>) {
  try {
    await fn();
    passed++;
    console.log(`  ✓ [PASS] ${name}`);
  } catch (err) {
    failed++;
    console.error(`  ✗ [FAIL] ${name} — ${(err as Error).message}`);
  }
}

async function main() {
  console.log("\n=== SettleMate receipt signing trust policy ===\n");

  console.log("--- 1. Key configuration fails closed ---");

  await test("1.1 production without the active key refuses to load and to sign", () => {
    useEnv({ NODE_ENV: "production" });
    expectConfigError(() => loadReceiptKeyRing(process.env), /RECEIPT_SIGNING_SECRET_V1 must be set in production/);
    expectConfigError(() => signedReceipt(), /must be set in production/);
  });

  await test("1.2 the old public default secrets are rejected as keys in every environment", () => {
    for (const nodeEnv of ["production", undefined]) {
      for (const [version, secret] of Object.entries(KNOWN_PUBLIC_LEGACY_KEYS)) {
        useEnv({ NODE_ENV: nodeEnv, [`RECEIPT_SIGNING_SECRET_${version.toUpperCase()}`]: secret, RECEIPT_SIGNING_SECRET_V1: version === "v1" ? secret : KEY_A });
        expectConfigError(() => loadReceiptKeyRing(process.env), /publicly known secret/);
      }
    }
  });

  await test("1.3 short keys, placeholders and cross-version reuse are rejected", () => {
    useEnv({ NODE_ENV: "production", RECEIPT_SIGNING_SECRET_V1: "too-short-key-1234567890" });
    expectConfigError(() => loadReceiptKeyRing(process.env), /at least 32 bytes/);
    useEnv({ NODE_ENV: "production", RECEIPT_SIGNING_SECRET_V1: "please-change-me-before-deploying-this-service" });
    expectConfigError(() => loadReceiptKeyRing(process.env), /placeholder/);
    useEnv({ NODE_ENV: "production", RECEIPT_SIGNING_SECRET_V1: KEY_A, RECEIPT_SIGNING_SECRET_V2: KEY_A });
    expectConfigError(() => loadReceiptKeyRing(process.env), /reuses the key/);
    // The same rules apply outside production: a bad configured key is never silently replaced.
    useEnv({ RECEIPT_SIGNING_SECRET_V1: "short" });
    expectConfigError(() => loadReceiptKeyRing(process.env), /at least 32 bytes/);
  });

  await test("1.4 malformed or unconfigured active version is rejected", () => {
    useEnv({ NODE_ENV: "production", RECEIPT_SIGNING_SECRET_V1: KEY_A, RECEIPT_SIGNING_ACTIVE_VERSION: "latest" });
    expectConfigError(() => loadReceiptKeyRing(process.env), /not of the form v<n>/);
    useEnv({ NODE_ENV: "production", RECEIPT_SIGNING_SECRET_V1: KEY_A, RECEIPT_SIGNING_ACTIVE_VERSION: "v2" });
    expectConfigError(() => loadReceiptKeyRing(process.env), /RECEIPT_SIGNING_SECRET_V2 must be set/);
  });

  await test("1.5 configuration errors never echo the key value", () => {
    const leaky = "x".repeat(20) + "SENTINEL";
    useEnv({ NODE_ENV: "production", RECEIPT_SIGNING_SECRET_V1: leaky });
    assert.throws(() => loadReceiptKeyRing(process.env), (err: unknown) => !(err as Error).message.includes("SENTINEL"));
    const report = validateStartupConfig();
    assert.ok(!JSON.stringify(report).includes("SENTINEL"));
  });

  await test("1.6 readiness reports receipt key misconfiguration as a failed check", () => {
    useEnv({ NODE_ENV: "production" });
    const bad = validateStartupConfig().checks.find((c) => c.name === "RECEIPT_SIGNING_KEYS");
    assert.equal(bad?.passed, false);
    useEnv({ NODE_ENV: "production", RECEIPT_SIGNING_SECRET_V1: KEY_A });
    const good = validateStartupConfig().checks.find((c) => c.name === "RECEIPT_SIGNING_KEYS");
    assert.equal(good?.passed, true);
  });

  await test("1.7 checkKeyMaterial accepts CSPRNG output but makes no randomness claim", () => {
    assert.equal(checkKeyMaterial(generateSigningKey()), null);
    // A long, non-random string passes the guard: the guard cannot detect predictability.
    assert.equal(checkKeyMaterial("abcdefghijklmnopqrstuvwxyz0123456789"), null);
  });

  console.log("\n--- 2. One trust policy for signing and verification ---");

  await test("2.1 governed key: sign then verify is TRUSTED and the report is trusted", () => {
    useEnv({ NODE_ENV: "production", RECEIPT_SIGNING_SECRET_V1: KEY_A });
    const receipt = signedReceipt();
    const sig = verifyReceiptSignature(receipt);
    assert.equal(sig.isValid, true);
    assert.equal(sig.trust, "TRUSTED");
    const report = verifyTerminalReceipt(receipt);
    assert.equal(report.verdict, "VALID");
    assert.equal(report.trusted, true);
    assert.equal(report.signatureTrust, "TRUSTED");
  });

  await test("2.2 a caller-supplied secret is refused by both verification entry points", () => {
    useEnv({ NODE_ENV: "production", RECEIPT_SIGNING_SECRET_V1: KEY_A });
    const forged = resignWith(signedReceipt(), "attacker-chosen-secret-0123456789abcdef");
    const anyVerify = verifyReceiptSignature as (r: TerminalDecisionReceipt, s?: string) => unknown;
    const anyReport = verifyTerminalReceipt as (r: unknown, s?: string, t?: string) => unknown;
    expectConfigError(() => anyVerify(forged, "attacker-chosen-secret-0123456789abcdef"), /caller-supplied secret/);
    expectConfigError(() => anyReport(forged, "attacker-chosen-secret-0123456789abcdef"), /caller-supplied secret/);
    // And the forged receipt is rejected through the normal path.
    assert.equal(verifyTerminalReceipt(forged).failureReason, "SIGNATURE_MISMATCH");
  });

  await test("2.3 an extra secret argument to signReceipt is ignored, never used as the key", () => {
    useEnv({ NODE_ENV: "production", RECEIPT_SIGNING_SECRET_V1: KEY_A });
    const anySign = signReceipt as (...args: unknown[]) => TerminalDecisionReceipt;
    const receipt = anySign(buildSampleUnsignedReceipt(), "v1", "attacker-chosen-secret-0123456789abcdef");
    assert.equal(verifyReceiptSignature(receipt).trust, "TRUSTED");
    assert.notEqual(receipt.signature, resignWith(receipt, "attacker-chosen-secret-0123456789abcdef").signature);
  });

  await test("2.4 signing with an unknown version fails; verifying one reports KEY_VERSION_UNKNOWN", () => {
    useEnv({ NODE_ENV: "production", RECEIPT_SIGNING_SECRET_V1: KEY_A });
    expectConfigError(() => signedReceipt({}, "v9"), /unknown signing key version 'v9'/);
    useEnv({ NODE_ENV: "production", RECEIPT_SIGNING_SECRET_V1: KEY_A, RECEIPT_SIGNING_SECRET_V9: KEY_B, RECEIPT_SIGNING_ACTIVE_VERSION: "v9" });
    const v9 = signedReceipt();
    useEnv({ NODE_ENV: "production", RECEIPT_SIGNING_SECRET_V1: KEY_A });
    const report = verifyTerminalReceipt(v9);
    assert.equal(report.verdict, "INVALID");
    assert.equal(report.failureReason, "KEY_VERSION_UNKNOWN");
  });

  await test("2.6 prototype-member key versions are INVALID, never a crash", () => {
    useEnv({ NODE_ENV: "production", RECEIPT_SIGNING_SECRET_V1: KEY_A });
    const receipt = signedReceipt();
    for (const signingKeyVersion of ["__proto__", "constructor", "toString", "hasOwnProperty"]) {
      const crafted = { ...receipt, signingKeyVersion };
      const rehashed = { ...crafted, proofHash: verifyReceiptSignature(crafted).recomputedHash };
      const sig = verifyReceiptSignature(rehashed);
      assert.equal(sig.isValid, false);
      assert.equal(sig.trust, "INVALID");
      const report = verifyTerminalReceipt(rehashed);
      assert.equal(report.verdict, "INVALID");
      assert.equal(report.failureReason, "KEY_VERSION_UNKNOWN");
    }
  });

  await test("2.5 malformed signatures are rejected without throwing", () => {
    useEnv({ NODE_ENV: "production", RECEIPT_SIGNING_SECRET_V1: KEY_A });
    const receipt = signedReceipt();
    for (const signature of ["", "zz".repeat(32), receipt.signature.slice(0, 62), receipt.signature + "00"]) {
      const sig = verifyReceiptSignature({ ...receipt, signature });
      assert.equal(sig.isValid, false);
      assert.equal(sig.trust, "INVALID");
    }
  });

  console.log("\n--- 3. Rotation ---");

  await test("3.1 after rotating to v2, v1 receipts stay TRUSTED and new receipts use v2", () => {
    useEnv({ NODE_ENV: "production", RECEIPT_SIGNING_SECRET_V1: KEY_A });
    const old = signedReceipt();
    assert.equal(old.signingKeyVersion, "v1");

    useEnv({ NODE_ENV: "production", RECEIPT_SIGNING_SECRET_V1: KEY_A, RECEIPT_SIGNING_SECRET_V2: KEY_B, RECEIPT_SIGNING_ACTIVE_VERSION: "v2" });
    assert.equal(getActiveSigningKeyVersion(), "v2");
    const fresh = signedReceipt();
    assert.equal(fresh.signingKeyVersion, "v2");
    assert.equal(verifyReceiptSignature(old).trust, "TRUSTED");
    assert.equal(verifyReceiptSignature(fresh).trust, "TRUSTED");
  });

  await test("3.2 production refuses to sign with a retired (non-active) version", () => {
    useEnv({ NODE_ENV: "production", RECEIPT_SIGNING_SECRET_V1: KEY_A, RECEIPT_SIGNING_SECRET_V2: KEY_B, RECEIPT_SIGNING_ACTIVE_VERSION: "v2" });
    expectConfigError(() => signedReceipt({}, "v1"), /only the active version 'v2' may sign/);
  });

  await test("3.3 removing a version from the ring stops its receipts verifying", () => {
    useEnv({ NODE_ENV: "production", RECEIPT_SIGNING_SECRET_V1: KEY_A, RECEIPT_SIGNING_SECRET_V2: KEY_B, RECEIPT_SIGNING_ACTIVE_VERSION: "v2" });
    const v2 = signedReceipt();
    useEnv({ NODE_ENV: "production", RECEIPT_SIGNING_SECRET_V1: KEY_A });
    assert.equal(verifyTerminalReceipt(v2).failureReason, "KEY_VERSION_UNKNOWN");
  });

  console.log("\n--- 4. Tampering and version substitution ---");

  await test("4.1 changing the amount breaks the proof hash", () => {
    useEnv({ NODE_ENV: "production", RECEIPT_SIGNING_SECRET_V1: KEY_A });
    const receipt = signedReceipt();
    const tampered = { ...receipt, inputCommitment: { ...receipt.inputCommitment, amountMinor: receipt.inputCommitment.amountMinor + 1 } };
    assert.equal(verifyTerminalReceipt(tampered).failureReason, "HASH_MISMATCH");
  });

  await test("4.2 tampering plus a recomputed proof hash still fails the HMAC", () => {
    useEnv({ NODE_ENV: "production", RECEIPT_SIGNING_SECRET_V1: KEY_A });
    const receipt = signedReceipt();
    const tampered = { ...receipt, finalDecision: "HUMAN_APPROVED" as const };
    const rehashed = { ...tampered, proofHash: verifyReceiptSignature(tampered).recomputedHash };
    const report = verifyTerminalReceipt(rehashed);
    assert.equal(report.verdict, "INVALID");
    assert.equal(report.failureReason, "SIGNATURE_MISMATCH");
    assert.equal(report.trusted, false);
  });

  await test("4.3 relabelling a v1 receipt as v2 is detected (version is inside the signed body)", () => {
    useEnv({ NODE_ENV: "production", RECEIPT_SIGNING_SECRET_V1: KEY_A, RECEIPT_SIGNING_SECRET_V2: KEY_B });
    const receipt = signedReceipt();
    const relabelled = { ...receipt, signingKeyVersion: "v2" };
    assert.equal(verifyTerminalReceipt(relabelled).failureReason, "HASH_MISMATCH");
    const rehashed = { ...relabelled, proofHash: verifyReceiptSignature(relabelled).recomputedHash };
    assert.equal(verifyTerminalReceipt(rehashed).failureReason, "SIGNATURE_MISMATCH");
  });

  console.log("\n--- 5. Legacy receipts signed with public secrets ---");

  for (const [version, secret] of Object.entries(KNOWN_PUBLIC_LEGACY_KEYS)) {
    await test(`5.${version.slice(1)} a ${version} receipt signed with the public default is LEGACY_PUBLIC_KEY, never trusted`, () => {
      useEnv({ NODE_ENV: "production", RECEIPT_SIGNING_SECRET_V1: KEY_A, RECEIPT_SIGNING_SECRET_V2: KEY_B, RECEIPT_SIGNING_ACTIVE_VERSION: version });
      const legacy = resignWith(signedReceipt(), secret);
      const sig = verifyReceiptSignature(legacy);
      assert.equal(sig.isValid, false);
      assert.equal(sig.trust, "UNTRUSTED_LEGACY_PUBLIC_KEY");
      const report = verifyTerminalReceipt(legacy);
      assert.equal(report.verdict, "INVALID");
      assert.equal(report.failureReason, "LEGACY_PUBLIC_KEY");
      assert.equal(report.trusted, false);
      // The receipt remains inspectable: identifiers and decision are reported.
      assert.equal(report.receiptId, legacy.receiptId);
      assert.equal(report.finalDecision, legacy.finalDecision);
    });
  }

  await test("5.3 legacy classification also applies outside production", () => {
    useEnv({});
    const legacy = resignWith(signedReceipt(), KNOWN_PUBLIC_LEGACY_KEYS.v1);
    assert.equal(verifyTerminalReceipt(legacy).failureReason, "LEGACY_PUBLIC_KEY");
  });

  console.log("\n--- 6. Development keys ---");

  await test("6.1 unset keys outside production are ephemeral: VALID but not trusted", () => {
    useEnv({});
    const receipt = signedReceipt();
    const report = verifyTerminalReceipt(receipt);
    assert.equal(report.verdict, "VALID");
    assert.equal(report.trusted, false);
    assert.equal(report.signatureTrust, "UNTRUSTED_DEVELOPMENT_KEY");
    // A new process (new ring) cannot verify it: nothing about the key is fixed or public.
    resetReceiptKeyRingForTests();
    assert.equal(verifyTerminalReceipt(receipt).failureReason, "SIGNATURE_MISMATCH");
  });

  await test("6.2 a development-signed receipt does not verify in production", () => {
    useEnv({});
    const devReceipt = signedReceipt();
    useEnv({ NODE_ENV: "production", RECEIPT_SIGNING_SECRET_V1: KEY_A });
    const report = verifyTerminalReceipt(devReceipt);
    assert.equal(report.verdict, "INVALID");
    assert.equal(report.trusted, false);
  });

  await test("6.3 configured keys outside production are governed and trusted", () => {
    useEnv({ RECEIPT_SIGNING_SECRET_V1: KEY_A });
    assert.equal(verifyTerminalReceipt(signedReceipt()).trusted, true);
  });

  console.log("\n--- 7. Verify route ---");

  async function callVerifyRoute(receipt: TerminalDecisionReceipt, body: unknown) {
    env.AUTH_SECRET = "test-only-auth-secret-0123456789abcdef";
    const token = createSessionToken({ sub: "u1", name: "Reviewer", role: "REVIEWER", tenantId: receipt.tenantId, exp: Math.floor(Date.now() / 1000) + 600 });
    const req = new NextRequest(`http://localhost:3000/api/receipts/${receipt.receiptId}/verify`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: `${SESSION_COOKIE}=${token}` },
      body: JSON.stringify(body),
    });
    const res = await verifyRoutePost(req, { params: Promise.resolve({ id: receipt.receiptId }) });
    return { status: res.status, json: await res.json() };
  }

  await test("7.1 production rejects tamper simulation; the stored receipt verifies as trusted", async () => {
    useEnv({ NODE_ENV: "production", RECEIPT_SIGNING_SECRET_V1: KEY_A });
    const receipt = signedReceipt({ receiptId: `rcpt_route_${Date.now()}` });
    await TerminalReceiptRepository.saveReceipt(receipt);

    const tamper = await callVerifyRoute(receipt, { tamperedFields: { finalDecision: "HUMAN_REJECTED" } });
    assert.equal(tamper.status, 400);
    assert.equal(tamper.json.error, "TAMPER_SIMULATION_DISABLED");

    const plain = await callVerifyRoute(receipt, {});
    assert.equal(plain.status, 200);
    assert.equal(plain.json.simulated, false);
    assert.equal(plain.json.report.verdict, "VALID");
    assert.equal(plain.json.report.trusted, true);
  });

  await test("7.2 outside production, tamper simulation is labelled simulated and reports INVALID", async () => {
    useEnv({ RECEIPT_SIGNING_SECRET_V1: KEY_A });
    const receipt = signedReceipt({ receiptId: `rcpt_route_dev_${Date.now()}` });
    await TerminalReceiptRepository.saveReceipt(receipt);
    const res = await callVerifyRoute(receipt, { tamperedFields: { finalDecision: "HUMAN_REJECTED" } });
    assert.equal(res.status, 200);
    assert.equal(res.json.simulated, true);
    assert.equal(res.json.report.verdict, "INVALID");
    assert.equal(res.json.report.trusted, false);
  });

  // Restore the environment for anything that runs after this file.
  for (const name of Object.keys(env)) delete env[name];
  Object.assign(env, ORIGINAL_ENV);
  resetReceiptKeyRingForTests();

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error("Receipt signing suite crashed:", err);
  process.exit(1);
});
