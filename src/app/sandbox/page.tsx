"use client";

import React, { useState, useRef } from "react";
import {
  Upload,
  Download,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
} from "lucide-react";
import { apiErrorMessage } from "@/lib/api/error-message";
import { PageHeader } from "@/components/ui/page-header";
import { SectionHeader } from "@/components/ui/section-header";
import { Badge } from "@/components/ui/badge";
import { formatAuditTime } from "@/lib/format";

interface SandboxSummary {
  autoMatched: number;
  suggested: number;
  exception: number;
  total: number;
}

interface SandboxException {
  id: string;
  type: string;
  description: string;
  amount: number;
  formattedAmount: string;
  paymentId: string;
  expectedNetAmount?: number;
  actualSettledAmount?: number | null;
  mismatchAmount?: number | null;
  cardinalityType?: string;
  aiSuggestionAvailable?: boolean;
}

interface SandboxResponse {
  success: boolean;
  summary: SandboxSummary;
  exceptions: SandboxException[];
  processedAt: string;
  error?: string;
}

const SAMPLE_CSV = `source,amount,currency,date,reference_id
PAYMENT,5000,INR,2026-08-20,TXN_101
SETTLEMENT,5000,INR,2026-08-21,TXN_101
BANK_TXN,5000,INR,2026-08-21,TXN_101
PAYMENT,12000,INR,2026-08-20,TXN_102
SETTLEMENT,12000,INR,2026-08-21,TXN_102
BANK_TXN,12000,INR,2026-08-21,TXN_102
PAYMENT,20000,INR,2026-08-20,TXN_103
SETTLEMENT,18450,INR,2026-08-21,TXN_103
REFUND,1550,INR,2026-08-21,TXN_103
PAYMENT,7500,INR,2026-08-20,TXN_104`;

