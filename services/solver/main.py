"""
SettleMate AI — FastAPI OR-Tools Microservice
POST /solve/invoice-match
"""

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field
from typing import List, Optional
import hashlib
from datetime import datetime, timezone
from cpsat_solver import solve_invoice_match_ortools

app = FastAPI(title="SettleMate AI — OR-Tools Invoice Matcher", version="1.0.0")


class CandidateInvoiceModel(BaseModel):
    invoiceId: str
    tenantId: str
    amountMinor: int = Field(gt=0)
    currency: str
    status: str = "ELIGIBLE"


class InvoiceMatchRequestModel(BaseModel):
    paymentId: str
    tenantId: str
    paymentAmountMinor: int = Field(gt=0)
    currency: str
    toleranceMinor: int = Field(default=0, ge=0)
    allowPartialPayment: bool = False
    maxInvoicesPerSplit: int = Field(default=8, ge=1, le=20)
    timeoutMs: int = Field(default=2000, ge=100, le=10000)
    invoices: List[CandidateInvoiceModel]
    policyVersion: str = "invoice-match-v1"


class InvoiceMatchResponseModel(BaseModel):
    solveId: str
    tenantId: str
    paymentId: str
    status: str
    solverStatus: str
    selectedInvoiceIds: List[str]
    selectedTotalMinor: int
    paymentAmountMinor: int
    differenceMinor: int
    toleranceMinor: int
    currency: str
    objectiveValue: float
    solveDurationMs: float
    candidatesConsideredCount: int
    isVerifiedDeterministically: bool
    verificationReason: str
    proofSignature: str
    policyVersion: str
    createdAt: str


@app.get("/health")
def health():
    return {"status": "ok", "service": "or-tools-solver"}


@app.post("/solve/invoice-match", response_model=InvoiceMatchResponseModel)
def solve_invoice_match(req: InvoiceMatchRequestModel):
    # Tenant & Currency Pre-checks
    for inv in req.invoices:
        if inv.tenantId != req.tenantId:
            raise HTTPException(status_code=400, detail=f"Tenant mismatch on invoice {inv.invoiceId}")
        if inv.currency.upper() != req.currency.upper():
            raise HTTPException(status_code=400, detail=f"Mixed currency on invoice {inv.invoiceId}")

    eligible = [inv.dict() for inv in req.invoices if inv.status == "ELIGIBLE"]

    result = solve_invoice_match_ortools(
        payment_amount_minor=req.paymentAmountMinor,
        invoices=eligible,
        tolerance_minor=req.toleranceMinor,
        allow_partial=req.allowPartialPayment,
        max_k=req.maxInvoicesPerSplit,
        timeout_seconds=req.timeoutMs / 1000.0,
    )

    solve_id = f"solv_{hashlib.sha256(f'{req.tenantId}:{req.paymentId}:{req.paymentAmountMinor}'.encode()).hexdigest()[:12]}"
    created_at = datetime.now(timezone.utc).isoformat()

    proof_sig = hashlib.sha256(
        f"{solve_id}:{result['status']}:{result['selectedTotalMinor']}:{result['differenceMinor']}".encode()
    ).hexdigest()

    return {
        "solveId": solve_id,
        "tenantId": req.tenantId,
        "paymentId": req.paymentId,
        "status": result["status"],
        "solverStatus": result["solverStatus"],
        "selectedInvoiceIds": result["selectedInvoiceIds"],
        "selectedTotalMinor": result["selectedTotalMinor"],
        "paymentAmountMinor": req.paymentAmountMinor,
        "differenceMinor": result["differenceMinor"],
        "toleranceMinor": req.toleranceMinor,
        "currency": req.currency,
        "objectiveValue": result["objectiveValue"],
        "solveDurationMs": result["solveDurationMs"],
        "candidatesConsideredCount": len(eligible),
        "isVerifiedDeterministically": True,
        "verificationReason": f"Solved via OR-Tools CP-SAT ({result['status']})",
        "proofSignature": proof_sig,
        "policyVersion": req.policyVersion,
        "createdAt": created_at,
    }
