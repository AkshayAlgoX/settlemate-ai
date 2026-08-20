import { v4 as uuidv4 } from "uuid";
import {
  FEE_CONFIG,
  SETTLEMENT_CONFIG,
  DEFAULT_DISTRIBUTION,
  PAYMENT_METHODS,
  type ExceptionType,
} from "@/lib/constants";

// ─── ID GENERATORS ───

function generateId(prefix: string, index: number): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let suffix = "";
  let n = index;
  for (let i = 0; i < 8; i++) {
    suffix = chars[n % chars.length] + suffix;
    n = Math.floor(n / chars.length);
  }
  return `${prefix}_${suffix}`;
}

function generateUTR(index: number, date: Date): string {
  const dateStr = date.toISOString().slice(0, 10).replace(/-/g, "");
  return `UTR${dateStr}${String(index).padStart(6, "0")}`;
}

// ─── HELPERS ───

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomChoice<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function addHours(date: Date, hours: number): Date {
  const d = new Date(date);
  d.setHours(d.getHours() + hours);
  return d;
}

function addMinutes(date: Date, mins: number): Date {
  const d = new Date(date);
  d.setMinutes(d.getMinutes() + mins);
  return d;
}

function computeFee(amountPaise: number, method: string): { fee: number; tax: number } {
  const rateBps =
    method === "card"
      ? FEE_CONFIG.CARD.rateBps
      : FEE_CONFIG.UPI.rateBps;
  const fee = Math.round((amountPaise * rateBps) / 10000);
  const tax = Math.round((fee * FEE_CONFIG.GST_PERCENT) / 100);
  return { fee, tax };
}

// ─── TYPES ───

interface GeneratedRecord {
  orders: Array<{
    orderId: string; amount: number; currency: string;
    status: string; customerEmail: string; description: string; createdAt: Date;
  }>;
  payments: Array<{
    paymentId: string; orderId: string; amount: number; currency: string;
    status: string; method: string; fee: number; tax: number;
    capturedAt: Date | null; createdAt: Date;
  }>;
  settlements: Array<{
    settlementId: string; paymentId: string; amount: number;
    fee: number; tax: number; utr: string | null;
    status: string; settledAt: Date | null; createdAt: Date;
  }>;
  bankTransactions: Array<{
    txnId: string; utr: string | null; amount: number;
    type: string; narration: string | null; balance: number;
    txnDate: Date; valueDate: Date | null;
  }>;
  refunds: Array<{
    refundId: string; paymentId: string; amount: number;
    status: string; reason: string; createdAt: Date; processedAt: Date | null;
  }>;
  chargebacks: Array<{
    chargebackId: string; paymentId: string; amount: number;
    reason: string; status: string; createdAt: Date; resolvedAt: Date | null;
  }>;
  groundTruths: Array<{
    paymentId: string; expectedLabel: string; scenario: string;
  }>;
}

// ─── MAIN GENERATOR ───

