/*
 * SettleMate AI — Smart Alerting Types & Deterministic Generator
 *
 * Browser-safe and server-safe alert schemas, channels, and deterministic generator.
 */

import { formatCurrency } from "@/lib/format";

export type AlertSeverity = "HIGH" | "MEDIUM" | "LOW";

export interface SmartAlert {
  id: string;
  exceptionId: string;
  type: string;
  severity: AlertSeverity;
  title: string;
  description: string;
  amountPaise: number;
  formattedAmount: string;
  channel: string;
  targetUrl: string;
  timestamp: string;
  ruleTriggered: string;
  signature?: string;
  deliveryStatus: "DELIVERED" | "SIMULATED" | "FAILED" | "PENDING";
  statusCode: number;
  recommendedPlaybook: string;
  metadata: {
    paymentId?: string;
    settlementId?: string;
    riskScore: number;
    variancePaise: number;
  };
}

export interface AlertChannel {
  id: string;
  name: string;
  targetUrl: string;
  type: "SLACK" | "PAGERDUTY" | "EMAIL" | "WEBHOOK";
  events: string[];
  status: "ACTIVE" | "PAUSED";
}

/** Pre-configured alert channels */
export const DEFAULT_ALERT_CHANNELS: AlertChannel[] = [
  {
    id: "chan_slack_critical",
    name: "Slack #finance-critical-alerts",
    targetUrl: "https://hooks.slack.internal/services/settlemate/recon-critical",
    type: "SLACK",
    events: ["reconciliation.exception.high_risk", "reconciliation.tolerance.breach"],
    status: "ACTIVE",
  },
  {
    id: "chan_pagerduty_p1",
    name: "PagerDuty P1 High Risk Incidents",
    targetUrl: "https://events.pagerduty.internal/v2/enqueue/settlemate-recon",
    type: "PAGERDUTY",
    events: ["reconciliation.exception.high_risk"],
    status: "ACTIVE",
  },
  {
    id: "chan_email_cfo",
    name: "CFO Escalation Email Notification",
    targetUrl: "https://notify.email.internal/api/v1/cfo-recon-digest",
    type: "EMAIL",
    events: ["reconciliation.tolerance.breach", "reconciliation.summary.daily"],
    status: "ACTIVE",
  },
  {
    id: "chan_mock_local",
    name: "Local Mock Alert Receiver",
    targetUrl: "http://localhost:3000/api/alerts/mock-receiver",
    type: "WEBHOOK",
    events: ["reconciliation.exception.*"],
    status: "ACTIVE",
  },
];

