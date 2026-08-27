/*
 * SettleMate AI — Business Impact & Finance-Ops ROI Calculator
 *
 * Translates low-level deterministic reconciliation metrics into tangible
 * enterprise finance-ops cost savings, labor reduction, and risk mitigation.
 */

export interface BusinessImpactInputs {
  monthlyTransactionVolume: number; // e.g., 500,000
  baselineExceptionRatePct: number; // e.g., 5.0%
  manualReviewTimeMinutes: number;  // e.g., 12 minutes
  analystHourlyCost: number;        // e.g., $45/hr or ₹3,500/hr
  currencySymbol?: string;          // e.g., "$" or "₹"
}

export interface BusinessImpactMetrics {
  // Volume & Exception Breakdown
  monthlyVolume: number;
  totalMonthlyExceptions: number;
  autoReconciledExceptions: number;
  escalatedExceptions: number;

  // Automation Rates
  exactAutoMatchRatePct: number;    // 39.2% (103/263)
  automatedResolutionRatePct: number; // 91.3% (240/263)
  manualReviewRatePct: number;       // 8.7% (23/263)
  deterministicAiBypassPct: number;  // 96.4%

  // Labor & Productivity
  monthlyHoursSaved: number;
  annualHoursSaved: number;
  fteRepurposed: number;             // Based on 160 working hours/month

  // Cost Savings
  monthlyCostSavings: number;
  annualCostSavings: number;
  tokenCostSavingsPct: number;

  // Risk Reduction
  preventedClericalErrorsMonthly: number; // Based on 1.5% human error baseline
  falseFinancialWrites: number;          // Strictly 0
}

export const OFFICIAL_BENCHMARK_STATS = {
  totalRecords: 263,
  exactAutoMatched: 103,
  groundedExceptionsResolved: 137,
  manualEscalated: 23,
  accuracyPct: 98.1,
  deterministicAiBypassPct: 96.4,
  coreThroughputRps: 630.7,
  falseFinancialWrites: 0,
};

export function calculateBusinessImpact(inputs: BusinessImpactInputs): BusinessImpactMetrics {
  const volume = Math.max(0, inputs.monthlyTransactionVolume);
  const exceptionRate = Math.max(0, Math.min(100, inputs.baselineExceptionRatePct)) / 100;
  const reviewTimeHrs = Math.max(0, inputs.manualReviewTimeMinutes) / 60;
  const hourlyCost = Math.max(0, inputs.analystHourlyCost);

  // Exact benchmark proportions
  const exactAutoMatchRatePct = Number(
    ((OFFICIAL_BENCHMARK_STATS.exactAutoMatched / OFFICIAL_BENCHMARK_STATS.totalRecords) * 100).toFixed(1)
  ); // 39.2%

  const automatedResolutionRatePct = Number(
    (
      ((OFFICIAL_BENCHMARK_STATS.exactAutoMatched + OFFICIAL_BENCHMARK_STATS.groundedExceptionsResolved) /
        OFFICIAL_BENCHMARK_STATS.totalRecords) *
      100
    ).toFixed(1)
  ); // 91.3%

  const manualReviewRatePct = Number(
    ((OFFICIAL_BENCHMARK_STATS.manualEscalated / OFFICIAL_BENCHMARK_STATS.totalRecords) * 100).toFixed(1)
  ); // 8.7%

  // Monthly totals
  const totalMonthlyExceptions = Math.round(volume * exceptionRate);
  const autoReconciledExceptions = Math.round(totalMonthlyExceptions * (automatedResolutionRatePct / 100));
  const escalatedExceptions = totalMonthlyExceptions - autoReconciledExceptions;

  // Productivity
  const monthlyHoursSaved = Number((autoReconciledExceptions * reviewTimeHrs).toFixed(1));
  const annualHoursSaved = Number((monthlyHoursSaved * 12).toFixed(1));
  const fteRepurposed = Number((monthlyHoursSaved / 160).toFixed(1));

  // Financial ROI
  const monthlyCostSavings = Math.round(monthlyHoursSaved * hourlyCost);
  const annualCostSavings = monthlyCostSavings * 12;

  // Risk Mitigation
  const clericalErrorRateBaseline = 0.015; // 1.5% human error rate
  const preventedClericalErrorsMonthly = Math.round(autoReconciledExceptions * clericalErrorRateBaseline);

  return {
    monthlyVolume: volume,
    totalMonthlyExceptions,
    autoReconciledExceptions,
    escalatedExceptions,
    exactAutoMatchRatePct,
    automatedResolutionRatePct,
    manualReviewRatePct,
    deterministicAiBypassPct: OFFICIAL_BENCHMARK_STATS.deterministicAiBypassPct,
    monthlyHoursSaved,
    annualHoursSaved,
    fteRepurposed,
    monthlyCostSavings,
    annualCostSavings,
    tokenCostSavingsPct: OFFICIAL_BENCHMARK_STATS.deterministicAiBypassPct,
    preventedClericalErrorsMonthly,
    falseFinancialWrites: 0,
  };
}
