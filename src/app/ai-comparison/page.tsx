"use client";

import React, { useState, useEffect } from "react";
import {
  RefreshCw,
} from "lucide-react";
import { Dropdown } from "@/components/ui/dropdown";
import { PageHeader } from "@/components/ui/page-header";
import { SectionHeader } from "@/components/ui/section-header";
import { Badge } from "@/components/ui/badge";

interface ComparisonArchitectureOutput {
  architectureName: string;
  badge: string;
  badgeColor: string;
  status: string;
  verdict: "BLOCKED" | "UNSAFE" | "VERIFIED";
  classification: string;
  explanation: string;
  actionTaken: string;
  invariantConservation: string;
  ledgerSafety: string;
  executionLatencyMs: number;
  falsePositiveRisk: string;
  adversarialSecurity: string;
  structuredDetails?: Record<string, unknown>;
}

interface ComparisonRunResponse {
  scenarioId: string;
  scenarioName: string;
  category: string;
  description: string;
  discrepancyPaise: number;
  discrepancyFormatted: string;
  architectures: {
    rulesOnly: ComparisonArchitectureOutput;
    pureLlm: ComparisonArchitectureOutput;
    hybrid: ComparisonArchitectureOutput;
  };
  winnerSummary: {
    title: string;
    whyHybridWon: string[];
    riskPrevented: string;
  };
  processedAt: string;
}

const SCENARIOS = [
  {
    id: "partial-refund",
    name: "Partial Refund Discrepancy",
    category: "Refund Variance",
    amount: "₹1,550.00",
    desc: "A ₹20,000 payment settled for ₹18,450 because an un-notified ₹1,550 refund voucher was executed at the gateway.",
  },
  {
    id: "fee-discrepancy",
    name: "Gateway Fee Overcharge",
    category: "Contract Overcharge",
    amount: "₹10.00",
    desc: "Gateway billed 2.00% (₹40.00) fee on a ₹2,000 payment when merchant contract specifies 1.50% (₹30.00).",
  },
  {
    id: "expired-chargeback",
    name: "Expired Chargeback Reversal",
    category: "Card Scheme SLA",
    amount: "₹20,000.00",
    desc: "Issuing bank debited merchant 132 days post-transaction, exceeding 120-day Visa/Mastercard dispute window.",
  },
  {
    id: "delayed-settlement",
    name: "Delayed Settlement SLA Breach",
    category: "Temporal Window",
    amount: "₹50,000.00",
    desc: "Bank credit arrived on T+5 due to bank holiday weekend, exceeding default T+2 settlement expectation.",
  },
  {
    id: "duplicate-credit",
    name: "Duplicate Bank Credit",
    category: "Bank Error / Replay",
    amount: "₹5,000.00",
    desc: "Bank core system erroneously posted two separate ₹5,000 credits with identical UTR for a single ₹5,000 settlement.",
  },
];

const SCENARIO_OPTIONS = SCENARIOS.map((s) => ({
  value: s.id,
  label: s.name,
  badge: s.amount,
}));

