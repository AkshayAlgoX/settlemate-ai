import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  AlertTriangle,
  ShieldCheck,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";

export default function NotFound() {
  return (
    <main className="flex min-h-[75vh] items-center justify-center px-4">
      <div className="w-full max-w-xl">
        <div className="rounded-lg border border-border bg-card overflow-hidden">
          <div className="flex items-center justify-between border-b border-border p-5">
            <div className="flex items-center gap-2.5">
              <div className="flex h-7 w-7 items-center justify-center rounded border border-border bg-background">
                <AlertTriangle className="h-3.5 w-3.5 text-muted-foreground" />
              </div>
              <div>
                <div className="text-xs font-semibold text-foreground">Route not found</div>
                <div className="text-[10px] text-muted-foreground/70">Control Plane Navigation</div>
              </div>
            </div>

            <Badge variant="outline">HTTP 404</Badge>
          </div>

          <div className="p-6 sm:p-8 space-y-4">
            <div className="font-mono text-5xl font-bold text-foreground">404</div>

            <h1 className="text-lg font-semibold text-foreground">
              This control-plane route does not exist.
            </h1>

            <p className="text-xs text-muted-foreground leading-relaxed">
              The requested page could not be located. Your financial data, reconciliation state, and audit logs remain securely preserved.
            </p>

            <div className="flex flex-wrap gap-2.5 pt-2">
              <Link
                href="/"
                className="inline-flex h-8 items-center gap-1.5 rounded-md bg-primary text-primary-foreground px-3.5 text-xs font-medium text-primary-foreground hover:bg-[#ffffff] transition"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                <span>Back to overview</span>
              </Link>

              <Link
                href="/dashboard"
                className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-card px-3.5 text-xs font-medium text-foreground hover:bg-accent transition"
              >
                <span>Open dashboard</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          </div>

          <div className="flex items-center justify-between border-t border-border p-4 text-[10px] text-muted-foreground/70 font-mono">
            <span className="flex items-center gap-1.5">
              <ShieldCheck className="h-3 w-3 text-[#10b981]" />
              <span>SettleMate AI Financial Control Plane</span>
            </span>

            <span>Deterministic · Auditable</span>
          </div>
        </div>
      </div>
    </main>
  );
}