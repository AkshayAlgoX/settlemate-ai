import { prisma } from "@/lib/db";
import type { CardinalityMatch } from "./cardinality";

interface PersistCardinalityInput {
  batchId: string;
  runId?: string;
  match: CardinalityMatch;
}

function sourceTypeFor(): string {
  return "SETTLEMENT";
}

function targetTypeFor(): string {
  return "BANK_TRANSACTION";
}

export async function persistCardinalityLink({
  batchId,
  runId,
  match,
}: PersistCardinalityInput): Promise<void> {
  await prisma.cardinalityLink.create({
    data: {
      batchId,
      runId: runId ?? null,
      relationshipType: match.type,
      sourceType: sourceTypeFor(),
      sourceIds: JSON.stringify(
        match.settlementIds,
      ),
      targetType: targetTypeFor(),
      targetIds: JSON.stringify(
        match.bankTxnIds,
      ),
      amount: match.settlementAmount,
      differencePaise:
        match.differencePaise,
      confidenceScore:
        match.confidenceScore,
      reasonCode: match.reasonCode,
      matchMethod:
        `CARDINALITY_${match.type.replace(
          ":",
          "_TO_",
        )}`,
    },
  });
}

export async function persistCardinalityLinks(
  batchId: string,
  matches: CardinalityMatch[],
  runId?: string,
): Promise<void> {
  for (const match of matches) {
    await persistCardinalityLink({
      batchId,
      runId,
      match,
    });
  }
}

export async function deleteCardinalityLinks(
  batchId: string,
): Promise<void> {
  await prisma.cardinalityLink.deleteMany({
    where: { batchId },
  });
}