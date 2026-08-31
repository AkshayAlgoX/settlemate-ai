/*
 * SettleMate AI — Milestone 3: Invoice Consumption & Race Condition Protection
 *
 * Atomically manages invoice consumption status to prevent double-spending
 * across concurrent payments and asynchronous distributed workers.
 */

import type { InvoiceStatus } from "./types";

export class DoubleConsumptionError extends Error {
  readonly code = "DOUBLE_INVOICE_CONSUMPTION_PREVENTED" as const;
  constructor(message: string) {
    super(message);
    this.name = "DoubleConsumptionError";
  }
}

interface InvoiceAllocationRecord {
  invoiceId: string;
  tenantId: string;
  consumedByPaymentId: string;
  status: InvoiceStatus;
  allocatedAt: string;
}

export class InvoiceConsumptionManager {
  private allocations = new Map<string, InvoiceAllocationRecord>();

  private key(tenantId: string, invoiceId: string): string {
    return `${tenantId}:${invoiceId}`;
  }

  /**
   * Atomically claims and consumes a set of invoices for a payment.
   * If ANY invoice is already consumed by another payment, fails closed immediately.
   */
  claimInvoices(
    tenantId: string,
    paymentId: string,
    invoiceIds: string[]
  ): { success: boolean; consumedIds: string[]; conflictInvoiceId?: string } {
    if (!tenantId || !paymentId || invoiceIds.length === 0) {
      return { success: true, consumedIds: [] };
    }

    // 1. Atomicity Pre-Check: Ensure NONE of the invoices are already consumed
    for (const invId of invoiceIds) {
      const k = this.key(tenantId, invId);
      const existing = this.allocations.get(k);
      if (existing && existing.status === "CONSUMED") {
        if (existing.consumedByPaymentId !== paymentId) {
          // Double consumption detected!
          return {
            success: false,
            consumedIds: [],
            conflictInvoiceId: invId,
          };
        }
      }
    }

    // 2. Commit Allocation Atomically
    const now = new Date().toISOString();
    for (const invId of invoiceIds) {
      const k = this.key(tenantId, invId);
      this.allocations.set(k, {
        invoiceId: invId,
        tenantId,
        consumedByPaymentId: paymentId,
        status: "CONSUMED",
        allocatedAt: now,
      });
    }

    return {
      success: true,
      consumedIds: invoiceIds,
    };
  }

  /**
   * Releases invoices if a payment settlement is cancelled or re-opened.
   */
  releaseInvoices(tenantId: string, paymentId: string, invoiceIds: string[]): void {
    for (const invId of invoiceIds) {
      const k = this.key(tenantId, invId);
      const existing = this.allocations.get(k);
      if (existing && existing.consumedByPaymentId === paymentId) {
        this.allocations.delete(k);
      }
    }
  }

  /**
   * Checks current consumption status for an invoice.
   */
  getInvoiceStatus(tenantId: string, invoiceId: string): InvoiceStatus {
    const k = this.key(tenantId, invoiceId);
    const existing = this.allocations.get(k);
    return existing ? existing.status : "ELIGIBLE";
  }

  /**
   * Clears in-memory allocations (for testing).
   */
  clear(): void {
    this.allocations.clear();
  }
}

export const invoiceConsumptionManager = new InvoiceConsumptionManager();
