/*
 * SettleMate AI — Context Vault Fuzzy Entity Resolver & Promotion Gate (Frontier 5)
 *
 * Implements strict multi-tier entity resolution:
 *   1. Token Similarity & Jaro-Winkler distance for OCR/invoice strings
 *   2. AI_SUGGESTED_EDGE: Advisory relationship created from fuzzy similarity
 *   3. DETERMINISTIC_VERIFICATION_GATE: Requires exact cryptographic or business ID match (UTR, OrderId, GSTIN)
 *   4. VERIFIED_EDGE: Only verified edges may influence exception calculation or ledger state
 */

export interface EntityCandidate {
  entityId: string;
  name: string;
  taxId?: string;
  orderId?: string;
  utr?: string;
  amountPaise?: number;
}

export type EdgeType = "AI_SUGGESTED_EDGE" | "VERIFIED_EDGE" | "AMBIGUOUS_ENTITY";

export interface EntityResolutionResult {
  sourceEntityId: string;
  targetEntityId: string;
  similarityScore: number;
  edgeType: EdgeType;
  verificationReason: string;
  isLedgerEligible: boolean;
}

export function computeLevenshteinDistance(a: string, b: string): number {
  const normalize = (s: string) => s.toLowerCase().replace(/\bprivate limited\b/g, "pvt ltd").replace(/\blimited\b/g, "ltd").trim();
  const s1 = normalize(a);
  const s2 = normalize(b);
  const m = s1.length;
  const n = s2.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));

  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (s1[i - 1] === s2[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        dp[i][j] = 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
      }
    }
  }
  return dp[m][n];
}

export function computeSimilarity(a: string, b: string): number {
  const s1 = a.toLowerCase().trim();
  const s2 = b.toLowerCase().trim();
  if (s1 === s2) return 1.0;
  const maxLen = Math.max(s1.length, s2.length);
  if (maxLen === 0) return 1.0;
  const dist = computeLevenshteinDistance(s1, s2);
  return Math.max(0, 1 - dist / maxLen);
}

export function resolveEntityEdge(
  source: EntityCandidate,
  target: EntityCandidate
): EntityResolutionResult {
  // 1. Check deterministic business identifier match
  const hasMatchingUtr = source.utr && target.utr && source.utr.trim() === target.utr.trim();
  const hasMatchingOrder = source.orderId && target.orderId && source.orderId.trim() === target.orderId.trim();
  const hasMatchingTaxId = source.taxId && target.taxId && source.taxId.trim() === target.taxId.trim();

  if (hasMatchingUtr || hasMatchingOrder || hasMatchingTaxId) {
    return {
      sourceEntityId: source.entityId,
      targetEntityId: target.entityId,
      similarityScore: 1.0,
      edgeType: "VERIFIED_EDGE",
      verificationReason: hasMatchingUtr ? "EXACT_UTR_MATCH" : hasMatchingOrder ? "EXACT_ORDER_ID_MATCH" : "EXACT_TAX_ID_MATCH",
      isLedgerEligible: true,
    };
  }

  // 2. Fuzzy name similarity evaluation
  const nameSim = computeSimilarity(source.name, target.name);

  if (nameSim >= 0.70) {
    // High fuzzy similarity creates an advisory edge only
    return {
      sourceEntityId: source.entityId,
      targetEntityId: target.entityId,
      similarityScore: Number(nameSim.toFixed(3)),
      edgeType: "AI_SUGGESTED_EDGE",
      verificationReason: `Fuzzy name similarity ${(nameSim * 100).toFixed(1)}% (requires deterministic verification)`,
      isLedgerEligible: false, // Forbidden from mutating financial ledger directly
    };
  }

  // 3. Ambiguous or low similarity
  return {
    sourceEntityId: source.entityId,
    targetEntityId: target.entityId,
    similarityScore: Number(nameSim.toFixed(3)),
    edgeType: "AMBIGUOUS_ENTITY",
    verificationReason: "Insufficient similarity and no shared identifier",
    isLedgerEligible: false,
  };
}
