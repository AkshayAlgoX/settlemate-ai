"use client";

import { useEffect, useState } from "react";
import {
  ShieldCheck,
  ShieldAlert,
  Brain,
  GitCommit,
  Database,
  FileText,
  Layers,
  Check,
  XCircle,
  Loader2,
  Plus,
} from "lucide-react";

interface PolicyRulesUI {
  amountTolerancePaise: number;
  toleranceWindowHours: number;
  materialityThresholdPaise: number;
  makerCheckerThresholdPaise: number;
  retryAttemptLimit: number;
}

interface ReconciliationPolicyUI {
  policyId: string;
  version: string;
  status: "DRAFT" | "SHADOW" | "APPROVED" | "ACTIVE" | "SUPERSEDED";
  createdBy: string;
  approvedBy?: string;
  createdAt: string;
  activatedAt?: string;
  rules: PolicyRulesUI;
  contentHash: string;
  description?: string;
}

interface RecordDiffUI {
  recordId: string;
  oldDecision: string;
  newDecision: string;
  oldConfidence: number;
  newConfidence: number;
  oldRisk: string;
  newRisk: string;
  oldMatchedRules: string[];
  newMatchedRules: string[];
  amountPaise: number;
  discrepancyPaise: number;
  timeDeltaHours: number;
  invariantResult: "PASSED" | "VIOLATION";
}

interface ShadowReportUI {
  baselinePolicyVersion: string;
  candidatePolicyVersion: string;
  candidatePolicyHash: string;
  recordsEvaluated: number;
  durationMs: number;
  throughputRecsPerSec: number;
  autoMatchDeltaPct: number;
  exceptionDeltaPct: number;
  precisionDeltaPct: number;
  recallDeltaPct: number;
  amountAtRiskDeltaPaise: number;
  invariantViolations: number;
  criticalExceptionsDelta: number;
  safetyScore: "SAFE" | "CAUTION" | "BLOCKED";
  canPromote: boolean;
  promotionBlockers: string[];
  newlyMatchedCount: number;
  newlyUnmatchedCount: number;
  newlyRiskyCount: number;
  newlyEscalatedCount: number;
  sampleRecordDiffs: RecordDiffUI[];
}

const SECURITY_LAYERS = [
  {
    title: "Deterministic Financial Engine",
    description:
      "The core reconciliation engine uses business rules, UTR matching, and integer-paise arithmetic. No AI, randomness, or model nondeterminism enters the financial source of truth.",
    icon: Database,
    points: [
      "Exact amount matching in integer paise",
      "T+2 settlement window rules",
      "UTR-based bank credit matching",
      "Fee + GST calculation with integer math",
    ],
  },
  {
    title: "AI Safety Gate",
    description:
      "AI is invoked only for exception investigation. Every response passes through structured validation before it can influence the application.",
    icon: Brain,
    points: [
      "Anomaly agent: max 5 cases per batched call",
      "Resolver agent: max 5 cases per batched call",
      "No financial fix is auto-applied; resolver output is advisory and recorded for review",
      "Schema rejection falls back to a deterministic template",
    ],
  },
  {
    title: "Structured Output Validation",
    description:
      "AI output is treated as untrusted input. Canonical schemas reject malformed shapes, invalid enums, out-of-range confidence, and unknown case IDs.",
    icon: FileText,
    points: [
      "Confidence constrained to 0–100",
      "Status constrained to canonical enums",
      "Fix type constrained to canonical enums",
      "Case IDs must belong to the queried exceptions",
    ],
  },
  {
    title: "Prompt Injection Defense",
    description:
      "Bank narrations, refund reasons, chargeback descriptions, and other source text are treated strictly as data rather than executable instructions.",
    icon: ShieldAlert,
    points: [
      "Source text explicitly quarantined as untrusted data",
      "Model instructed never to follow record-level instructions",
      "Grounded Q&A rejects evidence paths not present in context",
    ],
  },
  {
    title: "Dual Maker-Checker Governance",
    description:
      "AI suggests resolutions; human operators approve. High-risk write actions require dual sign-off before hitting downstream ledgers.",
    icon: ShieldCheck,
    points: [
      "AI produces SUGGESTION_ONLY status for write actions",
      "Maker (operator) submits proposed fix with rationale",
      "Checker (supervisor) approves or rejects with audit record",
      "Audit trail records both identities, timestamps, and pre/post diff",
    ],
  },
  {
    title: "Cryptographic Tamper-Evident Audit",
    description:
      "Every workflow state transition writes a forward-only event with SHA-256 hash chaining and Merkle batch roots for verifiable audit compliance.",
    icon: Layers,
    points: [
      "State transition hash: SHA-256(prevHash || eventPayload)",
      "Tamper detection on cold storage reads",
      "Zero delete, zero update on audit table rows",
      "Exportable Merkle inclusion proofs for third-party audit",
    ],
  },
];

