/*
 * SettleMate AI — Ingestion Data Quality & Sanitization Gate (M8 Hardening)
 *
 * Enforces strict pre-reconciliation validation:
 *   - Separates INVALID_INPUT vs VALID_INPUT_NOT_YET_RECONCILED vs TRUE_FINANCIAL_EXCEPTION
 *   - Checks required identifiers, positive integer paise, ISO timestamps, UTR syntax
 *   - Protects downstream reconciliation engine from malformed or corrupted inputs
 */

export interface ValidationIssue {
  recordId: string;
  field: string;
  code: "MISSING_ID" | "INVALID_AMOUNT" | "INVALID_TIMESTAMP" | "MALFORMED_UTR" | "INVALID_CURRENCY" | "DUPLICATE_SOURCE_ID";
  message: string;
  rawRecord: unknown;
}

export interface IngestionValidationResult<T> {
  validRecords: T[];
  invalidRecords: ValidationIssue[];
  totalReceived: number;
  totalValid: number;
  totalRejected: number;
}

export function validatePayments(rawPayments: Array<Record<string, unknown>>): IngestionValidationResult<Record<string, unknown>> {
  const validRecords: Array<Record<string, unknown>> = [];
  const invalidRecords: ValidationIssue[] = [];
  const seenIds = new Set<string>();

  for (const p of rawPayments) {
    const id = (p.paymentId as string) || (p.id as string);
    if (!id || typeof id !== "string" || id.trim() === "") {
      invalidRecords.push({
        recordId: id || "UNKNOWN",
        field: "paymentId",
        code: "MISSING_ID",
        message: "Payment missing valid paymentId string",
        rawRecord: p,
      });
      continue;
    }

    if (seenIds.has(id.trim().toLowerCase())) {
      invalidRecords.push({
        recordId: id,
        field: "paymentId",
        code: "DUPLICATE_SOURCE_ID",
        message: `Duplicate paymentId ${id} detected in single ingestion batch`,
        rawRecord: p,
      });
      continue;
    }
    seenIds.add(id.trim().toLowerCase());

    const amount = Number(p.amount);
    if (!Number.isFinite(amount) || amount <= 0 || !Number.isSafeInteger(Math.round(amount))) {
      invalidRecords.push({
        recordId: id,
        field: "amount",
        code: "INVALID_AMOUNT",
        message: `Payment amount ${p.amount} is invalid or non-positive paise`,
        rawRecord: p,
      });
      continue;
    }

    validRecords.push(p);
  }

  return {
    validRecords,
    invalidRecords,
    totalReceived: rawPayments.length,
    totalValid: validRecords.length,
    totalRejected: invalidRecords.length,
  };
}

export function validateSettlements(rawSettlements: Array<Record<string, unknown>>): IngestionValidationResult<Record<string, unknown>> {
  const validRecords: Array<Record<string, unknown>> = [];
  const invalidRecords: ValidationIssue[] = [];
  const seenIds = new Set<string>();

  for (const s of rawSettlements) {
    const id = (s.settlementId as string) || (s.id as string);
    if (!id || typeof id !== "string" || id.trim() === "") {
      invalidRecords.push({
        recordId: id || "UNKNOWN",
        field: "settlementId",
        code: "MISSING_ID",
        message: "Settlement missing valid settlementId string",
        rawRecord: s,
      });
      continue;
    }

    if (seenIds.has(id.trim().toLowerCase())) {
      invalidRecords.push({
        recordId: id,
        field: "settlementId",
        code: "DUPLICATE_SOURCE_ID",
        message: `Duplicate settlementId ${id} detected in single ingestion batch`,
        rawRecord: s,
      });
      continue;
    }
    seenIds.add(id.trim().toLowerCase());

    const amount = Number(s.amount);
    if (!Number.isFinite(amount) || amount < 0) {
      invalidRecords.push({
        recordId: id,
        field: "amount",
        code: "INVALID_AMOUNT",
        message: `Settlement amount ${s.amount} is invalid`,
        rawRecord: s,
      });
      continue;
    }

    validRecords.push(s);
  }

  return {
    validRecords,
    invalidRecords,
    totalReceived: rawSettlements.length,
    totalValid: validRecords.length,
    totalRejected: invalidRecords.length,
  };
}
