/*
 * SettleMate AI — Aggregate Risk & Tolerance Stacking Engine (Day 6)
 *
 * Prevents "Death by 1,000 Pauses":
 * Individually safe tolerance drift (< ₹1.00 per record) can collectively create
 * material financial exposure when stacked across 1,000+ records.
 *
 * Implements:
 *   - Per-record discrepancy tracking in exact integer paise
 *   - Cumulative tolerance drift per merchant, provider, and batch
 *   - Deterministic policy threshold boundary gates (exact to 1 paise)
 *   - Automatic escalation to CONTROLLED_REVIEW / MAKER_CHECKER when aggregate exposure crosses limit
 */

export interface ToleranceRecord {
  recordId: string;
  merchantId?: string;
  provider?: string;
  grossPaise: number;
  settledPaise: number;
  discrepancyPaise: number;
  tolerated: boolean;
}

export interface AggregateRiskPolicy {
  maxSingleRecordTolerancePaise: number; // e.g. 100 paise (₹1.00)
  maxBatchCumulativeTolerancePaise: number; // e.g. 50000 paise (₹500.00)
  maxMerchantCumulativeTolerancePaise: number; // e.g. 10000 paise (₹100.00)
  maxProviderCumulativeTolerancePaise: number; // e.g. 25000 paise (₹250.00)
  maxAggregateDriftRatio: number; // e.g. 0.005 (0.5% of total volume)
}

export const DEFAULT_AGGREGATE_RISK_POLICY: AggregateRiskPolicy = {
  maxSingleRecordTolerancePaise: 100, // ₹1.00
  maxBatchCumulativeTolerancePaise: 50000, // ₹500.00
  maxMerchantCumulativeTolerancePaise: 10000, // ₹100.00
  maxProviderCumulativeTolerancePaise: 25000, // ₹250.00
  maxAggregateDriftRatio: 0.005, // 0.5%
};

export type AggregateRiskVerdict =
  | "SAFE_WITHIN_TOLERANCE"
  | "AGGREGATE_DRIFT_WARNING"
  | "AGGREGATE_TOLERANCE_BREACH_REVIEW_REQUIRED";

export interface AggregateRiskReport {
  verdict: AggregateRiskVerdict;
  totalRecordsProcessed: number;
  toleratedRecordsCount: number;
  totalVolumePaise: number;
  cumulativeToleranceConsumedPaise: number;
  cumulativeAmountAtRiskPaise: number;
  aggregateDriftRatio: number;
  merchantExposure: Record<string, number>;
  providerExposure: Record<string, number>;
  breachedLimits: string[];
  requiresMakerChecker: boolean;
  explanation: string;
}

export class AggregateRiskTracker {
  private records: ToleranceRecord[] = [];
  private totalVolumePaise = 0;
  private cumulativeToleranceConsumedPaise = 0;
  private merchantExposure = new Map<string, number>();
  private providerExposure = new Map<string, number>();
  private policy: AggregateRiskPolicy;

  constructor(policy: Partial<AggregateRiskPolicy> = {}) {
    this.policy = { ...DEFAULT_AGGREGATE_RISK_POLICY, ...policy };
  }

  recordTransaction(record: {
    recordId: string;
    merchantId?: string;
    provider?: string;
    grossPaise: number;
    settledPaise: number;
  }): { individuallySafe: boolean; discrepancyPaise: number } {
    const discrepancy = Math.abs(record.grossPaise - record.settledPaise);
    const individuallySafe = discrepancy <= this.policy.maxSingleRecordTolerancePaise;

    this.records.push({
      recordId: record.recordId,
      merchantId: record.merchantId,
      provider: record.provider,
      grossPaise: record.grossPaise,
      settledPaise: record.settledPaise,
      discrepancyPaise: discrepancy,
      tolerated: individuallySafe && discrepancy > 0,
    });

    this.totalVolumePaise += record.grossPaise;
    this.cumulativeToleranceConsumedPaise += discrepancy;

    if (record.merchantId) {
      const prev = this.merchantExposure.get(record.merchantId) ?? 0;
      this.merchantExposure.set(record.merchantId, prev + discrepancy);
    }

    if (record.provider) {
      const prev = this.providerExposure.get(record.provider) ?? 0;
      this.providerExposure.set(record.provider, prev + discrepancy);
    }

    return { individuallySafe, discrepancyPaise: discrepancy };
  }

