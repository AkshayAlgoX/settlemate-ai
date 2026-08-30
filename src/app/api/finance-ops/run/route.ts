import { NextResponse } from "next/server";
import { safeErrorResponse } from "@/lib/security/api-security";
import { FinanceOpsLoopRunner, type FinanceOpsScenarioType, type HostileAttackMode } from "@/lib/reconciliation/finance-ops-loop";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const scenario: FinanceOpsScenarioType = body.scenario || "SCENARIO_A_REFUND";
    const hostileMode: HostileAttackMode = body.hostileMode || "NORMAL";

    const runner = new FinanceOpsLoopRunner();
    const result = await runner.execute50RecordFinanceOpsLoop({
      scenario,
      hostileMode,
    });

    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (error) {
    // safeErrorResponse masks 5xx detail; the raw message leaked loop-runner
    // internals to the caller.
    return safeErrorResponse(error, 500, "FINANCE_OPS_ERROR");
  }
}