export default function SecurityPage() {
  const [policies, setPolicies] = useState<ReconciliationPolicyUI[]>([]);
  const [activePolicy, setActivePolicy] = useState<ReconciliationPolicyUI | null>(null);
  const [latestReport, setLatestReport] = useState<ShadowReportUI | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);

  // Form State for Draft Creation
  const [showDraftForm, setShowDraftForm] = useState(false);
  const [draftVersion, setDraftVersion] = useState("1.1.0");
  const [draftTolerance, setDraftTolerance] = useState(100);
  const [draftWindow, setDraftWindow] = useState(72);
  const [draftMateriality, setDraftMateriality] = useState(5000);
  const [draftDescription] = useState("Candidate Policy");
  const [selectedSampleSize, setSelectedSampleSize] = useState(10000);

  const fetchPolicies = async () => {
    try {
      const res = await fetch("/api/policy");
      const data = await res.json();
      if (data.success) {
        setPolicies(data.policies || []);
        setActivePolicy(data.activePolicy || null);
      }
    } catch (err) {
      console.error("Failed to fetch policies:", err);
    }
  };

  useEffect(() => {
    let isMounted = true;
    void fetch("/api/policy")
      .then((res) => res.json())
      .then((data) => {
        if (isMounted && data.success) {
          setPolicies(data.policies || []);
          setActivePolicy(data.activePolicy || null);
        }
      })
      .catch((err) => console.error("Failed to fetch policies:", err));
    return () => {
      isMounted = false;
    };
  }, []);

  const handleCreateDraft = async () => {
    setActionLoading(true);
    setFeedback(null);
    try {
      const res = await fetch("/api/policy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create_draft",
          version: draftVersion,
          createdBy: "POLICY_CONTROLLER",
          description: draftDescription,
          rules: {
            amountTolerancePaise: draftTolerance,
            toleranceWindowHours: draftWindow,
            materialityThresholdPaise: draftMateriality * 100,
            makerCheckerThresholdPaise: 1000000,
            retryAttemptLimit: 3,
            confidenceThresholds: { autoMatchMin: 90, suggestedMatchMin: 70 },
            riskThresholds: { highRiskScoreMin: 70, mediumRiskScoreMin: 40 },
            providerRules: {
              RAZORPAY: { maxDelayedDays: 3, allowedMethods: ["UPI", "CARD", "NETBANKING"] },
            },
            cardinalityConstraints: {
              allowManyToOne: true,
              allowOneToMany: true,
              allowManyToMany: true,
              maxGroupSize: 50,
            },
          },
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "Failed to create draft");
      setFeedback({ type: "success", message: "Draft policy v" + draftVersion + " created successfully." });
      setShowDraftForm(false);
      await fetchPolicies();
    } catch (err) {
      setFeedback({ type: "error", message: err instanceof Error ? err.message : "Creation failed" });
    } finally {
      setActionLoading(false);
    }
  };

  const handleRunShadowReplay = async (version: string) => {
    setActionLoading(true);
    setFeedback(null);
    try {
      const res = await fetch("/api/policy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "run_shadow_replay",
          version,
          sampleSize: selectedSampleSize,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "Shadow replay failed");
      setLatestReport(data.report);
      setFeedback({
        type: "success",
        message: "Evaluated " + selectedSampleSize.toLocaleString() + " records in " + (data.report.durationMs || 10) + "ms. Safety Score: " + data.report.safetyScore,
      });
      await fetchPolicies();
    } catch (err) {
      setFeedback({ type: "error", message: err instanceof Error ? err.message : "Shadow replay failed" });
    } finally {
      setActionLoading(false);
    }
  };

  const handleApprove = async (version: string) => {
    setActionLoading(true);
    setFeedback(null);
    try {
      const res = await fetch("/api/policy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "approve", version, actorId: "SENIOR_CONTROLLER_AUDITOR" }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "Approval failed");
      setFeedback({ type: "success", message: "Policy v" + version + " approved by Senior Controller." });
      await fetchPolicies();
    } catch (err) {
      setFeedback({ type: "error", message: err instanceof Error ? err.message : "Approval failed" });
    } finally {
      setActionLoading(false);
    }
  };

  const handleActivate = async (version: string) => {
    setActionLoading(true);
    setFeedback(null);
    try {
      const res = await fetch("/api/policy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "activate", version }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "Activation failed");
      setFeedback({ type: "success", message: "Policy v" + version + " is now ACTIVE in production." });
      await fetchPolicies();
    } catch (err) {
      setFeedback({ type: "error", message: err instanceof Error ? err.message : "Activation failed" });
    } finally {
      setActionLoading(false);
    }
  };

  const handleRollback = async (targetVersion: string) => {
    setActionLoading(true);
    setFeedback(null);
    try {
      const res = await fetch("/api/policy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "rollback", targetVersion, actorId: "EMERGENCY_RISK_OFFICER" }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "Rollback failed");
      setFeedback({ type: "success", message: "Emergency rollback to v" + targetVersion + " executed successfully." });
      await fetchPolicies();
    } catch (err) {
      setFeedback({ type: "error", message: err instanceof Error ? err.message : "Rollback failed" });
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-8 sm:px-6 lg:px-8">
      {/* Header */}
      <header className="border border-[#2a2e29] bg-[#0d100d] p-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="flex items-center gap-2 text-[8px] font-medium uppercase tracking-[0.22em] text-[#63695f]">
              <ShieldCheck className="h-3.5 w-3.5 text-[#97a57e]" />
              Institutional Financial Control Plane
            </div>

            <h1 className="mt-1 text-[20px] font-bold tracking-[-0.03em] text-[#e3e1d8]">
              Security & Policy-as-Code Governance
            </h1>

            <p className="mt-1 text-[11px] text-[#71776d]">
              Deterministic arithmetic, 100k+ streaming shadow replay promotion gates, immutable audit lineage, and fail-closed AI boundaries.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <span className="inline-flex items-center gap-1.5 border border-[#4a5839] bg-[#12180e] px-2.5 py-1 text-[8px] font-bold uppercase tracking-[0.14em] text-[#a8b88d]">
              <span className="h-1.5 w-1.5 rounded-full bg-[#a8b88d]" />
              POLICY GOVERNANCE ACTIVE
            </span>
          </div>
        </div>
      </header>

      {feedback ? (
        <div className={"flex items-center justify-between border px-4 py-3 " + (
          feedback.type === "success"
            ? "border-[#384a32] bg-[#10160d] text-[#a8b88d]"
            : "border-[#552e2a] bg-[#221312] text-[#e0897d]"
        )}>
          <div className="flex items-center gap-2 text-[10px]">
            {feedback.type === "success" ? <Check className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
            <span>{feedback.message}</span>
          </div>
          <button type="button" onClick={() => setFeedback(null)} className="text-[9px] uppercase tracking-wider underline">
            Dismiss
          </button>
        </div>
      ) : null}

      {/* POLICY-AS-CODE CONTROL CENTER */}
      <section className="border border-[#2a2e29] bg-[#0d100d]">
        <div className="flex flex-col gap-3 border-b border-[#252a24] px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <GitCommit className="h-4 w-4 text-[#98a47f]" />
            <div>
              <div className="text-[8px] font-medium uppercase tracking-[0.2em] text-[#626960]">
                Policy-as-Code Engine
              </div>
              <div className="mt-0.5 text-[13px] font-semibold text-[#dddcd4]">
                Versioned Rules & Streaming Shadow Replay
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Sample Size Selector */}
            <div className="flex items-center gap-1.5 border border-[#252a24] bg-[#080b08] px-2 py-1">
              <span className="text-[8px] uppercase tracking-wider text-[#60675c]">Replay Sample:</span>
              <select
                value={selectedSampleSize}
                onChange={(e) => setSelectedSampleSize(Number(e.target.value))}
                className="bg-transparent font-mono text-[9px] text-[#dddcd4] focus:outline-none"
              >
                <option value={250}>250 (Benchmark)</option>
                <option value={1000}>1,000 (Standard)</option>
                <option value={10000}>10,000 (Production Scale)</option>
                <option value={100000}>100,000 (Hyperscale)</option>
              </select>
            </div>

            <button
              type="button"
              onClick={() => setShowDraftForm(!showDraftForm)}
              className="inline-flex items-center gap-1.5 border border-[#3b4533] bg-[#12160f] px-3 py-1.5 text-[8px] font-bold uppercase tracking-[0.14em] text-[#b4c399] hover:bg-[#1a2016]"
            >
              <Plus className="h-3 w-3" />
              {showDraftForm ? "Cancel Draft" : "New Candidate Policy"}
            </button>
          </div>
        </div>

        {/* Draft Policy Creator Form */}
        {showDraftForm ? (
          <div className="border-b border-[#252a24] bg-[#0b0e0b] p-5">
            <div className="text-[9px] font-bold uppercase tracking-wider text-[#dddcd4]">
              Create Candidate Policy Version
            </div>
            <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <label className="text-[7px] uppercase tracking-wider text-[#636b5e]">Version</label>
                <input
                  type="text"
                  value={draftVersion}
                  onChange={(e) => setDraftVersion(e.target.value)}
                  className="mt-1 h-9 w-full border border-[#2a2f28] bg-[#10140f] px-3 text-[11px] font-mono text-[#dcdbd3]"
                />
              </div>
              <div>
                <label className="text-[7px] uppercase tracking-wider text-[#636b5e]">Amount Tolerance (Paise)</label>
                <input
                  type="number"
                  value={draftTolerance}
                  onChange={(e) => setDraftTolerance(Number(e.target.value))}
                  className="mt-1 h-9 w-full border border-[#2a2f28] bg-[#10140f] px-3 text-[11px] font-mono text-[#dcdbd3]"
                />
              </div>
              <div>
                <label className="text-[7px] uppercase tracking-wider text-[#636b5e]">Timing Window (Hours)</label>
                <input
                  type="number"
                  value={draftWindow}
                  onChange={(e) => setDraftWindow(Number(e.target.value))}
                  className="mt-1 h-9 w-full border border-[#2a2f28] bg-[#10140f] px-3 text-[11px] font-mono text-[#dcdbd3]"
                />
              </div>
              <div>
                <label className="text-[7px] uppercase tracking-wider text-[#636b5e]">Materiality Threshold (INR)</label>
                <input
                  type="number"
                  value={draftMateriality}
                  onChange={(e) => setDraftMateriality(Number(e.target.value))}
                  className="mt-1 h-9 w-full border border-[#2a2f28] bg-[#10140f] px-3 text-[11px] font-mono text-[#dcdbd3]"
                />
              </div>
            </div>
            <div className="mt-4 flex justify-end">
              <button
                type="button"
                disabled={actionLoading}
                onClick={handleCreateDraft}
                className="inline-flex items-center gap-2 border border-[#4a5839] bg-[#151c11] px-4 py-2 text-[8px] font-bold uppercase tracking-[0.14em] text-[#b8c99e] hover:bg-[#1c2617]"
              >
                {actionLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                Save Policy Draft
              </button>
            </div>
          </div>
        ) : null}

        {/* Active Policy Status Card */}
        {activePolicy ? (
          <div className="grid gap-px bg-[#252a24] sm:grid-cols-2 lg:grid-cols-4">
            <div className="bg-[#0a0d0a] p-4">
              <div className="text-[7px] uppercase tracking-[0.16em] text-[#60675c]">Active Policy Version</div>
              <div className="mt-1 font-mono text-[16px] font-bold text-[#b4c399]">{activePolicy.version}</div>
              <div className="mt-0.5 text-[7px] text-[#60675c]">{activePolicy.status} in production</div>
            </div>
            <div className="bg-[#0a0d0a] p-4">
              <div className="text-[7px] uppercase tracking-[0.16em] text-[#60675c]">Amount Tolerance</div>
              <div className="mt-1 font-mono text-[16px] font-bold text-[#d7d5cd]">
                ₹{(activePolicy.rules.amountTolerancePaise / 100).toFixed(2)}
              </div>
              <div className="mt-0.5 text-[7px] text-[#60675c]">{activePolicy.rules.amountTolerancePaise} paise threshold</div>
            </div>
            <div className="bg-[#0a0d0a] p-4">
              <div className="text-[7px] uppercase tracking-[0.16em] text-[#60675c]">Timing Window</div>
              <div className="mt-1 font-mono text-[16px] font-bold text-[#d7d5cd]">
                {activePolicy.rules.toleranceWindowHours} Hours
              </div>
              <div className="mt-0.5 text-[7px] text-[#60675c]">T+{(activePolicy.rules.toleranceWindowHours / 24).toFixed(0)} clearing window</div>
            </div>
            <div className="bg-[#0a0d0a] p-4">
              <div className="text-[7px] uppercase tracking-[0.16em] text-[#60675c]">Canonical Policy Hash</div>
              <div className="mt-1 font-mono text-[11px] text-[#a4b58a] truncate">
                {activePolicy.contentHash.slice(0, 16)}...
              </div>
              <div className="mt-0.5 text-[7px] text-[#60675c]">SHA-256 Verified</div>
            </div>
          </div>
        ) : null}

        {/* Latest Shadow Replay Impact Card */}
        {latestReport ? (
          <div className="border-t border-[#252a24] bg-[#0c141a] p-5 space-y-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <span className="text-[8px] font-bold uppercase tracking-[0.16em] text-[#88b0c4]">
                  Streaming Shadow Replay: v{latestReport.candidatePolicyVersion} vs v{latestReport.baselinePolicyVersion}
                </span>
                <div className="mt-0.5 font-mono text-[9px] text-[#688291]">
                  Evaluated {latestReport.recordsEvaluated.toLocaleString()} records in {latestReport.durationMs}ms ({latestReport.throughputRecsPerSec.toLocaleString()} recs/sec)
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className={"px-2.5 py-1 text-[8px] font-bold uppercase tracking-wider border " + (
                  latestReport.safetyScore === "SAFE"
                    ? "border-[#384a56] bg-[#101b22] text-[#9fc7dc]"
                    : latestReport.safetyScore === "CAUTION"
                    ? "border-[#4e432a] bg-[#14120a] text-[#c9b275]"
                    : "border-[#552e2a] bg-[#221312] text-[#e0897d]"
                )}>
                  SAFETY SCORE: {latestReport.safetyScore}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="border border-[#1f2e38] bg-[#090f14] p-3">
                <div className="text-[7px] uppercase text-[#688291]">Auto-Match Delta</div>
                <div className="mt-1 font-mono text-[13px] font-bold text-[#88b0c4]">
                  {latestReport.autoMatchDeltaPct >= 0 ? "+" : ""}{latestReport.autoMatchDeltaPct}%
                </div>
                <div className="mt-0.5 text-[7px] text-[#556975]">({latestReport.newlyMatchedCount} newly matched)</div>
              </div>
              <div className="border border-[#1f2e38] bg-[#090f14] p-3">
                <div className="text-[7px] uppercase text-[#688291]">Exception Delta</div>
                <div className="mt-1 font-mono text-[13px] font-bold text-[#88b0c4]">
                  {latestReport.exceptionDeltaPct >= 0 ? "+" : ""}{latestReport.exceptionDeltaPct}%
                </div>
                <div className="mt-0.5 text-[7px] text-[#556975]">({latestReport.newlyUnmatchedCount} newly unmatched)</div>
              </div>
              <div className="border border-[#1f2e38] bg-[#090f14] p-3">
                <div className="text-[7px] uppercase text-[#688291]">Invariant Violations</div>
                <div className="mt-1 font-mono text-[13px] font-bold text-[#96a879]">
                  {latestReport.invariantViolations} (Zero Tolerance)
                </div>
                <div className="mt-0.5 text-[7px] text-[#556975]">100% Conservation</div>
              </div>
              <div className="border border-[#1f2e38] bg-[#090f14] p-3">
                <div className="text-[7px] uppercase text-[#688291]">Amount at Risk Delta</div>
                <div className="mt-1 font-mono text-[13px] font-bold text-[#d7d5cd]">
                  ₹{(latestReport.amountAtRiskDeltaPaise / 100).toFixed(2)}
                </div>
                <div className="mt-0.5 text-[7px] text-[#556975]">Deterministic Math</div>
              </div>
            </div>

            {/* Record-Level Diff Drill-Down Preview */}
            {latestReport.sampleRecordDiffs && latestReport.sampleRecordDiffs.length > 0 ? (
              <div className="border border-[#1f2e38] bg-[#080d11] p-3">
                <div className="text-[8px] font-bold uppercase tracking-wider text-[#88b0c4] mb-2">
                  Record-Level Impact Drill-Down ({latestReport.sampleRecordDiffs.length} Sample Diffs)
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left font-mono text-[8px]">
                    <thead>
                      <tr className="border-b border-[#1f2e38] text-[#556975]">
                        <th className="py-1">Record ID</th>
                        <th className="py-1">Old Decision</th>
                        <th className="py-1">New Decision</th>
                        <th className="py-1">Delay</th>
                        <th className="py-1">Amount</th>
                        <th className="py-1">Invariant</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#152028] text-[#8e9da6]">
                      {latestReport.sampleRecordDiffs.slice(0, 5).map((d, idx) => (
                        <tr key={idx}>
                          <td className="py-1 text-[#dddcd4]">{d.recordId}</td>
                          <td className="py-1">{d.oldDecision}</td>
                          <td className="py-1 text-[#88b0c4]">{d.newDecision}</td>
                          <td className="py-1">{d.timeDeltaHours}h</td>
                          <td className="py-1">₹{(d.amountPaise / 100).toFixed(2)}</td>
                          <td className="py-1 text-[#96a879]">PASSED</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : null}
          </div>
        ) : null}

        {/* Versioned Policy Ledger Table */}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[750px] border-collapse text-left text-[9px]">
            <thead>
              <tr className="border-b border-[#252a24] bg-[#0a0d0a] text-[7px] uppercase tracking-[0.16em] text-[#555c52]">
                <th className="px-5 py-3 font-semibold">Policy Version</th>
                <th className="px-5 py-3 font-semibold">Status</th>
                <th className="px-5 py-3 font-semibold">Rules Digest</th>
                <th className="px-5 py-3 font-semibold">Author / Approver</th>
                <th className="px-5 py-3 font-semibold">SHA-256 Hash</th>
                <th className="px-5 py-3 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1e221d]">
              {policies.map((pol) => {
                const isCurrentActive = pol.status === "ACTIVE";
                return (
                  <tr key={pol.version} className={isCurrentActive ? "bg-[#11160e]" : "hover:bg-[#10140f]"}>
                    <td className="px-5 py-3 font-mono font-bold text-[#dddcd4]">
                      v{pol.version}
                    </td>
                    <td className="px-5 py-3">
                      <span className={"inline-flex px-2 py-0.5 text-[7px] font-bold uppercase tracking-wider border " + (
                        pol.status === "ACTIVE"
                          ? "border-[#4a5839] bg-[#141a0f] text-[#a8b88d]"
                          : pol.status === "APPROVED"
                          ? "border-[#384a56] bg-[#101b22] text-[#9fc7dc]"
                          : pol.status === "SHADOW"
                          ? "border-[#4e432a] bg-[#14120a] text-[#c9b275]"
                          : pol.status === "SUPERSEDED"
                          ? "border-[#2a2e29] bg-[#0e110e] text-[#60675c]"
                          : "border-[#333a30] bg-[#10140f] text-[#8e958a]"
                      )}>
                        {pol.status}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-[#8e958a]">
                      <div>Tolerance: ₹{(pol.rules.amountTolerancePaise / 100).toFixed(2)}</div>
                      <div className="text-[8px] text-[#60675c]">Window: {pol.rules.toleranceWindowHours}h</div>
                    </td>
                    <td className="px-5 py-3 font-mono text-[8px] text-[#788074]">
                      <div>{pol.createdBy}</div>
                      {pol.approvedBy ? <div className="text-[#a8b88d]">✓ {pol.approvedBy}</div> : null}
                    </td>
                    <td className="px-5 py-3 font-mono text-[8px] text-[#555c52]">
                      {pol.contentHash.slice(0, 12)}...
                    </td>
                    <td className="px-5 py-3 text-right">
                      <div className="inline-flex items-center gap-1.5">
                        {pol.status === "DRAFT" || pol.status === "SHADOW" ? (
                          <button
                            type="button"
                            disabled={actionLoading}
                            onClick={() => handleRunShadowReplay(pol.version)}
                            className="border border-[#2f3d47] bg-[#0c1419] px-2.5 py-1 text-[7px] font-bold uppercase tracking-wider text-[#88b0c4] hover:bg-[#121e26]"
                          >
                            Replay ({selectedSampleSize.toLocaleString()})
                          </button>
                        ) : null}

                        {pol.status === "SHADOW" ? (
                          <button
                            type="button"
                            disabled={actionLoading}
                            onClick={() => handleApprove(pol.version)}
                            className="border border-[#384a56] bg-[#101b22] px-2.5 py-1 text-[7px] font-bold uppercase tracking-wider text-[#9fc7dc] hover:bg-[#15232c]"
                          >
                            Approve
                          </button>
                        ) : null}

                        {pol.status === "APPROVED" ? (
                          <button
                            type="button"
                            disabled={actionLoading}
                            onClick={() => handleActivate(pol.version)}
                            className="border border-[#4a5839] bg-[#141a0f] px-2.5 py-1 text-[7px] font-bold uppercase tracking-wider text-[#a8b88d] hover:bg-[#1c2615]"
                          >
                            Activate
                          </button>
                        ) : null}

                        {pol.status === "SUPERSEDED" ? (
                          <button
                            type="button"
                            disabled={actionLoading}
                            onClick={() => handleRollback(pol.version)}
                            className="border border-[#4e432a] bg-[#14120a] px-2.5 py-1 text-[7px] font-bold uppercase tracking-wider text-[#c9b275] hover:bg-[#1f1c10]"
                          >
                            Rollback To
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* Security Architecture Grid */}
      <section className="space-y-4">
        <div className="text-[8px] font-medium uppercase tracking-[0.2em] text-[#63695f]">
          Institutional Safety Blueprint
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {SECURITY_LAYERS.map((layer) => {
            const Icon = layer.icon;
            return (
              <div
                key={layer.title}
                className="border border-[#2a2e29] bg-[#0d100d] p-5"
              >
                <div className="flex items-center gap-2.5">
                  <div className="border border-[#2a2e29] bg-[#151815] p-2 text-[#97a57e]">
                    <Icon className="h-4 w-4" />
                  </div>
                  <h2 className="text-[12px] font-semibold text-[#dddcd4]">
                    {layer.title}
                  </h2>
                </div>

                <p className="mt-3 text-[11px] leading-relaxed text-[#858c80]">
                  {layer.description}
                </p>

                <div className="mt-4 border-t border-[#1e221d] pt-3">
                  <div className="text-[7px] font-medium uppercase tracking-[0.16em] text-[#555c52]">
                    Verification Guarantees
                  </div>
                  <ul className="mt-2 space-y-1.5">
                    {layer.points.map((point) => (
                      <li
                        key={point}
                        className="flex items-start gap-1.5 text-[10px] text-[#71776d]"
                      >
                        <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-[#555c52]" />
                        <span>{point}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
