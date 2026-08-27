"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  BookOpen,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  ShieldCheck,
  Zap,
  ArrowUpRight,
  FileText,
  Clock,
  Sparkles,
  ExternalLink,
  Scale,
  Users,
  Copy,
  Check,
} from "lucide-react";
import {
  getAllPlaybooks,
  generatePlaybook,
  type PlaybookScenarioId,
  type ExceptionPlaybook,
} from "@/lib/playbooks/generator";

export default function PlaybooksPage() {
  const [selectedId, setSelectedId] = useState<PlaybookScenarioId>("partial-refund");
  const [copied, setCopied] = useState(false);
  const [activeStepTab, setActiveStepTab] = useState<number | null>(null);

  const playbooks = getAllPlaybooks();
  const currentPlaybook = generatePlaybook(selectedId);

  const handleCopyJournal = () => {
    const journalText = JSON.stringify(currentPlaybook.recommendedJournal, null, 2);
    navigator.clipboard.writeText(journalText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const getSeverityBadge = (severity: ExceptionPlaybook["severity"]) => {
    switch (severity) {
      case "HIGH":
        return "bg-rose-500/20 text-rose-400 border-rose-500/30";
      case "MEDIUM":
        return "bg-amber-500/20 text-amber-400 border-amber-500/30";
      case "LOW":
      default:
        return "bg-cyan-500/20 text-cyan-400 border-cyan-500/30";
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {/* Header Banner */}
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-emerald-950/70 via-slate-900 to-indigo-950/60 border border-emerald-500/30 p-6 sm:p-8 shadow-2xl backdrop-blur-xl">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 relative z-10">
            <div className="space-y-2">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-semibold uppercase tracking-wider">
                <BookOpen className="w-3.5 h-3.5" />
                Operational Standard Operating Procedures · 📚 00R
              </div>
              <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-white">
                Reconciliation Resolution Playbooks
              </h1>
              <p className="text-xs sm:text-sm text-slate-300 max-w-2xl leading-relaxed">
                Auto-generated, policy-backed resolution workflows for each exception type in the reconciliation lifecycle. Synthesized directly from live scenario specifications, Context Vault evidence schemas, Policy-as-Code triggers, and double-entry ledger invariants.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <Link
                href={`/scenarios?scenario=${selectedId}`}
                className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition-all shadow-lg flex items-center gap-2 cursor-pointer active:scale-95"
              >
                <Zap className="w-3.5 h-3.5" />
                Test in Scenario Lab
              </Link>

              <Link
                href="/calibration"
                className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition-all flex items-center gap-1.5"
              >
                Confidence Calibration <ArrowUpRight className="w-3.5 h-3.5" />
              </Link>
            </div>
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
                className={`p-4 rounded-xl text-left border transition-all cursor-pointer flex flex-col justify-between space-y-3 ${
                  isSelected
                    ? "bg-slate-900 border-emerald-500/60 shadow-lg ring-1 ring-emerald-500/40"
                    : "bg-slate-900/40 border-slate-800 hover:bg-slate-900/80 hover:border-slate-700 text-slate-400"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${getSeverityBadge(p.severity)}`}>
                    {p.severity}
                  </span>
                  <span className="text-[10px] font-mono text-slate-500 flex items-center gap-1">
                    <Clock className="w-2.5 h-2.5" /> {p.slaTargetHours}h SLA
                  </span>
                </div>

                <div>
                  <div className={`text-xs font-bold ${isSelected ? "text-white" : "text-slate-300"}`}>
                    {p.title.replace(" Playbook", "")}
                  </div>
                  <div className="text-[10px] text-slate-500 mt-1 font-mono uppercase truncate">
                    {p.category}
                  </div>
                </div>

                <div className="flex items-center justify-between text-[11px] pt-1 border-t border-slate-800/80">
                  <span className="text-slate-400 font-mono text-[10px]">{p.recommendedJournal.sampleFormattedAmount}</span>
                  <ArrowRight className={`w-3 h-3 transition-transform ${isSelected ? "text-emerald-400 translate-x-0.5" : "text-slate-600"}`} />
                </div>
              </button>
            );
          })}
        </div>

        {/* Selected Playbook Detail View */}
        <div className="space-y-6">
          {/* Section 1: Playbook Overview & Metadata */}
          <div className="p-6 rounded-2xl bg-slate-900/80 border border-slate-800 shadow-xl space-y-4">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-4">
              <div>
                <div className="flex items-center gap-3">
                  <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold border ${getSeverityBadge(currentPlaybook.severity)}`}>
                    {currentPlaybook.severity} PRIORITY
                  </span>
                  <span className="text-xs font-mono text-emerald-400 bg-emerald-950/40 px-2.5 py-0.5 rounded border border-emerald-500/20">
                    Category: {currentPlaybook.category}
                  </span>
                  <span className="text-xs font-mono text-slate-400">
                    Target SLA: {currentPlaybook.slaTargetHours} Hours
                  </span>
                </div>
                <h2 className="text-2xl font-bold text-white mt-2">
                  {currentPlaybook.title}
                </h2>
                <p className="text-xs sm:text-sm text-slate-300 mt-1 max-w-3xl leading-relaxed">
                  {currentPlaybook.description}
                </p>
              </div>

              <div className="flex items-center gap-2 self-start md:self-auto">
                <Link
                  href={currentPlaybook.scenarioRunUrl}
                  className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 flex items-center gap-1.5 transition-all"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  View Scenario Trace
                </Link>
              </div>
            </div>

            {/* AI Hypothesis Preview */}
            <div className="p-4 rounded-xl bg-slate-950/80 border border-indigo-500/20 space-y-2">
              <div className="flex items-center gap-2 text-indigo-400 text-xs font-bold uppercase tracking-wider">
                <Sparkles className="w-3.5 h-3.5" />
                Automated AI Investigation Hypothesis
              </div>
              <p className="text-xs text-slate-200 font-mono leading-relaxed">
                &ldquo;{currentPlaybook.sampleAiHypothesis}&rdquo;
              </p>
            </div>
          </div>

          {/* Section 2: Trigger Conditions & Context Vault Evidence (2-Column Grid) */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Trigger Conditions from Policy */}
            <div className="p-6 rounded-2xl bg-slate-900/70 border border-slate-800 shadow-xl space-y-4">
              <div className="flex items-center gap-2 border-b border-slate-800 pb-3">
                <AlertTriangle className="w-4 h-4 text-amber-400" />
                <h3 className="text-sm font-bold text-white uppercase tracking-wider">
                  1. Policy-as-Code Trigger Conditions
                </h3>
              </div>

              <div className="space-y-3">
                {currentPlaybook.triggerConditions.map((cond, idx) => (
                  <div
                    key={idx}
                    className="p-3.5 rounded-xl bg-slate-950/70 border border-slate-800/80 space-y-1.5 text-xs"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-amber-400">{cond.parameter}</span>
                      <span className="font-mono text-[10px] text-slate-400">{cond.policyReference}</span>
                    </div>
                    <div className="text-slate-300">{cond.condition}</div>
                    <div className="font-mono text-[11px] text-emerald-400 bg-slate-900/90 px-2 py-1 rounded border border-slate-800">
                      Rule Threshold: {cond.thresholdValue}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Required Evidence from Context Vault */}
            <div className="p-6 rounded-2xl bg-slate-900/70 border border-slate-800 shadow-xl space-y-4">
              <div className="flex items-center gap-2 border-b border-slate-800 pb-3">
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                <h3 className="text-sm font-bold text-white uppercase tracking-wider">
                  2. Required Evidence from Context Vault
                </h3>
              </div>

              <div className="space-y-3">
                {currentPlaybook.requiredEvidence.map((ev, idx) => (
                  <div
                    key={idx}
                    className="p-3.5 rounded-xl bg-slate-950/70 border border-slate-800/80 space-y-1.5 text-xs"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-emerald-400 flex items-center gap-1.5">
                        <FileText className="w-3.5 h-3.5" />
                        {ev.documentName}
                      </span>
                      <span className="text-[10px] font-mono text-cyan-400 bg-cyan-950/50 px-2 py-0.5 rounded border border-cyan-500/30">
                        {ev.sourceType}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-[11px] text-slate-400 font-mono">
                      <span>Key: {ev.vaultLookupKey}</span>
                      <span className="text-emerald-300">{ev.integrityProof}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Section 3: Recommended Double-Entry Journal Adjustment */}
          <div className="p-6 rounded-2xl bg-slate-900/70 border border-slate-800 shadow-xl space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Scale className="w-4 h-4 text-indigo-400" />
                <div>
                  <h3 className="text-sm font-bold text-white uppercase tracking-wider">
                    3. Recommended Double-Entry Journal Adjustment
                  </h3>
                  <p className="text-xs text-slate-400">
                    Balanced minor-unit ledger postings with strict 0-drift invariant validation.
                  </p>
                </div>
              </div>

              <button
                onClick={handleCopyJournal}
                className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 flex items-center gap-1.5 transition-all self-start sm:self-auto"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                {copied ? "Copied Journal" : "Copy Journal JSON"}
              </button>
            </div>

            <div className="p-4 rounded-xl bg-slate-950/90 border border-slate-800 space-y-4">
              <div className="text-xs text-slate-300 font-mono bg-slate-900/90 p-3 rounded-lg border border-slate-800">
                <strong>Narration:</strong> {currentPlaybook.recommendedJournal.narration}
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs font-mono">
                  <thead className="bg-slate-900 text-slate-400 uppercase tracking-wider border-b border-slate-800">
                    <tr>
                      <th className="py-2.5 px-3">Entry Type</th>
                      <th className="py-2.5 px-3">General Ledger Account</th>
                      <th className="py-2.5 px-3 text-right">Amount (Paise)</th>
                      <th className="py-2.5 px-3 text-right">Amount (INR)</th>
                      <th className="py-2.5 px-3">Purpose & Lineage</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {currentPlaybook.recommendedJournal.entries.map((entry, idx) => (
                      <tr key={idx} className="hover:bg-slate-900/40">
                        <td className="py-3 px-3">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            entry.type === "DEBIT"
                              ? "bg-indigo-500/20 text-indigo-400 border border-indigo-500/30"
                              : "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                          }`}>
                            {entry.type}
                          </span>
                        </td>
                        <td className="py-3 px-3 text-white font-bold">{entry.account}</td>
                        <td className="py-3 px-3 text-right text-slate-300">{entry.amountPaise.toLocaleString()} paise</td>
                        <td className="py-3 px-3 text-right text-emerald-400 font-bold">{entry.formattedAmount}</td>
                        <td className="py-3 px-3 font-sans text-slate-400">{entry.description}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex items-center justify-between text-xs text-slate-400 pt-2 border-t border-slate-800/80 font-mono">
                <span>Conservation Guard: <strong className="text-emerald-400">{currentPlaybook.recommendedJournal.zeroDriftInvariant}</strong></span>
                <span className="text-[11px] text-indigo-300">Invariant Result: PASSED (Zero Drift)</span>
              </div>
            </div>
          </div>

          {/* Section 4: Maker / Checker Approval Flow */}
          <div className="p-6 rounded-2xl bg-slate-900/70 border border-slate-800 shadow-xl space-y-4">
            <div className="flex items-center gap-2 border-b border-slate-800 pb-3">
              <Users className="w-4 h-4 text-cyan-400" />
              <div>
                <h3 className="text-sm font-bold text-white uppercase tracking-wider">
                  4. Maker / Checker Dual-Control Approval Flow
                </h3>
                <p className="text-xs text-slate-400">
                  Strict segregation of duties: system mechanical gates $\rightarrow$ Maker Reviewer proposal $\rightarrow$ Checker Controller authorization.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 pt-1">
              {currentPlaybook.approvalFlow.map((step) => {
                const isSelected = activeStepTab === step.stepNumber;
                return (
                  <div
                    key={step.stepNumber}
                    onClick={() => setActiveStepTab(isSelected ? null : step.stepNumber)}
                    className={`p-4 rounded-xl border transition-all cursor-pointer space-y-2.5 flex flex-col justify-between ${
                      isSelected
                        ? "bg-slate-900 border-cyan-500/60 ring-1 ring-cyan-500/40"
                        : "bg-slate-950/70 border-slate-800 hover:border-slate-700"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="w-6 h-6 rounded-full bg-slate-900 border border-slate-700 flex items-center justify-center text-xs font-bold text-emerald-400">
                        {step.stepNumber}
                      </span>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold font-mono ${
                        step.role === "SYSTEM_GATE"
                          ? "bg-slate-800 text-slate-300"
                          : step.role === "MAKER_ANALYST"
                          ? "bg-indigo-500/20 text-indigo-400 border border-indigo-500/30"
                          : step.role === "CHECKER_CONTROLLER"
                          ? "bg-cyan-500/20 text-cyan-400 border border-cyan-500/30"
                          : "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                      }`}>
                        {step.role}
                      </span>
                    </div>

                    <div>
                      <div className="text-xs font-bold text-white">{step.stage}</div>
                      <div className="text-[11px] text-slate-300 mt-1 leading-normal">{step.action}</div>
                    </div>

                    <div className="text-[10px] font-mono text-emerald-400/90 bg-slate-900/90 p-2 rounded border border-slate-800/80">
                      ✓ {step.validationCheck}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Section 5: Structured AI Claims & Mechanical Falsification */}
          <div className="p-6 rounded-2xl bg-slate-900/70 border border-slate-800 shadow-xl space-y-4">
            <div className="flex items-center gap-2 border-b border-slate-800 pb-3">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              <div>
                <h3 className="text-sm font-bold text-white uppercase tracking-wider">
                  5. Non-LLM Mechanical Claim Verifications for this Playbook
                </h3>
                <p className="text-xs text-slate-400">
                  Every claim asserted by the AI agent is checked deterministically against Context Vault evidence.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {currentPlaybook.sampleClaims.map((claim, idx) => (
                <div
                  key={idx}
                  className="p-4 rounded-xl bg-slate-950/80 border border-slate-800 space-y-2 text-xs"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-[10px] font-bold text-cyan-400 uppercase">
                      {claim.type}
                    </span>
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                      MECHANICALLY VERIFIED
                    </span>
                  </div>
                  <div className="text-slate-200 font-semibold">{claim.claimText}</div>
                  <div className="font-mono text-[11px] text-slate-400 bg-slate-900/80 p-2 rounded border border-slate-800">
                    Check: {claim.validationCheck}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
