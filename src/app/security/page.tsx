"use client";

import { useEffect, useState } from "react";
import {
  ShieldCheck,
  Brain,
  Database,
  FileText,
  Layers,
  Check,
  XCircle,
  Loader2,
  Plus,
} from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { SectionHeader } from "@/components/ui/section-header";
import { Badge } from "@/components/ui/badge";
import { Dropdown } from "@/components/ui/dropdown";

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
      "The core reconciliation engine uses business rules, UTR matching, and integer-paise arithmetic. No AI or model nondeterminism enters the financial source of truth.",
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
      "AI is invoked only for exception investigation. Every response passes through structured validation before influencing the application.",
    icon: Brain,
    points: [
      "Anomaly agent: max 5 cases per batched call",
      "Resolver agent: max 5 cases per batched call",
      "No financial fix is auto-applied; resolver output is advisory",
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
      "Case IDs must belong to queried exceptions",
    ],
  },
  {
    title: "Prompt Injection Defense",
    description:
      "Bank narrations, refund reasons, chargeback descriptions, and other source text are treated strictly as data rather than instructions.",
    icon: ShieldCheck,
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
      "Audit trail records identities, timestamps, and pre/post diff",
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
    <div className="space-y-10 pb-12">
      {/* Header */}
      <PageHeader
        tag="Security & Policy"
        title="Policy-as-code & security blueprint"
        description="Deterministic integer arithmetic, streaming shadow replay promotion gates, immutable audit lineage, and fail-closed AI boundaries."
        badge={<Badge variant="success">Governance active</Badge>}
      />

      {feedback ? (
        <div className={`flex items-center justify-between rounded-lg border p-4 text-xs ${
          feedback.type === "success"
            ? "border-border bg-card text-foreground"
            : "border-[#3b1818] bg-[#140a0a] text-[#ef4444]"
        }`}>
          <div className="flex items-center gap-2">
            {feedback.type === "success" ? <Check className="h-4 w-4 text-[#10b981]" /> : <XCircle className="h-4 w-4 text-[#ef4444]" />}
            <span>{feedback.message}</span>
          </div>
          <button type="button" onClick={() => setFeedback(null)} className="text-xs text-muted-foreground hover:text-foreground">
            Dismiss
          </button>
        </div>
      ) : null}

      {/* POLICY-AS-CODE CONTROL CENTER */}
      <section className="rounded-lg border border-border bg-card space-y-4">
        <div className="flex flex-col gap-3 border-b border-border p-5 sm:flex-row sm:items-center sm:justify-between">
          <SectionHeader
            title="Versioned rules & shadow replay"
            description="Replay candidate policies against real workloads before promotion."
            className="border-b-0 pb-0"
          />

          <div className="flex items-center gap-2">
            {/* Sample Size Selector */}
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-muted-foreground font-medium">Replay:</span>
              <Dropdown
                value={String(selectedSampleSize)}
                onValueChange={(val) => setSelectedSampleSize(Number(val))}
                options={[
                  { value: "250", label: "250 records", badge: "Fast" },
                  { value: "1000", label: "1,000 records", badge: "1k" },
                  { value: "10000", label: "10,000 records", badge: "10k" },
                  { value: "100000", label: "100,000 records", badge: "100k" },
                ]}
                size="sm"
                triggerClassName="w-[150px] font-mono text-xs"
                data-testid="security-sample-size-dropdown"
              />
            </div>

            <button
              type="button"
              onClick={() => setShowDraftForm(!showDraftForm)}
              className="inline-flex h-8 items-center gap-1.5 rounded-md bg-primary text-primary-foreground px-3 text-xs font-medium text-primary-foreground hover:bg-[#ffffff] transition"
            >
              <Plus className="h-3 w-3" />
              <span>{showDraftForm ? "Cancel draft" : "New candidate policy"}</span>
            </button>
          </div>
        </div>

        {/* Draft Policy Creator Form */}
        {showDraftForm ? (
          <div className="border-b border-border bg-background p-5 space-y-4">
            <div className="text-xs font-semibold text-foreground">
              Create Candidate Policy Version
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 text-xs">
              <div>
                <label className="text-muted-foreground block mb-1">Version</label>
                <input
                  type="text"
                  value={draftVersion}
                  onChange={(e) => setDraftVersion(e.target.value)}
                  className="h-8 w-full border border-border rounded bg-card px-3 text-xs font-mono text-foreground"
                />
              </div>
              <div>
                <label className="text-muted-foreground block mb-1">Amount Tolerance (Paise)</label>
                <input
                  type="number"
                  value={draftTolerance}
                  onChange={(e) => setDraftTolerance(Number(e.target.value))}
                  className="h-8 w-full border border-border rounded bg-card px-3 text-xs font-mono text-foreground"
                />
              </div>
              <div>
                <label className="text-muted-foreground block mb-1">Timing Window (Hours)</label>
                <input
                  type="number"
                  value={draftWindow}
                  onChange={(e) => setDraftWindow(Number(e.target.value))}
                  className="h-8 w-full border border-border rounded bg-card px-3 text-xs font-mono text-foreground"
                />
              </div>
              <div>
                <label className="text-muted-foreground block mb-1">Materiality Threshold (INR)</label>
                <input
                  type="number"
                  value={draftMateriality}
                  onChange={(e) => setDraftMateriality(Number(e.target.value))}
                  className="h-8 w-full border border-border rounded bg-card px-3 text-xs font-mono text-foreground"
                />
              </div>
            </div>
            <div className="flex justify-end">
              <button
                type="button"
                disabled={actionLoading}
                onClick={handleCreateDraft}
                className="inline-flex h-8 items-center gap-1.5 rounded-md bg-primary text-primary-foreground px-3 text-xs font-medium text-primary-foreground hover:bg-[#ffffff] transition disabled:opacity-50"
              >
                {actionLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                <span>Save policy draft</span>
              </button>
            </div>
          </div>
        ) : null}

        {/* Active Policy Status Card */}
        {activePolicy ? (
          <div className="grid gap-px bg-[#1e1e1e] sm:grid-cols-2 lg:grid-cols-4">
            <div className="bg-card p-4 space-y-1">
              <div className="text-xs text-muted-foreground">Active Policy Version</div>
              <div className="font-mono text-xl font-semibold text-foreground">{activePolicy.version}</div>
              <div className="text-[11px] text-[#10b981]">Active in production</div>
            </div>
            <div className="bg-card p-4 space-y-1">
              <div className="text-xs text-muted-foreground">Amount Tolerance</div>
              <div className="font-mono text-xl font-semibold text-foreground">
                ₹{(activePolicy.rules.amountTolerancePaise / 100).toFixed(2)}
              </div>
              <div className="text-[11px] text-muted-foreground/70">{activePolicy.rules.amountTolerancePaise} paise threshold</div>
            </div>
            <div className="bg-card p-4 space-y-1">
              <div className="text-xs text-muted-foreground">Timing Window</div>
              <div className="font-mono text-xl font-semibold text-foreground">
                {activePolicy.rules.toleranceWindowHours} Hours
              </div>
              <div className="text-[11px] text-muted-foreground/70">T+{(activePolicy.rules.toleranceWindowHours / 24).toFixed(0)} clearing window</div>
            </div>
            <div className="bg-card p-4 space-y-1">
              <div className="text-xs text-muted-foreground">Canonical Hash</div>
              <div className="font-mono text-xs text-foreground truncate mt-1">
                {activePolicy.contentHash.slice(0, 16)}...
              </div>
              <div className="text-[11px] text-muted-foreground/70">SHA-256 Verified</div>
            </div>
          </div>
        ) : null}

        {/* Latest Shadow Replay Impact Card */}
        {latestReport ? (
          <div className="border-t border-border bg-background p-5 space-y-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <span className="text-xs font-semibold text-foreground">
                  Shadow Replay: v{latestReport.candidatePolicyVersion} vs v{latestReport.baselinePolicyVersion}
                </span>
                <div className="font-mono text-xs text-muted-foreground mt-0.5">
                  Evaluated {latestReport.recordsEvaluated.toLocaleString()} records in {latestReport.durationMs}ms ({latestReport.throughputRecsPerSec.toLocaleString()} recs/s)
                </div>
              </div>
              <Badge variant={latestReport.safetyScore === "SAFE" ? "success" : "warning"}>
                Safety: {latestReport.safetyScore}
              </Badge>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="border border-border bg-card p-3 rounded-md">
                <div className="text-xs text-muted-foreground">Auto-Match Delta</div>
                <div className="font-mono text-base font-semibold text-foreground mt-0.5">
                  {latestReport.autoMatchDeltaPct >= 0 ? "+" : ""}{latestReport.autoMatchDeltaPct}%
                </div>
                <div className="text-[10px] text-muted-foreground/70">({latestReport.newlyMatchedCount} newly matched)</div>
              </div>
              <div className="border border-border bg-card p-3 rounded-md">
                <div className="text-xs text-muted-foreground">Exception Delta</div>
                <div className="font-mono text-base font-semibold text-foreground mt-0.5">
                  {latestReport.exceptionDeltaPct >= 0 ? "+" : ""}{latestReport.exceptionDeltaPct}%
                </div>
                <div className="text-[10px] text-muted-foreground/70">({latestReport.newlyUnmatchedCount} newly unmatched)</div>
              </div>
              <div className="border border-border bg-card p-3 rounded-md">
                <div className="text-xs text-muted-foreground">Invariant Violations</div>
                <div className="font-mono text-base font-semibold text-[#10b981] mt-0.5">
                  {latestReport.invariantViolations}
                </div>
                <div className="text-[10px] text-muted-foreground/70">Zero Tolerance</div>
              </div>
              <div className="border border-border bg-card p-3 rounded-md">
                <div className="text-xs text-muted-foreground">Amount at Risk Delta</div>
                <div className="font-mono text-base font-semibold text-foreground mt-0.5">
                  ₹{(latestReport.amountAtRiskDeltaPaise / 100).toFixed(2)}
                </div>
                <div className="text-[10px] text-muted-foreground/70">Exact Paise</div>
              </div>
            </div>

            {/* Record-Level Diff Drill-Down Preview */}
            {latestReport.sampleRecordDiffs && latestReport.sampleRecordDiffs.length > 0 ? (
              <div className="border border-border bg-card p-3 rounded-md">
                <div className="text-xs font-semibold text-foreground mb-2">
                  Sample Record Diffs ({latestReport.sampleRecordDiffs.length})
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left font-mono text-xs">
                    <thead>
                      <tr className="border-b border-border bg-muted/30 text-xs font-medium text-muted-foreground">
                        <th className="py-2 px-3 font-medium">Record ID</th>
                        <th className="py-2 px-3 font-medium">Old Decision</th>
                        <th className="py-2 px-3 font-medium">New Decision</th>
                        <th className="py-2 px-3 font-medium">Delay</th>
                        <th className="py-2 px-3 font-medium">Amount</th>
                        <th className="py-2 px-3 font-medium">Invariant</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {latestReport.sampleRecordDiffs.slice(0, 5).map((d, idx) => (
                        <tr key={idx} className="hover:bg-accent/40 transition">
                          <td className="py-2 px-3 text-foreground font-semibold">{d.recordId}</td>
                          <td className="py-2 px-3 text-muted-foreground">{d.oldDecision}</td>
                          <td className="py-2 px-3 text-foreground">{d.newDecision}</td>
                          <td className="py-2 px-3 text-muted-foreground/70">{d.timeDeltaHours}h</td>
                          <td className="py-2 px-3 text-foreground">₹{(d.amountPaise / 100).toFixed(2)}</td>
                          <td className="py-2 px-3">
                            <Badge variant={d.invariantResult === "PASSED" ? "success" : "destructive"}>
                              {d.invariantResult}
                            </Badge>
                          </td>
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
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-border bg-muted/30 text-xs font-medium text-muted-foreground">
                <th className="px-5 py-2.5 font-medium">Policy Version</th>
                <th className="px-5 py-2.5 font-medium">Status</th>
                <th className="px-5 py-2.5 font-medium">Rules Digest</th>
                <th className="px-5 py-2.5 font-medium">Author / Approver</th>
                <th className="px-5 py-2.5 font-medium">SHA-256 Hash</th>
                <th className="px-5 py-2.5 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {policies.map((pol) => {
                const isCurrentActive = pol.status === "ACTIVE";
                return (
                  <tr key={pol.version} className={isCurrentActive ? "bg-[#0f0f0f]/60" : "hover:bg-accent/40"}>
                    <td className="px-5 py-3 font-mono font-semibold text-foreground">
                      v{pol.version}
                    </td>
                    <td className="px-5 py-3">
                      <Badge variant={pol.status === "ACTIVE" ? "success" : pol.status === "APPROVED" ? "outline" : "secondary"}>
                        {pol.status}
                      </Badge>
                    </td>
                    <td className="px-5 py-3 text-muted-foreground">
                      <div>Tolerance: ₹{(pol.rules.amountTolerancePaise / 100).toFixed(2)}</div>
                      <div className="text-[11px] text-muted-foreground/70">Window: {pol.rules.toleranceWindowHours}h</div>
                    </td>
                    <td className="px-5 py-3 font-mono text-[11px] text-muted-foreground">
                      <div>{pol.createdBy}</div>
                      {pol.approvedBy ? <div className="text-foreground">✓ {pol.approvedBy}</div> : null}
                    </td>
                    <td className="px-5 py-3 font-mono text-[11px] text-muted-foreground/70">
                      {pol.contentHash.slice(0, 12)}...
                    </td>
                    <td className="px-5 py-3 text-right">
                      <div className="inline-flex items-center gap-1.5">
                        {pol.status === "DRAFT" || pol.status === "SHADOW" ? (
                          <button
                            type="button"
                            disabled={actionLoading}
                            onClick={() => handleRunShadowReplay(pol.version)}
                            className="h-7 px-2.5 rounded border border-border bg-card text-xs font-medium text-foreground hover:bg-accent transition"
                          >
                            Replay ({selectedSampleSize.toLocaleString()})
                          </button>
                        ) : null}

                        {pol.status === "SHADOW" ? (
                          <button
                            type="button"
                            disabled={actionLoading}
                            onClick={() => handleApprove(pol.version)}
                            className="h-7 px-2.5 rounded bg-primary text-primary-foreground text-xs font-medium text-primary-foreground hover:bg-[#ffffff] transition"
                          >
                            Approve
                          </button>
                        ) : null}

                        {pol.status === "APPROVED" ? (
                          <button
                            type="button"
                            disabled={actionLoading}
                            onClick={() => handleActivate(pol.version)}
                            className="h-7 px-2.5 rounded bg-primary text-primary-foreground text-xs font-medium text-primary-foreground hover:bg-[#ffffff] transition"
                          >
                            Activate
                          </button>
                        ) : null}

                        {pol.status === "SUPERSEDED" ? (
                          <button
                            type="button"
                            disabled={actionLoading}
                            onClick={() => handleRollback(pol.version)}
                            className="h-7 px-2.5 rounded border border-border bg-card text-xs font-medium text-muted-foreground hover:text-foreground transition"
                          >
                            Rollback
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
        <SectionHeader
          title="Institutional safety blueprint"
          description="Six architectural defense layers protecting financial state."
        />

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {SECURITY_LAYERS.map((layer) => (
            <div
              key={layer.title}
              className="rounded-lg border border-border bg-card p-5 space-y-3"
            >
              <h2 className="text-xs font-semibold text-foreground">
                {layer.title}
              </h2>

              <p className="text-xs leading-relaxed text-muted-foreground">
                {layer.description}
              </p>

              <div className="border-t border-border pt-3">
                <ul className="space-y-1.5">
                  {layer.points.map((point) => (
                    <li
                      key={point}
                      className="flex items-start gap-1.5 text-[11px] text-muted-foreground/70"
                    >
                      <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-[#888888]" />
                      <span>{point}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