/** Seeded deterministic scenarios for alerts */
const DETERMINISTIC_ALERT_TEMPLATES: Array<Omit<SmartAlert, "id" | "timestamp" | "signature" | "deliveryStatus" | "statusCode">> = [
  {
    exceptionId: "EXP_ALERT_STACK_01",
    type: "TOLERANCE_STACKING_BREACH",
    severity: "HIGH",
    title: "Cumulative Tolerance Stacking Breach (25 Micro-Variances)",
    description: "25 sub-threshold variances of ₹50.00 accumulated to ₹1,250.00 total exposure, breaching batch cumulative tolerance limits.",
    amountPaise: 125000,
    formattedAmount: formatCurrency(125000),
    channel: "Slack #finance-critical-alerts",
    targetUrl: "https://hooks.slack.internal/services/settlemate/recon-critical",
    ruleTriggered: "RULE_AGGREGATE_TOLERANCE_CAP_BREACHED",
    recommendedPlaybook: "PB-04: Batch-Wide Tolerance Stacking Escalation",
    metadata: {
      riskScore: 92,
      variancePaise: 125000,
      paymentId: "PAY_BATCH_STACK_001",
    },
  },
  {
    exceptionId: "EXP_ALERT_REFUND_02",
    type: "UNNOTIFIED_REFUND_VARIANCE",
    severity: "HIGH",
    title: "High-Variance Un-Notified Refund Voucher",
    description: "Captured payment of ₹20,000 settled for ₹18,450 due to an unnotified ₹1,550 refund voucher at gateway.",
    amountPaise: 155000,
    formattedAmount: formatCurrency(155000),
    channel: "Slack #finance-critical-alerts",
    targetUrl: "https://hooks.slack.internal/services/settlemate/recon-critical",
    ruleTriggered: "RULE_UNEXPLAINED_VARIANCE_ABOVE_THRESHOLD",
    recommendedPlaybook: "PB-01: Un-Notified Refund Matching & Journal Posting",
    metadata: {
      riskScore: 88,
      variancePaise: 155000,
      paymentId: "PAY_PROD_1001",
      settlementId: "SETL_PROD_1001",
    },
  },
  {
    exceptionId: "EXP_ALERT_DUP_03",
    type: "DUPLICATE_BANK_CREDIT",
    severity: "HIGH",
    title: "Duplicate Bank Credit Detected (2x ₹5,000.00)",
    description: "Bank statement contains duplicate credit entries for a single order settlement reference UTR_DUP_8819.",
    amountPaise: 500000,
    formattedAmount: formatCurrency(500000),
    channel: "PagerDuty P1 High Risk Incidents",
    targetUrl: "https://events.pagerduty.internal/v2/enqueue/settlemate-recon",
    ruleTriggered: "RULE_DUPLICATE_CREDIT_POSTING_BLOCKED",
    recommendedPlaybook: "PB-05: Duplicate Credit Reversal & Clearing Escrow",
    metadata: {
      riskScore: 95,
      variancePaise: 500000,
      paymentId: "PAY_DUP_4410",
      settlementId: "SETL_DUP_4410",
    },
  },
  {
    exceptionId: "EXP_ALERT_CHARGEBACK_04",
    type: "EXPIRED_CHARGEBACK_DISPUTE",
    severity: "MEDIUM",
    title: "Expired Chargeback Filed Past T+90 Day SLA",
    description: "Chargeback of ₹15,000.00 filed at T+120 days, exceeding network dispute eligibility window.",
    amountPaise: 1500000,
    formattedAmount: formatCurrency(1500000),
    channel: "Slack #finance-critical-alerts",
    targetUrl: "https://hooks.slack.internal/services/settlemate/recon-critical",
    ruleTriggered: "RULE_CHARGEBACK_TIMING_WINDOW_BREACH",
    recommendedPlaybook: "PB-03: Chargeback Representment & Evidence Submission",
    metadata: {
      riskScore: 68,
      variancePaise: 1500000,
      paymentId: "PAY_CB_9901",
    },
  },
  {
    exceptionId: "EXP_ALERT_FEE_05",
    type: "CONTRACT_FEE_OVERCHARGE",
    severity: "LOW",
    title: "Gateway Fee Tier Overcharge (2.0% vs Contract 1.5%)",
    description: "Processor billed 2.0% MDR fee (₹200.00) instead of contracted rate 1.5% (₹150.00), leaving ₹50.00 variance.",
    amountPaise: 5000,
    formattedAmount: formatCurrency(5000),
    channel: "Local Mock Alert Receiver",
    targetUrl: "http://localhost:3000/api/alerts/mock-receiver",
    ruleTriggered: "RULE_MDR_RATE_EXCEEDS_SCHEDULE",
    recommendedPlaybook: "PB-02: Processor Fee Discrepancy Dispute Filing",
    metadata: {
      riskScore: 35,
      variancePaise: 5000,
      paymentId: "PAY_FEE_1120",
    },
  },
  {
    exceptionId: "EXP_ALERT_SLA_06",
    type: "DELAYED_SETTLEMENT_SLA",
    severity: "MEDIUM",
    title: "Delayed Settlement SLA Breach (T+5 Days)",
    description: "Payment captured on Monday settled on Friday, exceeding contractual T+1 settlement SLA window.",
    amountPaise: 250000,
    formattedAmount: formatCurrency(250000),
    channel: "CFO Escalation Email Notification",
    targetUrl: "https://notify.email.internal/api/v1/cfo-recon-digest",
    ruleTriggered: "RULE_SETTLEMENT_LATENCY_EXCEEDED",
    recommendedPlaybook: "PB-06: Acquirer Settlement SLA Penalty Calculation",
    metadata: {
      riskScore: 62,
      variancePaise: 250000,
      paymentId: "PAY_SLA_7740",
    },
  },
  {
    exceptionId: "EXP_ALERT_HIGH_07",
    type: "CRITICAL_VARIANCE_ANOMALY",
    severity: "HIGH",
    title: "Material Unexplained Variance (₹60,000.00)",
    description: "High-value transaction variance exceeding ₹50,000 threshold requires immediate Controller dual-authorization.",
    amountPaise: 6000000,
    formattedAmount: formatCurrency(6000000),
    channel: "Slack #finance-critical-alerts",
    targetUrl: "https://hooks.slack.internal/services/settlemate/recon-critical",
    ruleTriggered: "RULE_MATERIAL_DISCREPANCY_LOCK",
    recommendedPlaybook: "PB-07: Material Exposure Controller Dual Sign-off",
    metadata: {
      riskScore: 98,
      variancePaise: 6000000,
      paymentId: "PAY_HIGH_9921",
    },
  },
];

/**
 * Generates a deterministic smart alert.
 */
export function generateDeterministicAlert(
  index: number = 0,
  forceHighRisk: boolean = false,
  customTimestamp?: string,
  customId?: string
): SmartAlert {
  const templates = forceHighRisk
    ? DETERMINISTIC_ALERT_TEMPLATES.filter((t) => t.severity === "HIGH")
    : DETERMINISTIC_ALERT_TEMPLATES;

  const template = templates[index % templates.length];
  const now = customTimestamp || "2026-08-28T10:00:00.000Z";
  const alertId = customId || `alt_det_${String(index).padStart(4, "0")}`;

  return {
    ...template,
    id: alertId,
    timestamp: now,
    deliveryStatus: "PENDING",
    statusCode: 0,
  };
}
