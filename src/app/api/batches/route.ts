import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth/session";
import { applySecurityHeaders, handleCorsPreflight } from "@/lib/security/api-security";

export async function OPTIONS() {
  return handleCorsPreflight();
}

export async function GET(req: NextRequest) {
  try {
    const session = getSession(req);
    const tenantId = session?.tenantId || "tenant_default_sandbox";
    const isPg = process.env.DATABASE_URL?.startsWith("postgres://") || process.env.DATABASE_URL?.startsWith("postgresql://");
    const batches = await prisma.batch.findMany({
      where: isPg
        ? ({ tenantId } as unknown as Parameters<typeof prisma.batch.findMany>[0] extends { where?: infer W } ? W : never)
        : undefined,
      orderBy: { createdAt: "desc" },
      take: 25,
      select: {
        id: true,
        name: true,
        size: true,
        status: true,
        source: true,
        totalRecords: true,
        autoMatched: true,
        exceptionsFound: true,
        unresolvedCount: true,
        accuracy: true,
        throughputRps: true,
        createdAt: true,
        completedAt: true,
      },
    });

    return applySecurityHeaders(
      NextResponse.json({
        success: true,
        tenantId,
        batches,
      })
    );
  } catch (err: unknown) {
    console.error("[BatchesAPI] Error fetching batches:", err);
    return applySecurityHeaders(
      NextResponse.json({ success: false, batches: [] })
    );
  }
}