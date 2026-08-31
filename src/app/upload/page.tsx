"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Loader2,
} from "lucide-react";
import Link from "next/link";
import { apiErrorMessage } from "@/lib/api/error-message";
import { PageHeader } from "@/components/ui/page-header";
import { SectionHeader } from "@/components/ui/section-header";
import { Badge } from "@/components/ui/badge";
import { Dropdown } from "@/components/ui/dropdown";

import { safeFetch } from "@/lib/api/safe-fetch";

interface UploadResponse {
  success: boolean;
  batchId: string;
  detectedProvider: string;
  schemaVersion: string;
  totalRecords: number;
  ordersCount: number;
  paymentsCount: number;
  settlementsCount: number;
  bankTxnsCount: number;
  totalGrossAmountPaise: number;
  totalBankCreditsPaise: number;
  warnings?: Array<{ field?: string; message: string }>;
}

const PROVIDER_OPTIONS = [
  { value: "AUTO", label: "Auto-detect schema", badge: "Auto" },
  { value: "BANK_STATEMENT", label: "Bank statement (HDFC/ICICI/SBI/Axis)", badge: "Bank" },
  { value: "RAZORPAY", label: "Razorpay gateway export", badge: "Gateway" },
  { value: "GENERIC_CSV", label: "Generic payment CSV", badge: "CSV" },
];