  evaluateAggregateRisk(): AggregateRiskReport {
    const breachedLimits: string[] = [];

    // 1. Check Batch Cumulative Limit
    if (this.cumulativeToleranceConsumedPaise > this.policy.maxBatchCumulativeTolerancePaise) {
      breachedLimits.push(
        `BATCH_CUMULATIVE_TOLERANCE_EXCEEDED: ${this.cumulativeToleranceConsumedPaise} paise > ${this.policy.maxBatchCumulativeTolerancePaise} paise limit`
      );
    }

    // 2. Check Merchant Cumulative Limits
    for (const [merchantId, exp] of this.merchantExposure.entries()) {
      if (exp > this.policy.maxMerchantCumulativeTolerancePaise) {
        breachedLimits.push(
          `MERCHANT_EXPOSURE_EXCEEDED (${merchantId}): ${exp} paise > ${this.policy.maxMerchantCumulativeTolerancePaise} paise limit`
        );
      }
    }

    // 3. Check Provider Cumulative Limits
    for (const [provider, exp] of this.providerExposure.entries()) {
      if (exp > this.policy.maxProviderCumulativeTolerancePaise) {
        breachedLimits.push(
          `PROVIDER_EXPOSURE_EXCEEDED (${provider}): ${exp} paise > ${this.policy.maxProviderCumulativeTolerancePaise} paise limit`
        );
      }
    }

    // 4. Check Aggregate Drift Ratio
    const driftRatio = this.totalVolumePaise > 0
      ? this.cumulativeToleranceConsumedPaise / this.totalVolumePaise
      : 0;
    if (driftRatio > this.policy.maxAggregateDriftRatio) {
      breachedLimits.push(
        `AGGREGATE_DRIFT_RATIO_EXCEEDED: ${(driftRatio * 100).toFixed(3)}% > ${(this.policy.maxAggregateDriftRatio * 100).toFixed(3)}% limit`
      );
    }

    const merchantObj: Record<string, number> = {};
    for (const [k, v] of this.merchantExposure.entries()) {
      merchantObj[k] = v;
    }

    const providerObj: Record<string, number> = {};
    for (const [k, v] of this.providerExposure.entries()) {
      providerObj[k] = v;
    }

    let verdict: AggregateRiskVerdict = "SAFE_WITHIN_TOLERANCE";
    let requiresMakerChecker = false;

    if (breachedLimits.length > 0) {
      verdict = "AGGREGATE_TOLERANCE_BREACH_REVIEW_REQUIRED";
      requiresMakerChecker = true;
    } else if (
      this.cumulativeToleranceConsumedPaise > this.policy.maxBatchCumulativeTolerancePaise * 0.8 ||
      driftRatio > this.policy.maxAggregateDriftRatio * 0.8
    ) {
      verdict = "AGGREGATE_DRIFT_WARNING";
    }

    const toleratedCount = this.records.filter((r) => r.tolerated).length;

    return {
      verdict,
      totalRecordsProcessed: this.records.length,
      toleratedRecordsCount: toleratedCount,
      totalVolumePaise: this.totalVolumePaise,
      cumulativeToleranceConsumedPaise: this.cumulativeToleranceConsumedPaise,
      cumulativeAmountAtRiskPaise: this.cumulativeToleranceConsumedPaise,
      aggregateDriftRatio: Number(driftRatio.toFixed(6)),
      merchantExposure: merchantObj,
      providerExposure: providerObj,
      breachedLimits,
      requiresMakerChecker,
      explanation:
        breachedLimits.length > 0
          ? `Collective tolerance stacking breach: ${breachedLimits.length} policy limit(s) exceeded. Silently auto-finalizing ${this.cumulativeToleranceConsumedPaise} paise drift prohibited.`
          : `Aggregate financial drift (${this.cumulativeToleranceConsumedPaise} paise across ${this.records.length} records) within policy parameters.`,
    };
  }
}
