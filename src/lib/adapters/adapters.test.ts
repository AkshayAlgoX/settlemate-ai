/*
 * SettleMate AI — Provider Adapters & Ingestion Test Suite
 */

import assert from "node:assert/strict";
import { BankStatementCsvAdapter } from "./bank-statement-csv";
import { RazorpayGatewayAdapter } from "./gateway-razorpay";
import { GenericGatewayAdapter } from "./generic-gateway";
import { StreamingIngestionEngine } from "./streaming-ingestion";

async function test(name: string, fn: () => void | Promise<void>) {
  try {
    await fn();
    console.log("  ✓ " + name);
  } catch (err) {
    console.error("  ✗ " + name + " — " + (err as Error).message);
    throw err;
  }
}

async function main() {
  console.log("\n=========================================================================");
  console.log(" SETTLEMATE AI — REAL DATA ADAPTERS & INGESTION TESTS");
  console.log("=========================================================================");

  // 1. Bank Statement CSV Parser
  await test("BankStatementCsvAdapter extracts credits, dates, and embedded UTRs from narration", async () => {
    const csv = "Txn Date,Reference No,Description,Credit Amount\n2026-08-20,TXN_991,CMS / UTR_HDFC_99100 / SETTLEMENT,500.00\n2026-08-21,TXN_992,NEFT / 123456789012 / PAYOUT,1250.75\n2026-08-22,TXN_993,TRANSFER FROM MERCHANT,3000.00\n";

    const adapter = new BankStatementCsvAdapter();
    const { dataset, validation } = await adapter.parseCsvStream(csv);

    assert.equal(validation.valid, true);
    assert.equal(dataset.bankTxns.length, 3);
    assert.equal(dataset.bankTxns[0]!.amount, 50000);
    assert.equal(dataset.bankTxns[0]!.utr, "UTR_HDFC_99100");
    assert.equal(dataset.bankTxns[1]!.amount, 125075);
    assert.equal(dataset.bankTxns[1]!.utr, "123456789012");
    assert.equal(dataset.bankTxns[2]!.amount, 300000);
    assert.equal(dataset.metadata.totalBankCreditsPaise, 475075);
  });

  // 2. Razorpay Gateway Adapter
  await test("RazorpayGatewayAdapter parses orders, payments, fees, taxes, and settlements", async () => {
    const csv = "payment_id,order_id,settlement_id,amount,fee,tax,utr,created_at,status,method\npay_rzp_1,ord_1,setl_1,1000.00,20.00,3.60,UTR_RZP_001,2026-08-20,captured,UPI\npay_rzp_2,ord_2,setl_2,500.00,10.00,1.80,UTR_RZP_002,2026-08-20,captured,CARD\n";

    const adapter = new RazorpayGatewayAdapter();
    const { dataset, validation } = await adapter.parseCsvStream(csv);

    assert.equal(validation.valid, true);
    assert.equal(dataset.payments.length, 2);
    assert.equal(dataset.settlements.length, 2);
    assert.equal(dataset.payments[0]!.amount, 100000);
    assert.equal(dataset.payments[0]!.fee, 2000);
    assert.equal(dataset.payments[0]!.tax, 360);
    assert.equal(dataset.settlements[0]!.amount, 100000 - 2000 - 360);
    assert.equal(dataset.settlements[0]!.utr, "UTR_RZP_001");
  });

  // 3. Generic Gateway Adapter
  await test("GenericGatewayAdapter parses arbitrary column headers with flexible matching", async () => {
    const csv = "ID,Total,Fee,UTR,Date\ngen_101,250.00,5.00,UTR_GEN_101,2026-08-21\ngen_102,750.00,15.00,UTR_GEN_102,2026-08-21\n";

    const adapter = new GenericGatewayAdapter();
    const { dataset, validation } = await adapter.parseCsvStream(csv);

    assert.equal(validation.valid, true);
    assert.equal(dataset.payments.length, 2);
    assert.equal(dataset.payments[0]!.amount, 25000);
    assert.equal(dataset.payments[0]!.fee, 500);
    assert.equal(dataset.settlements[0]!.amount, 24500);
  });

  // 4. Streaming Ingestion Auto-Detection
  await test("StreamingIngestionEngine auto-detects provider schema correctly", async () => {
    const engine = new StreamingIngestionEngine();

    const rzpCsv = "payment_id,settlement_id,amount,created_at\np1,s1,100,2026-08-20\n";
    assert.equal(engine.detectProvider(rzpCsv), "RAZORPAY");

    const bankCsv = "txn_date,narration,credit,balance\n2026-08-20,CREDIT SALARY,50000,100000\n";
    assert.equal(engine.detectProvider(bankCsv), "BANK_STATEMENT");

    const genericCsv = "custom_id,total_amount,timestamp\n1,100,2026-08-20\n";
    assert.equal(engine.detectProvider(genericCsv), "GENERIC_CSV");
  });

  // 5. Schema Validation & Error Reporting
  await test("Schema validation rejects invalid/missing headers cleanly", async () => {
    const badCsv = "random_col_1,random_col_2\nfoo,bar\n";
    const adapter = new BankStatementCsvAdapter();
    const { validation } = await adapter.parseCsvStream(badCsv, { strict: true });

    assert.equal(validation.valid, false);
    assert.ok(validation.errors.length > 0);
    assert.ok(validation.errors.some((e) => e.field === "date" || e.field === "amount"));
  });

  console.log("\nadapters: ALL 5 PASSED\n");
}

void main();
