/*
 * SettleMate AI — Smart Alerting Engine Tests
 */

import assert from "node:assert";
import {
  generateDeterministicAlert,
  dispatchSmartAlert,
  DEFAULT_ALERT_CHANNELS,
} from "./alert-engine";
import { v1Store } from "@/lib/api/v1-store";
import { POST as mockReceiverPost } from "@/app/api/alerts/mock-receiver/route";
import { POST as alertTriggerPost } from "@/app/api/alerts/trigger/route";
import { NextRequest } from "next/server";

async function runTests() {
  console.log("\n========================================================");
  console.log("   SETTLEMATE AI — SMART ALERTING ENGINE TESTS          ");
  console.log("========================================================\n");

  // 1. Deterministic Alert Generation
  console.log("1. Testing Deterministic Alert Generation...");
  assert(DEFAULT_ALERT_CHANNELS.length >= 4, "Must have at least 4 default channels configured");
  const alert0 = generateDeterministicAlert(0);
  assert(typeof alert0.id === "string" && alert0.id.startsWith("alt_"), "Alert ID must start with alt_");
  assert(Number.isInteger(alert0.amountPaise) && alert0.amountPaise > 0, "amountPaise must be positive integer");
  assert(typeof alert0.formattedAmount === "string" && alert0.formattedAmount.includes("₹"), "Must format currency properly");
  assert(["HIGH", "MEDIUM", "LOW"].includes(alert0.severity), "Severity must be HIGH/MEDIUM/LOW");
  assert(alert0.recommendedPlaybook.startsWith("PB-"), "Playbook must start with PB-");
  console.log(`   ✓ Alert 0 generated: [${alert0.severity}] ${alert0.title} (${alert0.formattedAmount})`);

  // 2. High-Risk Filtering
  console.log("\n2. Testing High-Risk Alert Filtering...");
  for (let i = 0; i < 5; i++) {
    const highRiskAlert = generateDeterministicAlert(i, true);
    assert.strictEqual(highRiskAlert.severity, "HIGH", "Must strictly produce HIGH severity alerts when forceHighRisk=true");
  }
  console.log("   ✓ High-risk filter generates strictly critical severity alerts");

  // 3. Webhook Dispatch with HMAC-SHA256 Signing
  console.log("\n3. Testing Signed Webhook Dispatch...");
  const sampleAlert = generateDeterministicAlert(1);
  const dispatched = await dispatchSmartAlert(
    sampleAlert,
    "https://hooks.slack.internal/services/settlemate/recon-critical"
  );
  assert(typeof dispatched.signature === "string", "Signature must be attached");
  assert(dispatched.signature.includes("v1="), "Signature must contain v1 HMAC hash");
  assert(dispatched.signature.includes("t="), "Signature must contain timestamp t=");
  assert.strictEqual(dispatched.deliveryStatus, "SIMULATED", "Internal domain must yield SIMULATED status");
  console.log(`   ✓ Alert dispatched with HMAC signature: ${dispatched.signature?.slice(0, 32)}...`);

  // 4. v1Store Integration & Log Persistence
  console.log("\n4. Testing SQLite Log Persistence for Alerts...");
  const logs = v1Store.getWebhookLogs(5);
  assert(logs.length > 0, "Webhook logs must record dispatched alert");
  assert(logs.some((l) => l.event.includes("reconciliation.alert")), "Event must be recorded in delivery logs");
  console.log(`   ✓ Webhook delivery logged to persistent store (${logs.length} total logs)`);

  // 5. Mock Receiver Endpoint Test
  console.log("\n5. Testing Mock Webhook Receiver Endpoint...");
  const mockReq = new NextRequest("http://localhost:3000/api/alerts/mock-receiver", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-SettleMate-Signature": dispatched.signature || "t=123456,v1=abcdef",
      "X-SettleMate-Event": "reconciliation.alert.high",
      "User-Agent": "SettleMate-Webhook-Dispatcher/1.0",
    },
    body: JSON.stringify({
      alertId: dispatched.id,
      exceptionId: dispatched.exceptionId,
      amountPaise: dispatched.amountPaise,
    }),
  });

  const receiverRes = await mockReceiverPost(mockReq);
  assert.strictEqual(receiverRes.status, 200, "Mock receiver must return 200 OK");
  const receiverData = await receiverRes.json();
  assert.strictEqual(receiverData.received, true);
  assert.strictEqual(receiverData.signatureVerified, true);
  assert.strictEqual(receiverData.event, "reconciliation.alert.high");
  console.log("   ✓ Mock receiver validated signature header and acknowledged payload");

  // 6. POST /api/alerts/trigger Route Test
  console.log("\n6. Testing POST /api/alerts/trigger Route Handler...");
  const triggerReq = new NextRequest("http://localhost:3000/api/alerts/trigger", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ highRiskOnly: true, index: 0 }),
  });
  const triggerRes = await alertTriggerPost(triggerReq);
  assert.strictEqual(triggerRes.status, 200);
  const triggerData = await triggerRes.json();
  assert.strictEqual(triggerData.success, true);
  assert.strictEqual(triggerData.alert.severity, "HIGH");
  console.log("   ✓ Trigger route returned high-risk alert envelope with HMAC proof");

  console.log("\n========================================================");
  console.log("   ALL SMART ALERTING ENGINE TESTS PASSED (6/6)         ");
  console.log("========================================================\n");
}

runTests().catch((err) => {
  console.error("Alert tests failed:", err);
  process.exit(1);
});
