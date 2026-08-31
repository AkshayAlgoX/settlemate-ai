/*
 * SettleMate AI — Milestone 4: Corrections List & Proposal Endpoint
 *
 * GET /api/corrections — List corrections for authenticated tenant
 * POST /api/corrections — Compute minimal correcting journal entry and invariant restoration proof
 */

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { CorrectionRepository } from "@/lib/corrections/repository";
import { calculateMinimalCorrection } from "@/lib/corrections/calculator";
import { InvariantRestorationProver } from "@/lib/corrections/prover";
import { CorrectionInputSchema, type ProposedCorrectionRecord } from "@/lib/corrections/types";
import { applySecurityHeaders, handleCorsPreflight, rateLimitGuard } from "@/lib/security/api-security";

export async function OPTIONS() {
  return handleCorsPreflight();
}

export async function GET(req: NextRequest) {
  const rateLimit = rateLimitGuard(req);
  if (!rateLimit.allowed && rateLimit.response) {
    return rateLimit.response;
  }

  const session = getSession(req);
  if (!session) {
    return applySecurityHeaders(
      NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 })
    );
  }

  const { searchParams } = new URL(req.url);
  const limit = parseInt(searchParams.get("limit") || "50", 10);

  const tenantId = session.tenantId || "default_tenant";
  const corrections = await CorrectionRepository.listCorrections(tenantId, limit);

  return applySecurityHeaders(
    NextResponse.json({
      success: true,
      tenantId,
      corrections,
    })
  );
}

export async function POST(req: NextRequest) {
  const rateLimit = rateLimitGuard(req);
  if (!rateLimit.allowed && rateLimit.response) {
    return rateLimit.response;
  }

  const session = getSession(req);
  if (!session) {
    return applySecurityHeaders(
      NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 })
    );
  }

  try {
    const tenantId = session.tenantId || "default_tenant";
    const rawBody = await req.json();
    const input = CorrectionInputSchema.parse({
      ...rawBody,
      tenantId,
    });

    // 1. Calculate Minimal Correction (Pure)
    const calcResult = calculateMinimalCorrection(input);

    if (!calcResult.applicable) {
      return applySecurityHeaders(
        NextResponse.json({
          success: false,
          status: calcResult.status,
          correctionType: calcResult.correctionType,
          reason: calcResult.reason || calcResult.minimalExplanation,
          journalLines: [],
        })
      );
    }

    // 2. Prove Invariant Restoration (Pure)
    const proof = InvariantRestorationProver.proveRestoration(input, calcResult.journalLines);

    // 3. Build Record & Persist
    const now = new Date().toISOString();
    const correctionId = `cor_${proof.proofId.replace("prf_", "")}`;

    const record: ProposedCorrectionRecord = {
      correctionId,
      tenantId,
      transactionId: input.transactionId,
      status: calcResult.status,
      correctionType: calcResult.correctionType,
      currency: input.currency || "INR",
      journalLines: calcResult.journalLines,
      totalDebitCorrectionMinor: calcResult.totalDebitCorrectionMinor,
      totalCreditCorrectionMinor: calcResult.totalCreditCorrectionMinor,
      detectedDifferenceMinor: calcResult.detectedDifferenceMinor,
      invariantProof: proof,
      minimalExplanation: calcResult.minimalExplanation,
      underlyingRecordVersion: input.underlyingRecordVersion || 1,
      policyVersion: input.policyVersion || "correction-policy-v1",
      createdAt: now,
      updatedAt: now,
    };

    await CorrectionRepository.saveCorrection(record);

    return applySecurityHeaders(
      NextResponse.json({
        success: true,
        record,
      })
    );
  } catch (err: unknown) {
    return applySecurityHeaders(
      NextResponse.json(
        { success: false, error: "VALIDATION_ERROR", message: (err as Error).message },
        { status: 400 }
      )
    );
  }
}