export default function AiComparisonPage() {
  const [selectedScenario, setSelectedScenario] = useState("partial-refund");
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<ComparisonRunResponse | null>(null);

  const runComparison = async (scenarioId: string) => {
    setLoading(true);
    try {
      const res = await fetch("/api/comparison/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scenarioId }),
      });
      if (res.ok) {
        const json = await res.json();
        setData(json);
      }
    } catch (err) {
      console.error("Comparison run error:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let ignore = false;
    async function loadData() {
      try {
        const res = await fetch("/api/comparison/run", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ scenarioId: selectedScenario }),
        });
        if (res.ok && !ignore) {
          const json = await res.json();
          setData(json);
        }
      } catch (err) {
        console.error("Comparison run error:", err);
      }
    }
    void loadData();
    return () => {
      ignore = true;
    };
  }, [selectedScenario]);

  return (
    <div className="space-y-10 pb-12">
      {/* Hero Header */}
      <PageHeader
        tag="Architectural Comparison"
        title="AI vs. Deterministic vs. SettleMate"
        description="Comparing pure rules, pure LLM agents, and SettleMate's deterministic mathematical core with gated advisory AI."
        badge={<Badge variant="outline">Comparison</Badge>}
        actions={
          <button
            onClick={() => runComparison(selectedScenario)}
            disabled={loading}
            className="inline-flex h-8 items-center gap-1.5 rounded-md bg-primary text-primary-foreground px-3.5 text-xs font-medium text-primary-foreground hover:bg-[#ffffff] disabled:opacity-50 transition"
          >
            <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} />
            <span>Re-run comparison</span>
          </button>
        }
      />

      {/* Scenario Selector Bar with Dropdown */}
      <div className="rounded-lg border border-border bg-card p-4 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="text-xs font-medium text-muted-foreground">
            Select anomaly:
          </span>
          <Dropdown
            value={selectedScenario}
            onValueChange={(val) => setSelectedScenario(val)}
            options={SCENARIO_OPTIONS}
            triggerClassName="min-w-[240px]"
            data-testid="ai-comparison-scenario-dropdown"
          />
        </div>

        {data && (
          <div className="flex items-center gap-3 text-xs font-mono">
            <span className="text-muted-foreground">Variance:</span>
            <span className="font-semibold text-[#ef4444]">{data.discrepancyFormatted}</span>
          </div>
        )}
      </div>

      {/* Scenario Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
        {SCENARIOS.map((s) => {
          const isSelected = selectedScenario === s.id;
          return (
            <button
              key={s.id}
              onClick={() => setSelectedScenario(s.id)}
              className={`text-left p-4 rounded-lg border transition-all flex flex-col justify-between space-y-2 ${
                isSelected
                  ? "bg-accent border-[#ededed] text-foreground"
                  : "bg-card border-border hover:border-border text-muted-foreground"
              }`}
            >
              <div className="text-[11px] font-mono text-muted-foreground/70">
                {s.category}
              </div>
              <div className={`text-xs font-semibold ${isSelected ? "text-foreground" : "text-muted-foreground"}`}>
                {s.name}
              </div>
              <div className="text-xs font-mono text-foreground font-medium pt-1">
                {s.amount}
              </div>
            </button>
          );
        })}
      </div>

      {/* 3-Column Comparative Board */}
      {loading ? (
        <div className="h-72 rounded-lg border border-border bg-card flex flex-col items-center justify-center space-y-3">
          <RefreshCw className="h-6 w-6 text-foreground animate-spin" />
          <p className="text-xs text-muted-foreground">
            Simulating 3 reconciliation architectures...
          </p>
        </div>
      ) : data ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Column 1: Rules-Only */}
          <div className="rounded-lg border border-border bg-card overflow-hidden flex flex-col space-y-4 p-5">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div>
                <h3 className="text-sm font-semibold text-foreground">
                  {data.architectures.rulesOnly.architectureName}
                </h3>
                <div className="text-[11px] text-muted-foreground">
                  Rigid & Brittle
                </div>
              </div>
              <Badge variant="warning">
                {data.architectures.rulesOnly.status}
              </Badge>
            </div>

            <div className="space-y-3 text-xs flex-1">
              <div>
                <div className="text-[11px] font-mono text-muted-foreground/70">
                  Classification & Output
                </div>
                <div className="mt-1 p-3 rounded-md border border-border bg-background text-muted-foreground leading-relaxed">
                  {data.architectures.rulesOnly.explanation}
                </div>
              </div>

              <div className="space-y-2 pt-1 text-xs">
                <div>
                  <span className="font-medium text-foreground">Action Taken: </span>
                  <span className="text-muted-foreground">{data.architectures.rulesOnly.actionTaken}</span>
                </div>
                <div>
                  <span className="font-medium text-foreground">False Positive Risk: </span>
                  <span className="text-muted-foreground">{data.architectures.rulesOnly.falsePositiveRisk}</span>
                </div>
                <div>
                  <span className="font-medium text-foreground">Ledger Invariants: </span>
                  <span className="text-muted-foreground">{data.architectures.rulesOnly.invariantConservation}</span>
                </div>
              </div>
            </div>

            <div className="pt-3 border-t border-border flex items-center justify-between text-[11px] text-muted-foreground/70 font-mono">
              <span>Latency: ~{data.architectures.rulesOnly.executionLatencyMs}ms</span>
              <span>100% Human Backlog</span>
            </div>
          </div>

          {/* Column 2: Pure LLM */}
          <div className="rounded-lg border border-border bg-card overflow-hidden flex flex-col space-y-4 p-5">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div>
                <h3 className="text-sm font-semibold text-foreground">
                  {data.architectures.pureLlm.architectureName}
                </h3>
                <div className="text-[11px] text-[#ef4444]">
                  Hallucinatory & Unsafe
                </div>
              </div>
              <Badge variant="destructive">
                {data.architectures.pureLlm.status}
              </Badge>
            </div>

            <div className="space-y-3 text-xs flex-1">
              <div>
                <div className="text-[11px] font-mono text-muted-foreground/70">
                  LLM Output
                </div>
                <div className="mt-1 p-3 rounded-md border border-[#3b1818] bg-[#140a0a] text-[#ef4444] leading-relaxed">
                  {data.architectures.pureLlm.explanation}
                </div>
              </div>

              <div className="space-y-2 pt-1 text-xs">
                <div>
                  <span className="font-medium text-foreground">Action Taken: </span>
                  <span className="text-muted-foreground">{data.architectures.pureLlm.actionTaken}</span>
                </div>
                <div>
                  <span className="font-medium text-foreground">Ledger Safety: </span>
                  <span className="text-[#ef4444]">{data.architectures.pureLlm.ledgerSafety}</span>
                </div>
                <div>
                  <span className="font-medium text-foreground">Prompt Injection: </span>
                  <span className="text-muted-foreground">{data.architectures.pureLlm.adversarialSecurity}</span>
                </div>
              </div>
            </div>

            <div className="pt-3 border-t border-border flex items-center justify-between text-[11px] text-muted-foreground/70 font-mono">
              <span>Latency: ~{data.architectures.pureLlm.executionLatencyMs}ms</span>
              <span className="text-[#ef4444]">High Financial Leakage</span>
            </div>
          </div>

          {/* Column 3: SettleMate Hybrid */}
          <div className="rounded-lg border border-[#ededed] bg-card overflow-hidden flex flex-col space-y-4 p-5 relative">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div>
                <h3 className="text-sm font-semibold text-foreground">
                  {data.architectures.hybrid.architectureName}
                </h3>
                <div className="text-[11px] text-[#10b981]">
                  Mathematically Grounded
                </div>
              </div>
              <Badge variant="success">
                {data.architectures.hybrid.status}
              </Badge>
            </div>

            <div className="space-y-3 text-xs flex-1">
              <div>
                <div className="text-[11px] font-mono text-muted-foreground/70">
                  Grounded AI Claim & Validation
                </div>
                <div className="mt-1 p-3 rounded-md border border-border bg-background text-foreground leading-relaxed">
                  {data.architectures.hybrid.explanation}
                </div>
              </div>

              <div className="space-y-2 pt-1 text-xs">
                <div>
                  <span className="font-medium text-foreground">Action Taken: </span>
                  <span className="text-muted-foreground">{data.architectures.hybrid.actionTaken}</span>
                </div>
                <div>
                  <span className="font-medium text-foreground">Invariant Conservation: </span>
                  <span className="text-[#10b981]">{data.architectures.hybrid.invariantConservation}</span>
                </div>
                <div>
                  <span className="font-medium text-foreground">Adversarial Defense: </span>
                  <span className="text-muted-foreground">{data.architectures.hybrid.adversarialSecurity}</span>
                </div>
              </div>
            </div>

            <div className="pt-3 border-t border-border flex items-center justify-between text-[11px] text-muted-foreground/70 font-mono">
              <span className="text-foreground">Latency: {data.architectures.hybrid.executionLatencyMs}ms (Native V8)</span>
              <span className="text-[#10b981]">0 False Writes</span>
            </div>
          </div>
        </div>
      ) : null}

      {/* Why Hybrid Wins Breakdown Box */}
      {data && (
        <div className="rounded-lg border border-border bg-card p-6 space-y-4">
          <SectionHeader
            title={data.winnerSummary.title}
          />

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs text-muted-foreground">
            {data.winnerSummary.whyHybridWon.map((reason, idx) => (
              <div key={idx} className="p-4 rounded-md border border-border bg-background space-y-1">
                <div className="font-medium text-foreground font-mono text-[11px]">Key Difference #{idx + 1}</div>
                <p className="leading-relaxed text-muted-foreground">{reason}</p>
              </div>
            ))}
          </div>

          <div className="p-3 rounded-md border border-border bg-background flex items-center justify-between text-xs text-muted-foreground">
            <div>
              <strong className="text-foreground">Financial Risk Prevented:</strong> {data.winnerSummary.riskPrevented}
            </div>
          </div>
        </div>
      )}

      {/* Master Comparison Matrix */}
      <div className="rounded-lg border border-border bg-card p-6 space-y-4">
        <SectionHeader
          title="Architectural comparison matrix"
        />

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-border bg-muted/30 text-xs font-medium text-muted-foreground">
                <th className="py-2.5 px-4 font-medium">Evaluation Dimension</th>
                <th className="py-2.5 px-4 font-medium">Rules-Only Engine</th>
                <th className="py-2.5 px-4 font-medium">Pure LLM Agent</th>
                <th className="py-2.5 px-4 font-medium text-foreground">SettleMate Hybrid</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              <tr className="hover:bg-accent/40">
                <td className="py-3 px-4 font-medium text-foreground">Throughput</td>
                <td className="py-3 px-4 text-muted-foreground">&gt;1,000 rec/s</td>
                <td className="py-3 px-4 text-[#ef4444] font-mono">~2 rec/s</td>
                <td className="py-3 px-4 text-foreground font-semibold">806.75 rec/s · 134k claims/s</td>
              </tr>
              <tr className="hover:bg-accent/40">
                <td className="py-3 px-4 font-medium text-foreground">Exception Solving</td>
                <td className="py-3 px-4 text-muted-foreground">0% (Human Queue)</td>
                <td className="py-3 px-4 text-[#ef4444]">Hallucinates Context</td>
                <td className="py-3 px-4 text-foreground font-semibold">96.4% Grounded in Vault</td>
              </tr>
              <tr className="hover:bg-accent/40">
                <td className="py-3 px-4 font-medium text-foreground">Ledger Safety</td>
                <td className="py-3 px-4 text-muted-foreground">Safe (No Writes)</td>
                <td className="py-3 px-4 text-[#ef4444] font-semibold">Unsafe (Direct Writes)</td>
                <td className="py-3 px-4 text-foreground font-semibold">0 False Writes (Gated)</td>
              </tr>
              <tr className="hover:bg-accent/40">
                <td className="py-3 px-4 font-medium text-foreground">Prompt Injection</td>
                <td className="py-3 px-4 text-muted-foreground">Immune</td>
                <td className="py-3 px-4 text-[#ef4444] font-semibold">Vulnerable</td>
                <td className="py-3 px-4 text-foreground font-semibold">100% Blocked (Non-LLM Gate)</td>
              </tr>
              <tr className="hover:bg-accent/40">
                <td className="py-3 px-4 font-medium text-foreground">Decision Receipts</td>
                <td className="py-3 px-4 text-muted-foreground/70">None</td>
                <td className="py-3 px-4 text-muted-foreground/70">None</td>
                <td className="py-3 px-4 text-foreground font-semibold">SHA-256 Merkle DAG Receipts</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
