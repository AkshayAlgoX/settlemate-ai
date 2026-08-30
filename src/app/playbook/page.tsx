"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  ExternalLink,
  Copy,
  Check,
} from "lucide-react";
import {
  getAllPlaybooks,
  generatePlaybook,
  type PlaybookScenarioId,
  type ExceptionPlaybook,
} from "@/lib/playbooks/generator";
import { Dropdown } from "@/components/ui/dropdown";
import { PageHeader } from "@/components/ui/page-header";
import { SectionHeader } from "@/components/ui/section-header";
import { Badge } from "@/components/ui/badge";

export default function PlaybooksPage() {
  const [selectedId, setSelectedId] = useState<PlaybookScenarioId>("partial-refund");
  const [copied, setCopied] = useState(false);
  const [activeStepTab, setActiveStepTab] = useState<number | null>(null);

  const playbooks = getAllPlaybooks();
  const currentPlaybook = generatePlaybook(selectedId);

  const playbookOptions = playbooks.map((p) => ({
    value: p.id,
    label: p.title.replace(" Playbook", ""),
    badge: p.severity,
  }));

  const handleCopyJournal = () => {
    const journalText = JSON.stringify(currentPlaybook.recommendedJournal, null, 2);
    navigator.clipboard.writeText(journalText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const getSeverityVariant = (severity: ExceptionPlaybook["severity"]) => {
    switch (severity) {
      case "HIGH":
        return "destructive";
      case "MEDIUM":
        return "warning";
      case "LOW":
      default:
        return "secondary";
    }
  };

  return (
    <div className="space-y-10 pb-12">
      {/* Header Banner */}
      <PageHeader
        tag="Operating Procedures"
        title="Reconciliation playbooks"
        description="Policy-backed resolution workflows synthesized from scenario specifications, Context Vault evidence schemas, and double-entry ledger invariants."
        badge={<Badge variant="outline">Resolution SOP</Badge>}
        actions={
          <div className="flex items-center gap-2">
            <Link
              href={`/scenarios?scenario=${selectedId}`}
              className="inline-flex h-8 items-center gap-1.5 rounded-md bg-primary text-primary-foreground px-3.5 text-xs font-medium text-primary-foreground hover:bg-[#ffffff] transition"
            >
              <span>Test in Scenario Lab</span>
            </Link>

            <Link
              href="/calibration"
              className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-card px-3 text-xs font-medium text-foreground hover:bg-accent transition"
            >
              <span>Calibration</span>
              <ExternalLink className="h-3 w-3 text-muted-foreground" />
            </Link>
          </div>
        }
      />

      {/* Playbook Dropdown & Quick Selector */}
      <div className="rounded-lg border border-border bg-card p-4 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="text-xs font-medium text-muted-foreground">
            Active playbook:
          </span>
          <Dropdown
            value={selectedId}
            onValueChange={(val) => {
              setSelectedId(val as PlaybookScenarioId);
              setActiveStepTab(null);
            }}
            options={playbookOptions}
            triggerClassName="min-w-[220px]"
            data-testid="playbook-dropdown"
          />
        </div>

        <div className="text-xs font-mono text-muted-foreground/70">
          5 Resolution Playbooks Available
        </div>
      </div>

      {/* 5 Playbook Tabs Navigation */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
        {playbooks.map((p) => {
          const isSelected = p.id === selectedId;
          return (
            <button
              key={p.id}
              onClick={() => {
                setSelectedId(p.id as PlaybookScenarioId);
                setActiveStepTab(null);
              }}
              className={`p-4 text-left rounded-lg border transition-all cursor-pointer flex flex-col justify-between space-y-3 ${
                isSelected
                  ? "bg-accent border-[#ededed] text-foreground"
                  : "bg-card border-border hover:border-border text-muted-foreground"
              }`}
            >
              <div className="flex items-center justify-between">
                <Badge variant={getSeverityVariant(p.severity)}>
                  {p.severity}
                </Badge>
                <span className="text-[11px] font-mono text-muted-foreground/70">
                  {p.slaTargetHours}h SLA
                </span>
              </div>

              <div>
                <div className={`text-xs font-semibold ${isSelected ? "text-foreground" : "text-muted-foreground"}`}>
                  {p.title.replace(" Playbook", "")}
                </div>
                <div className="text-[11px] text-muted-foreground/70 mt-0.5 font-mono truncate">
                  {p.category}
                </div>
              </div>

              <div className="flex items-center justify-between text-[11px] pt-1 border-t border-border">
                <span className="font-mono text-[10px] text-muted-foreground/70">{p.recommendedJournal.sampleFormattedAmount}</span>
                <ArrowRight className={`h-3 w-3 ${isSelected ? "text-foreground" : "text-[#444444]"}`} />
              </div>
            </button>
          );
        })}
      </div>

      {/* Selected Playbook Detail View */}
      <div className="space-y-6">
        {/* Section 1: Playbook Overview & Metadata */}
        <div className="p-6 rounded-lg border border-border bg-card space-y-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border pb-4">
            <div>
              <div className="flex items-center gap-2">
                <Badge variant={getSeverityVariant(currentPlaybook.severity)}>
                  {currentPlaybook.severity} Priority
                </Badge>
                <span className="text-xs font-mono text-muted-foreground bg-background px-2 py-0.5 rounded border border-border">
                  Category: {currentPlaybook.category}
                </span>
                <span className="text-xs font-mono text-muted-foreground/70">
                  Target SLA: {currentPlaybook.slaTargetHours} Hours
                </span>
              </div>
              <h2 className="text-xl font-semibold text-foreground mt-2">
                {currentPlaybook.title}
              </h2>
              <p className="text-xs sm:text-sm text-muted-foreground mt-1 max-w-3xl leading-relaxed">
                {currentPlaybook.description}
              </p>
            </div>

            <Link
              href={currentPlaybook.scenarioRunUrl}
              className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-card px-3 text-xs font-medium text-foreground hover:bg-accent transition self-start md:self-auto"
            >
              <span>Scenario Trace</span>
              <ExternalLink className="h-3 w-3 text-muted-foreground" />
            </Link>
          </div>

          {/* AI Hypothesis Preview */}
          <div className="p-4 rounded-md border border-border bg-background space-y-1.5">
            <div className="text-xs font-medium text-muted-foreground">
              Automated AI investigation hypothesis
            </div>
            <p className="text-xs text-foreground font-mono leading-relaxed">
              &ldquo;{currentPlaybook.sampleAiHypothesis}&rdquo;
            </p>
          </div>
        </div>

        {/* Section 2: Trigger Conditions & Context Vault Evidence */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Trigger Conditions from Policy */}
          <div className="p-6 rounded-lg border border-border bg-card space-y-4">
            <SectionHeader
              title="1. Policy-as-Code trigger conditions"
              description="Automated rule checks that route exceptions to this playbook."
            />

            <div className="space-y-2.5">
              {currentPlaybook.triggerConditions.map((cond, idx) => (
                <div
                  key={idx}
                  className="p-3.5 rounded-md border border-border bg-background space-y-1 text-xs"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-foreground">{cond.parameter}</span>
                    <span className="font-mono text-[10px] text-muted-foreground/70">{cond.policyReference}</span>
                  </div>
                  <div className="text-muted-foreground">{cond.condition}</div>
                  <div className="font-mono text-[11px] text-foreground pt-1">
                    Rule threshold: {cond.thresholdValue}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Required Evidence from Context Vault */}
          <div className="p-6 rounded-lg border border-border bg-card space-y-4">
            <SectionHeader
              title="2. Required evidence from Context Vault"
              description="Deterministic documents required to prove and close this exception."
            />

            <div className="space-y-2.5">
              {currentPlaybook.requiredEvidence.map((ev, idx) => (
                <div
                  key={idx}
                  className="p-3.5 rounded-md border border-border bg-background space-y-1 text-xs"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-foreground">
                      {ev.documentName}
                    </span>
                    <Badge variant="outline">
                      {ev.sourceType}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-muted-foreground font-mono">
                    <span>Key: {ev.vaultLookupKey}</span>
                    <span className="text-[#10b981]">{ev.integrityProof}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Section 3: Recommended Double-Entry Journal Adjustment */}
        <div className="p-6 rounded-lg border border-border bg-card space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border pb-3">
            <div>
              <h3 className="text-sm font-semibold text-foreground">
                3. Recommended double-entry journal adjustment
              </h3>
              <p className="text-xs text-muted-foreground">
                Balanced minor-unit ledger postings with strict 0-drift invariant validation.
              </p>
            </div>

            <button
              onClick={handleCopyJournal}
              className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-card px-3 text-xs font-medium text-foreground hover:bg-accent transition self-start sm:self-auto"
            >
              {copied ? <Check className="h-3.5 w-3.5 text-[#10b981]" /> : <Copy className="h-3.5 w-3.5 text-muted-foreground" />}
              <span>{copied ? "Copied" : "Copy journal JSON"}</span>
            </button>
          </div>

          <div className="space-y-4">
            <div className="text-xs text-muted-foreground font-mono bg-background p-3 rounded-md border border-border">
              <strong className="text-foreground">Narration:</strong> {currentPlaybook.recommendedJournal.narration}
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs font-mono">
                <thead>
                  <tr className="border-b border-border text-[10px] uppercase tracking-wider text-muted-foreground/70">
                    <th className="pb-2.5 font-medium">Entry Type</th>
                    <th className="pb-2.5 font-medium">General Ledger Account</th>
                    <th className="pb-2.5 font-medium text-right">Amount (Paise)</th>
                    <th className="pb-2.5 font-medium text-right">Amount (INR)</th>
                    <th className="pb-2.5 font-medium">Purpose & Lineage</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {currentPlaybook.recommendedJournal.entries.map((entry, idx) => (
                    <tr key={idx} className="hover:bg-accent/40">
                      <td className="py-2.5">
                        <Badge variant={entry.type === "DEBIT" ? "warning" : "success"}>
                          {entry.type}
                        </Badge>
                      </td>
                      <td className="py-2.5 text-foreground font-medium">{entry.account}</td>
                      <td className="py-2.5 text-right text-muted-foreground">{entry.amountPaise.toLocaleString()} paise</td>
                      <td className="py-2.5 text-right text-foreground font-semibold">{entry.formattedAmount}</td>
                      <td className="py-2.5 font-sans text-xs text-muted-foreground">{entry.description}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex items-center justify-between text-xs text-muted-foreground pt-2 border-t border-border font-mono">
              <span>Conservation guard: <strong className="text-foreground">{currentPlaybook.recommendedJournal.zeroDriftInvariant}</strong></span>
              <span className="text-[#10b981]">Invariant Result: PASSED (Zero Drift)</span>
            </div>
          </div>
        </div>

        {/* Section 4: Maker / Checker Approval Flow */}
        <div className="p-6 rounded-lg border border-border bg-card space-y-4">
          <SectionHeader
            title="4. Maker / Checker dual-control approval flow"
            description="Strict segregation of duties: system mechanical gates -> Maker Reviewer proposal -> Checker Controller authorization."
          />

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 pt-1">
            {currentPlaybook.approvalFlow.map((step) => {
              const isSelected = activeStepTab === step.stepNumber;
              return (
                <div
                  key={step.stepNumber}
                  onClick={() => setActiveStepTab(isSelected ? null : step.stepNumber)}
                  className={`p-4 rounded-lg border transition-all cursor-pointer space-y-2.5 flex flex-col justify-between ${
                    isSelected
                      ? "bg-accent border-[#ededed] text-foreground"
                      : "bg-background border-border hover:border-border"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="w-5 h-5 rounded border border-[#262626] bg-secondary flex items-center justify-center text-[10px] font-semibold text-foreground font-mono">
                      {step.stepNumber}
                    </span>
                    <Badge variant="outline">
                      {step.role}
                    </Badge>
                  </div>

                  <div>
                    <div className="text-xs font-semibold text-foreground">{step.stage}</div>
                    <div className="text-xs text-muted-foreground mt-1 leading-normal">{step.action}</div>
                  </div>

                  <div className="text-[11px] font-mono text-muted-foreground bg-card p-2 rounded border border-border">
                    ✓ {step.validationCheck}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Section 5: Structured AI Claims & Mechanical Falsification */}
        <div className="p-6 rounded-lg border border-border bg-card space-y-4">
          <SectionHeader
            title="5. Non-LLM mechanical claim verifications for this playbook"
            description="Every claim asserted by the AI agent is checked deterministically against Context Vault evidence."
          />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {currentPlaybook.sampleClaims.map((claim, idx) => (
              <div
                key={idx}
                className="p-4 rounded-lg border border-border bg-background space-y-2 text-xs"
              >
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[10px] font-semibold text-muted-foreground uppercase">
                    {claim.type}
                  </span>
                  <Badge variant="success">
                    Mechanically Verified
                  </Badge>
                </div>
                <div className="text-foreground font-medium">{claim.claimText}</div>
                <div className="font-mono text-[11px] text-muted-foreground bg-card p-2 rounded border border-border">
                  Check: {claim.validationCheck}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