export function generateSyntheticBatch(size: number): GeneratedRecord {
  const baseDate = new Date("2025-08-01T00:00:00Z");
  const orders: GeneratedRecord["orders"] = [];
  const payments: GeneratedRecord["payments"] = [];
  const settlements: GeneratedRecord["settlements"] = [];
  const bankTransactions: GeneratedRecord["bankTransactions"] = [];
  const refunds: GeneratedRecord["refunds"] = [];
  const chargebacks: GeneratedRecord["chargebacks"] = [];
  const groundTruths: GeneratedRecord["groundTruths"] = [];

  // Compute counts per scenario
  const distribution = DEFAULT_DISTRIBUTION;
  const counts: Record<string, number> = {};
  let allocated = 0;
  const entries = Object.entries(distribution);

  for (let i = 0; i < entries.length - 1; i++) {
    const [key, pct] = entries[i];
    counts[key] = Math.round(size * pct);
    allocated += counts[key];
  }
  counts[entries[entries.length - 1][0]] = size - allocated;

  // Shuffle scenario assignments
  const assignments: ExceptionType[] = [];
  for (const [type, count] of Object.entries(counts)) {
    for (let i = 0; i < count; i++) {
      assignments.push(type as ExceptionType);
    }
  }
  // Fisher-Yates shuffle
  for (let i = assignments.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [assignments[i], assignments[j]] = [assignments[j], assignments[i]];
  }

  let bankBalance = 500000000; // ₹50L starting balance
  let globalIndex = 0;

  for (let i = 0; i < size; i++) {
    const scenario = assignments[i];
    const idx = i + 1;
    globalIndex++;

    const orderId = generateId("order", idx);
    const paymentId = generateId("pay", idx);
    const method = randomChoice(PAYMENT_METHODS);
    const amount = randomInt(5000, 500000) * 100; // ₹500 to ₹50,000 in paise
    const { fee, tax } = computeFee(amount, method);
    const orderDate = addHours(baseDate, randomInt(0, 20 * 24));
    const paymentDate = addMinutes(orderDate, randomInt(1, 30));
    const capturedDate = addMinutes(paymentDate, randomInt(1, 5));
    const customerEmail = `customer${idx}@example.com`;
    const description = `Payment for Order #${idx}`;

    // Always create order and payment
    orders.push({
      orderId, amount, currency: "INR", status: "paid",
      customerEmail, description, createdAt: orderDate,
    });

    payments.push({
      paymentId, orderId, amount, currency: "INR",
      status: "captured", method, fee, tax,
      capturedAt: capturedDate, createdAt: paymentDate,
    });

    // Now generate scenario-specific records
    switch (scenario) {
      case "AUTO_MATCHED": {
        const settlementId = generateId("setl", idx);
        const utr = generateUTR(idx, capturedDate);
        const expectedNet = amount - fee - tax;
        const settledDate = addDays(capturedDate, SETTLEMENT_CONFIG.DELAY_DAYS);
        const bankDate = addHours(settledDate, randomInt(2, 18));

        settlements.push({
          settlementId, paymentId, amount: expectedNet,
          fee, tax, utr, status: "processed",
          settledAt: settledDate, createdAt: addDays(capturedDate, 1),
        });

        bankBalance += expectedNet;
        bankTransactions.push({
          txnId: generateId("btxn", idx), utr, amount: expectedNet,
          type: "CREDIT", narration: `RAZORPAY SETTLEMENT ${settlementId} ${utr}`,
          balance: bankBalance, txnDate: bankDate, valueDate: bankDate,
        });

        groundTruths.push({
          paymentId, expectedLabel: "AUTO_MATCHED",
          scenario: "Perfect match: order→payment→settlement→bank all align",
        });
        break;
      }

      case "PENDING_SETTLEMENT": {
        // Payment captured recently, settlement not yet due
        const recentDate = addDays(baseDate, 25); // Near end of range
        payments[payments.length - 1].capturedAt = recentDate;
        payments[payments.length - 1].createdAt = addMinutes(recentDate, -5);
        orders[orders.length - 1].createdAt = addMinutes(recentDate, -10);
        // No settlement created — it's pending

        groundTruths.push({
          paymentId, expectedLabel: "PENDING_SETTLEMENT",
          scenario: "Payment captured recently, T+2 settlement window not yet elapsed",
        });
        break;
      }

      case "MISSING_BANK_CREDIT": {
        const settlementId = generateId("setl", idx);
        const utr = generateUTR(idx, capturedDate);
        const expectedNet = amount - fee - tax;
        const settledDate = addDays(capturedDate, SETTLEMENT_CONFIG.DELAY_DAYS);

        settlements.push({
          settlementId, paymentId, amount: expectedNet,
          fee, tax, utr, status: "processed",
          settledAt: settledDate, createdAt: addDays(capturedDate, 1),
        });
        // No bank transaction — credit is missing

        groundTruths.push({
          paymentId, expectedLabel: "MISSING_BANK_CREDIT",
          scenario: `Settlement ${settlementId} processed but no bank credit with UTR ${utr}`,
        });
        break;
      }

      case "AMOUNT_MISMATCH": {
        const settlementId = generateId("setl", idx);
        const utr = generateUTR(idx, capturedDate);
        const expectedNet = amount - fee - tax;
        // Wrong fee applied in settlement (e.g., flat ₹10 extra)
        const wrongFee = fee + randomInt(500, 5000);
        const wrongTax = Math.round((wrongFee * FEE_CONFIG.GST_PERCENT) / 100);
        const wrongSettledAmount = amount - wrongFee - wrongTax;
        const settledDate = addDays(capturedDate, SETTLEMENT_CONFIG.DELAY_DAYS);
        const bankDate = addHours(settledDate, randomInt(2, 18));

        settlements.push({
          settlementId, paymentId, amount: wrongSettledAmount,
          fee: wrongFee, tax: wrongTax, utr, status: "processed",
          settledAt: settledDate, createdAt: addDays(capturedDate, 1),
        });

        bankBalance += wrongSettledAmount;
        bankTransactions.push({
          txnId: generateId("btxn", idx), utr, amount: wrongSettledAmount,
          type: "CREDIT", narration: `RAZORPAY SETTLEMENT ${settlementId}`,
          balance: bankBalance, txnDate: bankDate, valueDate: bankDate,
        });

        groundTruths.push({
          paymentId, expectedLabel: "AMOUNT_MISMATCH",
          scenario: `Expected ₹${expectedNet / 100} but settled ₹${wrongSettledAmount / 100} (wrong fee deduction)`,
        });
        break;
      }

      case "DUPLICATE_SETTLEMENT": {
        const expectedNet = amount - fee - tax;
        const settledDate = addDays(capturedDate, SETTLEMENT_CONFIG.DELAY_DAYS);

        // First settlement
        const setlId1 = generateId("setl", idx);
        const utr1 = generateUTR(idx, capturedDate);
        settlements.push({
          settlementId: setlId1, paymentId, amount: expectedNet,
          fee, tax, utr: utr1, status: "processed",
          settledAt: settledDate, createdAt: addDays(capturedDate, 1),
        });

        // Duplicate settlement (same payment, different settlement ID)
        const setlId2 = generateId("setl", idx + 10000);
        const utr2 = generateUTR(idx + 10000, capturedDate);
        settlements.push({
          settlementId: setlId2, paymentId, amount: expectedNet,
          fee, tax, utr: utr2, status: "processed",
          settledAt: addHours(settledDate, 6), createdAt: addDays(capturedDate, 1),
        });

        // Bank credits for both
        const bankDate1 = addHours(settledDate, randomInt(2, 12));
        bankBalance += expectedNet;
        bankTransactions.push({
          txnId: generateId("btxn", idx), utr: utr1, amount: expectedNet,
          type: "CREDIT", narration: `RAZORPAY SETTLEMENT ${setlId1}`,
          balance: bankBalance, txnDate: bankDate1, valueDate: bankDate1,
        });

        const bankDate2 = addHours(settledDate, randomInt(12, 24));
        bankBalance += expectedNet;
        bankTransactions.push({
          txnId: generateId("btxn", idx + 10000), utr: utr2, amount: expectedNet,
          type: "CREDIT", narration: `RAZORPAY SETTLEMENT ${setlId2}`,
          balance: bankBalance, txnDate: bankDate2, valueDate: bankDate2,
        });

        groundTruths.push({
          paymentId, expectedLabel: "DUPLICATE_SETTLEMENT",
          scenario: `Payment ${paymentId} appears in settlements ${setlId1} and ${setlId2}`,
        });
        break;
      }

      case "ORPHAN_BANK_CREDIT": {
        // Normal settlement for this payment
        const settlementId = generateId("setl", idx);
        const utr = generateUTR(idx, capturedDate);
        const expectedNet = amount - fee - tax;
        const settledDate = addDays(capturedDate, SETTLEMENT_CONFIG.DELAY_DAYS);
        const bankDate = addHours(settledDate, randomInt(2, 18));

        settlements.push({
          settlementId, paymentId, amount: expectedNet,
          fee, tax, utr, status: "processed",
          settledAt: settledDate, createdAt: addDays(capturedDate, 1),
        });

        bankBalance += expectedNet;
        bankTransactions.push({
          txnId: generateId("btxn", idx), utr, amount: expectedNet,
          type: "CREDIT", narration: `RAZORPAY SETTLEMENT ${settlementId}`,
          balance: bankBalance, txnDate: bankDate, valueDate: bankDate,
        });

        // Orphan bank credit — no matching settlement
        const orphanAmount = randomInt(1000, 100000) * 100;
        const orphanUtr = generateUTR(idx + 50000, capturedDate);
        bankBalance += orphanAmount;
        bankTransactions.push({
          txnId: generateId("btxn", idx + 50000), utr: orphanUtr,
          amount: orphanAmount, type: "CREDIT",
          narration: `RAZORPAY SETTLEMENT setl_orphan_${idx} ${orphanUtr}`,
          balance: bankBalance,
          txnDate: addDays(bankDate, randomInt(1, 3)),
          valueDate: addDays(bankDate, randomInt(1, 3)),
        });

        groundTruths.push({
          paymentId, expectedLabel: "ORPHAN_BANK_CREDIT",
          scenario: `Bank credit of ₹${orphanAmount / 100} with UTR ${orphanUtr} has no matching settlement`,
        });
        break;
      }

      case "REFUND_MISMATCH": {
        const refundAmount = Math.round(amount * randomInt(10, 40) / 100);
        const refundId = generateId("rfnd", idx);
        const expectedNet = amount - fee - tax - refundAmount;
        const settlementId = generateId("setl", idx);
        const utr = generateUTR(idx, capturedDate);
        const settledDate = addDays(capturedDate, SETTLEMENT_CONFIG.DELAY_DAYS);
        const bankDate = addHours(settledDate, randomInt(2, 18));

        // Refund exists
        refunds.push({
          refundId, paymentId, amount: refundAmount,
          status: "processed", reason: "Customer request",
          createdAt: addHours(capturedDate, randomInt(1, 24)),
          processedAt: addHours(capturedDate, randomInt(24, 48)),
        });

        // Settlement does NOT account for refund (wrong amount)
        const wrongSettled = amount - fee - tax; // Forgot to subtract refund
        settlements.push({
          settlementId, paymentId, amount: wrongSettled,
          fee, tax, utr, status: "processed",
          settledAt: settledDate, createdAt: addDays(capturedDate, 1),
        });

        bankBalance += wrongSettled;
        bankTransactions.push({
          txnId: generateId("btxn", idx), utr, amount: wrongSettled,
          type: "CREDIT", narration: `RAZORPAY SETTLEMENT ${settlementId}`,
          balance: bankBalance, txnDate: bankDate, valueDate: bankDate,
        });

        groundTruths.push({
          paymentId, expectedLabel: "REFUND_MISMATCH",
          scenario: `Refund ₹${refundAmount / 100} issued but settlement ₹${wrongSettled / 100} didn't deduct it (expected ₹${expectedNet / 100})`,
        });
        break;
      }

      case "CHARGEBACK_ADJUSTMENT": {
        const cbAmount = Math.round(amount * randomInt(20, 60) / 100);
        const cbId = generateId("cb", idx);
        const expectedNet = amount - fee - tax;
        const settlementId = generateId("setl", idx);
        const utr = generateUTR(idx, capturedDate);
        const settledDate = addDays(capturedDate, SETTLEMENT_CONFIG.DELAY_DAYS);
        const bankDate = addHours(settledDate, randomInt(2, 18));

        // Original settlement was correct
        settlements.push({
          settlementId, paymentId, amount: expectedNet,
          fee, tax, utr, status: "processed",
          settledAt: settledDate, createdAt: addDays(capturedDate, 1),
        });

        bankBalance += expectedNet;
        bankTransactions.push({
          txnId: generateId("btxn", idx), utr, amount: expectedNet,
          type: "CREDIT", narration: `RAZORPAY SETTLEMENT ${settlementId}`,
          balance: bankBalance, txnDate: bankDate, valueDate: bankDate,
        });

        // Chargeback comes later
        chargebacks.push({
          chargebackId: cbId, paymentId, amount: cbAmount,
          reason: "Unauthorized transaction", status: "open",
          createdAt: addDays(capturedDate, randomInt(7, 21)),
          resolvedAt: null,
        });

        // Chargeback debit in bank
        bankBalance -= cbAmount;
        bankTransactions.push({
          txnId: generateId("btxn", idx + 20000), utr: null,
          amount: cbAmount, type: "DEBIT",
          narration: `RAZORPAY CHARGEBACK ${cbId} ${paymentId}`,
          balance: bankBalance,
          txnDate: addDays(capturedDate, randomInt(10, 25)),
          valueDate: null,
        });

        groundTruths.push({
          paymentId, expectedLabel: "CHARGEBACK_ADJUSTMENT",
          scenario: `Payment settled but chargeback ₹${cbAmount / 100} raised later (${cbId})`,
        });
        break;
      }

      case "DELAYED_BANK_CREDIT": {
        const settlementId = generateId("setl", idx);
        const utr = generateUTR(idx, capturedDate);
        const expectedNet = amount - fee - tax;
        const settledDate = addDays(capturedDate, SETTLEMENT_CONFIG.DELAY_DAYS);
        // Bank credit arrives LATE (beyond expected window)
        const bankDate = addHours(settledDate, randomInt(48, 96)); // 2-4 days late

        settlements.push({
          settlementId, paymentId, amount: expectedNet,
          fee, tax, utr, status: "processed",
          settledAt: settledDate, createdAt: addDays(capturedDate, 1),
        });

        bankBalance += expectedNet;
        bankTransactions.push({
          txnId: generateId("btxn", idx), utr, amount: expectedNet,
          type: "CREDIT", narration: `RAZORPAY SETTLEMENT ${settlementId}`,
          balance: bankBalance, txnDate: bankDate, valueDate: bankDate,
        });

        groundTruths.push({
          paymentId, expectedLabel: "DELAYED_BANK_CREDIT",
          scenario: `Settlement processed ${settledDate.toISOString().slice(0, 10)} but bank credit arrived ${bankDate.toISOString().slice(0, 10)} (${Math.round((bankDate.getTime() - settledDate.getTime()) / 3600000)}h delay)`,
        });
        break;
      }

      case "NEEDS_MANUAL_REVIEW": {
        const settlementId = generateId("setl", idx);
        const expectedNet = amount - fee - tax;
        const settledDate = addDays(capturedDate, SETTLEMENT_CONFIG.DELAY_DAYS);

        // Settlement with NO UTR (hard to match)
        settlements.push({
          settlementId, paymentId, amount: expectedNet,
          fee, tax, utr: null, status: "processed",
          settledAt: settledDate, createdAt: addDays(capturedDate, 1),
        });

        // Multiple bank credits with similar amounts (ambiguous)
        const bankDate = addHours(settledDate, randomInt(2, 18));
        bankBalance += expectedNet;
        bankTransactions.push({
          txnId: generateId("btxn", idx), utr: null, amount: expectedNet,
          type: "CREDIT", narration: `RAZORPAY BULK SETTLEMENT BATCH`,
          balance: bankBalance, txnDate: bankDate, valueDate: bankDate,
        });

        // Add a confusing similar-amount transaction
        bankTransactions.push({
          txnId: generateId("btxn", idx + 30000), utr: null,
          amount: expectedNet + randomInt(-50, 50),
          type: "CREDIT", narration: `RAZORPAY BULK SETTLEMENT BATCH`,
          balance: bankBalance,
          txnDate: addMinutes(bankDate, randomInt(-30, 30)),
          valueDate: bankDate,
        });

        groundTruths.push({
          paymentId, expectedLabel: "NEEDS_MANUAL_REVIEW",
          scenario: `No UTR, multiple similar-amount bank credits — ambiguous match requires human review`,
        });
        break;
      }
    }
  }

  return {
    orders, payments, settlements, bankTransactions,
    refunds, chargebacks, groundTruths,
  };
}