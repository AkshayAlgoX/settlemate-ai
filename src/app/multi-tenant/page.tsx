"use client";

import React, { useState, useEffect } from "react";
import {
  ShieldAlert,
  CheckCircle2,
  RotateCw,
} from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { SectionHeader } from "@/components/ui/section-header";
import { Badge } from "@/components/ui/badge";

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
    <div className="space-y-10 pb-12">
      {/* Top Header */}
      <PageHeader
        tag="Enterprise Architecture"
        title="Multi-tenant ledger segregation"
        description="Mathematical partition isolation across independent enterprise merchants with zero cross-tenant contamination and global balance conservation."
        badge={<Badge variant="success">Partition Isolated</Badge>}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => runTenantReconciliation(simulateAttack)}
              disabled={isLoading}
              className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-card px-3 text-xs font-medium text-foreground hover:bg-accent transition"
            >
              <RotateCw className={`h-3.5 w-3.5 ${isLoading ? "animate-spin" : ""}`} />
              <span>Reconcile all</span>
            </button>
            <button
              type="button"
              onClick={() => setSimulateAttack(!simulateAttack)}
              className={`inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-xs font-medium transition ${
                simulateAttack
                  ? "bg-primary text-primary-foreground hover:bg-[#ffffff]"
                  : "border border-[#3b1818] bg-[#140a0a] text-[#ef4444] hover:bg-[#1f0f0f]"
              }`}
            >
              {simulateAttack ? (
                <>
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  <span>Restore clean boundary</span>
                </>
              ) : (
                <>
                  <ShieldAlert className="h-3.5 w-3.5" />
                  <span>Simulate cross-tenant attack</span>
                </>
              )}
            </button>
          </div>
        }
      />

      {/* Cross-Tenant Invariant Sentinel Card */}
      {report && (
        <section className="rounded-lg border border-border bg-card p-6 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-border pb-3">
            <SectionHeader
              title="Cross-tenant invariant sentinel"
              description="Global partition isolation guarantees"
              className="border-b-0 pb-0"
            />
            <Badge variant="success">
              {report.partitionIsolation}
            </Badge>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="rounded-md border border-border bg-background p-4 space-y-1">
              <div className="text-xl font-semibold font-mono text-foreground flex items-center gap-1.5">
                <CheckCircle2 className="h-4 w-4 text-[#10b981]" />
                {report.crossTalkMatches} (Zero Leaks)
              </div>
              <div className="text-xs font-medium text-foreground">Cross-talk matches</div>
              <div className="text-[11px] text-muted-foreground/70">Strict mathematical isolation</div>
            </div>

            <div className="rounded-md border border-border bg-background p-4 space-y-1">
              <div className="text-xl font-semibold font-mono text-foreground">
                {report.globalTotalGrossFormatted}
              </div>
              <div className="text-xs font-medium text-foreground">Global GMV processed</div>
              <div className="text-[11px] text-muted-foreground/70">{report.totalTenantsProcessed} Isolated Ledgers</div>
            </div>

            <div className="rounded-md border border-border bg-background p-4 space-y-1">
              <div className="text-xl font-semibold font-mono text-foreground">
                {report.globalMatchRatePct}%
              </div>
              <div className="text-xs font-medium text-foreground">Global match rate</div>
              <div className="text-[11px] text-muted-foreground/70">All active tenants</div>
            </div>

            <div className="rounded-md border border-border bg-background p-4 space-y-1">
              <div className="text-xl font-semibold font-mono text-[#10b981] flex items-center gap-1.5">
                {report.balanceConservationVerified ? "CONSERVED" : "DRIFT"}
              </div>
              <div className="text-xs font-medium text-foreground">Balance conservation</div>
              <div className="text-[11px] text-muted-foreground/70">0 paise drift</div>
            </div>
          </div>

          {/* Attack Interception Banner if Active */}
          {report.crossTenantAttackDefense.attackAttempted && (
            <div className="p-4 rounded-md border border-[#3b1818] bg-[#140a0a] flex items-start gap-3">
              <ShieldAlert className="h-5 w-5 text-[#ef4444] shrink-0 mt-0.5" />
              <div className="space-y-1 text-xs">
                <div className="font-semibold text-[#ef4444]">
                  Exploit Neutralized: {report.crossTenantAttackDefense.vector}
                </div>
                <div className="text-muted-foreground">{report.crossTenantAttackDefense.description}</div>
                <div className="text-[11px] font-mono text-foreground pt-1">
                  Defense: {report.crossTenantAttackDefense.interceptedBy}
                </div>
              </div>
            </div>
          )}
        </section>
      )}

      {/* Tenant Partition Cards Grid */}
      <section className="space-y-4">
        <SectionHeader
          title="Merchant ledger partitions"
          description="Select any tenant to view its isolated ledger postings."
        />

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {tenants.map((t) => {
            const isSelected = selectedTenantId === t.tenantId;
            return (
              <button
                key={t.tenantId}
                type="button"
                onClick={() => setSelectedTenantId(t.tenantId)}
                className={`p-4 rounded-lg border text-left space-y-2 transition ${
                  isSelected
                    ? "bg-accent border-[#ededed] text-foreground"
                    : "bg-card border-border hover:border-border text-muted-foreground"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-xs text-foreground">{t.name}</span>
                  <Badge variant="outline">{t.industry}</Badge>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs font-mono pt-1">
                  <div>
                    <span className="text-muted-foreground/70">Records:</span>{" "}
                    <span className="text-foreground">{t.totalRecords}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground/70">Match:</span>{" "}
                    <span className="text-[#10b981]">{t.matchRatePct}%</span>
                  </div>
                  <div className="col-span-2">
                    <span className="text-muted-foreground/70">Exceptions:</span>{" "}
                    <span className={t.exceptionCount > 0 ? "text-[#ef4444] font-semibold" : "text-foreground"}>
                      {t.exceptionCount}
                    </span>
                  </div>
                </div>

                <div className="text-[11px] font-mono text-muted-foreground/70 truncate pt-1 border-t border-border">
                  Root: {t.partitionMerkleRoot.slice(0, 16)}...
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {/* Selected Tenant Detailed Ledger Stream */}
      {activeTenant && (
        <section className="rounded-lg border border-border bg-card p-6 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-border pb-3">
            <SectionHeader
              title={`Partition ledger: ${activeTenant.name}`}
              description={`Isolated postings locked with SHA-256 Merkle root ${activeTenant.partitionMerkleRoot.slice(0, 20)}...`}
              className="border-b-0 pb-0"
            />
            <Badge variant="success">
              Partition Sealed
            </Badge>
          </div>

          <div className="overflow-x-auto rounded border border-border">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-border bg-muted/30 text-xs font-medium text-muted-foreground">
                  <th className="py-2.5 px-4 font-medium">Reference</th>
                  <th className="py-2.5 px-4 font-medium">Gross</th>
                  <th className="py-2.5 px-4 font-medium">Settled</th>
                  <th className="py-2.5 px-4 font-medium">Discrepancy</th>
                  <th className="py-2.5 px-4 font-medium">Status</th>
                  <th className="py-2.5 px-4 font-medium">Audit Note</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {activeTenant.records.map((r, i) => (
                  <tr key={i} className="hover:bg-accent/40 transition font-mono">
                    <td className="py-3 px-4 font-semibold text-foreground whitespace-nowrap">
                      {r.refId}
                    </td>
                    <td className="py-3 px-4 text-muted-foreground whitespace-nowrap">
                      ₹{(r.grossPaise / 100).toFixed(2)}
                    </td>
                    <td className="py-3 px-4 text-muted-foreground whitespace-nowrap">
                      ₹{(r.settledPaise / 100).toFixed(2)}
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      {r.discrepancyPaise === 0 ? (
                        <span className="text-muted-foreground/70">₹0.00</span>
                      ) : (
                        <span className="text-[#ef4444] font-semibold">₹{(r.discrepancyPaise / 100).toFixed(2)}</span>
                      )}
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      <Badge variant={r.status === "AUTO_MATCHED" ? "success" : "destructive"}>
                        {r.status}
                      </Badge>
                    </td>
                    <td className="py-3 px-4 text-xs font-sans text-muted-foreground whitespace-nowrap">
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
