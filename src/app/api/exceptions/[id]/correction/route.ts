import { NextRequest, NextResponse } from "next/server";
import { CorrectionManager } from "@/lib/exceptions/correction";
import { getSession } from "@/lib/auth/session";

const globalCorrectionManager = new CorrectionManager();

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: "Exception ID required" }, { status: 400 });
    }

    const proposals = globalCorrectionManager.getProposalsForException(id);
    return NextResponse.json({ success: true, proposals });
  } catch (error) {
    console.error("Correction GET error:", error);
    return NextResponse.json({ error: "Failed to fetch corrections" }, { status: 500 });
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();
    const { action } = body;

    const session = getSession(req);
    const actorId = session?.name ? session.name + " (" + session.role + ")" : "MAKER_OPERATOR";

    if (!action) {
      return NextResponse.json({ error: "Action required" }, { status: 400 });
    }

    if (action === "propose_correction") {
      const {
        actionType,
        reason,
        evidenceIds,
        adjustmentPaise,
        refundId,
        chargebackId,
        settlementId,
        grossAmountPaise,
        feePaise,
        taxPaise,
        refundPaise,
        chargebackPaise,
        actualSettledPaise,
      } = body;

      const proposal = globalCorrectionManager.proposeCorrection({
        exceptionId: id,
        makerId: actorId,
        actionType: actionType || "ATTACH_REFUND",
        reason: reason || "Attached refund evidence explains difference",
        evidenceIds: evidenceIds || [],
        adjustmentPaise: adjustmentPaise || 0,
        refundId,
        chargebackId,
        settlementId,
        grossAmountPaise: grossAmountPaise || 2000000,
        feePaise: feePaise || 40000,
        taxPaise: taxPaise || 7200,
        refundPaise: refundPaise || 0,
        chargebackPaise: chargebackPaise || 0,
        actualSettledPaise: actualSettledPaise || 1800000,
      });

      return NextResponse.json({ success: true, proposal });
    }

    if (action === "checker_review") {
      const { correctionId, reviewAction, notes } = body;
      if (!correctionId || !reviewAction) {
        return NextResponse.json({ error: "correctionId and reviewAction required" }, { status: 400 });
      }

      const checkerId = session?.name ? session.name + " (" + session.role + ")" : "CHECKER_SUPERVISOR";

      const updated = globalCorrectionManager.reviewCorrection({
        correctionId,
        checkerId,
        action: reviewAction,
        notes,
      });

      return NextResponse.json({ success: true, proposal: updated });
    }

    if (action === "recalculate_verify") {
      const { correctionId } = body;
      if (!correctionId) {
        return NextResponse.json({ error: "correctionId required" }, { status: 400 });
      }

      const result = globalCorrectionManager.recalculateAndVerify(correctionId);
      return NextResponse.json({ success: true, ...result });
    }

    if (action === "finalize") {
      const { correctionId, currentState } = body;
      if (!correctionId) {
        return NextResponse.json({ error: "correctionId required" }, { status: 400 });
      }

      const result = globalCorrectionManager.finalizeToLedger({
        exceptionId: id,
        correctionId,
        actorId,
        currentState: currentState || "FINALIZABLE",
      });

      return NextResponse.json({ ...result });
    }

    return NextResponse.json({ error: "Unrecognized action: " + action }, { status: 400 });
  } catch (error) {
    console.error("Correction POST error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Correction operation failed" },
      { status: 400 }
    );
  }
}
