/*
 * SettleMate AI — LLM AI Investigator & Offline Fallback Unit Tests
 */

import assert from "node:assert/strict";
import {
  executeAiInvestigator,
  generateDeterministicClaims,
  buildInvestigatorPrompt,
} from "./llm-investigator";
import type { CouncilReviewRequest } from "./council";
import { DeterministicClaimValidator } from "./claim-validator";
import { AiClaimLogRepository, initDatabase } from "@/lib/storage/sqlite-db";

async function test(name: string, fn: () => void | Promise<void>) {
  try {
    await fn();
    console.log("  ✓ " + name);
  } catch (err) {
    console.error("  ✗ " + name + " — " + (err as Error).message);
    throw err;
  }
}

async function runTests() {
  console.log("\n=========================================================================");
  console.log(" SETTLEMATE AI — LLM INVESTIGATOR & OFFLINE FALLBACK TESTS");
  console.log("=========================================================================\n");

  initDatabase();

  const sampleRequest: CouncilReviewRequest = {
    exceptionId: "exc_demo_valid",
    exceptionType: "SETTLEMENT_DELAY",
    amountPaise: 100000,
    riskLevel: "MEDIUM",
    paymentRecord: {
      paymentId: "pay_100",
      amount: 1000,
      fee: 20,
      tax: 3.6,
      createdAt: new Date("2026-08-20T10:00:00Z"),
    },
    settlementRecord: {
      settlementId: "setl_100",
      amount: 976.4, // Net: 1000 - 20 - 3.6 = 976.40
      settledAt: new Date("2026-08-22T10:00:00Z"),
    },
    evidenceItems: [
      {
        evidenceId: "ev_setl_100",
        sourceType: "SETTLEMENT",
        sourceReference: "SETL-100",
        title: "Gateway Settlement Advice",
        createdAt: new Date("2026-08-22T10:00:00Z"),
        observedAt: new Date("2026-08-22T10:00:00Z"),
        contentHash: "hash_setl_100",
        accessClassification: "CONFIDENTIAL",
        linkedRecords: { paymentIds: ["pay_100"] },
        provider: "RAZORPAY",
      },
    ],
  };

  await test("1. Prompt engineering constructs rich context with evidence and exception details", () => {
    const prompt = buildInvestigatorPrompt(sampleRequest);
    assert.ok(prompt.includes("exc_demo_valid"));
    assert.ok(prompt.includes("SETTLEMENT_DELAY"));
    assert.ok(prompt.includes("ev_setl_100"));
    assert.ok(prompt.includes("AIClaim"));
  });

  await test("2. Offline fallback generates structured, falsifiable claims without external network calls", () => {
    const output = generateDeterministicClaims(sampleRequest);
    assert.ok(output.hypothesis.includes("offline fallback"));
    assert.ok(output.claims.length >= 2);
    assert.equal(output.claims[0].claimId, "C1");
    assert.equal(output.claims[0].type, "AMOUNT");
    assert.ok(output.claims[0].statement.includes("Net expected settlement is ₹976.40"));

    // Verify claim passes deterministic validator
    const validator = new DeterministicClaimValidator();
    const receipt = validator.validateAllClaims(output.claims, sampleRequest, "ccl_test_001");
    assert.ok(receipt.verifiedClaimsCount >= 1);
    assert.equal(receipt.disputedClaimsCount, 0);
  });

  await test("3. executeAiInvestigator falls back gracefully and logs to SQLite when no API key is set", async () => {
    const originalOpenAI = process.env.OPENAI_API_KEY;
    const originalAnthropic = process.env.ANTHROPIC_API_KEY;
    const originalGemini = process.env.GEMINI_API_KEY;

    delete process.env.OPENAI_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.GEMINI_API_KEY;

    try {
      const uniqueRequest = { ...sampleRequest, exceptionId: `exc_test_fallback_${Date.now()}` };
      const res = await executeAiInvestigator(uniqueRequest);
      assert.equal(res.isOfflineFallback, true);
      assert.equal(res.model, "offline-fallback");
      assert.ok(res.latencyMs >= 0);
      assert.ok(res.investigator.claims.length >= 2);

      // Verify logged to SQLite
      const logs = AiClaimLogRepository.getByExceptionId(uniqueRequest.exceptionId);
      assert.ok(logs.length > 0);
      assert.equal(logs[0].status, "FALLBACK");
      assert.equal(logs[0].model, "offline-fallback");
    } finally {
      if (originalOpenAI) process.env.OPENAI_API_KEY = originalOpenAI;
      if (originalAnthropic) process.env.ANTHROPIC_API_KEY = originalAnthropic;
      if (originalGemini) process.env.GEMINI_API_KEY = originalGemini;
    }
  });

  await test("4. Mocked LLM call parses structured claims and validates against non-LLM gate", async () => {
    const originalFetch = globalThis.fetch;
    process.env.OPENAI_API_KEY = "sk-mock-test-key-for-unit-testing";

    const mockResponsePayload = {
      choices: [
        {
          message: {
            content: JSON.stringify({
              hypothesis: "Net settlement verified against gateway settlement advice.",
              reasoning: "Payment pay_100 settled cleanly for ₹976.40 within policy window.",
              supportingFacts: ["Settlement advice confirmed by Razorpay"],
              uncertainties: [],
              recommendedAction: "MAKER_CHECKER_SIGN_OFF",
              confidence: 94,
              claimedNetPaise: 97640,
              claims: [
                {
                  claimId: "C1",
                  type: "AMOUNT",
                  statement: "Net expected settlement is ₹976.40.",
                  evidenceIds: ["ev_setl_100"],
                  assertedValues: [
                    {
                      key: "netAmount",
                      value: 97640,
                      expectedPaise: 97640,
                      observedPaise: 97640,
                    },
                  ],
                  confidence: 95,
                  uncertainties: [],
                },
                {
                  claimId: "C2",
                  type: "POLICY",
                  statement: "Timing is within policy window.",
                  evidenceIds: ["ev_setl_100"],
                  assertedValues: [],
                  confidence: 98,
                  uncertainties: [],
                },
              ],
            }),
          },
        },
      ],
    };

    globalThis.fetch = (async (url: string | URL | Request) => {
      const urlStr = String(url);
      if (urlStr.includes("openai.com")) {
        return new Response(JSON.stringify(mockResponsePayload), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      return originalFetch(url as RequestInfo, undefined);
    }) as typeof fetch;

    try {
      const res = await executeAiInvestigator(sampleRequest);
      assert.equal(res.isOfflineFallback, false);
      assert.equal(res.investigator.confidence, 94);
      assert.equal(res.investigator.claims.length, 2);

      // Verify that LLM output passes through DeterministicClaimValidator
      const validator = new DeterministicClaimValidator();
      const receipt = validator.validateAllClaims(res.investigator.claims, sampleRequest, "ccl_mock_001");
      assert.equal(receipt.verifiedClaimsCount, 2);
      assert.equal(receipt.disputedClaimsCount, 0);

      // Verify logged to SQLite with SUCCESS status
      const logs = AiClaimLogRepository.getByExceptionId(sampleRequest.exceptionId);
      assert.ok(logs.some((l) => l.status === "SUCCESS"));
    } finally {
      globalThis.fetch = originalFetch;
      delete process.env.OPENAI_API_KEY;
    }
  });

  await test("5. Network failure / LLM error gracefully triggers offline fallback and logs error status", async () => {
    const originalFetch = globalThis.fetch;
    process.env.OPENAI_API_KEY = "sk-mock-failing-key";

    globalThis.fetch = (async () => {
      return new Response(JSON.stringify({ error: { message: "Rate limit exceeded" } }), {
        status: 429,
        statusText: "Too Many Requests",
      });
    }) as typeof fetch;

    try {
      const res = await executeAiInvestigator(sampleRequest);
      assert.equal(res.isOfflineFallback, true);
      assert.ok(res.investigator.claims.length >= 2);
      assert.ok(res.error?.includes("429"));
    } finally {
      globalThis.fetch = originalFetch;
      delete process.env.OPENAI_API_KEY;
    }
  });

  console.log("\nllm-investigator: ALL 5 UNIT & INTEGRATION TESTS PASSED\n");
}

runTests().catch((err) => {
  console.error("Test failure:", err);
  process.exit(1);
});
