/*
 * SettleMate AI — Generic Context Ingestion Adapters
 *
 * Provides typed ingestion for external unstructured/semi-structured evidence:
 * invoices, customer support emails, provider webhooks, and analyst notes.
 */

import {
  computeEvidenceHash,
  generateDeterministicEvidenceId,
  type AccessClassification,
  type EvidenceItem,
  type LinkedFinancialRecords,
} from "./types";

export interface IngestDocumentInput {
  title: string;
  text: string;
  sourceReference: string;
  provider?: string;
  classification?: AccessClassification;
  linkedRecords: LinkedFinancialRecords;
  observedAt?: Date;
  structuredData?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

export interface IngestEmailInput {
  sender: string;
  subject: string;
  body: string;
  messageId: string;
  provider?: string;
  classification?: AccessClassification;
  linkedRecords: LinkedFinancialRecords;
  timestamp?: Date;
}

export interface IngestWebhookInput {
  eventType: string;
  provider: string;
  payload: Record<string, unknown>;
  eventId: string;
  classification?: AccessClassification;
  linkedRecords: LinkedFinancialRecords;
  timestamp?: Date;
}

export interface IngestAnalystNoteInput {
  author: string;
  text: string;
  noteId: string;
  classification?: AccessClassification;
  linkedRecords: LinkedFinancialRecords;
  timestamp?: Date;
}

export class ContextIngestionAdapter {
  /**
   * Ingest invoice or commercial document.
   */
  ingestInvoice(input: IngestDocumentInput): EvidenceItem {
    const { hash, byteLength } = computeEvidenceHash(
      "INVOICE",
      input.sourceReference,
      input.text,
      input.structuredData
    );

    const evidenceId = generateDeterministicEvidenceId("INVOICE", input.sourceReference);

    return {
      evidenceId,
      sourceType: "INVOICE",
      sourceReference: input.sourceReference,
      contentHash: hash,
      hashAlgorithm: "SHA-256",
      byteLength,
      mimeType: "text/plain",
      schemaVersion: "1.0.0",
      title: input.title,
      createdAt: new Date(),
      observedAt: input.observedAt || new Date(),
      accessClassification: input.classification || "CONFIDENTIAL",
      linkedRecords: input.linkedRecords,
      provider: input.provider || "MANUAL_UPLOAD",
      structuredData: input.structuredData,
      rawText: input.text,
      metadata: input.metadata,
    };
  }

  /**
   * Ingest customer support or banking email thread.
   */
  ingestEmail(input: IngestEmailInput): EvidenceItem {
    const rawText = "From: " + input.sender + "\nSubject: " + input.subject + "\n\n" + input.body;
    const structuredData = {
      sender: input.sender,
      subject: input.subject,
    };

    const { hash, byteLength } = computeEvidenceHash(
      "EMAIL",
      input.messageId,
      rawText,
      structuredData
    );

    const evidenceId = generateDeterministicEvidenceId("EMAIL", input.messageId);

    return {
      evidenceId,
      sourceType: "EMAIL",
      sourceReference: input.messageId,
      contentHash: hash,
      hashAlgorithm: "SHA-256",
      byteLength,
      mimeType: "message/rfc822",
      schemaVersion: "1.0.0",
      title: "Email: " + input.subject,
      createdAt: new Date(),
      observedAt: input.timestamp || new Date(),
      accessClassification: input.classification || "CONFIDENTIAL",
      linkedRecords: input.linkedRecords,
      provider: input.provider || "SUPPORT_HELPDESK",
      structuredData,
      rawText,
    };
  }

  /**
   * Ingest provider webhook payload.
   */
  ingestWebhook(input: IngestWebhookInput): EvidenceItem {
    const { hash, byteLength } = computeEvidenceHash(
      "WEBHOOK",
      input.eventId,
      JSON.stringify(input.payload),
      input.payload
    );

    const evidenceId = generateDeterministicEvidenceId("WEBHOOK", input.eventId);

    return {
      evidenceId,
      sourceType: "WEBHOOK",
      sourceReference: input.eventId,
      contentHash: hash,
      hashAlgorithm: "SHA-256",
      byteLength,
      mimeType: "application/json",
      schemaVersion: "1.0.0",
      title: "Webhook [" + input.provider + "]: " + input.eventType,
      createdAt: new Date(),
      observedAt: input.timestamp || new Date(),
      accessClassification: input.classification || "RESTRICTED",
      linkedRecords: input.linkedRecords,
      provider: input.provider,
      structuredData: input.payload,
      rawText: JSON.stringify(input.payload, null, 2),
    };
  }

  /**
   * Ingest financial analyst investigation note.
   */
  ingestAnalystNote(input: IngestAnalystNoteInput): EvidenceItem {
    const structuredData = { author: input.author };
    const { hash, byteLength } = computeEvidenceHash(
      "ANALYST_NOTE",
      input.noteId,
      input.text,
      structuredData
    );

    const evidenceId = generateDeterministicEvidenceId("ANALYST_NOTE", input.noteId);

    return {
      evidenceId,
      sourceType: "ANALYST_NOTE",
      sourceReference: input.noteId,
      contentHash: hash,
      hashAlgorithm: "SHA-256",
      byteLength,
      mimeType: "text/plain",
      schemaVersion: "1.0.0",
      title: "Analyst Note by " + input.author,
      createdAt: new Date(),
      observedAt: input.timestamp || new Date(),
      accessClassification: input.classification || "CONFIDENTIAL",
      linkedRecords: input.linkedRecords,
      provider: "SETTLEMATE_INTERNAL",
      structuredData,
      rawText: input.text,
    };
  }
}
