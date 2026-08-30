"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import {
  RefreshCw,
  AlertTriangle,
  ExternalLink,
  Sliders,
  ChevronRight,
  Filter,
  Check,
  Copy,
  X,
} from "lucide-react";
import {
  STATIC_FX_RATES,
  SUPPORTED_CURRENCIES,
} from "@/lib/currency/fx-rates";
import {
  generateSampleMultiCurrencyBatch,
  type MultiCurrencyTxnInput,
  type MultiCurrencyReconciliationResult,
  type ConvertedTxnDetail,
} from "@/lib/currency/currency-types";
import { Dropdown } from "@/components/ui/dropdown";
import { PageHeader } from "@/components/ui/page-header";
import { SectionHeader } from "@/components/ui/section-header";
import { Badge } from "@/components/ui/badge";

const CURRENCY_OPTIONS = [
  { value: "ALL", label: "All Currencies" },
  ...SUPPORTED_CURRENCIES.map((c) => ({ value: c, label: `${c} (${STATIC_FX_RATES[c]?.symbol || ""})` })),
];

const TYPE_OPTIONS = [
  { value: "ALL", label: "All Types" },
  { value: "payment", label: "Payment" },
  { value: "settlement", label: "Settlement" },
  { value: "bank_transaction", label: "Bank Txn" },
  { value: "refund", label: "Refund" },
];

const BATCH_SIZE_OPTIONS = [
  { value: "20", label: "20 Txns" },
  { value: "30", label: "30 Txns (Default)" },
  { value: "45", label: "45 Txns" },
  { value: "50", label: "50 Txns (Max)" },
];