export default function SandboxPage() {
  const [, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [response, setResponse] = useState<SandboxResponse | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDownloadSample = () => {
    const blob = new Blob([SAMPLE_CSV], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", "settlemate_sandbox_sample.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const processFile = async (selectedFile: File) => {
    setFile(selectedFile);
    setIsUploading(true);
    setErrorMessage(null);
    setErrorCode(null);
    setResponse(null);

    try {
      const formData = new FormData();
      formData.append("file", selectedFile);

      const res = await fetch("/api/sandbox/reconcile", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();
      if (!res.ok || data.error) {
        const code = typeof data?.error === "object" ? data.error?.code : null;
        setErrorCode(code || (res.status === 422 ? "INCOMPLETE_INPUT" : null));
        setErrorMessage(apiErrorMessage(data, "Reconciliation failed"));
      } else {
        setResponse(data);
      }
    } catch (err) {
      setErrorMessage((err as Error).message || "Upload error");
    } finally {
      setIsUploading(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      processFile(e.target.files[0]);
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processFile(e.dataTransfer.files[0]);
    }
  };

  const handleReset = () => {
    setFile(null);
    setResponse(null);
    setErrorMessage(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  return (
    <div className="space-y-10 pb-12">
      {/* Header */}
      <PageHeader
        tag="Developer Sandbox"
        title="Custom dataset sandbox"
        description="Upload custom transaction CSV datasets to test multi-source matching and exception classification in an isolated environment."
        badge={<Badge variant="outline">Sandbox</Badge>}
        actions={
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleDownloadSample}
              className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-card px-3 text-xs font-medium text-foreground hover:bg-accent transition"
            >
              <Download className="h-3.5 w-3.5 text-muted-foreground" />
              <span>Download sample CSV</span>
            </button>
            {response && (
              <button
                type="button"
                onClick={handleReset}
                className="inline-flex h-8 items-center rounded-md border border-border bg-card px-3 text-xs font-medium text-foreground hover:bg-accent transition"
              >
                Clear
              </button>
            )}
          </div>
        }
      />

      {/* Upload Zone */}
      {!response && (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          className={`rounded-lg border border-dashed p-10 text-center transition-all ${
            isDragging
              ? "border-[#ededed] bg-accent"
              : "border-border bg-card hover:border-border"
          }`}
        >
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            accept=".csv"
            className="hidden"
            id="sandbox-file-upload"
          />

          <div className="max-w-md mx-auto space-y-4">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-md border border-border bg-background">
              {isUploading ? (
                <RefreshCw className="h-5 w-5 animate-spin text-foreground" />
              ) : (
                <Upload className="h-5 w-5 text-muted-foreground" />
              )}
            </div>

            <div className="space-y-1">
              <h3 className="text-sm font-semibold text-foreground">
                {isUploading ? "Reconciling uploaded dataset..." : "Drag & drop your CSV or choose file"}
              </h3>
              <p className="text-xs text-muted-foreground">
                Schema: <code className="text-foreground font-mono">source, amount, currency, date, reference_id</code>
              </p>
            </div>

            {!isUploading && (
              <label
                htmlFor="sandbox-file-upload"
                className="inline-flex h-8 items-center rounded-md bg-primary text-primary-foreground px-3.5 text-xs font-medium text-primary-foreground hover:bg-[#ffffff] cursor-pointer transition"
              >
                Select CSV file
              </label>
            )}
          </div>
        </div>
      )}

      {/* Error Alert */}
      {errorMessage && (
        <div
          data-testid="sandbox-error-alert"
          className="rounded-lg border border-[#3b1818] bg-[#140a0a] p-4 flex items-start gap-3 text-xs text-[#ef4444]"
        >
          <AlertTriangle className="h-4 w-4 shrink-0 text-[#ef4444] mt-0.5" />
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-foreground">Reconciliation Input Error</span>
              {errorCode && (
                <span className="font-mono text-[10px] px-1.5 py-0.5 rounded border border-[#3b1818] bg-background text-[#ef4444]">
                  {errorCode}
                </span>
              )}
            </div>
            <div className="text-xs text-muted-foreground">{errorMessage}</div>
          </div>
        </div>
      )}

      {/* Results Dashboard */}
      {response && (
        <div className="space-y-6">
          {/* Metrics 4-Grid */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="rounded-lg border border-border bg-card p-5 space-y-1">
              <div className="text-2xl sm:text-3xl font-mono font-semibold text-foreground">
                {response.summary.autoMatched}
              </div>
              <div className="text-xs font-medium text-foreground">
                Auto-matched
              </div>
              <div className="text-[11px] text-muted-foreground/70">Deterministic match</div>
            </div>

            <div className="rounded-lg border border-border bg-card p-5 space-y-1">
              <div className="text-2xl sm:text-3xl font-mono font-semibold text-foreground">
                {response.summary.suggested}
              </div>
              <div className="text-xs font-medium text-foreground">
                Suggested matches
              </div>
              <div className="text-[11px] text-muted-foreground/70">Cardinality matches</div>
            </div>

            <div className="rounded-lg border border-border bg-card p-5 space-y-1">
              <div className="text-2xl sm:text-3xl font-mono font-semibold text-[#ef4444]">
                {response.summary.exception}
              </div>
              <div className="text-xs font-medium text-foreground">
                Exceptions isolated
              </div>
              <div className="text-[11px] text-muted-foreground/70">Variances & missing credits</div>
            </div>

            <div className="rounded-lg border border-border bg-card p-5 space-y-1">
              <div className="text-2xl sm:text-3xl font-mono font-semibold text-foreground">
                {response.summary.total}
              </div>
              <div className="text-xs font-medium text-foreground">
                Total processed
              </div>
              <div className="text-[11px] text-muted-foreground/70">Evaluated in paise</div>
            </div>
          </div>

          {/* Exceptions Table / List */}
          <div className="rounded-lg border border-border bg-card p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <SectionHeader
                title={`Isolated exceptions (${response.exceptions.length})`}
                className="border-b-0 pb-0"
              />
              <span className="text-xs font-mono text-muted-foreground/70">
                {formatAuditTime(response.processedAt)}
              </span>
            </div>

            {response.exceptions.length === 0 ? (
              <div className="text-center py-8 text-xs text-muted-foreground flex flex-col items-center gap-2">
                <CheckCircle2 className="h-6 w-6 text-[#10b981]" />
                <span>Zero exceptions detected. All transactions reconciled cleanly.</span>
              </div>
            ) : (
              <div className="space-y-3">
                {response.exceptions.map((exp) => (
                  <div
                    key={exp.id}
                    className="rounded-md border border-border bg-background p-4 flex flex-col md:flex-row md:items-center justify-between gap-4"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono text-muted-foreground">{exp.id}</span>
                        <Badge variant="destructive">{exp.type}</Badge>
                      </div>
                      <div className="text-xs text-muted-foreground">{exp.description}</div>
                      <div className="text-[11px] font-mono text-muted-foreground/70">
                        Ref: {exp.paymentId} | Expected: ₹{((exp.expectedNetAmount || 0) / 100).toFixed(2)} | Actual: ₹{((exp.actualSettledAmount || 0) / 100).toFixed(2)}
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <div className="text-sm font-mono font-semibold text-[#ef4444]">
                        {exp.formattedAmount}
                      </div>
                      <div className="text-[11px] text-muted-foreground/70">
                        Variance
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
