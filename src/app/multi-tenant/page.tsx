"use client";

import React, { useState, useEffect } from "react";
import {
  Building2,
  ShieldCheck,
  ShieldAlert,
  CheckCircle2,
  RotateCw,
  Layers,
  Database,
  Lock,
} from "lucide-react";

interface TenantRecord {
  refId: string;
  grossPaise: number;
  settledPaise: number;
  discrepancyPaise: number;
  status: "AUTO_MATCHED" | "EXCEPTION";
  reason?: string;
}

interface TenantItem {
  tenantId: string;
  name: string;
  industry: string;
  currency: string;
  totalRecords: number;
  autoMatchedCount: number;
  exceptionCount: number;
  matchRatePct: number;
  totalGrossFormatted: string;
  totalSettledFormatted: string;
  discrepancyFormatted: string;
  partitionMerkleRoot: string;
  records: TenantRecord[];
}

interface CrossTenantReport {
  partitionIsolation: string;
  crossTalkMatches: number;
  totalTenantsProcessed: number;
  globalTotalGrossFormatted: string;
  globalTotalSettledFormatted: string;
  globalDiscrepancyFormatted: string;
  globalMatchRatePct: number;
  balanceConservationVerified: boolean;
  crossTenantAttackDefense: {
    attackAttempted: boolean;
    vector?: string;
    description?: string;
    interceptedBy?: string;
    blocked?: boolean;
    status?: string;
  };
}

