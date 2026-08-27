/*
 * SettleMate AI — Massive Fuzz Testing Runner Script
 */

import { runFuzzCampaign } from "../src/lib/fuzz/fuzzer";

async function main() {
  console.log("\n=========================================================================");
  console.log(" 🧪 SETTLEMATE AI — 200,000-ITERATION INDUSTRIAL FUZZ CAMPAIGN");
  console.log("=========================================================================\n");

  const start = performance.now();
  const stats = await runFuzzCampaign(200000);
  const elapsed = (performance.now() - start) / 1000;

  console.log(`Campaign Finished in: ${elapsed.toFixed(2)}s`);
  console.log(`Total Fuzz Runs:      ${stats.totalIterations}`);
  console.log(`Matcher Runs:         ${stats.matcherFuzzed}`);
  console.log(`Receipt Runs:         ${stats.receiptFuzzed}`);
  console.log(`Claim Validator Runs: ${stats.claimsFuzzed}`);
  console.log(`Crashes Detected:     ${stats.crashes}`);
  console.log(`Memory Leaks:         ${stats.memoryLeaks}`);

  if (stats.bugsFound.length > 0) {
    console.log("\n🚨 Surface Vulnerabilities / Crashes:");
    for (const bug of stats.bugsFound.slice(0, 10)) {
      console.log(`  - ${bug}`);
    }
  } else {
    console.log("\n🛡️  ZERO CRASHES / ZERO HANGS / ZERO MEMORY LEAKS DETECTED.");
  }
}

void main();
