import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { ContextVault } from "@/lib/evidence/vault";
import { ContextIngestionAdapter } from "@/lib/evidence/adapter";
import { GroundedAiVerifier } from "@/lib/evidence/grounded-ai";
import { VerificationCouncil, shouldInvokeCouncil } from "@/lib/ai/council";
import { generateDeterministicEvidenceId } from "@/lib/evidence/types";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    if (!id) {
      return NextResponse.json({ error: "Exception ID required" }, { status: 400 });
    }

    const exception = await prisma.exception.findUnique({
      where: { id },
      include: {
        aiExplanation: true,
        agentTraces: {
          orderBy: [{ passNumber: "asc" }, { stepNumber: "asc" }],
        },
      },
    });

    if (!exception) {
      return NextResponse.json({ error: "Exception not found" }, { status: 404 });
    }

    const { batchId, paymentId, settlementId, bankTxnId } = exception;

    const [
      payment,
      settlement,
      bankTxn,
      refunds,
      chargebacks,
      reconResult,
      auditLogs,
    ] = await Promise.all([
      paymentId
        ? prisma.payment.findFirst({ where: { batchId, paymentId } })
        : null,
      settlementId
        ? prisma.settlement.findFirst({ where: { batchId, settlementId } })
        : paymentId
        ? prisma.settlement.findFirst({ where: { batchId, paymentId } })
        : null,
      bankTxnId
        ? prisma.bankTransaction.findFirst({ where: { batchId, txnId: bankTxnId } })
        : null,
      paymentId
        ? prisma.refund.findMany({ where: { batchId, paymentId } })
        : [],
      paymentId
        ? prisma.chargeback.findMany({ where: { batchId, paymentId } })
        : [],
      paymentId
        ? prisma.reconciliationResult.findFirst({ where: { batchId, paymentId } })
        : null,
      prisma.auditLog.findMany({
        where: {
          batchId,
          OR: [
            { entityId: id },
            ...(paymentId ? [{ entityId: paymentId }] : []),
          ],
        },
        orderBy: { timestamp: "desc" },
      }),
    ]);

    let order = null;
    if (payment?.orderId) {
      order = await prisma.order.findFirst({
        where: { batchId, orderId: payment.orderId },
      });
    }

    let provenanceData = null;
    if (reconResult?.matchDetails) {
      try {
        provenanceData = JSON.parse(reconResult.matchDetails);
      } catch {
        provenanceData = { raw: reconResult.matchDetails };
      }
    }

    // =========================================================================
    // CONTEXT VAULT & EVIDENCE GRAPH INTEGRATION
    // =========================================================================
    const vault = new ContextVault();
    const adapter = new ContextIngestionAdapter();
    const aiVerifier = new GroundedAiVerifier();
    const council = new VerificationCouncil();

    // 1. Ingest Structured Financial Records into Vault
    if (payment) {
      vault.addEvidence({
        evidenceId: generateDeterministicEvidenceId("PAYMENT", payment.paymentId),
        batchId,
        exceptionId: id,
        sourceType: "PAYMENT",
        sourceReference: payment.paymentId,
        title: "Payment Authorization (" + payment.method + ")",
        createdAt: payment.createdAt,
        observedAt: payment.capturedAt || payment.createdAt,
        accessClassification: "CONFIDENTIAL",
        linkedRecords: {
          paymentIds: [payment.paymentId],
          orderIds: payment.orderId ? [payment.orderId] : [],
          exceptionIds: [id],
        },
        provider: payment.method || "GATEWAY",
        structuredData: {
          amountPaise: Math.round(payment.amount * 100),
          feePaise: Math.round(payment.fee * 100),
          taxPaise: Math.round(payment.tax * 100),
          currency: payment.currency,
          status: payment.status,
          method: payment.method,
        },
        rawText: "Payment " + payment.paymentId + " | Amount: " + payment.amount + " " + payment.currency + " | Method: " + payment.method,
      });
    }

    if (settlement) {
      const settledDate = settlement.settledAt || settlement.createdAt;
      vault.addEvidence({
        evidenceId: generateDeterministicEvidenceId("SETTLEMENT", settlement.settlementId),
        batchId,
        exceptionId: id,
        sourceType: "SETTLEMENT",
        sourceReference: settlement.settlementId,
        title: "Gateway Settlement Advice",
        createdAt: settlement.createdAt,
        observedAt: settledDate,
        accessClassification: "CONFIDENTIAL",
        linkedRecords: {
          settlementIds: [settlement.settlementId],
          paymentIds: paymentId ? [paymentId] : [],
          exceptionIds: [id],
        },
        provider: "SETTLEMENT_GATEWAY",
        structuredData: {
          amountPaise: Math.round(settlement.amount * 100),
          feePaise: Math.round(settlement.fee * 100),
          taxPaise: Math.round(settlement.tax * 100),
          currency: "INR",
          status: settlement.status,
          utr: settlement.utr,
        },
        rawText: "Settlement " + settlement.settlementId + " | Amount: " + settlement.amount + " | UTR: " + (settlement.utr || "N/A"),
      });
    }

    if (bankTxn) {
      vault.addEvidence({
        evidenceId: generateDeterministicEvidenceId("BANK_RECORD", bankTxn.txnId),
        batchId,
        exceptionId: id,
        sourceType: "BANK_RECORD",
        sourceReference: bankTxn.txnId,
        title: "Bank Statement Credit (" + bankTxn.type + ")",
        createdAt: bankTxn.txnDate,
        observedAt: bankTxn.valueDate || bankTxn.txnDate,
        accessClassification: "RESTRICTED",
        linkedRecords: {
          bankTxnIds: [bankTxn.txnId],
          paymentIds: paymentId ? [paymentId] : [],
          exceptionIds: [id],
        },
        provider: "CORE_BANKING",
        structuredData: {
          amountPaise: Math.round(bankTxn.amount * 100),
          currency: "INR",
          type: bankTxn.type,
          utr: bankTxn.utr,
          description: bankTxn.narration || "Bank Transaction",
        },
        rawText: "Bank Txn " + bankTxn.txnId + " | Amount: " + bankTxn.amount + " | Ref: " + (bankTxn.narration || "Credit"),
      });
    }

    for (const r of refunds) {
      vault.addEvidence({
        evidenceId: generateDeterministicEvidenceId("REFUND", r.refundId),
        batchId,
        exceptionId: id,
        sourceType: "REFUND",
        sourceReference: r.refundId,
        title: "Processed Refund #" + r.refundId,
        createdAt: r.createdAt,
        observedAt: r.processedAt || r.createdAt,
        accessClassification: "CONFIDENTIAL",
        linkedRecords: {
          refundIds: [r.refundId],
          paymentIds: [r.paymentId],
          exceptionIds: [id],
        },
        provider: "GATEWAY",
        structuredData: {
          amountPaise: Math.round(r.amount * 100),
          status: r.status,
          reason: r.reason,
        },
        rawText: "Refund " + r.refundId + " | Amount: " + r.amount + " | Reason: " + (r.reason || "Refund"),
      });
    }

    for (const c of chargebacks) {
      vault.addEvidence({
        evidenceId: generateDeterministicEvidenceId("CHARGEBACK", c.chargebackId),
        batchId,
        exceptionId: id,
        sourceType: "CHARGEBACK",
        sourceReference: c.chargebackId,
        title: "Dispute / Chargeback #" + c.chargebackId,
        createdAt: c.createdAt,
        observedAt: c.resolvedAt || c.createdAt,
        accessClassification: "RESTRICTED",
        linkedRecords: {
          chargebackIds: [c.chargebackId],
          paymentIds: [c.paymentId],
          exceptionIds: [id],
        },
        provider: "CARD_NETWORK",
        structuredData: {
          amountPaise: Math.round(c.amount * 100),
          status: c.status,
          reason: c.reason,
        },
        rawText: "Chargeback " + c.chargebackId + " | Amount: " + c.amount + " | Reason: " + (c.reason || "Dispute"),
      });
    }

    // 2. Synthesize contextual documents (invoices, emails, webhooks)
    if (order) {
      const invoiceEvidence = adapter.ingestInvoice({
        title: "Commercial Order Invoice #" + order.orderId,
        text: "Invoice total: " + order.amount + " " + order.currency + " for customer " + (order.customerEmail || "N/A") + ". Description: " + (order.description || "Order"),
        sourceReference: "INV-" + order.orderId,
        provider: "BILLING_SYSTEM",
        classification: "PUBLIC",
        linkedRecords: {
          orderIds: [order.orderId],
          paymentIds: paymentId ? [paymentId] : [],
          exceptionIds: [id],
        },
        structuredData: {
          amountPaise: Math.round(order.amount * 100),
          currency: order.currency,
          customerEmail: order.customerEmail,
        },
      });
      vault.addEvidence(invoiceEvidence);
    }

    // 3. Detect Contradictions
    const contradictions = paymentId
      ? vault.detectContradictions(paymentId)
      : [];

    // 4. Retrieve Bounded Subgraph
    const rootNodeId = paymentId || settlementId || bankTxnId || id;
    const graphData = vault.getGraph().getSubgraph(rootNodeId, 2, "HIGHLY_RESTRICTED");

    // 5. Verify All Vault Evidence Items
    const allVaultItems = vault.getAllItems().map((item) => ({
      ...item,
      verificationStatus: vault.verifyEvidence(item.evidenceId),
    }));

    // 6. Grounded AI Verification
    const allowedEvidenceIds = allVaultItems.map((v) => v.evidenceId);
    const rawAiSummary = exception.aiExplanation?.summary || exception.exceptionType || "Exception under investigation.";
    const rawAiReason = exception.aiExplanation?.recommendedAction || "Review discrepancy against transaction logs.";

    const groundedAiInvestigation = aiVerifier.verifyAndSanitizeDecision({
      rawSummary: rawAiSummary,
      rawReason: rawAiReason,
      citedEvidenceIds: allowedEvidenceIds.slice(0, 3),
      recommendedAction: exception.aiExplanation?.recommendedAction || "Route for Maker/Checker sign-off",
      confidence: exception.confidenceScore || 85,
      allowedEvidence: allVaultItems,
      contradictions,
    });

    // 7. Multi-Agent Verification Council Execution
    const councilRouting = shouldInvokeCouncil({
      decision: "EXCEPTION",
      riskLevel: (exception.riskLevel as "LOW" | "MEDIUM" | "HIGH" | "CRITICAL") || "MEDIUM",
      discrepancyPaise: reconResult?.mismatchAmount ? Math.round(reconResult.mismatchAmount * 100) : 0,
      amountPaise: payment ? Math.round(payment.amount * 100) : 100000,
      hasContradictions: contradictions.length > 0,
    });

    const councilDecision = council.deliberate({
      exceptionId: id,
      batchId,
      exceptionType: exception.exceptionType,
      amountPaise: payment ? Math.round(payment.amount * 100) : 100000,
      discrepancyPaise: reconResult?.mismatchAmount ? Math.round(reconResult.mismatchAmount * 100) : 0,
      riskLevel: (exception.riskLevel as "LOW" | "MEDIUM" | "HIGH" | "CRITICAL") || "MEDIUM",
      evidenceItems: allVaultItems,
      contradictions,
      paymentRecord: payment ? {
        paymentId: payment.paymentId,
        amount: payment.amount,
        fee: payment.fee,
        tax: payment.tax,
        createdAt: payment.createdAt,
        method: payment.method,
      } : undefined,
      settlementRecord: settlement ? {
        settlementId: settlement.settlementId,
        amount: settlement.amount,
        settledAt: settlement.settledAt || settlement.createdAt,
        utr: settlement.utr,
      } : undefined,
      bankRecord: bankTxn ? {
        txnId: bankTxn.txnId,
        amount: bankTxn.amount,
        txnDate: bankTxn.txnDate,
        utr: bankTxn.utr,
      } : undefined,
      refundRecord: refunds[0] ? {
        refundId: refunds[0].refundId,
        amount: refunds[0].amount,
        status: refunds[0].status,
        createdAt: refunds[0].createdAt,
      } : undefined,
      chargebackRecord: chargebacks[0] ? {
        chargebackId: chargebacks[0].chargebackId,
        amount: chargebacks[0].amount,
        status: chargebacks[0].status,
        createdAt: chargebacks[0].createdAt,
      } : undefined,
    });

    return NextResponse.json({
      success: true,
      exception,
      sources: {
        order,
        payment,
        settlement,
        bankTxn,
        refunds,
        chargebacks,
      },
      evidenceVault: {
        items: allVaultItems,
        totalItems: allVaultItems.length,
        tamperedCount: allVaultItems.filter((i) => i.verificationStatus === "TAMPER_DETECTED").length,
        contradictions,
        graph: graphData,
      },
      groundedInvestigation: groundedAiInvestigation,
      verificationCouncil: {
        routing: councilRouting,
        decision: councilDecision,
      },
      calculation: reconResult
        ? {
            orderAmount: reconResult.orderAmount,
            paymentAmount: reconResult.paymentAmount,
            fee: reconResult.paymentFee,
            tax: reconResult.paymentTax,
            refundAmount: reconResult.refundAmount,
            chargebackAmount: reconResult.chargebackAmount,
            expectedNetAmount: reconResult.expectedNetAmount,
            actualSettledAmount: reconResult.actualSettledAmount,
            bankCreditedAmount: reconResult.bankCreditedAmount,
            mismatchAmount: reconResult.mismatchAmount,
            confidenceScore: reconResult.confidenceScore,
            matchMethod: reconResult.matchMethod,
          }
        : null,
      provenance: provenanceData,
      auditTimeline: auditLogs,
    });
  } catch (error) {
    console.error("Exception detail fetch error:", error);
    return NextResponse.json(
      { error: "Failed to fetch exception detail" },
      { status: 500 }
    );
  }
}
