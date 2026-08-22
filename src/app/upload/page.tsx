"use client";

import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Database,
  FileText,
  LockKeyhole,
  Upload,
} from "lucide-react";
import Link from "next/link";

const REQUIRED_FILES = [
  {
    name: "orders.csv",
    description: "Order details with amounts and customer information",
  },
  {
    name: "payments.csv",
    description: "Payment captures, fees, taxes, and payment methods",
  },
  {
    name: "settlements.csv",
    description: "Settlement records with settlement IDs and UTRs",
  },
  {
    name: "bank_statement.csv",
    description: "Bank credits and debits used for settlement matching",
  },
];

const OPTIONAL_FILES = [
  {
    name: "refunds.csv",
    description: "Processed refund records",
  },
  {
    name: "chargebacks.csv",
    description: "Chargeback adjustment records",
  },
  {
    name: "ground_truth.csv",
    description: "Expected labels for evaluation",
  },
];

function FileCard({
  name,
  description,
  required,
}: {
  name: string;
  description: string;
  required: boolean;
}) {
  return (
    <div className="group border border-[#292f28] bg-[#0a0d0a] p-4 transition hover:border-[#414a3b] hover:bg-[#0f130f]">
      <div className="flex items-start gap-3">
        <div
          className={`flex h-8 w-8 shrink-0 items-center justify-center border ${
            required
              ? "border-[#394934] bg-[#11160f]"
              : "border-[#30352f] bg-[#10130f]"
          }`}
        >
          <FileText
            className={`h-3.5 w-3.5 ${
              required ? "text-[#9eae84]" : "text-[#70776d]"
            }`}
          />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate font-mono text-[10px] font-medium text-[#d0cec6]">
              {name}
            </span>

            {required ? (
              <span className="shrink-0 border border-[#3d4936] bg-[#10150f] px-1.5 py-0.5 text-[7px] font-semibold uppercase tracking-[0.12em] text-[#a3b18a]">
                Required
              </span>
            ) : (
              <span className="shrink-0 border border-[#343a33] bg-[#10130f] px-1.5 py-0.5 text-[7px] font-medium uppercase tracking-[0.12em] text-[#777e74]">
                Optional
              </span>
            )}
          </div>

          <p className="mt-1.5 text-[9px] leading-5 text-[#686f66]">
            {description}
          </p>
        </div>

        <ArrowRight className="mt-1 h-3 w-3 shrink-0 text-[#464d44] transition-transform group-hover:translate-x-0.5 group-hover:text-[#899574]" />
      </div>
    </div>
  );
}

export default function UploadPage() {
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
                Ingestion / CSV
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-[28px] font-semibold tracking-[-0.045em] text-[#eeece4]">
                Upload financial data
              </h1>

              <span className="inline-flex items-center gap-1.5 border border-[#4d4634] bg-[#15120d] px-2.5 py-1 text-[8px] font-medium uppercase tracking-[0.14em] text-[#bba978]">
                <LockKeyhole className="h-3 w-3" />
                Roadmap
              </span>
            </div>

            <p className="mt-2 max-w-2xl text-[11px] leading-5 text-[#747a71]">
              Bring your own settlement data into the same source model used
              by the reconciliation engine. The production CSV ingestion
              interface is intentionally not enabled in this build.
            </p>
          </div>

          <div className="border border-[#30352f] bg-[#0e110e] px-4 py-3">
            <div className="text-[7px] font-medium uppercase tracking-[0.18em] text-[#62685f]">
              Ingestion model
            </div>

            <div className="mt-2 text-[11px] text-[#c6c5bd]">
              Six-source financial record set
            </div>

            <div className="mt-1 text-[8px] uppercase tracking-[0.13em] text-[#565d54]">
              CSV-ready schema
            </div>
          </div>
        </div>
      </header>

      {/* Honest scope */}
      <section className="border border-[#4c4332] bg-[#120f0b]">
        <div className="flex flex-col gap-4 px-5 py-5 md:flex-row md:items-start">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center border border-[#574a32] bg-[#17130b]">
            <AlertCircle className="h-4 w-4 text-[#c0a66c]" />
          </div>

          <div className="flex-1">
            <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#c5ae79]">
              CSV ingestion is currently a roadmap item
            </div>

            <p className="mt-2 max-w-4xl text-[10px] leading-5 text-[#827665]">
              The reconciliation model is structured around these six source
              datasets, but this competition build does not expose a live
              browser upload flow. The demo generator creates synthetic data
              that exercises the same downstream reconciliation concepts
              without pretending that production ingestion is already live.
            </p>
          </div>

          <div className="shrink-0 border border-[#3d432f] bg-[#11150f] px-3 py-2">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-3.5 w-3.5 text-[#9eac84]" />
              <span className="text-[8px] uppercase tracking-[0.13em] text-[#98a581]">
                Honest scope
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* Required files */}
      <section className="border border-[#2a2e29] bg-[#0d100d]">
        <div className="flex flex-col gap-2 border-b border-[#252a24] px-5 py-4 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="text-[8px] font-medium uppercase tracking-[0.2em] text-[#626960]">
              Source contract
            </div>

            <div className="mt-1 text-[13px] font-semibold text-[#dddcd4]">
              Required financial datasets
            </div>
          </div>

          <span className="text-[8px] uppercase tracking-[0.14em] text-[#555c53]">
            {REQUIRED_FILES.length} required files
          </span>
        </div>

        <div className="grid gap-px bg-[#252a24] md:grid-cols-2">
          {REQUIRED_FILES.map((file) => (
            <FileCard
              key={file.name}
              name={file.name}
              description={file.description}
              required
            />
          ))}
        </div>
      </section>

      {/* Optional files */}
      <section className="border border-[#2a2e29] bg-[#0d100d]">
        <div className="flex flex-col gap-2 border-b border-[#252a24] px-5 py-4 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="text-[8px] font-medium uppercase tracking-[0.2em] text-[#626960]">
              Extended inputs
            </div>

            <div className="mt-1 text-[13px] font-semibold text-[#dddcd4]">
              Optional datasets
            </div>
          </div>

          <span className="text-[8px] uppercase tracking-[0.14em] text-[#555c53]">
            {OPTIONAL_FILES.length} optional files
          </span>
        </div>

        <div className="grid gap-px bg-[#252a24] md:grid-cols-3">
          {OPTIONAL_FILES.map((file) => (
            <FileCard
              key={file.name}
              name={file.name}
              description={file.description}
              required={false}
            />
          ))}
        </div>
      </section>

      {/* Demo route */}
      <section className="border border-[#3d4934] bg-[#0d100d]">
        <div className="grid gap-px bg-[#252a24] md:grid-cols-[1fr_auto]">
          <div className="bg-[#0a0d0a] p-5">
            <div className="flex items-center gap-2">
              <Database className="h-3.5 w-3.5 text-[#9ca780]" />

              <span className="text-[8px] font-medium uppercase tracking-[0.19em] text-[#626960]">
                Recommended demo path
              </span>
            </div>

            <div className="mt-2 text-[13px] font-semibold text-[#d9d7cf]">
              Generate the dataset instead
            </div>

            <p className="mt-2 max-w-2xl text-[10px] leading-5 text-[#666d64]">
              Generate deterministic synthetic Razorpay-like records with
              controlled exception scenarios, then run the complete
              three-pass reconciliation and adversarial self-test.
            </p>
          </div>

          <div className="flex items-center bg-[#10150f] p-5">
            <Link
              href="/demo"
              className="inline-flex h-10 items-center gap-2 border border-[#5a6748] bg-[#151b11] px-4 text-[9px] font-semibold uppercase tracking-[0.14em] text-[#b8c694] transition hover:bg-[#1a2115]"
            >
              <Database className="h-3.5 w-3.5" />
              Generate demo data
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
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