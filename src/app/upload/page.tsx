"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Database,
  Loader2,
  Sparkles,
  Upload,
} from "lucide-react";
import Link from "next/link";

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

      const res = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to upload and validate CSV.");
      }

      setUploadResult(data);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsUploading(false);
    }
  };

  const handleReconcileNow = async () => {
    if (!uploadResult?.batchId) return;
    setIsReconciling(true);

    try {
      const res = await fetch(`/api/reconcile/${uploadResult.batchId}`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Reconciliation failed.");
      }
      router.push(`/dashboard?batchId=${uploadResult.batchId}`);
    } catch (err) {
      setError((err as Error).message);
      setIsReconciling(false);
    }
  };

  return (
    <div className="space-y-7 pb-8">
      {/* Header */}
      <header className="border-b border-[#20241f] pb-6">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <div className="mb-3 flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center border border-[#343a31] bg-[#10130f]">
                <Upload className="h-3.5 w-3.5 text-[#a0aa83]" />
              </div>

              <span className="text-[8px] font-medium uppercase tracking-[0.22em] text-[#626960]">
                Ingestion / Multi-Provider
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-[28px] font-semibold tracking-[-0.045em] text-[#eeece4]">
                Import Financial Statements
              </h1>

              <span className="inline-flex items-center gap-1.5 border border-[#3d4936] bg-[#10150f] px-2.5 py-1 text-[8px] font-medium uppercase tracking-[0.14em] text-[#a3b18a]">
                <CheckCircle2 className="h-3 w-3" />
                Live Ingestion Active
              </span>
            </div>

            <p className="mt-2 max-w-2xl text-[11px] leading-5 text-[#747a71]">
              Upload raw bank statements (HDFC, ICICI, SBI, Axis) or payment gateway exports (Razorpay, Generic CSV).
              The streaming ingestion engine automatically validates schemas, parses fees and taxes, extracts UTRs, and normalizes records into canonical financial events.
            </p>
          </div>

          <div className="border border-[#30352f] bg-[#0e110e] px-4 py-3">
            <div className="text-[7px] font-medium uppercase tracking-[0.18em] text-[#62685f]">
              Supported Adapters
            </div>
            <div className="mt-2 text-[11px] text-[#c6c5bd]">
              Razorpay • Bank CSV • Generic Gateway
            </div>
            <div className="mt-1 text-[8px] uppercase tracking-[0.13em] text-[#565d54]">
              Automatic Schema Detection
            </div>
          </div>
        </div>
      </header>

      {/* Live Upload Box */}
      <section className="border border-[#2a2e29] bg-[#0d100d] p-6">
        <div className="max-w-2xl space-y-5">
          <div className="space-y-2">
            <label className="text-[9px] font-semibold uppercase tracking-[0.16em] text-[#a3b18a]">
              Select Statement / Export CSV
            </label>
            <div className="flex items-center gap-3">
              <input
                type="file"
                accept=".csv,text/csv"
                onChange={handleFileChange}
                className="block w-full border border-[#2b3328] bg-[#10140f] px-3 py-2 text-xs text-[#d0cec6] file:mr-4 file:border-0 file:bg-[#1f271d] file:px-3 file:py-1 file:text-xs file:font-semibold file:text-[#a3b18a] hover:file:bg-[#283325]"
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-4">
            <div className="space-y-1">
              <label className="text-[8px] font-medium uppercase tracking-[0.14em] text-[#71786d]">
                Provider Preset
              </label>
              <select
                value={provider}
                onChange={(e) => setProvider(e.target.value)}
                className="border border-[#2b3328] bg-[#10140f] px-3 py-1.5 text-xs text-[#d0cec6]"
              >
                <option value="AUTO">Auto-Detect Schema</option>
                <option value="BANK_STATEMENT">Bank Statement (HDFC/ICICI/SBI)</option>
                <option value="RAZORPAY">Razorpay Gateway Export</option>
                <option value="GENERIC_CSV">Generic Payment CSV</option>
              </select>
            </div>

            <div className="pt-4">
              <button
                onClick={handleUpload}
                disabled={!file || isUploading}
                className="inline-flex items-center gap-2 border border-[#40503a] bg-[#172014] px-5 py-2 text-xs font-semibold text-[#a3b18a] transition hover:bg-[#212c1d] disabled:opacity-50"
              >
                {isUploading ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Validating & Ingesting...
                  </>
                ) : (
                  <>
                    <Upload className="h-3.5 w-3.5" />
                    Upload & Ingest Statement
                  </>
                )}
              </button>
            </div>
          </div>

          {error && (
            <div className="flex items-start gap-2 border border-[#522] bg-[#180a0a] p-3 text-xs text-[#f87171]">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {uploadResult && (
            <div className="space-y-4 border border-[#394934] bg-[#0f150e] p-5">
              <div className="flex items-center justify-between border-b border-[#243021] pb-3">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-[#86efac]" />
                  <span className="text-xs font-semibold text-[#d0cec6]">
                    Ingestion Successful
                  </span>
                </div>
                <span className="border border-[#3d4936] bg-[#10150f] px-2 py-0.5 text-[8px] font-mono uppercase tracking-[0.14em] text-[#a3b18a]">
                  {uploadResult.detectedProvider} ({uploadResult.schemaVersion})
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
                <div className="border border-[#232d20] bg-[#0b100a] p-3">
                  <div className="text-[8px] uppercase tracking-wider text-[#6a7364]">Total Records</div>
                  <div className="mt-1 font-mono text-base font-bold text-[#e5e5e5]">
                    {uploadResult.totalRecords.toLocaleString()}
                  </div>
                </div>
                <div className="border border-[#232d20] bg-[#0b100a] p-3">
                  <div className="text-[8px] uppercase tracking-wider text-[#6a7364]">Settlements</div>
                  <div className="mt-1 font-mono text-base font-bold text-[#a3b18a]">
                    {uploadResult.settlementsCount.toLocaleString()}
                  </div>
                </div>
                <div className="border border-[#232d20] bg-[#0b100a] p-3">
                  <div className="text-[8px] uppercase tracking-wider text-[#6a7364]">Bank Deposits</div>
                  <div className="mt-1 font-mono text-base font-bold text-[#93c5fd]">
                    {uploadResult.bankTxnsCount.toLocaleString()}
                  </div>
                </div>
                <div className="border border-[#232d20] bg-[#0b100a] p-3">
                  <div className="text-[8px] uppercase tracking-wider text-[#6a7364]">Batch ID</div>
                  <div className="mt-1 truncate font-mono text-[10px] text-[#9ca3af]">
                    {uploadResult.batchId}
                  </div>
                </div>
              </div>

              <div className="pt-2">
                <button
                  onClick={handleReconcileNow}
                  disabled={isReconciling}
                  className="inline-flex items-center gap-2 border border-[#4d6645] bg-[#22331d] px-6 py-2.5 text-xs font-bold text-[#bbf7d0] transition hover:bg-[#2d4427] disabled:opacity-50"
                >
                  {isReconciling ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Running Deterministic Reconciliation...
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-4 w-4" />
                      Run Reconciliation on Batch
                      <ArrowRight className="h-4 w-4" />
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Demo Quick Start Alternative */}
      <section className="border border-[#2a2e29] bg-[#0d100d] p-5">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="text-[9px] font-semibold uppercase tracking-[0.16em] text-[#a3b18a]">
              Synthetic Benchmark Data
            </div>
            <p className="mt-1 text-xs text-[#71786d]">
              Want to run standard deterministic competition batches instead of uploading custom CSVs?
            </p>
          </div>
          <Link
            href="/demo"
            className="inline-flex items-center gap-2 border border-[#343d30] bg-[#141a12] px-4 py-2 text-xs font-semibold text-[#a3b18a] hover:bg-[#1d261a]"
          >
            <Database className="h-3.5 w-3.5" />
            Open Demo Generator
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </section>

      {/* Footer */}
      <div className="flex flex-col gap-3 border-t border-[#20241f] pt-4 text-[8px] uppercase tracking-[0.16em] text-[#4f554d] sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <Upload className="h-3 w-3" />
          Financial data ingestion
        </div>

        <div className="flex items-center gap-4">
          <span>CSV-ready</span>
          <span>Schema aligned</span>
          <span>Upload flow planned</span>
        </div>
      </div>
    </div>
  );
}