export default function UploadPage() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [provider, setProvider] = useState<string>("AUTO");
  const [isUploading, setIsUploading] = useState(false);
  const [isReconciling, setIsReconciling] = useState(false);
  const [uploadResult, setUploadResult] = useState<UploadResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
      setError(null);
      setUploadResult(null);
    }
  };

  const handleUpload = async () => {
    if (isUploading) return;
    if (!file) {
      setError("Please select a CSV file to upload.");
      return;
    }

    setIsUploading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append("file", file);
      if (provider !== "AUTO") {
        formData.append("provider", provider);
      }

      const res = await safeFetch<UploadResponse>("/api/upload", {
        method: "POST",
        body: formData,
      });

      if (!res.ok || !res.data?.success) {
        throw new Error(res.error || apiErrorMessage(res.data, "Failed to upload and validate CSV."));
      }

      setUploadResult(res.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to upload and validate CSV.");
    } finally {
      setIsUploading(false);
    }
  };

  const handleReconcileNow = async () => {
    if (isReconciling) return;
    if (!uploadResult?.batchId) return;
    setIsReconciling(true);
    setError(null);

    try {
      const res = await safeFetch<{ success?: boolean; error?: string }>(`/api/reconcile/${uploadResult.batchId}`, {
        method: "POST",
      });
      if (!res.ok || !res.data?.success) {
        throw new Error(res.error || apiErrorMessage(res.data, "Reconciliation failed."));
      }
      router.push(`/dashboard?batchId=${uploadResult.batchId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Reconciliation failed.");
      setIsReconciling(false);
    }
  };


  return (
    <div className="space-y-8 pb-12 font-sans">
      {/* Header */}
      <PageHeader
        tag="Data Ingestion"
        title="Import financial statements"
        description="Upload raw bank statements (HDFC, ICICI, SBI, Axis) or payment gateway exports (Razorpay, Stripe, Generic CSV) for streaming validation and normalization."
        badge={<Badge variant="outline">Multi-Provider</Badge>}
        actions={
          <div className="flex items-center gap-2">
            <Link
              href="/demo"
              className="inline-flex h-8 items-center rounded-lg border border-border bg-card px-3 text-xs font-medium text-foreground hover:bg-accent hover:border-foreground/30 transition"
            >
              <span>Demo generator</span>
            </Link>
          </div>
        }
      />

      {/* Live Upload Box */}
      <section className="rounded-xl border border-border bg-card p-5 sm:p-6 space-y-6 shadow-2xs">
        <SectionHeader
          title="Upload statement or export"
          description="Automatic schema detection and fee/tax parsing"
          className="border-b-0 pb-0"
        />

        <div className="max-w-2xl space-y-4 text-xs">
          <div className="space-y-1.5">
            <label className="text-muted-foreground block font-medium">Select CSV file</label>
            <input
              type="file"
              accept=".csv,text/csv"
              onChange={handleFileChange}
              className="block w-full rounded-lg border border-border bg-background px-3 py-2 text-xs text-foreground file:mr-4 file:border-0 file:bg-secondary file:px-3 file:py-1 file:text-xs file:font-medium file:text-foreground hover:file:bg-accent cursor-pointer"
            />
          </div>

          <div className="flex flex-wrap items-end gap-4">
            <div className="space-y-1.5">
              <label className="text-muted-foreground block font-medium">Provider adapter</label>
              <Dropdown
                value={provider}
                onValueChange={setProvider}
                options={PROVIDER_OPTIONS}
                data-testid="upload-provider-dropdown"
                triggerClassName="w-[280px]"
              />
            </div>

            <div>
              <button
                type="button"
                onClick={handleUpload}
                disabled={!file || isUploading}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-4 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition shadow-xs"
              >
                {isUploading ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    <span>Validating & ingesting...</span>
                  </>
                ) : (
                  <span>Ingest statement</span>
                )}
              </button>
            </div>
          </div>

          {error && (
            <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {uploadResult && (
            <div className="space-y-4 rounded-lg border border-border bg-background p-5">
              <div className="flex items-center justify-between border-b border-border pb-3">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                  <span className="text-xs font-semibold text-foreground">
                    Ingestion successful
                  </span>
                </div>
                <Badge variant="outline">
                  {uploadResult.detectedProvider} ({uploadResult.schemaVersion})
                </Badge>
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
                <div className="rounded-lg border border-border bg-card p-3">
                  <div className="text-xs text-muted-foreground">Total Records</div>
                  <div className="mt-1 font-mono text-base font-semibold text-foreground">
                    {uploadResult.totalRecords.toLocaleString()}
                  </div>
                </div>
                <div className="rounded-lg border border-border bg-card p-3">
                  <div className="text-xs text-muted-foreground">Settlements</div>
                  <div className="mt-1 font-mono text-base font-semibold text-foreground">
                    {uploadResult.settlementsCount.toLocaleString()}
                  </div>
                </div>
                <div className="rounded-lg border border-border bg-card p-3">
                  <div className="text-xs text-muted-foreground">Bank Deposits</div>
                  <div className="mt-1 font-mono text-base font-semibold text-foreground">
                    {uploadResult.bankTxnsCount.toLocaleString()}
                  </div>
                </div>
                <div className="rounded-lg border border-border bg-card p-3">
                  <div className="text-xs text-muted-foreground">Batch ID</div>
                  <div className="mt-1 truncate font-mono text-[11px] text-muted-foreground">
                    {uploadResult.batchId}
                  </div>
                </div>
              </div>

              <div className="pt-2">
                <button
                  type="button"
                  onClick={handleReconcileNow}
                  disabled={isReconciling}
                  className="inline-flex h-8 items-center rounded-lg bg-primary px-4 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition"
                >
                  {isReconciling ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                      <span>Reconciling batch...</span>
                    </>
                  ) : (
                    <span>Reconcile batch</span>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Demo Alternative Callout */}
      <section className="rounded-xl border border-border bg-card p-5 shadow-2xs">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="text-xs font-semibold text-foreground">
              Synthetic benchmark data generator
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Prefer to run standard deterministic batches with seeded anomalies instead of uploading custom files?
            </p>
          </div>
          <Link
            href="/demo"
            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border bg-card px-3.5 text-xs font-medium text-foreground hover:bg-accent hover:border-foreground/30 transition shrink-0"
          >
            <span>Open demo generator</span>
            <ArrowRight className="h-3 w-3 text-muted-foreground" />
          </Link>
        </div>
      </section>
    </div>
  );
}