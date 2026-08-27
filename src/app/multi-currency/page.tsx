"use client";

/*
 * SettleMate AI — Multi-Currency & Tax-Aware Reconciliation Dashboard
 *
 * Provides real-time cross-border multi-currency conversion, tax isolation (GST/VAT),
 * exact integer arithmetic validation, and exception resolution for global settlements.
 */

import React, { useState, useEffect } from "react";
import Link from "next/link";
import {
  Globe,
  Coins,
  Receipt,
  Scale,
  ArrowRightLeft,
  Percent,
  Sparkles,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  Info,
  DollarSign,
  TrendingUp,
  Sliders,
  ChevronRight,
  Filter,
  Check,
  Copy,
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
      .catch(() => {
        // Ignore network failure on unmount
      });

    return () => {
      active = false;
    };
  }, []);

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
    <div className="p-6 md:p-8 max-w-7xl mx-auto space-y-8 text-slate-100">
      {/* Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-6">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-gradient-to-br from-emerald-500/20 to-teal-500/10 border border-emerald-500/30 text-emerald-400">
              <Globe className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2.5">
                <h1 className="text-2xl font-bold text-slate-100 tracking-tight">
                  Multi-Currency & Tax-Aware Reconciliation
                </h1>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
                  🌍 00S
                </span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-medium bg-indigo-500/10 border border-indigo-500/20 text-indigo-400">
                  INTEGER-FLOOR MATH
                </span>
              </div>
              <p className="text-sm text-slate-400 mt-1">
                Cross-border multi-currency conversion, GST/VAT tax isolation, and zero-drift ledger integrity in base INR paise.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => handleGenerateSample(sampleCount)}
            disabled={isReconciling}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-semibold text-slate-200 transition"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isReconciling ? "animate-spin" : ""}`} />
            Regenerate Batch
          </button>

          <Link
            href="/sandbox"
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/30 text-xs font-semibold text-emerald-300 transition"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            Upload CSV in Sandbox
          </Link>
        </div>
      </div>

      {/* Top Level Summary Metrics Cards */}
      {reconResult && (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 space-y-1">
            <div className="text-xs text-slate-400 flex items-center gap-1.5 font-medium">
              <Coins className="w-3.5 h-3.5 text-emerald-400" />
              Total Converted Gross
            </div>
            <div className="text-xl font-bold text-slate-100 font-mono">
              {reconResult.summary.formattedTotalGrossINR}
            </div>
            <div className="text-[11px] text-slate-500 font-mono">
              {reconResult.summary.totalGrossConvertedPaise.toLocaleString()} paise
            </div>
          </div>

          <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 space-y-1">
            <div className="text-xs text-slate-400 flex items-center gap-1.5 font-medium">
              <Receipt className="w-3.5 h-3.5 text-indigo-400" />
              Isolated Tax (GST/VAT)
            </div>
            <div className="text-xl font-bold text-indigo-300 font-mono">
              {reconResult.summary.formattedTotalTaxINR}
            </div>
            <div className="text-[11px] text-slate-500 font-mono">
              {reconResult.summary.totalTaxConvertedPaise.toLocaleString()} paise
            </div>
          </div>

          <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 space-y-1">
            <div className="text-xs text-slate-400 flex items-center gap-1.5 font-medium">
              <TrendingUp className="w-3.5 h-3.5 text-teal-400" />
              Total Net Converted
            </div>
            <div className="text-xl font-bold text-teal-300 font-mono">
              {reconResult.summary.formattedTotalNetINR}
            </div>
            <div className="text-[11px] text-slate-500 font-mono">
              {reconResult.summary.totalNetConvertedPaise.toLocaleString()} paise
            </div>
          </div>

          <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 space-y-1">
            <div className="text-xs text-slate-400 flex items-center gap-1.5 font-medium">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
              Auto-Match Rate
            </div>
            <div className="text-xl font-bold text-emerald-400 font-mono">
              {reconResult.summary.matchRatePct}%
            </div>
            <div className="text-[11px] text-slate-500">
              {reconResult.summary.matchedCount} of {reconResult.summary.totalInputTransactions} txns
            </div>
          </div>

          <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 space-y-1">
            <div className="text-xs text-slate-400 flex items-center gap-1.5 font-medium">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
              Exceptions / FX Drift
            </div>
            <div className="text-xl font-bold text-amber-400 font-mono">
              {reconResult.summary.exceptionCount}
            </div>
            <div className="text-[11px] text-slate-500">
              {reconResult.summary.manualReviewCount} manual reviews
            </div>
          </div>
        </div>
      )}

      {/* Dataset Generator Controls */}
      <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800 flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
            <Sliders className="w-3.5 h-3.5 text-indigo-400" />
            Batch Size:
          </span>
          {[20, 30, 45, 50].map((count) => (
            <button
              key={count}
              onClick={() => {
                setSampleCount(count);
                handleGenerateSample(count);
              }}
              className={`px-3 py-1 rounded-lg text-xs font-semibold transition ${
                sampleCount === count
                  ? "bg-indigo-600 text-white shadow"
                  : "bg-slate-800 text-slate-400 hover:bg-slate-700"
              }`}
            >
              {count} Txns
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleCopyPayloadJson}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-300 border border-slate-700 transition"
          >
            {copiedJson ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-400" />
                <span className="text-emerald-400">Copied JSON!</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5 text-slate-400" />
                <span>Copy Ingestion JSON</span>
              </>
            )}
          </button>

          <button
            onClick={() => handleRunReconciliation()}
            disabled={isReconciling}
            className="flex items-center gap-2 px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-xs font-bold text-white shadow-lg shadow-emerald-600/20 transition"
          >
            <Sparkles className="w-3.5 h-3.5" />
            {isReconciling ? "Reconciling..." : "Run Engine"}
          </button>
        </div>
      </div>

      {/* Main Tab Navigation */}
      <div className="flex border-b border-slate-800 gap-2 overflow-x-auto pb-px">
        {[
          { id: "transactions", label: "Converted Transactions", icon: ArrowRightLeft, count: reconResult?.convertedTransactions.length },
          { id: "exceptions", label: "Multi-Currency Exceptions", icon: AlertTriangle, count: reconResult?.exceptions.length, alert: (reconResult?.exceptions.length || 0) > 0 },
          { id: "rates", label: "Static Sovereign FX Rates", icon: DollarSign, count: Object.keys(STATIC_FX_RATES).length },
          { id: "tax", label: "Tax Jurisdictions & GST/VAT", icon: Percent, count: reconResult?.summary.taxBreakdown.length },
          { id: "math", label: "Exact Integer Arithmetic Spec", icon: Scale },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as "transactions" | "exceptions" | "rates" | "tax" | "math")}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-t-xl text-xs font-semibold transition border-b-2 whitespace-nowrap ${
                isActive
                  ? "bg-slate-800/80 text-emerald-400 border-emerald-500"
                  : "text-slate-400 border-transparent hover:text-slate-200 hover:bg-slate-900/40"
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{tab.label}</span>
              {tab.count !== undefined && (
                <span
                  className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${
                    tab.alert
                      ? "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                      : "bg-slate-800 text-slate-400"
                  }`}
                >
                  {tab.count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* TAB 1: Converted Transactions Table */}
      {activeTab === "transactions" && (
        <div className="space-y-4">
          {/* Filter Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-xl bg-slate-900/60 border border-slate-800 text-xs">
            <div className="flex items-center gap-2">
              <Filter className="w-3.5 h-3.5 text-slate-400" />
              <span className="text-slate-400 font-medium">Currency:</span>
              <div className="flex gap-1">
                {["ALL", ...SUPPORTED_CURRENCIES].map((cur) => (
                  <button
                    key={cur}
                    onClick={() => setSelectedCurrencyFilter(cur)}
                    className={`px-2 py-0.5 rounded text-[11px] font-semibold transition ${
                      selectedCurrencyFilter === cur
                        ? "bg-emerald-600 text-white"
                        : "bg-slate-800 text-slate-400 hover:bg-slate-700"
                    }`}
                  >
                    {cur}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-slate-400 font-medium">Type:</span>
              <div className="flex gap-1">
                {["ALL", "payment", "settlement", "bank_transaction", "refund"].map((type) => (
                  <button
                    key={type}
                    onClick={() => setSelectedTypeFilter(type)}
                    className={`px-2 py-0.5 rounded text-[11px] font-semibold transition ${
                      selectedTypeFilter === type
                        ? "bg-indigo-600 text-white"
                        : "bg-slate-800 text-slate-400 hover:bg-slate-700"
                    }`}
                  >
                    {type}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Table */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 overflow-hidden shadow-xl">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="bg-slate-950/80 text-slate-400 uppercase tracking-wider font-semibold border-b border-slate-800">
                    <th className="py-3 px-4">Txn ID & Ref</th>
                    <th className="py-3 px-3">Type</th>
                    <th className="py-3 px-3">Original Currency</th>
                    <th className="py-3 px-3 text-right">Native Amount</th>
                    <th className="py-3 px-3 text-right">Tax (GST/VAT)</th>
                    <th className="py-3 px-3">FX Rate Applied</th>
                    <th className="py-3 px-4 text-right font-bold text-emerald-400">Converted INR Base</th>
                    <th className="py-3 px-3 text-center">Inspect</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {filteredTransactions.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-8 text-center text-slate-500">
                        No transactions found for the selected filter.
                      </td>
                    </tr>
                  ) : (
                    filteredTransactions.map((t) => (
                      <tr
                        key={t.id}
                        className="hover:bg-slate-800/40 transition cursor-pointer"
                        onClick={() => setSelectedTxn(t)}
                      >
                        <td className="py-3 px-4">
                          <div className="font-mono font-semibold text-slate-200">{t.id}</div>
                          <div className="text-[10px] text-slate-400 font-mono">Ref: {t.referenceId}</div>
                        </td>
                        <td className="py-3 px-3">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-semibold uppercase ${
                              t.type === "payment"
                                ? "bg-blue-500/10 text-blue-400 border border-blue-500/20"
                                : t.type === "settlement"
                                ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                                : t.type === "bank_transaction"
                                ? "bg-purple-500/10 text-purple-400 border border-purple-500/20"
                                : "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                            }`}
                          >
                            {t.type}
                          </span>
                        </td>
                        <td className="py-3 px-3">
                          <span className="font-bold text-slate-300">{t.originalCurrency}</span>
                        </td>
                        <td className="py-3 px-3 text-right font-mono font-semibold text-slate-200">
                          {t.formattedOriginal}
                          <div className="text-[10px] text-slate-400 font-mono">
                            {t.originalAmountMinor.toLocaleString()} minor
                          </div>
                        </td>
                        <td className="py-3 px-3 text-right font-mono">
                          {t.originalTaxMinor > 0 ? (
                            <div>
                              <span className="text-indigo-300 font-medium">{t.formattedOriginalTax}</span>
                              <div className="text-[10px] text-indigo-400/80">{t.taxType}</div>
                            </div>
                          ) : (
                            <span className="text-slate-600">—</span>
                          )}
                        </td>
                        <td className="py-3 px-3 font-mono text-[11px] text-slate-300">
                          1 {t.originalCurrency} = ₹{t.fxConversion.fxRateApplied.toFixed(2)}
                        </td>
                        <td className="py-3 px-4 text-right font-mono font-bold text-emerald-400">
                          {t.formattedBaseTotal}
                          <div className="text-[10px] text-slate-400 font-mono">
                            {t.baseTotalPaise.toLocaleString()} paise
                          </div>
                        </td>
                        <td className="py-3 px-3 text-center">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedTxn(t);
                            }}
                            className="p-1 rounded hover:bg-slate-700 text-slate-400 hover:text-slate-200 transition"
                          >
                            <ChevronRight className="w-4 h-4" />
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
          <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 flex-shrink-0" />
            <div>
              <span className="font-bold">Multi-Currency Discrepancies & Tax Isolation Alerts:</span> Engine isolates
              currency mismatches, cross-border VAT withholding gaps, and penny rounding variances before ledger mutation.
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4">
            {reconResult?.exceptions.map((exc) => (
              <div
                key={exc.id}
                className="p-5 rounded-2xl bg-slate-900/70 border border-slate-800 space-y-3 hover:border-slate-700 transition shadow-lg"
              >
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 border-b border-slate-800/80 pb-3">
                  <div className="flex items-center gap-3">
                    <span className="px-2.5 py-1 rounded text-xs font-mono font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                      {exc.status}
                    </span>
                    <span className="font-mono font-semibold text-slate-200 text-sm">{exc.paymentId}</span>
                    <span className="text-xs text-slate-400 font-mono">Order: {exc.orderId}</span>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-400">Variance:</span>
                    <span className="text-sm font-bold font-mono text-amber-400">{exc.formattedMismatchINR}</span>
                    <span className="text-xs text-slate-500 font-mono">({exc.mismatchAmountPaise} paise)</span>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                  <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800/80 space-y-1">
                    <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                      Root Cause Analysis
                    </div>
                    <p className="text-slate-200 leading-relaxed font-mono">{exc.rootCause}</p>
                  </div>

                  <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800/80 space-y-1">
                    <div className="text-[11px] font-bold uppercase tracking-wider text-emerald-400">
                      Recommended Resolution
                    </div>
                    <p className="text-emerald-300 leading-relaxed font-mono">{exc.recommendedAction}</p>
                  </div>
                </div>

                <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1">
                  <div>
                    Payment Currency: <span className="font-bold text-slate-200">{exc.paymentCurrency}</span> | Settlement
                    Currency: <span className="font-bold text-slate-200">{exc.settlementCurrency}</span>
                  </div>
                  <div>
                    Confidence Score: <span className="font-bold text-slate-200">{exc.confidenceScore}%</span>
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
          <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 text-xs space-y-2 text-slate-300">
            <div className="font-bold text-slate-100 flex items-center gap-2">
              <Info className="w-4 h-4 text-indigo-400" />
              Scaled Integer FX Conversion Architecture
            </div>
            <p>
              To prevent floating-point precision loss (0.1 + 0.2 &ne; 0.3), each exchange rate is stored as a rational
              fraction ratio: &ldquo;Paise = floor((AmountMinor &times; Numerator) / Denominator)&rdquo;.
            </p>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 overflow-hidden shadow-xl">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="bg-slate-950/80 text-slate-400 uppercase tracking-wider font-semibold border-b border-slate-800">
                  <th className="py-3 px-4">Currency Code</th>
                  <th className="py-3 px-4">Name</th>
                  <th className="py-3 px-4">Decimals</th>
                  <th className="py-3 px-4">Minor Unit</th>
                  <th className="py-3 px-4 font-mono">Integer Ratio (Num/Denom)</th>
                  <th className="py-3 px-4 font-bold text-emerald-400">Effective INR Rate</th>
                  <th className="py-3 px-4">Sovereign Source</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {Object.values(STATIC_FX_RATES).map((r) => (
                  <tr key={r.code} className="hover:bg-slate-800/30 transition">
                    <td className="py-3 px-4 font-bold text-slate-200">
                      {r.symbol} {r.code}
                    </td>
                    <td className="py-3 px-4 text-slate-300">{r.name}</td>
                    <td className="py-3 px-4 font-mono">{r.decimals}</td>
                    <td className="py-3 px-4 text-slate-400">{r.minorUnitName}</td>
                    <td className="py-3 px-4 font-mono text-indigo-400">
                      {r.rateNumerator} / {r.rateDenominator}
                    </td>
                    <td className="py-3 px-4 font-mono font-bold text-emerald-400">
                      ₹{r.rateToINR.toFixed(4)}
                    </td>
                    <td className="py-3 px-4 text-[11px] text-slate-400">{r.source}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 4: Tax Breakdown Matrix */}
      {activeTab === "tax" && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-5 rounded-2xl bg-slate-900/70 border border-slate-800 space-y-3">
              <div className="text-sm font-bold text-slate-100 flex items-center gap-2">
                <Percent className="w-4 h-4 text-indigo-400" />
                Cross-Border Tax Isolation Principles
              </div>
              <ul className="text-xs text-slate-300 space-y-2 list-disc list-inside leading-relaxed">
                <li>
                  <span className="font-semibold text-slate-200">Domestic GST (18% / 28%):</span> Handled natively in INR paise,
                  matched directly against government GSTN e-invoices.
                </li>
                <li>
                  <span className="font-semibold text-slate-200">International VAT (20% EU / UK):</span> Converted to base paise at
                  exact integer floor and isolated into <code className="text-indigo-300">TAX_HOLDING_CLEARING_AC</code>.
                </li>
                <li>
                  <span className="font-semibold text-slate-200">Zero Tax Drift Invariant:</span> Gross Settlement $\equiv$ Net
                  Settlement $+$ Tax Component $+$ Gateway Processing Fee.
                </li>
              </ul>
            </div>

            <div className="p-5 rounded-2xl bg-slate-900/70 border border-slate-800 space-y-3">
              <div className="text-sm font-bold text-slate-100 flex items-center gap-2">
                <Receipt className="w-4 h-4 text-emerald-400" />
                Tax Totals by Jurisdiction
              </div>
              <div className="space-y-2">
                {reconResult?.summary.taxBreakdown.map((t) => (
                  <div
                    key={t.taxType}
                    className="p-3 rounded-xl bg-slate-950/60 border border-slate-800/80 flex items-center justify-between text-xs"
                  >
                    <div>
                      <div className="font-bold text-slate-200">{t.taxType} Jurisdiction</div>
                      <div className="text-[10px] text-slate-400">{t.transactionCount} transactions</div>
                    </div>
                    <div className="text-right">
                      <div className="font-mono font-bold text-emerald-400">{t.formattedTaxINR}</div>
                      <div className="text-[10px] text-slate-500 font-mono">{t.totalTaxPaise.toLocaleString()} paise</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 5: Exact Integer Arithmetic Specification */}
      {activeTab === "math" && (
        <div className="p-6 rounded-2xl bg-slate-900/70 border border-slate-800 space-y-6">
          <div className="space-y-2">
            <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
              <Scale className="w-5 h-5 text-emerald-400" />
              Financial Engineering Specification: Multi-Currency Arithmetic Invariants
            </h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Standard floating-point numbers (IEEE-754) accumulate binary rounding errors (e.g. $0.1 + 0.2 = 0.30000000000000004$),
              which lead to ledger imbalances and non-reproducible financial audits. SettleMate AI enforces mathematical
              conservation through integer floor division.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
            <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800 space-y-2">
              <div className="font-bold text-emerald-400">1. Integer Minor Units</div>
              <p className="text-slate-300 leading-relaxed">
                All amounts inside the core engine are stored as integer paise ($\frac{1}{100}$ of ₹1 INR) or native minor units
                (cents/pence/fils).
              </p>
            </div>

            <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800 space-y-2">
              <div className="font-bold text-indigo-400">2. Floor Rounding Guard</div>
              <p className="text-slate-300 leading-relaxed">
                Division rounds down (floor) during conversion to prevent over-crediting and phantom revenue creation.
              </p>
            </div>

            <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800 space-y-2">
              <div className="font-bold text-teal-400">3. Sovereign Ratio Storage</div>
              <p className="text-slate-300 leading-relaxed">
                FX rates are stored as immutable scaled integer fractions (Numerator / Denominator) avoiding float precision loss.
              </p>
            </div>
          </div>

          <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800 space-y-2 text-xs font-mono">
            <div className="text-slate-400 font-bold uppercase tracking-wider text-[11px]">
              Mathematical Conversion Formula
            </div>
            <pre className="text-emerald-300 overflow-x-auto p-3 rounded-lg bg-slate-900/90 border border-slate-800">
{`// Exact Minor-Unit Conversion with BigInt Floor Division
function convertToBaseMinor(amountMinor, fromDef):
    let minorBig = BigInt(amountMinor)
    let paiseBig = (minorBig * BigInt(fromDef.rateNumerator)) / BigInt(fromDef.rateDenominator)
    return Number(paiseBig) // Guaranteed exact integer minor units`}
            </pre>
          </div>
        </div>
      )}

      {/* Transaction Inspection Modal/Drawer */}
      {selectedTxn && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-xl w-full p-6 space-y-5 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2.5">
                <Globe className="w-5 h-5 text-emerald-400" />
                <h3 className="text-base font-bold text-slate-100 font-mono">{selectedTxn.id}</h3>
              </div>
              <button
                onClick={() => setSelectedTxn(null)}
                className="text-slate-400 hover:text-slate-200 text-sm font-bold px-2 py-1 rounded bg-slate-800"
              >
                ✕
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800">
                <div className="text-slate-400 font-medium">Original Foreign Amount</div>
                <div className="text-base font-bold text-slate-100 font-mono mt-1">
                  {selectedTxn.formattedOriginal}
                </div>
                <div className="text-[10px] text-slate-500 font-mono">
                  {selectedTxn.originalAmountMinor} {selectedTxn.originalCurrency} minor units
                </div>
              </div>

              <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800">
                <div className="text-slate-400 font-medium">Converted Base INR</div>
                <div className="text-base font-bold text-emerald-400 font-mono mt-1">
                  {selectedTxn.formattedBaseTotal}
                </div>
                <div className="text-[10px] text-slate-500 font-mono">
                  {selectedTxn.baseTotalPaise.toLocaleString()} paise
                </div>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800 space-y-2 text-xs">
              <div className="font-bold text-slate-300">FX Conversion Audit Details:</div>
              <div className="grid grid-cols-2 gap-2 text-[11px] font-mono">
                <div>
                  <span className="text-slate-400">Exchange Rate:</span> 1 {selectedTxn.originalCurrency} = ₹{selectedTxn.fxConversion.fxRateApplied.toFixed(4)}
                </div>
                <div>
                  <span className="text-slate-400">Integer Ratio:</span> {selectedTxn.fxConversion.rateNumerator} / {selectedTxn.fxConversion.rateDenominator}
                </div>
                <div>
                  <span className="text-slate-400">Rounding Policy:</span> {selectedTxn.fxConversion.roundingMethod}
                </div>
                <div>
                  <span className="text-slate-400">Effective Date:</span> {selectedTxn.fxConversion.effectiveDate}
                </div>
              </div>
            </div>

            {selectedTxn.originalTaxMinor > 0 && (
              <div className="p-3 rounded-xl bg-indigo-950/30 border border-indigo-500/20 text-xs space-y-1">
                <div className="font-bold text-indigo-400">Tax Component Isolated:</div>
                <div className="flex justify-between font-mono text-[11px]">
                  <span>
                    Original: {selectedTxn.formattedOriginalTax} ({selectedTxn.taxType})
                  </span>
                  <span className="text-emerald-400">Converted: {selectedTxn.formattedBaseTax}</span>
                </div>
              </div>
            )}

            <div className="flex justify-end pt-2">
              <button
                onClick={() => setSelectedTxn(null)}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 transition"
              >
                Close Inspector
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
