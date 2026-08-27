"use client";

import React, { useState, useRef } from "react";
import {
  Upload,
  Download,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Sparkles,
} from "lucide-react";

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
        setErrorMessage(data.error || "Reconciliation failed");
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
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-8 sm:px-6 lg:px-8">
      {/* Header */}
      <header className="border border-[#2a2e29] bg-[#0d100d] p-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="flex items-center gap-2 text-[9px] font-bold uppercase tracking-[0.2em] text-[#a4b58a]">
              <Sparkles className="h-4 w-4 text-[#a4b58a]" />
              Interactive Reconciliation Sandbox
            </div>
            <h1 className="mt-1 text-2xl font-bold tracking-tight text-[#e3e1d8]">
              Judge & Developer Data Playground
            </h1>
            <p className="mt-1 text-xs text-[#8c9288]">
              Upload any custom CSV transaction dataset (max 100 rows, 1 MB) to test deterministic multi-source matching and exception classification in isolation.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleDownloadSample}
              className="px-4 py-2 border border-[#3e4d36] bg-[#11160f] hover:bg-[#182313] text-[#a4b58a] text-xs font-bold uppercase tracking-wider flex items-center gap-2"
            >
              <Download className="h-3.5 w-3.5" />
              Download Sample CSV
            </button>
            {response && (
              <button
                type="button"
                onClick={handleReset}
                className="px-4 py-2 border border-[#252a24] bg-[#090b09] hover:bg-[#121611] text-[#8c9288] text-xs font-bold uppercase tracking-wider"
              >
                Clear Sandbox
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Upload Zone */}
      {!response && (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          className={`border-2 border-dashed p-10 text-center transition-all ${
            isDragging
              ? "border-[#a4b58a] bg-[#141a12]"
              : "border-[#2a2e29] bg-[#0d100d] hover:border-[#3e4d36]"
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
            <div className="mx-auto flex h-14 w-14 items-center justify-center border border-[#3e4d36] bg-[#11160f]">
              {isUploading ? (
                <RefreshCw className="h-6 w-6 animate-spin text-[#a4b58a]" />
              ) : (
                <Upload className="h-6 w-6 text-[#a4b58a]" />
              )}
            </div>

            <div>
              <h3 className="text-sm font-bold text-[#e3e1d8]">
                {isUploading ? "Reconciling Uploaded Dataset..." : "Drag & Drop your CSV or Choose File"}
              </h3>
              <p className="text-xs text-[#8c9288] mt-1">
                Required schema: <code className="text-[#a4b58a]">source, amount, currency, date, reference_id</code>
              </p>
            </div>

            {!isUploading && (
              <label
                htmlFor="sandbox-file-upload"
                className="inline-block px-6 py-2.5 bg-[#a4b58a] hover:bg-[#b8c99e] text-[#0d100d] text-xs font-bold uppercase tracking-wider cursor-pointer"
              >
                Select CSV File
              </label>
            )}
          </div>
        </div>
      )}

      {/* Error Alert */}
      {errorMessage && (
        <div className="border border-[#6e2b26] bg-[#291211] p-4 flex items-center gap-3 text-xs text-[#e89088]">
          <AlertTriangle className="h-5 w-5 shrink-0 text-[#d9776f]" />
          <div>
            <div className="font-bold">Validation or Processing Error</div>
            <div>{errorMessage}</div>
          </div>
        </div>
      )}

      {/* Results Dashboard */}
      {response && (
        <div className="space-y-6">
          {/* Metrics 4-Grid */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="border border-[#3e4d36] bg-[#11160f] p-5">
              <div className="text-[10px] font-bold uppercase tracking-wider text-[#687063]">
                Auto-Matched
              </div>
              <div className="text-3xl font-mono font-bold text-[#a4b58a] mt-1">
                {response.summary.autoMatched}
              </div>
              <div className="text-[10px] text-[#8c9288] mt-1">100% Deterministic Match</div>
            </div>

            <div className="border border-[#4e4d36] bg-[#15150f] p-5">
              <div className="text-[10px] font-bold uppercase tracking-wider text-[#737255]">
                Suggested Matches
              </div>
              <div className="text-3xl font-mono font-bold text-[#d4c373] mt-1">
                {response.summary.suggested}
              </div>
              <div className="text-[10px] text-[#8c9288] mt-1">Cardinality / Fuzzy Matches</div>
            </div>

            <div className="border border-[#6e2b26] bg-[#1a0f0e] p-5">
              <div className="text-[10px] font-bold uppercase tracking-wider text-[#823a35]">
                Exceptions Isolated
              </div>
              <div className="text-3xl font-mono font-bold text-[#d9776f] mt-1">
                {response.summary.exception}
              </div>
              <div className="text-[10px] text-[#8c9288] mt-1">Variances & Missing Credits</div>
            </div>

            <div className="border border-[#2a2e29] bg-[#0d100d] p-5">
              <div className="text-[10px] font-bold uppercase tracking-wider text-[#687063]">
                Total Processed
              </div>
              <div className="text-3xl font-mono font-bold text-[#e3e1d8] mt-1">
                {response.summary.total}
              </div>
              <div className="text-[10px] text-[#8c9288] mt-1">Evaluated in Minor Units</div>
            </div>
          </div>

          {/* Exceptions Table / List */}
          <div className="border border-[#2a2e29] bg-[#0d100d] p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-[#252a24] pb-3">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-[#d9776f]" />
                <h3 className="text-sm font-bold text-[#e3e1d8] uppercase tracking-wider">
                  Isolated Reconciliation Exceptions ({response.exceptions.length})
                </h3>
              </div>
              <span className="text-[10px] font-mono text-[#8c9288]">
                Processed at: {new Date(response.processedAt).toLocaleTimeString()}
              </span>
            </div>

            {response.exceptions.length === 0 ? (
              <div className="text-center py-8 text-xs text-[#a4b58a] flex flex-col items-center gap-2">
                <CheckCircle2 className="h-8 w-8" />
                <span>Zero exceptions detected! All transactions reconciled cleanly.</span>
              </div>
            ) : (
              <div className="space-y-3">
                {response.exceptions.map((exp) => (
                  <div
                    key={exp.id}
                    className="border border-[#2e3a29] bg-[#090b09] p-4 flex flex-col md:flex-row md:items-center justify-between gap-4"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-mono font-bold text-[#a4b58a]">{exp.id}</span>
                        <span className="text-xs font-bold text-[#e3e1d8]">{exp.type}</span>
                      </div>
                      <div className="text-[11px] text-[#8c9288]">{exp.description}</div>
                      <div className="text-[10px] font-mono text-[#687063]">
                        Payment Ref: {exp.paymentId} | Expected: ₹{((exp.expectedNetAmount || 0) / 100).toFixed(2)} | Actual: ₹{((exp.actualSettledAmount || 0) / 100).toFixed(2)}
                      </div>
                    </div>

                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <div className="text-xs font-mono font-bold text-[#d9776f]">
                          {exp.formattedAmount}
                        </div>
                        <div className="text-[9px] uppercase tracking-wider text-[#687063]">
                          Variance Amount
                        </div>
                      </div>

                      <div className="px-3 py-1 bg-[#141b12] border border-[#2e3a29] text-[10px] font-bold text-[#a4b58a]">
                        AI Investigation Available
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
