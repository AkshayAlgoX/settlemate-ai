/*
 * SettleMate AI — Decision Receipt Retrieval Endpoint
 */

import { NextRequest, NextResponse } from "next/server";
import { applySecurityHeaders, handleCorsPreflight, rateLimitGuard } from "@/lib/security/api-security";
import { DecisionReceiptRepository, JobRepository } from "@/lib/storage/sqlite-db";

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

  if (!receipt) {
    // Check if the job exists and has a receipt embedded
    const job = JobRepository.get(id);
    if (job?.receipt) {
      const parsedReceipt = JSON.parse(job.receipt);
      return applySecurityHeaders(
        NextResponse.json({
          success: true,
          receipt: {
            receiptId: `rcpt_${parsedReceipt.fingerprint || id}`,
            jobId: job.jobId,
            rootHash: parsedReceipt.rootHash,
            leafCount: parsedReceipt.leafCount,
            algorithm: parsedReceipt.algorithm,
            timestamp: parsedReceipt.timestamp,
            fingerprint: parsedReceipt.fingerprint,
            signature: parsedReceipt.signature,
          },
        })
      );
    }

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

  return applySecurityHeaders(
    NextResponse.json({
      success: true,
      receipt: {
        receiptId: receipt.receiptId,
        jobId: receipt.jobId,
        rootHash: receipt.rootHash,
        leafCount: receipt.leafCount,
        algorithm: receipt.algorithm,
        timestamp: receipt.timestamp,
        fingerprint: receipt.fingerprint,
        signature: receipt.signature,
        canonicalPayload: receipt.canonicalPayload ? JSON.parse(receipt.canonicalPayload) : undefined,
        createdAt: receipt.createdAt,
      },
    })
  );
}
