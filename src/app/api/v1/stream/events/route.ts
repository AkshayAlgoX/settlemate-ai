/*
 * SettleMate AI — Real-Time Server-Sent Events (SSE) Stream Endpoint
 *
 * GET /api/v1/stream/events
 *
 * Implements:
 *   1. Authenticated, Tenant-Scoped SSE Event Stream
 *   2. Keepalive Heartbeat (: keepalive\n\n) every 15s
 *   3. Last-Event-ID Missed Event Catch-Up
 *   4. Graceful Disconnect & Zero Memory Leak Connection Cleanup
 *   5. Strict Cross-Tenant Isolation
 */

import { NextRequest } from "next/server";
import { handleCorsPreflight, sessionOrApiKeyGuard } from "@/lib/security/api-security";
import { eventBroker, type TelemetryEvent } from "@/lib/events/event-broker";
import { metrics } from "@/lib/observability/metrics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function OPTIONS() {
  return handleCorsPreflight();
}

export async function GET(req: NextRequest) {
  // 1. Authenticate the subscriber and resolve its tenant server-side. The SSE
  //    stream replays durable events, so an anonymous or tenant-spoofing caller
  //    must never reach the broker.
  const auth = sessionOrApiKeyGuard(req);
  if (!auth.allowed && auth.response) {
    return auth.response;
  }
  const tenantId = auth.tenantId;

  const lastEventId = req.headers.get("last-event-id") || req.nextUrl.searchParams.get("lastEventId");
  const encoder = new TextEncoder();

  let cleanup: (() => void) | null = null;
  let keepaliveTimer: NodeJS.Timeout | null = null;

  const stream = new ReadableStream({
    start(controller) {
      // 1. Emit connected envelope
      const welcome: TelemetryEvent = {
        eventId: `evt_init_${Date.now()}`,
        tenantId,
        eventType: "HEARTBEAT",
        entityId: "system",
        timestamp: new Date().toISOString(),
        sequence: 0,
        payload: { message: "SSE stream connected", tenantId },
      };
      controller.enqueue(
        encoder.encode(`id: ${welcome.eventId}\nevent: heartbeat\ndata: ${JSON.stringify(welcome)}\n\n`)
      );

      // 2. Catch up missed events if Last-Event-ID is provided
      if (lastEventId) {
        metrics.streamReconnects?.inc();
        const missedEvents = eventBroker.getEventsSince(tenantId, lastEventId);
        for (const evt of missedEvents) {
          controller.enqueue(
            encoder.encode(
              `id: ${evt.eventId}\nevent: ${evt.eventType.toLowerCase()}\ndata: ${JSON.stringify(evt)}\n\n`
            )
          );
        }
      }

      // 3. Keepalive timer (every 15s)
      keepaliveTimer = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(`: keepalive\n\n`));
        } catch {
          if (keepaliveTimer) clearInterval(keepaliveTimer);
        }
      }, 15000);

      // 4. Subscribe to tenant event stream
      cleanup = eventBroker.subscribe(tenantId, (event) => {
        try {
          const sseData = `id: ${event.eventId}\nevent: ${event.eventType.toLowerCase()}\ndata: ${JSON.stringify(event)}\n\n`;
          controller.enqueue(encoder.encode(sseData));
        } catch {
          metrics.streamDeliveryErrors?.inc();
        }
      });
    },
    cancel() {
      if (keepaliveTimer) clearInterval(keepaliveTimer);
      if (cleanup) cleanup();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