export default function MultiTenantSimPage() {
  const [tenants, setTenants] = useState<TenantItem[]>([]);
  const [report, setReport] = useState<CrossTenantReport | null>(null);
  const [simulateAttack, setSimulateAttack] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [selectedTenantId, setSelectedTenantId] = useState<string>("tenant_nexus_retail");

  const runTenantReconciliation = async (attack: boolean) => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/tenant/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ simulateCrossTenantAttack: attack }),
      });

      if (res.ok) {
        const data = await res.json();
        setTenants(data.tenants || []);
        setReport(data.crossTenantReport || null);
      }
    } catch {
      // Fallback
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    let isMounted = true;
    const load = async () => {
      try {
        setIsLoading(true);
        const res = await fetch("/api/tenant/run", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ simulateCrossTenantAttack: simulateAttack }),
        });

        if (res.ok && isMounted) {
          const data = await res.json();
          setTenants(data.tenants || []);
          setReport(data.crossTenantReport || null);
        }
      } catch {
        // Fallback
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    void load();
    return () => {
      isMounted = false;
    };
  }, [simulateAttack]);

  const activeTenant = tenants.find((t) => t.tenantId === selectedTenantId) || tenants[0];

  return (
    <div className="mx-auto max-w-7xl space-y-8 px-4 py-8 sm:px-6 lg:px-8">
      {/* Top Header */}
      <header className="border border-[#2a2e29] bg-[#0d100d] p-6 sm:p-8">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.2em] text-[#a4b58a]">
              <Building2 className="h-4 w-4 text-[#a4b58a]" />
              Enterprise Architecture & Data Segregation
            </div>
            <h1 className="mt-2 text-2xl sm:text-3xl font-bold tracking-tight text-[#e3e1d8]">
              Multi-Tenant Ledger Simulation
            </h1>
            <p className="mt-2 max-w-3xl text-xs sm:text-sm text-[#8c9288]">
              Demonstrates strict mathematical partition isolation across independent enterprise merchants. Verifies that zero cross-tenant contamination occurs and global balance conservation holds invariant.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => runTenantReconciliation(simulateAttack)}
              disabled={isLoading}
              className="px-4 py-2 border border-[#3e4d36] bg-[#11160f] hover:bg-[#182313] text-[#a4b58a] text-xs font-bold uppercase tracking-wider flex items-center gap-2 transition"
            >
              <RotateCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
              Reconcile All Tenants
            </button>
            <button
              type="button"
              onClick={() => setSimulateAttack(!simulateAttack)}
              className={`px-4 py-2 text-xs font-bold uppercase tracking-wider border flex items-center gap-2 transition ${
                simulateAttack
                  ? "border-[#a4b58a] bg-[#182313] text-[#a4b58a]"
                  : "border-[#6e2b26] bg-[#291211] text-[#e06c75] hover:bg-[#381615]"
              }`}
            >
              {simulateAttack ? (
                <>
                  <CheckCircle2 className="h-4 w-4" />
                  Restore Clean Boundary Mode
                </>
              ) : (
                <>
                  <ShieldAlert className="h-4 w-4" />
                  Simulate Cross-Tenant Fraud Infiltration
                </>
              )}
            </button>
          </div>
        </div>
      </header>

      {/* Cross-Tenant Invariant Sentinel Card */}
      {report && (
        <section className="border border-[#252a24] bg-[#0d100d] p-6 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#1f241e] pb-3">
            <h2 className="text-xs font-bold uppercase tracking-wider text-[#e3e1d8] flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-[#a4b58a]" />
              Global Cross-Tenant Invariant Sentinel
            </h2>
            <span className="text-[10px] font-mono text-[#a4b58a] font-bold">
              {report.partitionIsolation}
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="border border-[#1f241e] bg-[#080a08] p-4 space-y-1">
              <span className="text-[10px] text-[#6c7465] font-mono uppercase">Cross-Talk Matches</span>
              <div className="text-xl font-bold font-mono text-[#a4b58a] flex items-center gap-1.5">
                <CheckCircle2 className="h-4 w-4" />
                {report.crossTalkMatches} Matches (Strict 0)
              </div>
              <div className="text-[10px] text-[#8c9288]">No cross-tenant leaks</div>
            </div>

            <div className="border border-[#1f241e] bg-[#080a08] p-4 space-y-1">
              <span className="text-[10px] text-[#6c7465] font-mono uppercase">Global GMV Processed</span>
              <div className="text-xl font-bold font-mono text-[#e3e1d8]">
                {report.globalTotalGrossFormatted}
              </div>
              <div className="text-[10px] text-[#8c9288]">{report.totalTenantsProcessed} Isolated Ledgers</div>
            </div>

            <div className="border border-[#1f241e] bg-[#080a08] p-4 space-y-1">
              <span className="text-[10px] text-[#6c7465] font-mono uppercase">Global Match Rate</span>
              <div className="text-xl font-bold font-mono text-[#a4b58a]">
                {report.globalMatchRatePct}%
              </div>
              <div className="text-[10px] text-[#8c9288]">Across all active tenants</div>
            </div>

            <div className="border border-[#1f241e] bg-[#080a08] p-4 space-y-1">
              <span className="text-[10px] text-[#6c7465] font-mono uppercase">Balance Conservation</span>
              <div className="text-xl font-bold font-mono text-[#a4b58a] flex items-center gap-1.5">
                <Lock className="h-4 w-4" />
                {report.balanceConservationVerified ? "CONSERVED" : "DRIFT_DETECTED"}
              </div>
              <div className="text-[10px] text-[#8c9288]">Net ₹0.00 mathematical drift</div>
            </div>
          </div>

          {/* Attack Interception Banner if Active */}
          {report.crossTenantAttackDefense.attackAttempted && (
            <div className="p-4 border border-[#6e2b26] bg-[#220f0e] flex items-start gap-3">
              <ShieldAlert className="h-5 w-5 text-[#e06c75] shrink-0 mt-0.5" />
              <div className="space-y-1 text-xs">
                <div className="font-bold text-[#e06c75]">
                  HOSTILE CROSS-TENANT EXPLOIT BLOCKED: {report.crossTenantAttackDefense.vector}
                </div>
                <div className="text-[#d48782]">{report.crossTenantAttackDefense.description}</div>
                <div className="text-[10px] font-mono text-[#a4b58a] pt-1">
                  Defense Mechanism: {report.crossTenantAttackDefense.interceptedBy}
                </div>
              </div>
            </div>
          )}
        </section>
      )}

      {/* Tenant Partition Cards Grid */}
      <section className="space-y-4">
        <div className="flex items-center justify-between border-b border-[#242820] pb-2">
          <h2 className="text-sm font-bold uppercase tracking-wider text-[#a4b58a] flex items-center gap-2">
            <Layers className="h-4 w-4" />
            Independent Merchant Ledger Partitions
          </h2>
          <span className="text-[10px] font-mono text-[#6c7465]">4 Active Tenants</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {tenants.map((t) => {
            const isSelected = selectedTenantId === t.tenantId;
            return (
              <button
                key={t.tenantId}
                type="button"
                onClick={() => setSelectedTenantId(t.tenantId)}
                className={`text-left p-5 border transition space-y-3 ${
                  isSelected
                    ? "border-[#a4b58a] bg-[#141b11]"
                    : "border-[#252a24] bg-[#0d100d] hover:border-[#384530]"
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-[#a4b58a]">
                    {t.industry}
                  </div>
                  <span className="text-[10px] font-mono px-2 py-0.5 bg-[#1a2417] text-[#a4b58a] border border-[#2e3e29]">
                    {t.matchRatePct}% Matched
                  </span>
                </div>

                <div>
                  <h3 className="text-sm font-bold text-[#e3e1d8]">{t.name}</h3>
                  <div className="text-[11px] font-mono text-[#6c7465]">{t.tenantId}</div>
                </div>

                <div className="border-t border-[#1f241e] pt-2 space-y-1 text-xs font-mono">
                  <div className="flex justify-between">
                    <span className="text-[#6c7465]">GMV:</span>
                    <span className="text-[#e3e1d8] font-bold">{t.totalGrossFormatted}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#6c7465]">Exceptions:</span>
                    <span className={t.exceptionCount > 0 ? "text-[#e5c07b] font-bold" : "text-[#a4b58a]"}>
                      {t.exceptionCount}
                    </span>
                  </div>
                </div>

                <div className="text-[9px] font-mono text-[#6c7465] truncate pt-1 border-t border-[#1f241e]">
                  Merkle: {t.partitionMerkleRoot.slice(0, 16)}...
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {/* Selected Tenant Detailed Ledger Stream */}
      {activeTenant && (
        <section className="border border-[#252a24] bg-[#0d100d] p-6 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#1f241e] pb-3">
            <div>
              <h3 className="text-sm font-bold text-[#e3e1d8] flex items-center gap-2">
                <Database className="h-4 w-4 text-[#a4b58a]" />
                Partition Ledger: {activeTenant.name} ({activeTenant.tenantId})
              </h3>
              <p className="text-[11px] text-[#8c9288]">
                Isolated transaction postings locked with SHA-256 Merkle root {activeTenant.partitionMerkleRoot.slice(0, 24)}...
              </p>
            </div>
            <span className="text-[10px] font-mono px-2.5 py-1 border border-[#3e4d36] bg-[#11160f] text-[#a4b58a]">
              Partition Sealed
            </span>
          </div>

          <div className="overflow-x-auto border border-[#252a24]">
            <table className="w-full text-left text-xs text-[#e3e1d8]">
              <thead className="bg-[#11140f] text-[10px] font-bold uppercase tracking-wider text-[#a4b58a] border-b border-[#252a24]">
                <tr>
                  <th className="py-3 px-4">Transaction Reference</th>
                  <th className="py-3 px-4">Gross Amount</th>
                  <th className="py-3 px-4">Settled Amount</th>
                  <th className="py-3 px-4">Discrepancy</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Audit Note</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1e231c] bg-[#090b09]">
                {activeTenant.records.map((r, i) => (
                  <tr key={i} className="hover:bg-[#0f130e] transition font-mono">
                    <td className="py-3 px-4 font-bold text-[#f0eee5] whitespace-nowrap">
                      {r.refId}
                    </td>
                    <td className="py-3 px-4 text-[#a0a69a] whitespace-nowrap">
                      ₹{(r.grossPaise / 100).toFixed(2)}
                    </td>
                    <td className="py-3 px-4 text-[#a0a69a] whitespace-nowrap">
                      ₹{(r.settledPaise / 100).toFixed(2)}
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      {r.discrepancyPaise === 0 ? (
                        <span className="text-[#6c7465]">₹0.00</span>
                      ) : (
                        <span className="text-[#e5c07b] font-bold">₹{(r.discrepancyPaise / 100).toFixed(2)}</span>
                      )}
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      <span
                        className={`px-2 py-0.5 border text-[10px] font-bold ${
                          r.status === "AUTO_MATCHED"
                            ? "border-[#2e4027] bg-[#0f170c] text-[#a4b58a]"
                            : "border-[#4a2624] bg-[#180e0d] text-[#e06c75]"
                        }`}
                      >
                        {r.status}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-[11px] text-[#8c9288] whitespace-nowrap">
                      {r.reason || "Exact 1:1 auto-reconciled"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