export default function MultiCurrencyPage() {
  const [sampleCount, setSampleCount] = useState<number>(30);
  const [transactions, setTransactions] = useState<MultiCurrencyTxnInput[]>(() => generateSampleMultiCurrencyBatch(30));
  const [selectedCurrencyFilter, setSelectedCurrencyFilter] = useState<string>("ALL");
  const [selectedTypeFilter, setSelectedTypeFilter] = useState<string>("ALL");
  const [isReconciling, setIsReconciling] = useState(false);
  const [reconResult, setReconResult] = useState<MultiCurrencyReconciliationResult | null>(null);
  const [activeTab, setActiveTab] = useState<"transactions" | "exceptions" | "rates" | "tax" | "math">("transactions");
  const [copiedJson, setCopiedJson] = useState(false);
  const [selectedTxn, setSelectedTxn] = useState<ConvertedTxnDetail | null>(null);

  // Reconcile initial dataset on mount
  useEffect(() => {
    let active = true;

    fetch("/api/v1/multi-currency/reconcile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ transactions }),
    })
      .then((res) => res.json())
      .then((data) => {
        if (active && data?.status === "SUCCESS") {
          setReconResult(data);
        }
      })
      .catch(() => {});

    return () => {
      active = false;
    };
  }, [transactions]);

  // Handler for regenerating sample batch
  const handleGenerateSample = (count: number = sampleCount) => {
    const newTxns = generateSampleMultiCurrencyBatch(count);
    setTransactions(newTxns);
    handleRunReconciliation(newTxns);
  };

  // Handler to execute reconciliation
  const handleRunReconciliation = async (txnsToRun: MultiCurrencyTxnInput[] = transactions) => {
    setIsReconciling(true);
    try {
      const res = await fetch("/api/v1/multi-currency/reconcile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transactions: txnsToRun }),
      });
      const data = await res.json();
      if (data?.status === "SUCCESS") {
        setReconResult(data);
      }
    } catch (err) {
      console.error("Reconciliation error:", err);
    } finally {
      setIsReconciling(false);
    }
  };

  const handleCopyPayloadJson = () => {
    navigator.clipboard.writeText(JSON.stringify(transactions, null, 2));
    setCopiedJson(true);
    setTimeout(() => setCopiedJson(false), 2000);
  };

  // Filter transactions for table
  const filteredTransactions = (reconResult?.convertedTransactions || []).filter((t) => {
    const matchCur = selectedCurrencyFilter === "ALL" || t.originalCurrency === selectedCurrencyFilter;
    const matchType = selectedTypeFilter === "ALL" || t.type === selectedTypeFilter;
    return matchCur && matchType;
  });

  return (
    <div className="space-y-10 pb-12">
      {/* Header Banner */}
      <PageHeader
        tag="Cross-Border Finance"
        title="Multi-currency reconciliation"
        description="Cross-border multi-currency conversion, GST/VAT tax isolation, and zero-drift ledger integrity using exact integer floor division."
        badge={<Badge variant="outline">FX Engine</Badge>}
        actions={
          <div className="flex items-center gap-2">
            <button
              onClick={() => handleGenerateSample(sampleCount)}
              disabled={isReconciling}
              className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-card px-3 text-xs font-medium text-foreground hover:bg-accent transition"
            >
              <RefreshCw className={`h-3 w-3 ${isReconciling ? "animate-spin" : ""}`} />
              <span>Regenerate batch</span>
            </button>

            <Link
              href="/sandbox"
              className="inline-flex h-8 items-center gap-1.5 rounded-md bg-primary text-primary-foreground px-3.5 text-xs font-medium text-primary-foreground hover:bg-[#ffffff] transition"
            >
              <span>Sandbox</span>
              <ExternalLink className="h-3 w-3 text-primary-foreground" />
            </Link>
          </div>
        }
      />

      {/* Top Level Summary Metrics Cards */}
      {reconResult && (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          <div className="rounded-lg border border-border bg-card p-4 space-y-1">
            <div className="text-xl font-semibold text-foreground font-mono">
              {reconResult.summary.formattedTotalGrossINR}
            </div>
            <div className="text-xs font-medium text-foreground">
              Converted gross
            </div>
            <div className="text-[11px] text-muted-foreground/70 font-mono">
              {reconResult.summary.totalGrossConvertedPaise.toLocaleString()} paise
            </div>
          </div>

          <div className="rounded-lg border border-border bg-card p-4 space-y-1">
            <div className="text-xl font-semibold text-foreground font-mono">
              {reconResult.summary.formattedTotalTaxINR}
            </div>
            <div className="text-xs font-medium text-foreground">
              Isolated tax
            </div>
            <div className="text-[11px] text-muted-foreground/70 font-mono">
              {reconResult.summary.totalTaxConvertedPaise.toLocaleString()} paise
            </div>
          </div>

          <div className="rounded-lg border border-border bg-card p-4 space-y-1">
            <div className="text-xl font-semibold text-foreground font-mono">
              {reconResult.summary.formattedTotalNetINR}
            </div>
            <div className="text-xs font-medium text-foreground">
              Converted net
            </div>
            <div className="text-[11px] text-muted-foreground/70 font-mono">
              {reconResult.summary.totalNetConvertedPaise.toLocaleString()} paise
            </div>
          </div>

          <div className="rounded-lg border border-border bg-card p-4 space-y-1">
            <div className="text-xl font-semibold text-foreground font-mono">
              {reconResult.summary.matchRatePct}%
            </div>
            <div className="text-xs font-medium text-foreground">
              Auto-match rate
            </div>
            <div className="text-[11px] text-muted-foreground/70">
              {reconResult.summary.matchedCount} of {reconResult.summary.totalInputTransactions} txns
            </div>
          </div>

          <div className="rounded-lg border border-border bg-card p-4 space-y-1">
            <div className="text-xl font-semibold text-foreground font-mono">
              {reconResult.summary.exceptionCount}
            </div>
            <div className="text-xs font-medium text-foreground">
              Exceptions
            </div>
            <div className="text-[11px] text-muted-foreground/70">
              Discrepancies isolated
            </div>
          </div>
        </div>
      )}

      {/* Dataset Generator Controls */}
      <div className="rounded-lg border border-border bg-card p-4 flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
            <Sliders className="h-3.5 w-3.5 text-muted-foreground" />
            Batch Size:
          </span>
          <Dropdown
            value={String(sampleCount)}
            onValueChange={(val) => {
              const count = Number(val);
              setSampleCount(count);
              handleGenerateSample(count);
            }}
            options={BATCH_SIZE_OPTIONS}
            triggerClassName="min-w-[140px]"
            data-testid="multi-currency-batch-dropdown"
          />
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleCopyPayloadJson}
            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-card px-3 text-xs font-medium text-foreground hover:bg-accent transition"
          >
            {copiedJson ? (
              <>
                <Check className="h-3.5 w-3.5 text-[#10b981]" />
                <span className="text-[#10b981]">Copied</span>
              </>
            ) : (
              <>
                <Copy className="h-3.5 w-3.5 text-muted-foreground" />
                <span>Copy payload JSON</span>
              </>
            )}
          </button>

          <button
            onClick={() => handleRunReconciliation()}
            disabled={isReconciling}
            className="inline-flex h-8 items-center gap-1.5 rounded-md bg-primary text-primary-foreground px-3.5 text-xs font-medium text-primary-foreground hover:bg-[#ffffff] transition"
          >
            <span>{isReconciling ? "Reconciling..." : "Run engine"}</span>
          </button>
        </div>
      </div>

      {/* Main Tab Navigation */}
      <div className="inline-flex rounded-md border border-border bg-card p-0.5">
        {[
          { id: "transactions", label: "Converted transactions" },
          { id: "exceptions", label: `Exceptions (${reconResult?.exceptions.length || 0})` },
          { id: "rates", label: "FX Rates" },
          { id: "tax", label: "Tax jurisdictions" },
          { id: "math", label: "Integer arithmetic" },
        ].map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as "transactions" | "exceptions" | "rates" | "tax" | "math")}
              className={`h-7 px-3 text-xs font-medium rounded transition ${
                isActive
                  ? "bg-secondary text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* TAB 1: Converted Transactions Table */}
      {activeTab === "transactions" && (
        <div className="space-y-4">
          {/* Filter Bar with Dropdowns */}
          <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-lg border border-border bg-card text-xs">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <Filter className="h-3.5 w-3.5 text-muted-foreground" />
                <span>Currency:</span>
              </div>
              <Dropdown
                value={selectedCurrencyFilter}
                onValueChange={setSelectedCurrencyFilter}
                options={CURRENCY_OPTIONS}
                triggerClassName="min-w-[150px]"
                data-testid="multi-currency-currency-dropdown"
              />
            </div>

            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <span>Type:</span>
              </div>
              <Dropdown
                value={selectedTypeFilter}
                onValueChange={setSelectedTypeFilter}
                options={TYPE_OPTIONS}
                triggerClassName="min-w-[140px]"
                data-testid="multi-currency-type-dropdown"
              />
            </div>
          </div>

          {/* Table */}
          <div className="rounded-lg border border-border bg-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-border bg-muted/30 text-xs font-medium text-muted-foreground">
                    <th className="py-2.5 px-4 font-medium">Txn ID & Ref</th>
                    <th className="py-2.5 px-3 font-medium">Type</th>
                    <th className="py-2.5 px-3 font-medium">Currency</th>
                    <th className="py-2.5 px-3 font-medium text-right">Native Amount</th>
                    <th className="py-2.5 px-3 font-medium text-right">Tax (GST/VAT)</th>
                    <th className="py-2.5 px-3 font-medium">FX Rate Applied</th>
                    <th className="py-2.5 px-4 font-medium text-right">Converted INR</th>
                    <th className="py-2.5 px-3 font-medium text-center">Inspect</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filteredTransactions.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-8 text-center text-muted-foreground/70 font-mono">
                        No transactions found for the selected filter.
                      </td>
                    </tr>
                  ) : (
                    filteredTransactions.map((t) => (
                      <tr
                        key={t.id}
                        className="hover:bg-accent/40 transition cursor-pointer"
                        onClick={() => setSelectedTxn(t)}
                      >
                        <td className="py-3 px-4">
                          <div className="font-mono font-medium text-foreground">{t.id}</div>
                          <div className="text-[10px] text-muted-foreground/70 font-mono">Ref: {t.referenceId}</div>
                        </td>
                        <td className="py-3 px-3">
                          <Badge variant="outline">
                            {t.type}
                          </Badge>
                        </td>
                        <td className="py-3 px-3">
                          <span className="font-medium text-foreground font-mono">{t.originalCurrency}</span>
                        </td>
                        <td className="py-3 px-3 text-right font-mono font-medium text-foreground">
                          {t.formattedOriginal}
                          <div className="text-[10px] text-muted-foreground/70">
                            {t.originalAmountMinor.toLocaleString()} minor
                          </div>
                        </td>
                        <td className="py-3 px-3 text-right font-mono">
                          {t.originalTaxMinor > 0 ? (
                            <div>
                              <span className="text-foreground">{t.formattedOriginalTax}</span>
                              <div className="text-[10px] text-muted-foreground/70">{t.taxType}</div>
                            </div>
                          ) : (
                            <span className="text-[#444444]">—</span>
                          )}
                        </td>
                        <td className="py-3 px-3 font-mono text-[11px] text-muted-foreground">
                          1 {t.originalCurrency} = ₹{t.fxConversion.fxRateApplied.toFixed(2)}
                        </td>
                        <td className="py-3 px-4 text-right font-mono font-semibold text-foreground">
                          {t.formattedBaseTotal}
                          <div className="text-[10px] text-muted-foreground/70">
                            {t.baseTotalPaise.toLocaleString()} paise
                          </div>
                        </td>
                        <td className="py-3 px-3 text-center">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedTxn(t);
                            }}
                            className="p-1 rounded border border-border bg-card hover:bg-accent text-muted-foreground hover:text-foreground"
                          >
                            <ChevronRight className="h-3.5 w-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: Multi-Currency Exceptions */}
      {activeTab === "exceptions" && (
        <div className="space-y-4">
          <div className="p-4 rounded-lg border border-border bg-card text-xs text-muted-foreground flex items-center gap-3">
            <AlertTriangle className="h-4 w-4 text-[#ef4444] shrink-0" />
            <div>
              <strong className="text-foreground">Multi-currency discrepancies & tax isolation:</strong> Engine isolates currency mismatches, cross-border VAT withholding gaps, and penny rounding variances before ledger mutation.
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3">
            {reconResult?.exceptions.map((exc) => (
              <div
                key={exc.id}
                className="p-5 rounded-lg border border-border bg-card space-y-3"
              >
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 border-b border-border pb-3">
                  <div className="flex items-center gap-2">
                    <Badge variant="destructive">
                      {exc.status}
                    </Badge>
                    <span className="font-mono font-medium text-foreground text-xs">{exc.paymentId}</span>
                    <span className="text-xs text-muted-foreground/70 font-mono">Order: {exc.orderId}</span>
                  </div>

                  <div className="flex items-center gap-2 text-xs">
                    <span className="text-muted-foreground/70">Variance:</span>
                    <span className="font-semibold font-mono text-[#ef4444]">{exc.formattedMismatchINR}</span>
                    <span className="text-muted-foreground/70 font-mono">({exc.mismatchAmountPaise} paise)</span>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                  <div className="p-3 rounded-md border border-border bg-background space-y-1">
                    <div className="text-[10px] font-mono uppercase text-muted-foreground/70">
                      Root cause analysis
                    </div>
                    <p className="text-muted-foreground font-mono">{exc.rootCause}</p>
                  </div>

                  <div className="p-3 rounded-md border border-border bg-background space-y-1">
                    <div className="text-[10px] font-mono uppercase text-muted-foreground/70">
                      Recommended resolution
                    </div>
                    <p className="text-foreground font-mono">{exc.recommendedAction}</p>
                  </div>
                </div>

                <div className="flex items-center justify-between text-xs text-muted-foreground/70 pt-1 font-mono">
                  <div>
                    Payment: <span className="text-foreground">{exc.paymentCurrency}</span> | Settlement: <span className="text-foreground">{exc.settlementCurrency}</span>
                  </div>
                  <div>
                    Confidence: <span className="text-foreground">{exc.confidenceScore}%</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 3: Static Sovereign FX Rates Table */}
      {activeTab === "rates" && (
        <div className="space-y-4">
          <div className="rounded-lg border border-border bg-card overflow-hidden">
            <table className="w-full text-left text-xs font-mono">
              <thead>
                <tr className="border-b border-border bg-muted/30 text-xs font-medium text-muted-foreground">
                  <th className="py-2.5 px-4 font-medium">Currency Code</th>
                  <th className="py-2.5 px-4 font-medium">Name</th>
                  <th className="py-2.5 px-4 font-medium">Decimals</th>
                  <th className="py-2.5 px-4 font-medium">Minor Unit</th>
                  <th className="py-2.5 px-4 font-medium">Integer Ratio (Num/Denom)</th>
                  <th className="py-2.5 px-4 font-medium text-foreground">Effective INR Rate</th>
                  <th className="py-2.5 px-4 font-medium">Source</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {Object.values(STATIC_FX_RATES).map((r) => (
                  <tr key={r.code} className="hover:bg-accent/40 transition">
                    <td className="py-3 px-4 font-semibold text-foreground">
                      {r.symbol} {r.code}
                    </td>
                    <td className="py-3 px-4 text-muted-foreground font-sans">{r.name}</td>
                    <td className="py-3 px-4 text-muted-foreground/70">{r.decimals}</td>
                    <td className="py-3 px-4 text-muted-foreground">{r.minorUnitName}</td>
                    <td className="py-3 px-4 text-muted-foreground">
                      {r.rateNumerator} / {r.rateDenominator}
                    </td>
                    <td className="py-3 px-4 font-semibold text-foreground">
                      ₹{r.rateToINR.toFixed(4)}
                    </td>
                    <td className="py-3 px-4 text-xs text-muted-foreground/70 font-sans">{r.source}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 4: Tax Breakdown Matrix */}
      {activeTab === "tax" && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="p-5 rounded-lg border border-border bg-card space-y-3">
            <SectionHeader
              title="Cross-border tax isolation principles"
            />
            <ul className="text-xs text-muted-foreground space-y-2 list-disc list-inside leading-relaxed">
              <li>
                <span className="font-medium text-foreground">Domestic GST (18% / 28%):</span> Handled natively in INR paise, matched directly against GSTN e-invoices.
              </li>
              <li>
                <span className="font-medium text-foreground">International VAT (20% EU / UK):</span> Converted to base paise at exact integer floor and isolated into clearing accounts.
              </li>
              <li>
                <span className="font-medium text-foreground">Zero Tax Drift Invariant:</span> Gross Settlement = Net Settlement + Tax Component + Gateway Processing Fee.
              </li>
            </ul>
          </div>

          <div className="p-5 rounded-lg border border-border bg-card space-y-3">
            <SectionHeader
              title="Tax totals by jurisdiction"
            />
            <div className="space-y-2">
              {reconResult?.summary.taxBreakdown.map((t) => (
                <div
                  key={t.taxType}
                  className="p-3 rounded-md border border-border bg-background flex items-center justify-between text-xs font-mono"
                >
                  <div>
                    <div className="font-semibold text-foreground">{t.taxType} Jurisdiction</div>
                    <div className="text-[10px] text-muted-foreground/70">{t.transactionCount} transactions</div>
                  </div>
                  <div className="text-right">
                    <div className="font-semibold text-foreground">{t.formattedTaxINR}</div>
                    <div className="text-[10px] text-muted-foreground/70 font-mono">{t.totalTaxPaise.toLocaleString()} paise</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* TAB 5: Exact Integer Arithmetic Specification */}
      {activeTab === "math" && (
        <div className="p-6 rounded-lg border border-border bg-card space-y-6">
          <SectionHeader
            title="Multi-currency integer arithmetic invariants"
            description="Floating-point arithmetic (IEEE-754) introduces non-deterministic rounding errors. SettleMate enforces integer floor division."
          />

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
            <div className="p-4 rounded-md border border-border bg-background space-y-1.5">
              <div className="font-semibold text-foreground">1. Integer minor units</div>
              <p className="text-muted-foreground leading-relaxed">
                All amounts inside the engine are stored as integer paise (1/100 of ₹1 INR) or native minor units.
              </p>
            </div>

            <div className="p-4 rounded-md border border-border bg-background space-y-1.5">
              <div className="font-semibold text-foreground">2. Floor rounding guard</div>
              <p className="text-muted-foreground leading-relaxed">
                Division rounds down (floor) during conversion to prevent phantom revenue creation.
              </p>
            </div>

            <div className="p-4 rounded-md border border-border bg-background space-y-1.5">
              <div className="font-semibold text-foreground">3. Sovereign ratio storage</div>
              <p className="text-muted-foreground leading-relaxed">
                FX rates are stored as immutable scaled integer fractions avoiding float precision loss.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Transaction Inspection Drawer */}
      {selectedTxn && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs">
          <div className="bg-card border border-border max-w-lg w-full p-6 rounded-lg space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <h3 className="text-sm font-semibold text-foreground font-mono">{selectedTxn.id}</h3>
              <button
                onClick={() => setSelectedTxn(null)}
                className="text-muted-foreground/70 hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="p-3 rounded-md border border-border bg-background">
                <div className="text-muted-foreground/70 text-[10px] uppercase">Original Amount</div>
                <div className="text-sm font-semibold text-foreground font-mono mt-1">
                  {selectedTxn.formattedOriginal}
                </div>
              </div>

              <div className="p-3 rounded-md border border-border bg-background">
                <div className="text-muted-foreground/70 text-[10px] uppercase">Converted Base INR</div>
                <div className="text-sm font-semibold text-foreground font-mono mt-1">
                  {selectedTxn.formattedBaseTotal}
                </div>
              </div>
            </div>

            <div className="p-3 rounded-md border border-border bg-background space-y-2 text-xs font-mono">
              <div className="font-semibold text-foreground">FX Conversion Audit:</div>
              <div className="grid grid-cols-2 gap-2 text-[11px] text-muted-foreground">
                <div>Rate: 1 {selectedTxn.originalCurrency} = ₹{selectedTxn.fxConversion.fxRateApplied.toFixed(4)}</div>
                <div>Ratio: {selectedTxn.fxConversion.rateNumerator} / {selectedTxn.fxConversion.rateDenominator}</div>
                <div>Rounding: {selectedTxn.fxConversion.roundingMethod}</div>
                <div>Effective: {selectedTxn.fxConversion.effectiveDate}</div>
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                onClick={() => setSelectedTxn(null)}
                className="h-8 px-3 rounded-md border border-border bg-card text-xs font-medium text-foreground hover:bg-accent transition"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
