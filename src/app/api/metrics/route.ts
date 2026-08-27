/*
 * SettleMate AI — Prometheus Metrics Endpoint
 *
 * GET /api/metrics — exposes the in-memory metrics registry in Prometheus text
 * exposition format (v0.0.4). Intended for scraping by a Prometheus server or
 * compatible agent. Never cached. Kept unauthenticated and un-rate-limited so a
 * scraper polling every few seconds is not throttled; in a hardened deployment
 * this route should be exposed only on an internal network / behind mTLS.
 */

import { NextResponse } from "next/server";
import { renderMetrics } from "@/lib/observability/metrics";
import { getSecurityHeaders } from "@/lib/security/api-security";

export const dynamic = "force-dynamic";

export async function GET() {
  const body = renderMetrics();
  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "text/plain; version=0.0.4; charset=utf-8",
      "Cache-Control": "no-store, max-age=0",
      ...getSecurityHeaders(),
    },
  });
}
