import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  AlertTriangle,
  ShieldCheck,
} from "lucide-react";

export default function NotFound() {
  return (
    <main className="flex min-h-[78vh] items-center justify-center px-4">
      <div className="w-full max-w-2xl">
        <div className="border border-[#2a2e29] bg-[#0d100d]">
          <div className="border-b border-[#252a24] px-6 py-5">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center border border-[#514733] bg-[#15120d]">
                  <AlertTriangle className="h-4 w-4 text-[#bba16c]" />
                </div>

                <div>
                  <div className="text-[8px] font-medium uppercase tracking-[0.2em] text-[#666d63]">
                    Control Plane / Route
                  </div>

                  <div className="mt-1 text-[13px] font-semibold text-[#dddcd4]">
                    Resource not found
                  </div>
                </div>
              </div>

              <span className="font-mono text-[9px] text-[#555c53]">
                404
              </span>
            </div>
          </div>

          <div className="px-6 py-10 sm:px-8 sm:py-12">
            <div className="text-[64px] font-semibold leading-none tracking-[-0.07em] text-[#e9e6dc]">
              404
            </div>

            <h1 className="mt-5 text-[23px] font-semibold tracking-[-0.035em] text-[#dcdad2]">
              This control-plane route does not exist.
            </h1>

            <p className="mt-3 max-w-lg text-[11px] leading-6 text-[#70776e]">
              The requested page could not be located. Your financial data,
              reconciliation state, and audit history remain unchanged.
            </p>

            <div className="mt-7 flex flex-wrap gap-2.5">
              <Link
                href="/"
                className="inline-flex h-10 items-center gap-2 bg-[#d9d6c7] px-4 text-[9px] font-semibold uppercase tracking-[0.14em] text-[#11130f] transition hover:bg-[#ece9da]"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                Back to overview
              </Link>

              <Link
                href="/dashboard"
                className="inline-flex h-10 items-center gap-2 border border-[#373d34] bg-[#0f120f] px-4 text-[9px] font-semibold uppercase tracking-[0.14em] text-[#aaaFA5] transition hover:border-[#4b5542] hover:text-[#d0d0c7]"
              >
                Open dashboard
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          </div>

          <div className="flex flex-col gap-2 border-t border-[#20241f] px-6 py-4 text-[8px] uppercase tracking-[0.15em] text-[#4f554d] sm:flex-row sm:items-center sm:justify-between">
            <span className="flex items-center gap-2">
              <ShieldCheck className="h-3 w-3" />
              SettleMate AI / Financial Control
            </span>

            <span>Deterministic · Grounded · Auditable</span>
          </div>
        </div>
      </div>
    </main>
  );
}