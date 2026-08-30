import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth/session";

// Next.js 16 renamed middleware -> proxy. See node_modules/next/dist/docs.
//
// SettleMate has TWO distinct authentication boundaries, and this proxy routes
// each request to the right one:
//
//   1. DASHBOARD (session cookie) — every page and every internal /api/* route.
//      Identity comes from a signed session cookie; unauthenticated page loads
//      redirect to /login, unauthenticated API calls get 401 JSON.
//
//   2. MACHINE API (sk_ API key) — /api/v1/*. These routes authenticate their
//      OWN callers via apiKeyGuard() and are used by external integrators who
//      have no browser and no cookie. The proxy deliberately lets them through
//      so the route's key check is the gate. Blocking them here would make the
//      key auth, CORS preflight, and rate limiting on those routes dead code.
//
// Plus a small set of genuinely public operational endpoints (below) that must
// answer unauthenticated callers to do their job at all.
//
// Authorization (role gating) is enforced inside each route handler from the
// server-verified session, NOT here — the proxy only establishes identity.

/** Auth endpoints: needed to obtain a session in the first place. */
const PUBLIC_AUTH_PREFIXES = ["/api/auth/login", "/api/auth/logout", "/api/auth/me"];

/**
 * Operational endpoints that are unauthenticated by design:
 *   /api/health   — orchestrator liveness/readiness probe (k8s, ECS, an LB).
 *                   A probe cannot present a session cookie, so gating this
 *                   would make every deployment report itself unhealthy.
 *   /api/docs     — OpenAPI spec + Swagger UI. Public API documentation is
 *                   meant to be readable before you have credentials.
 *   /api/metrics  — Prometheus scrape target. Optionally gated by METRICS_TOKEN
 *                   (see below); a scraper cannot hold a browser session.
 */
const PUBLIC_OPERATIONAL_PREFIXES = ["/api/health", "/api/docs", "/api/metrics"];

/** The sk_-authenticated machine API surface. */
const MACHINE_API_PREFIX = "/api/v1";

const STATE_CHANGING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

function matchesPrefix(pathname: string, prefixes: string[]): boolean {
  return prefixes.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

/**
 * Cross-site request forgery check for the COOKIE-authenticated surface.
 *
 * The session cookie is SameSite=Lax, which already stops a cross-site form POST
 * from carrying it. This is the second layer: it also covers same-site-but-
 * different-origin attackers (another app on the same registrable domain) and
 * holds the line if the cookie policy is ever loosened to SameSite=None.
 *
 * Deliberately NOT applied to /api/v1/*: those callers authenticate with an
 * explicit sk_ key, not an ambient cookie, so there is nothing for a forged
 * request to ride on — and a legitimate integrator's Origin is arbitrary.
 */
function csrfRejected(request: NextRequest): boolean {
  if (!STATE_CHANGING_METHODS.has(request.method)) return false;

  // Sec-Fetch-Site is set by the browser itself and is unforgeable from page JS,
  // which makes it strictly stronger than Origin when present. "none" means a
  // direct user action (typed URL, bookmark), which is not a forgery.
  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite) {
    return fetchSite !== "same-origin" && fetchSite !== "none";
  }

  // Fallback for callers that omit Sec-Fetch-Site (curl, scripts, older
  // browsers). An absent Origin means a non-browser client, which has no ambient
  // cookie to be abused, so it is allowed — blocking it would break scripted
  // use of the dashboard API without closing an attack path.
  const origin = request.headers.get("origin");
  if (!origin) return false;

  try {
    const originHost = new URL(origin).host;
    // Compare against the forwarded/browser-visible host as well as the parsed
    // URL host so a reverse proxy or tunnel does not produce false rejections.
    const hostHeader = request.headers.get("host");
    return originHost !== request.nextUrl.host && originHost !== hostHeader;
  } catch {
    return true; // malformed Origin — treat as hostile
  }
}

/** Constant-time string compare that never throws on length mismatch. */
function secureEquals(a: string, b: string): boolean {
  const left = Buffer.from(a, "utf8");
  const right = Buffer.from(b, "utf8");
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

/**
 * /api/metrics exposes operational counters. It stays open by default so a
 * local Prometheus works out of the box, but setting METRICS_TOKEN requires
 * `Authorization: Bearer <token>` — the recommended production posture when the
 * route is not already isolated on an internal network.
 */
function metricsTokenRejected(request: NextRequest): boolean {
  const expected = process.env.METRICS_TOKEN;
  if (!expected) return false;

  const header = request.headers.get("authorization") || "";
  const presented = header.replace(/^Bearer\s+/i, "").trim();
  if (!presented) return true;
  return !secureEquals(presented, expected);
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const session = token ? verifySessionToken(token) : null;

  // ── API routes ──
  if (pathname.startsWith("/api/")) {
    // Machine API first. It authenticates its own callers with an sk_ key via
    // apiKeyGuard(), so neither the session boundary nor the CSRF check applies
    // — and a CORS preflight carries no credentials by definition, so OPTIONS
    // must pass through untouched too.
    if (pathname === MACHINE_API_PREFIX || pathname.startsWith(MACHINE_API_PREFIX + "/")) {
      return NextResponse.next();
    }

    // Everything below this line is the cookie-authenticated surface, so writes
    // get the CSRF check first. This deliberately includes /api/auth/login:
    // forced-login CSRF (logging a victim into an attacker's account) is a real
    // class of bug, and the legitimate login form is always same-origin.
    if (csrfRejected(request)) {
      return NextResponse.json(
        {
          error:
            "Cross-site request blocked. State-changing requests must originate from the application itself.",
        },
        { status: 403 }
      );
    }

    if (matchesPrefix(pathname, PUBLIC_AUTH_PREFIXES)) {
      return NextResponse.next();
    }

    if (matchesPrefix(pathname, PUBLIC_OPERATIONAL_PREFIXES)) {
      if (pathname.startsWith("/api/metrics") && metricsTokenRejected(request)) {
        return NextResponse.json(
          { error: "Unauthorized: METRICS_TOKEN required to scrape /api/metrics" },
          { status: 401, headers: { "WWW-Authenticate": 'Bearer realm="settlemate-metrics"' } }
        );
      }
      return NextResponse.next();
    }

    // Everything else under /api is dashboard-internal: session required.
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.next();
  }

  // ── Pages ──
  // /api-docs renders the Swagger UI against the public /api/docs spec, so it is
  // public for the same reason the spec is: you read the docs before you have
  // credentials.
  if (pathname === "/api-docs") {
    return NextResponse.next();
  }

  // Root landing page: public for unauthenticated visitors, redirects authenticated users to /dashboard
  if (pathname === "/") {
    if (session) {
      return NextResponse.redirect(new URL("/dashboard", request.url));
    }
    return NextResponse.next();
  }

  if (pathname === "/login") {
    // Already authenticated: send them into the authenticated dashboard rather than back to login.
    if (session) {
      return NextResponse.redirect(new URL("/dashboard", request.url));
    }
    return NextResponse.next();
  }

  if (!session) {
    const url = new URL("/login", request.url);
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

// Exclude static assets / images from the auth boundary.
export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|svg|ico|jpg|jpeg|webp|css|js|woff2?)$).*)',
  ],
};
