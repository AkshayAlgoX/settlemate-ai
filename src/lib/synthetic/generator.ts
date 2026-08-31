import {
  FEE_CONFIG,
  SETTLEMENT_CONFIG,
  DEFAULT_DISTRIBUTION,
  PAYMENT_METHODS,
  type ExceptionType,
} from "@/lib/constants";

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

type RandomSource = () => number;

function createSeededRandom(seed: number): RandomSource {
  let state = seed >>> 0;

  return () => {
    state += 0x6d2b79f5;

    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);

    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randomInt(
  min: number,
  max: number,
  random: RandomSource
): number {
  return Math.floor(random() * (max - min + 1)) + min;
}

function randomChoice<T>(
  arr: readonly T[],
  random: RandomSource
): T {
  return arr[Math.floor(random() * arr.length)];
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

export function generateSyntheticBatch(
  size: number,
  seed?: number
): GeneratedRecord {
  const baseDate = new Date("2025-08-01T00:00:00Z");
  const random: RandomSource =
    seed === undefined ? Math.random : createSeededRandom(seed);

  // Local deterministic wrappers to avoid missing `random` argument errors
  const randInt = (min: number, max: number) => randomInt(min, max, random);
  const pick = <T>(arr: readonly T[]) => randomChoice(arr, random);

  const orders: GeneratedRecord["orders"] = [];
  const payments: GeneratedRecord["payments"] = [];
  const settlements: GeneratedRecord["settlements"] = [];
  const bankTransactions: GeneratedRecord["bankTransactions"] = [];
  const refunds: GeneratedRecord["refunds"] = [];
  const chargebacks: GeneratedRecord["chargebacks"] = [];
  const groundTruths: GeneratedRecord["groundTruths"] = [];

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

  const assignments: ExceptionType[] = [];
  for (const [type, count] of Object.entries(counts)) {
    for (let i = 0; i < count; i++) {
      assignments.push(type as ExceptionType);
    }
  }

  for (let i = assignments.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [assignments[i], assignments[j]] = [assignments[j], assignments[i]];
  }

  let bankBalance = 500000000;

  for (let i = 0; i < size; i++) {
    const scenario = assignments[i];
    const idx = i + 1;

    const orderId = generateId("order", idx);
    const paymentId = generateId("pay", idx);
    const method = pick(PAYMENT_METHODS);
    const amount = randInt(5000, 500000) * 100;
    const { fee, tax } = computeFee(amount, method);
    const orderDate = addHours(baseDate, randInt(0, 20 * 24));
    const paymentDate = addMinutes(orderDate, randInt(1, 30));
    const capturedDate = addMinutes(paymentDate, randInt(1, 5));
    const customerEmail = `customer${idx}@example.com`;
    const description = `Payment for Order #${idx}`;

    orders.push({
      orderId, amount, currency: "INR", status: "paid",
      customerEmail, description, createdAt: orderDate,
    });

    payments.push({
      paymentId, orderId, amount, currency: "INR",
      status: "captured", method, fee, tax,
      capturedAt: capturedDate, createdAt: paymentDate,
    });

    switch (scenario) {
      case "AUTO_MATCHED": {
        const settlementId = generateId("setl", idx);
        const utr = generateUTR(idx, capturedDate);
        const expectedNet = amount - fee - tax;
        const settledDate = addDays(capturedDate, SETTLEMENT_CONFIG.DELAY_DAYS);
        const bankDate = addHours(settledDate, randInt(2, 18));

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
        const recentDate = addDays(baseDate, 25);
        payments[payments.length - 1].capturedAt = recentDate;
        payments[payments.length - 1].createdAt = addMinutes(recentDate, -5);
        orders[orders.length - 1].createdAt = addMinutes(recentDate, -10);

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
        const wrongFee = fee + randInt(500, 5000);
        const wrongTax = Math.round((wrongFee * FEE_CONFIG.GST_PERCENT) / 100);
        const wrongSettledAmount = amount - wrongFee - wrongTax;
        const settledDate = addDays(capturedDate, SETTLEMENT_CONFIG.DELAY_DAYS);
        const bankDate = addHours(settledDate, randInt(2, 18));

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

        const setlId1 = generateId("setl", idx);
        const utr1 = generateUTR(idx, capturedDate);
        settlements.push({
          settlementId: setlId1, paymentId, amount: expectedNet,
          fee, tax, utr: utr1, status: "processed",
          settledAt: settledDate, createdAt: addDays(capturedDate, 1),
        });

        const setlId2 = generateId("setl", idx + 10000);
        const utr2 = generateUTR(idx + 10000, capturedDate);
        settlements.push({
          settlementId: setlId2, paymentId, amount: expectedNet,
          fee, tax, utr: utr2, status: "processed",
          settledAt: addHours(settledDate, 6), createdAt: addDays(capturedDate, 1),
        });

        const bankDate1 = addHours(settledDate, randInt(2, 12));
        bankBalance += expectedNet;
        bankTransactions.push({
          txnId: generateId("btxn", idx), utr: utr1, amount: expectedNet,
          type: "CREDIT", narration: `RAZORPAY SETTLEMENT ${setlId1}`,
          balance: bankBalance, txnDate: bankDate1, valueDate: bankDate1,
        });

        const bankDate2 = addHours(settledDate, randInt(12, 24));
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
        const settlementId = generateId("setl", idx);
        const utr = generateUTR(idx, capturedDate);
        const expectedNet = amount - fee - tax;
        const settledDate = addDays(capturedDate, SETTLEMENT_CONFIG.DELAY_DAYS);
        const bankDate = addHours(settledDate, randInt(2, 18));

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

        const orphanAmount = randInt(1000, 100000) * 100;
        const orphanUtr = generateUTR(idx + 50000, capturedDate);
        bankBalance += orphanAmount;
        bankTransactions.push({
          txnId: generateId("btxn", idx + 50000), utr: orphanUtr,
          amount: orphanAmount, type: "CREDIT",
          narration: `RAZORPAY SETTLEMENT setl_orphan_${idx} ${orphanUtr}`,
          balance: bankBalance,
          txnDate: addDays(bankDate, randInt(1, 3)),
          valueDate: addDays(bankDate, randInt(1, 3)),
        });

        groundTruths.push({
          paymentId, expectedLabel: "ORPHAN_BANK_CREDIT",
          scenario: `Bank credit of ₹${orphanAmount / 100} with UTR ${orphanUtr} has no matching settlement`,
        });
        break;
      }

      case "REFUND_MISMATCH": {
        const refundAmount = Math.round((amount * randInt(10, 40)) / 100);
        const refundId = generateId("rfnd", idx);
        const expectedNet = amount - fee - tax - refundAmount;
        const settlementId = generateId("setl", idx);
        const utr = generateUTR(idx, capturedDate);
        const settledDate = addDays(capturedDate, SETTLEMENT_CONFIG.DELAY_DAYS);
        const bankDate = addHours(settledDate, randInt(2, 18));

        refunds.push({
          refundId, paymentId, amount: refundAmount,
          status: "processed", reason: "Customer request",
          createdAt: addHours(capturedDate, randInt(1, 24)),
          processedAt: addHours(capturedDate, randInt(24, 48)),
        });

        const wrongSettled = amount - fee - tax;
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
        const cbAmount = Math.round((amount * randInt(20, 60)) / 100);
        const cbId = generateId("cb", idx);
        const expectedNet = amount - fee - tax;
        const settlementId = generateId("setl", idx);
        const utr = generateUTR(idx, capturedDate);
        const settledDate = addDays(capturedDate, SETTLEMENT_CONFIG.DELAY_DAYS);
        const bankDate = addHours(settledDate, randInt(2, 18));

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

        chargebacks.push({
          chargebackId: cbId, paymentId, amount: cbAmount,
          reason: "Unauthorized transaction", status: "open",
          createdAt: addDays(capturedDate, randInt(7, 21)),
          resolvedAt: null,
        });

        bankBalance -= cbAmount;
        bankTransactions.push({
          txnId: generateId("btxn", idx + 20000), utr: null,
          amount: cbAmount, type: "DEBIT",
          narration: `RAZORPAY CHARGEBACK ${cbId} ${paymentId}`,
          balance: bankBalance,
          txnDate: addDays(capturedDate, randInt(10, 25)),
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
        const bankDate = addHours(settledDate, randInt(48, 96));

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

        settlements.push({
          settlementId, paymentId, amount: expectedNet,
          fee, tax, utr: null, status: "processed",
          settledAt: settledDate, createdAt: addDays(capturedDate, 1),
        });

        const bankDate = addHours(settledDate, randInt(2, 18));
        bankBalance += expectedNet;
        bankTransactions.push({
          txnId: generateId("btxn", idx), utr: null, amount: expectedNet,
          type: "CREDIT", narration: `RAZORPAY BULK SETTLEMENT BATCH`,
          balance: bankBalance, txnDate: bankDate, valueDate: bankDate,
        });

        bankTransactions.push({
          txnId: generateId("btxn", idx + 30000), utr: null,
          amount: expectedNet + randInt(-50, 50),
          type: "CREDIT", narration: `RAZORPAY BULK SETTLEMENT BATCH`,
          balance: bankBalance,
          txnDate: addMinutes(bankDate, randInt(-30, 30)),
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

/**
 * Generates only a slice of synthetic batch records for bounded step execution.
 * Runs in strictly O(count) time and memory, enabling instantaneous generation for 100K and 1M+ workloads.
 */
export function generateSyntheticBatchSlice(
  startIdx: number,
  count: number,
  totalSize: number,
  seed: number = 20260821
): GeneratedRecord {
  const baseDate = new Date("2025-08-01T00:00:00Z");

  const orders: GeneratedRecord["orders"] = [];
  const payments: GeneratedRecord["payments"] = [];
  const settlements: GeneratedRecord["settlements"] = [];
  const bankTransactions: GeneratedRecord["bankTransactions"] = [];
  const refunds: GeneratedRecord["refunds"] = [];
  const chargebacks: GeneratedRecord["chargebacks"] = [];
  const groundTruths: GeneratedRecord["groundTruths"] = [];

  let bankBalance = 500000000;
  const endIdx = Math.min(totalSize, startIdx + count);

  for (let i = startIdx; i < endIdx; i++) {
    const idx = i + 1;
    // Deterministic per-record PRNG seed derived from global seed and record index
    const itemSeed = (seed ^ (idx * 2654435761)) >>> 0;
    const random: RandomSource = createSeededRandom(itemSeed);

    const randInt = (min: number, max: number) => randomInt(min, max, random);
    const pick = <T>(arr: readonly T[]) => randomChoice(arr, random);

    const r = random();
    let scenario: ExceptionType;
    if (r < 0.70) {
      scenario = "AUTO_MATCHED";
    } else if (r < 0.76) {
      scenario = "PENDING_SETTLEMENT";
    } else if (r < 0.81) {
      scenario = "MISSING_BANK_CREDIT";
    } else if (r < 0.85) {
      scenario = "AMOUNT_MISMATCH";
    } else if (r < 0.88) {
      scenario = "DUPLICATE_SETTLEMENT";
    } else if (r < 0.91) {
      scenario = "ORPHAN_BANK_CREDIT";
    } else if (r < 0.94) {
      scenario = "REFUND_MISMATCH";
    } else if (r < 0.96) {
      scenario = "CHARGEBACK_ADJUSTMENT";
    } else if (r < 0.98) {
      scenario = "DELAYED_BANK_CREDIT";
    } else {
      scenario = "NEEDS_MANUAL_REVIEW";
    }

    const orderId = generateId("order", idx);
    const paymentId = generateId("pay", idx);
    const method = pick(PAYMENT_METHODS);
    const amount = randInt(5000, 500000) * 100;
    const { fee, tax } = computeFee(amount, method);
    const orderDate = addHours(baseDate, randInt(0, 20 * 24));
    const paymentDate = addMinutes(orderDate, randInt(1, 30));
    const capturedDate = addMinutes(paymentDate, randInt(1, 5));
    const customerEmail = `customer${idx}@example.com`;
    const description = `Payment for Order #${idx}`;

    orders.push({
      orderId,
      amount,
      currency: "INR",
      status: "paid",
      customerEmail,
      description,
      createdAt: orderDate,
    });

    payments.push({
      paymentId,
      orderId,
      amount,
      currency: "INR",
      status: "captured",
      method,
      fee,
      tax,
      capturedAt: capturedDate,
      createdAt: paymentDate,
    });

    switch (scenario) {
      case "AUTO_MATCHED": {
        const settlementId = generateId("setl", idx);
        const utr = generateUTR(idx, capturedDate);
        const expectedNet = amount - fee - tax;
        const settledDate = addDays(capturedDate, SETTLEMENT_CONFIG.DELAY_DAYS);
        const bankDate = addHours(settledDate, randInt(2, 18));

        settlements.push({
          settlementId,
          paymentId,
          amount: expectedNet,
          fee,
          tax,
          utr,
          status: "processed",
          settledAt: settledDate,
          createdAt: addDays(capturedDate, 1),
        });

        bankBalance += expectedNet;
        bankTransactions.push({
          txnId: generateId("btxn", idx),
          utr,
          amount: expectedNet,
          type: "CREDIT",
          narration: `RAZORPAY SETTLEMENT ${settlementId} ${utr}`,
          balance: bankBalance,
          txnDate: bankDate,
          valueDate: bankDate,
        });

        groundTruths.push({
          paymentId,
          expectedLabel: "AUTO_MATCHED",
          scenario: "Perfect match: order→payment→settlement→bank all align",
        });
        break;
      }

      case "PENDING_SETTLEMENT": {
        const recentDate = addDays(baseDate, 25);
        payments[payments.length - 1].capturedAt = recentDate;
        payments[payments.length - 1].createdAt = addMinutes(recentDate, -5);
        orders[orders.length - 1].createdAt = addMinutes(recentDate, -10);

        groundTruths.push({
          paymentId,
          expectedLabel: "PENDING_SETTLEMENT",
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
          settlementId,
          paymentId,
          amount: expectedNet,
          fee,
          tax,
          utr,
          status: "processed",
          settledAt: settledDate,
          createdAt: addDays(capturedDate, 1),
        });

        groundTruths.push({
          paymentId,
          expectedLabel: "MISSING_BANK_CREDIT",
          scenario: `Settlement ${settlementId} processed but no bank credit with UTR ${utr}`,
        });
        break;
      }

      case "AMOUNT_MISMATCH": {
        const settlementId = generateId("setl", idx);
        const utr = generateUTR(idx, capturedDate);
        const expectedNet = amount - fee - tax;
        const wrongFee = fee + randInt(500, 5000);
        const wrongTax = Math.round((wrongFee * FEE_CONFIG.GST_PERCENT) / 100);
        const wrongSettledAmount = amount - wrongFee - wrongTax;
        const settledDate = addDays(capturedDate, SETTLEMENT_CONFIG.DELAY_DAYS);
        const bankDate = addHours(settledDate, randInt(2, 18));

        settlements.push({
          settlementId,
          paymentId,
          amount: wrongSettledAmount,
          fee: wrongFee,
          tax: wrongTax,
          utr,
          status: "processed",
          settledAt: settledDate,
          createdAt: addDays(capturedDate, 1),
        });

        bankBalance += wrongSettledAmount;
        bankTransactions.push({
          txnId: generateId("btxn", idx),
          utr,
          amount: wrongSettledAmount,
          type: "CREDIT",
          narration: `RAZORPAY SETTLEMENT ${settlementId}`,
          balance: bankBalance,
          txnDate: bankDate,
          valueDate: bankDate,
        });

        groundTruths.push({
          paymentId,
          expectedLabel: "AMOUNT_MISMATCH",
          scenario: `Expected ₹${expectedNet / 100} but settled ₹${wrongSettledAmount / 100} (wrong fee deduction)`,
        });
        break;
      }

      case "DUPLICATE_SETTLEMENT": {
        const expectedNet = amount - fee - tax;
        const settledDate = addDays(capturedDate, SETTLEMENT_CONFIG.DELAY_DAYS);

        const setlId1 = generateId("setl", idx);
        const utr1 = generateUTR(idx, capturedDate);
        settlements.push({
          settlementId: setlId1,
          paymentId,
          amount: expectedNet,
          fee,
          tax,
          utr: utr1,
          status: "processed",
          settledAt: settledDate,
          createdAt: addDays(capturedDate, 1),
        });

        const setlId2 = generateId("setl", idx + 10000);
        const utr2 = generateUTR(idx + 10000, capturedDate);
        settlements.push({
          settlementId: setlId2,
          paymentId,
          amount: expectedNet,
          fee,
          tax,
          utr: utr2,
          status: "processed",
          settledAt: addHours(settledDate, 6),
          createdAt: addDays(capturedDate, 1),
        });

        const bankDate1 = addHours(settledDate, randInt(2, 12));
        bankBalance += expectedNet;
        bankTransactions.push({
          txnId: generateId("btxn", idx),
          utr: utr1,
          amount: expectedNet,
          type: "CREDIT",
          narration: `RAZORPAY SETTLEMENT ${setlId1}`,
          balance: bankBalance,
          txnDate: bankDate1,
          valueDate: bankDate1,
        });

        const bankDate2 = addHours(settledDate, randInt(12, 24));
        bankBalance += expectedNet;
        bankTransactions.push({
          txnId: generateId("btxn", idx + 10000),
          utr: utr2,
          amount: expectedNet,
          type: "CREDIT",
          narration: `RAZORPAY SETTLEMENT ${setlId2}`,
          balance: bankBalance,
          txnDate: bankDate2,
          valueDate: bankDate2,
        });

        groundTruths.push({
          paymentId,
          expectedLabel: "DUPLICATE_SETTLEMENT",
          scenario: `Payment ${paymentId} appears in settlements ${setlId1} and ${setlId2}`,
        });
        break;
      }

      case "ORPHAN_BANK_CREDIT": {
        const settlementId = generateId("setl", idx);
        const utr = generateUTR(idx, capturedDate);
        const expectedNet = amount - fee - tax;
        const settledDate = addDays(capturedDate, SETTLEMENT_CONFIG.DELAY_DAYS);
        const bankDate = addHours(settledDate, randInt(2, 18));

        settlements.push({
          settlementId,
          paymentId,
          amount: expectedNet,
          fee,
          tax,
          utr,
          status: "processed",
          settledAt: settledDate,
          createdAt: addDays(capturedDate, 1),
        });

        bankBalance += expectedNet;
        bankTransactions.push({
          txnId: generateId("btxn", idx),
          utr,
          amount: expectedNet,
          type: "CREDIT",
          narration: `RAZORPAY SETTLEMENT ${settlementId}`,
          balance: bankBalance,
          txnDate: bankDate,
          valueDate: bankDate,
        });

        const orphanAmount = randInt(1000, 100000) * 100;
        const orphanUtr = generateUTR(idx + 50000, capturedDate);
        bankBalance += orphanAmount;
        bankTransactions.push({
          txnId: generateId("btxn", idx + 50000),
          utr: orphanUtr,
          amount: orphanAmount,
          type: "CREDIT",
          narration: `RAZORPAY SETTLEMENT setl_orphan_${idx} ${orphanUtr}`,
          balance: bankBalance,
          txnDate: addDays(bankDate, randInt(1, 3)),
          valueDate: addDays(bankDate, randInt(1, 3)),
        });

        groundTruths.push({
          paymentId,
          expectedLabel: "ORPHAN_BANK_CREDIT",
          scenario: `Bank credit of ₹${orphanAmount / 100} with UTR ${orphanUtr} has no matching settlement`,
        });
        break;
      }

      case "REFUND_MISMATCH": {
        const refundAmount = Math.round((amount * randInt(10, 40)) / 100);
        const refundId = generateId("rfnd", idx);
        const expectedNet = amount - fee - tax - refundAmount;
        const settlementId = generateId("setl", idx);
        const utr = generateUTR(idx, capturedDate);
        const settledDate = addDays(capturedDate, SETTLEMENT_CONFIG.DELAY_DAYS);
        const bankDate = addHours(settledDate, randInt(2, 18));

        refunds.push({
          refundId,
          paymentId,
          amount: refundAmount,
          status: "processed",
          reason: "Customer request",
          createdAt: addHours(capturedDate, randInt(1, 24)),
          processedAt: addHours(capturedDate, randInt(24, 48)),
        });

        const wrongSettled = amount - fee - tax;
        settlements.push({
          settlementId,
          paymentId,
          amount: wrongSettled,
          fee,
          tax,
          utr,
          status: "processed",
          settledAt: settledDate,
          createdAt: addDays(capturedDate, 1),
        });

        bankBalance += wrongSettled;
        bankTransactions.push({
          txnId: generateId("btxn", idx),
          utr,
          amount: wrongSettled,
          type: "CREDIT",
          narration: `RAZORPAY SETTLEMENT ${settlementId}`,
          balance: bankBalance,
          txnDate: bankDate,
          valueDate: bankDate,
        });

        groundTruths.push({
          paymentId,
          expectedLabel: "REFUND_MISMATCH",
          scenario: `Refund ₹${refundAmount / 100} issued but settlement ₹${wrongSettled / 100} didn't deduct it (expected ₹${expectedNet / 100})`,
        });
        break;
      }

      case "CHARGEBACK_ADJUSTMENT": {
        const cbAmount = Math.round((amount * randInt(20, 60)) / 100);
        const cbId = generateId("cb", idx);
        const expectedNet = amount - fee - tax;
        const settlementId = generateId("setl", idx);
        const utr = generateUTR(idx, capturedDate);
        const settledDate = addDays(capturedDate, SETTLEMENT_CONFIG.DELAY_DAYS);
        const bankDate = addHours(settledDate, randInt(2, 18));

        settlements.push({
          settlementId,
          paymentId,
          amount: expectedNet,
          fee,
          tax,
          utr,
          status: "processed",
          settledAt: settledDate,
          createdAt: addDays(capturedDate, 1),
        });

        bankBalance += expectedNet;
        bankTransactions.push({
          txnId: generateId("btxn", idx),
          utr,
          amount: expectedNet,
          type: "CREDIT",
          narration: `RAZORPAY SETTLEMENT ${settlementId}`,
          balance: bankBalance,
          txnDate: bankDate,
          valueDate: bankDate,
        });

        chargebacks.push({
          chargebackId: cbId,
          paymentId,
          amount: cbAmount,
          reason: "Unauthorized transaction",
          status: "open",
          createdAt: addDays(capturedDate, randInt(7, 21)),
          resolvedAt: null,
        });

        bankBalance -= cbAmount;
        bankTransactions.push({
          txnId: generateId("btxn", idx + 20000),
          utr: null,
          amount: cbAmount,
          type: "DEBIT",
          narration: `RAZORPAY CHARGEBACK ${cbId} ${paymentId}`,
          balance: bankBalance,
          txnDate: addDays(capturedDate, randInt(10, 25)),
          valueDate: null,
        });

        groundTruths.push({
          paymentId,
          expectedLabel: "CHARGEBACK_ADJUSTMENT",
          scenario: `Payment settled but chargeback ₹${cbAmount / 100} raised later (${cbId})`,
        });
        break;
      }

      case "DELAYED_BANK_CREDIT": {
        const settlementId = generateId("setl", idx);
        const utr = generateUTR(idx, capturedDate);
        const expectedNet = amount - fee - tax;
        const settledDate = addDays(capturedDate, SETTLEMENT_CONFIG.DELAY_DAYS);
        const bankDate = addHours(settledDate, randInt(48, 96));

        settlements.push({
          settlementId,
          paymentId,
          amount: expectedNet,
          fee,
          tax,
          utr,
          status: "processed",
          settledAt: settledDate,
          createdAt: addDays(capturedDate, 1),
        });

        bankBalance += expectedNet;
        bankTransactions.push({
          txnId: generateId("btxn", idx),
          utr,
          amount: expectedNet,
          type: "CREDIT",
          narration: `RAZORPAY SETTLEMENT ${settlementId} ${utr}`,
          balance: bankBalance,
          txnDate: bankDate,
          valueDate: bankDate,
        });

        groundTruths.push({
          paymentId,
          expectedLabel: "DELAYED_BANK_CREDIT",
          scenario: `Settlement processed on time but bank credit delayed by ${Math.round((bankDate.getTime() - settledDate.getTime()) / 3600000)} hours`,
        });
        break;
      }

      case "NEEDS_MANUAL_REVIEW": {
        const expectedNet = amount - fee - tax;
        const settledDate = addDays(capturedDate, SETTLEMENT_CONFIG.DELAY_DAYS);
        const bankDate = addHours(settledDate, randInt(2, 18));

        const settlementId = generateId("setl", idx);
        settlements.push({
          settlementId,
          paymentId,
          amount: expectedNet,
          fee,
          tax,
          utr: null,
          status: "processed",
          settledAt: settledDate,
          createdAt: addDays(capturedDate, 1),
        });

        bankBalance += expectedNet;
        bankTransactions.push({
          txnId: generateId("btxn", idx),
          utr: null,
          amount: expectedNet,
          type: "CREDIT",
          narration: `RAZORPAY BULK SETTLEMENT BATCH`,
          balance: bankBalance,
          txnDate: bankDate,
          valueDate: bankDate,
        });

        bankTransactions.push({
          txnId: generateId("btxn", idx + 30000),
          utr: null,
          amount: expectedNet + randInt(-50, 50),
          type: "CREDIT",
          narration: `RAZORPAY BULK SETTLEMENT BATCH`,
          balance: bankBalance,
          txnDate: addMinutes(bankDate, randInt(-30, 30)),
          valueDate: bankDate,
        });

        groundTruths.push({
          paymentId,
          expectedLabel: "NEEDS_MANUAL_REVIEW",
          scenario: `No UTR, multiple similar-amount bank credits — ambiguous match requires human review`,
        });
        break;
      }
    }
  }

  return {
    orders,
    payments,
    settlements,
    bankTransactions,
    refunds,
    chargebacks,
    groundTruths,
  };
}