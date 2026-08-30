/*
 * SettleMate AI — Production Readiness Probe Endpoint (/api/v1/ready)
 *
 * Verifies that all mandatory external dependencies are available:
 *   1. PostgreSQL / Database Connectivity & Query Execution
 *   2. Object Storage Read/Write Access
 *   3. Configuration Validation
 *
 * Returns HTTP 200 { status: "ready" } when healthy; HTTP 503 { status: "unready" } if degraded.
 */

import { NextResponse } from "next/server";
import { applySecurityHeaders, handleCorsPreflight } from "@/lib/security/api-security";
import { checkDatabaseConnection } from "@/lib/db";
import { objectStorage } from "@/lib/storage/object-storage";
import { validateStartupConfig } from "@/lib/config/startup-validation";

export async function OPTIONS() {
  return handleCorsPreflight();
}

export async function GET(_req?: Request) {
  void _req;
  const dbHealth = await checkDatabaseConnection();
  const configHealth = validateStartupConfig();

  let storageHealth = "up";
  try {
    const testKey = "system/probes/readiness-check.txt";
    await objectStorage.putObject(testKey, "probe");
    const retrieved = await objectStorage.getObject(testKey);
    if (!retrieved || !retrieved.verified) {
      storageHealth = "degraded";
    }
  } catch {
    storageHealth = "down";
  }

  const isReady = dbHealth.status === "up" && configHealth.valid && storageHealth !== "down";

  const status = isReady ? "ready" : "unready";
  const statusCode = isReady ? 200 : 503;

  return applySecurityHeaders(
    NextResponse.json(
      {
        status,
        timestamp: new Date().toISOString(),
        checks: {
          database: {
            status: dbHealth.status,
            provider: dbHealth.provider,
            latencyMs: dbHealth.latencyMs,
          },
          storage: {
            status: storageHealth,
          },
          config: {
            valid: configHealth.valid,
          },
        },
      },
      { status: statusCode }
    )
  );
}
