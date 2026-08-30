/*
 * SettleMate AI — Decision Receipt Retrieval & Independent Verification Endpoint
 */

import { NextRequest, NextResponse } from "next/server";
import { applySecurityHeaders, handleCorsPreflight, rateLimitGuard } from "@/lib/security/api-security";
import {
  UnifiedReceiptRepository as DecisionReceiptRepository,
  UnifiedJobRepository as JobRepository,
} from "@/lib/storage/unified-store";
import {
  verifyDecisionReceipt,
  generateOfflineEvidenceBundle,
} from "@/lib/reconciliation/merkle-verifier";
import type { V1DecisionReceipt } from "@/lib/api/v1-store";

interface FormattedReceipt extends V1DecisionReceipt {
  receiptId?: string;
  jobId?: string;
  createdAt?: string;
}

export async function OPTIONS() {
  return handleCorsPreflight();
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = rateLimitGuard(req);
  if (!guard.allowed && guard.response) {
    return guard.response;
  }

  const { id } = await params;

  if (!id) {
    return applySecurityHeaders(
      NextResponse.json({ error: "Receipt ID or Job ID required" }, { status: 400 })
    );
  }

  // Look up by receipt ID first, then by job ID
  let receipt = DecisionReceiptRepository.get(id);
  if (!receipt) {
    receipt = DecisionReceiptRepository.getByJobId(id);
  }

  let formattedReceipt: FormattedReceipt | null = null;
  let jobSummary: Record<string, unknown> = {};

  if (receipt) {
    formattedReceipt = {
      receiptId: receipt.receiptId,
      jobId: receipt.jobId,
      rootHash: receipt.rootHash,
      leafCount: receipt.leafCount,
      algorithm: receipt.algorithm,
      timestamp: receipt.timestamp,
      fingerprint: receipt.fingerprint,
      signature: receipt.signature,
      createdAt: receipt.createdAt,
    };
    if (receipt.jobId) {
      const job = JobRepository.get(receipt.jobId);
      if (job?.summary) {
        try {
          jobSummary = JSON.parse(job.summary);
        } catch {}
      }
    }
  } else {
    // Check if the job exists and has a receipt embedded
    const job = JobRepository.get(id);
    if (job?.receipt) {
      const parsedReceipt = JSON.parse(job.receipt);
      formattedReceipt = {
        receiptId: `rcpt_${parsedReceipt.fingerprint || id}`,
        jobId: job.jobId,
        rootHash: parsedReceipt.rootHash,
        leafCount: parsedReceipt.leafCount,
        algorithm: parsedReceipt.algorithm,
        timestamp: parsedReceipt.timestamp,
        fingerprint: parsedReceipt.fingerprint,
        signature: parsedReceipt.signature,
      };
      if (job.summary) {
        try {
          jobSummary = JSON.parse(job.summary);
        } catch {}
      }
    }
  }

  if (!formattedReceipt) {
    return applySecurityHeaders(
      NextResponse.json(
        {
          error: {
            code: "RECEIPT_NOT_FOUND",
            message: `Decision receipt with ID '${id}' not found in persistent store`,
          },
        },
        { status: 404 }
      )
    );
  }

  // Execute independent deterministic verification
  const verification = verifyDecisionReceipt(formattedReceipt);
  const offlineBundle = generateOfflineEvidenceBundle(formattedReceipt, jobSummary);

  return applySecurityHeaders(
    NextResponse.json({
      success: true,
      receipt: formattedReceipt,
      verification,
      offlineVerificationBundle: offlineBundle,
    })
  );
}
