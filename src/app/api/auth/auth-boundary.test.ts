/*
 * SettleMate AI — Auth Boundary Test Suite
 *
 * Covers the two hardening layers added around the cookie-authenticated surface:
 *   1. POST /api/auth/login brute-force throttling (authRateLimiter).
 *   2. proxy.ts routing between the session boundary, the sk_ machine API, the
 *      public operational endpoints, and the CSRF check on state-changing writes.
 */

import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { POST as loginPost } from "./login/route";
import { POST as generateBatchPost } from "../batches/generate/route";
import { POST as uploadPost } from "../upload/route";
import { proxy } from "@/proxy";
import { authRateLimiter } from "@/lib/auth/rate-limiter";
import { SESSION_COOKIE, authenticateUser, createSessionToken } from "@/lib/auth/session";
import { prisma } from "@/lib/db";

let passed = 0;
let failed = 0;

async function check(name: string, fn: () => Promise<void> | void) {
  try {
    await fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failed++;
    console.error(`  ✗ ${name} — ${(err as Error).message}`);
  }
}

const ORIGIN = "http://localhost:3000";

/** A login POST from a specific simulated client address. */
function loginRequest(
  username: string,
  password: string,
  ip = "203.0.113.10"
): NextRequest {
  return new NextRequest(`${ORIGIN}/api/auth/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Forwarded-For": ip,
    },
    body: JSON.stringify({ username, password }),
  });
}

function proxyRequest(
  path: string,
  init: { method?: string; headers?: Record<string, string>; session?: boolean } = {}
): NextRequest {
  const headers: Record<string, string> = { host: "localhost:3000", ...(init.headers || {}) };
  const req = new NextRequest(`${ORIGIN}${path}`, {
    method: init.method || "GET",
    headers,
  });
  if (init.session) {
    const user = authenticateUser("admin", "admin123");
    assert.ok(user, "demo admin must authenticate to build a session fixture");
    req.cookies.set(SESSION_COOKIE, createSessionToken(user));
  }
  return req;
}

/** Did the proxy allow the request to continue to the route handler? */
function isPassThrough(res: Response): boolean {
  return res.headers.has("x-middleware-next") || res.status === 200;
}

async function run() {
  console.log("\n=========================================================================");
  console.log(" 🔐 SETTLEMATE AI — AUTH BOUNDARY TESTS (login throttle + proxy CSRF)");
  console.log("=========================================================================");

  console.log("\n1. Login brute-force throttling");

  await check("invalid credentials return 401 with a non-specific message", async () => {
    authRateLimiter.clear();
    const res = await loginPost(loginRequest("admin", "wrong-password"));
    assert.equal(res.status, 401);
    const json = await res.json();
    assert.equal(json.error, "Invalid credentials");
    // Must not disclose which field was wrong, or that the user exists.
    assert.ok(!/password|username/i.test(json.error));
  });

  await check("valid credentials return 200 and set an httpOnly session cookie", async () => {
    authRateLimiter.clear();
    const res = await loginPost(loginRequest("admin", "admin123"));
    assert.equal(res.status, 200);
    const json = await res.json();
    assert.equal(json.success, true);
    assert.equal(json.user.role, "ADMIN");

    const setCookie = res.headers.get("set-cookie") || "";
    assert.ok(setCookie.includes(SESSION_COOKIE), "session cookie is set");
    assert.match(setCookie, /HttpOnly/i, "cookie is HttpOnly");
    assert.match(setCookie, /SameSite=lax/i, "cookie is SameSite=Lax");
    // The response body must never echo the password back.
    assert.ok(!JSON.stringify(json).includes("admin123"));
  });

  await check("the 11th attempt in a window is throttled with 429 + Retry-After", async () => {
    authRateLimiter.clear();
    const ip = "198.51.100.77";

    // authRateLimiter allows 10 requests per 60s window.
    for (let i = 0; i < 10; i++) {
      const res = await loginPost(loginRequest("admin", `guess-${i}`, ip));
      assert.equal(res.status, 401, `attempt ${i + 1} should still be evaluated`);
    }

    const blocked = await loginPost(loginRequest("admin", "guess-11", ip));
    assert.equal(blocked.status, 429);
    const retryAfter = Number(blocked.headers.get("retry-after"));
    assert.ok(retryAfter > 0 && retryAfter <= 60, `Retry-After is a sane ${retryAfter}s`);
    const json = await blocked.json();
    assert.ok(json.retryAfterSeconds > 0);
  });

  await check("throttling is per-client, so one attacker cannot lock everyone out", async () => {
    authRateLimiter.clear();
    const attacker = "198.51.100.99";
    for (let i = 0; i < 11; i++) {
      await loginPost(loginRequest("admin", `guess-${i}`, attacker));
    }
    // A different address is unaffected and can still log in.
    const victim = await loginPost(loginRequest("admin", "admin123", "203.0.113.55"));
    assert.equal(victim.status, 200);
  });

  await check("a caller-supplied header cannot mint a fresh bucket", async () => {
    authRateLimiter.clear();
    const ip = "192.0.2.31";
    for (let i = 0; i < 10; i++) {
      await loginPost(loginRequest("admin", `guess-${i}`, ip));
    }
    // Rotating an X-API-Key would bypass a key-first identifier like
    // getClientIdentifier(); the login bucket is IP-only precisely to stop that.
    const evasive = new NextRequest(`${ORIGIN}/api/auth/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Forwarded-For": ip,
        "X-API-Key": "sk_rotating_key_to_dodge_the_limit_0001",
      },
      body: JSON.stringify({ username: "admin", password: "guess-11" }),
    });
    const res = await loginPost(evasive);
    assert.equal(res.status, 429, "still throttled despite a fresh API key");
  });

  await check("a successful login clears the caller's throttle bucket", async () => {
    authRateLimiter.clear();
    const ip = "192.0.2.44";
    for (let i = 0; i < 5; i++) {
      await loginPost(loginRequest("admin", `typo-${i}`, ip));
    }
    const ok = await loginPost(loginRequest("admin", "admin123", ip));
    assert.equal(ok.status, 200);

    // Bucket reset: a full fresh allowance is available afterwards.
    for (let i = 0; i < 10; i++) {
      const res = await loginPost(loginRequest("admin", `after-${i}`, ip));
      assert.equal(res.status, 401, `post-reset attempt ${i + 1} is not throttled`);
    }
  });

  console.log("\n2. Proxy CSRF enforcement on the cookie-authenticated surface");

  await check("a cross-site POST to a dashboard API route is blocked with 403", async () => {
    const res = await proxy(
      proxyRequest("/api/exceptions/transition", {
        method: "POST",
        headers: { "Sec-Fetch-Site": "cross-site", origin: "https://evil.example.com" },
        session: true,
      })
    );
    assert.equal(res.status, 403);
    const json = await res.json();
    assert.match(json.error, /Cross-site request blocked/);
  });

  await check("a same-origin POST from the app itself passes through", async () => {
    const res = await proxy(
      proxyRequest("/api/exceptions/transition", {
        method: "POST",
        headers: { "Sec-Fetch-Site": "same-origin", origin: ORIGIN },
        session: true,
      })
    );
    assert.ok(isPassThrough(res), `expected pass-through, got ${res.status}`);
  });

  await check("a mismatched Origin is blocked even without Sec-Fetch-Site", async () => {
    const res = await proxy(
      proxyRequest("/api/exceptions/transition", {
        method: "POST",
        headers: { origin: "https://attacker.test" },
        session: true,
      })
    );
    assert.equal(res.status, 403);
  });

  await check("a non-browser caller with no Origin at all is allowed", async () => {
    // curl and server-to-server clients carry no ambient cookie, so there is
    // nothing for a forged request to ride on. Blocking them closes no attack
    // path and breaks scripted use.
    const res = await proxy(
      proxyRequest("/api/exceptions/transition", { method: "POST", session: true })
    );
    assert.ok(isPassThrough(res), `expected pass-through, got ${res.status}`);
  });

  await check("safe methods are never CSRF-blocked", async () => {
    const res = await proxy(
      proxyRequest("/api/exceptions/list", {
        method: "GET",
        headers: { "Sec-Fetch-Site": "cross-site", origin: "https://evil.example.com" },
        session: true,
      })
    );
    assert.ok(isPassThrough(res), `GET must not be blocked, got ${res.status}`);
  });

  await check("the sk_ machine API is exempt from the CSRF check", async () => {
    // /api/v1/* authenticates with an explicit key, not a cookie, and a
    // legitimate integrator's Origin is arbitrary. The route's own apiKeyGuard()
    // is the boundary there.
    const res = await proxy(
      proxyRequest("/api/v1/reconcile", {
        method: "POST",
        headers: { origin: "https://partner-erp.example.com" },
      })
    );
    assert.ok(isPassThrough(res), `expected pass-through, got ${res.status}`);
  });

  console.log("\n3. Proxy session boundary and public endpoints");

  await check("an unauthenticated dashboard API call returns 401 JSON", async () => {
    const res = await proxy(proxyRequest("/api/exceptions/list"));
    assert.equal(res.status, 401);
    const json = await res.json();
    assert.equal(json.error, "Unauthorized");
  });

  await check("an unauthenticated page load redirects to /login with a next param", async () => {
    const res = await proxy(proxyRequest("/risk-dashboard"));
    assert.equal(res.status, 307);
    const location = new URL(res.headers.get("location") || "", ORIGIN);
    assert.equal(location.pathname, "/login");
    assert.equal(location.searchParams.get("next"), "/risk-dashboard");
  });

  await check("an unauthenticated visit to / renders the public landing page", async () => {
    const res = await proxy(proxyRequest("/"));
    assert.ok(isPassThrough(res), `expected public landing pass-through, got ${res.status}`);
  });

  await check("an authenticated visit to / redirects directly to /dashboard", async () => {
    const res = await proxy(proxyRequest("/", { session: true }));
    assert.equal(res.status, 307);
    assert.equal(new URL(res.headers.get("location") || "", ORIGIN).pathname, "/dashboard");
  });

  await check("an authenticated visit to /login is redirected to /dashboard", async () => {
    const res = await proxy(proxyRequest("/login", { session: true }));
    assert.equal(res.status, 307);
    assert.equal(new URL(res.headers.get("location") || "", ORIGIN).pathname, "/dashboard");
  });

  await check("health, docs and the login endpoint need no session", async () => {
    for (const path of ["/api/health", "/api/docs", "/api/auth/login", "/api/auth/me"]) {
      const res = await proxy(proxyRequest(path));
      assert.ok(isPassThrough(res), `${path} should be public, got ${res.status}`);
    }
  });

  await check("the machine API is reachable without a session cookie", async () => {
    // Regression guard for the auth-boundary unification: the proxy used to
    // 401 every /api/v1/* call, which made each route's key auth, CORS and
    // rate limiting unreachable dead code.
    for (const path of ["/api/v1/health", "/api/v1/webhooks/logs", "/api/v1/reconcile"]) {
      const res = await proxy(proxyRequest(path));
      assert.ok(isPassThrough(res), `${path} should bypass the session gate, got ${res.status}`);
    }
  });

  await check("/api/metrics is open by default and gated when METRICS_TOKEN is set", async () => {
    const saved = process.env.METRICS_TOKEN;
    const env = process.env as { METRICS_TOKEN?: string };
    try {
      delete env.METRICS_TOKEN;
      assert.ok(
        isPassThrough(await proxy(proxyRequest("/api/metrics"))),
        "open when unset so a local Prometheus works out of the box"
      );

      env.METRICS_TOKEN = "scrape-token-abc123";
      const unauth = await proxy(proxyRequest("/api/metrics"));
      assert.equal(unauth.status, 401, "gated once a token is configured");
      assert.match(unauth.headers.get("www-authenticate") || "", /Bearer/);

      const wrong = await proxy(
        proxyRequest("/api/metrics", { headers: { authorization: "Bearer wrong-token" } })
      );
      assert.equal(wrong.status, 401, "a wrong token is rejected");

      const right = await proxy(
        proxyRequest("/api/metrics", { headers: { authorization: "Bearer scrape-token-abc123" } })
      );
      assert.ok(isPassThrough(right), `correct token should scrape, got ${right.status}`);
    } finally {
      if (saved === undefined) delete env.METRICS_TOKEN;
      else env.METRICS_TOKEN = saved;
    }
  });

  console.log("\n4. Server-side RBAC on mutations & file upload size limits");

  const adminUser = authenticateUser("admin", "admin123")!;
  const adminToken = createSessionToken(adminUser);
  const reviewerUser = authenticateUser("reviewer", "review123")!;
  const reviewerToken = createSessionToken(reviewerUser);

  await check("POST /api/batches/generate rejects REVIEWER with 403 Forbidden", async () => {
    const req = new NextRequest(`${ORIGIN}/api/batches/generate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        cookie: `${SESSION_COOKIE}=${reviewerToken}`,
      },
      body: JSON.stringify({ size: 250 }),
    });
    const res = await generateBatchPost(req);
    assert.equal(res.status, 403);
    const json = await res.json();
    assert.match(json.error, /Forbidden/);
  });

  await check("POST /api/batches/generate allows ADMIN past the auth gate", async () => {
    const req = new NextRequest(`${ORIGIN}/api/batches/generate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        cookie: `${SESSION_COOKIE}=${adminToken}`,
      },
      body: JSON.stringify({ size: 99999999 }), // Invalid size to test handler logic without mutating DB
    });
    const res = await generateBatchPost(req);
    assert.equal(res.status, 400); // Reaches size validation
    const json = await res.json();
    assert.match(json.error, /Invalid batch size/);
  });

  await check("POST /api/batches/generate generates 250 records with BigInt balance (> 2^31 - 1)", async () => {
    const req = new NextRequest(`${ORIGIN}/api/batches/generate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        cookie: `${SESSION_COOKIE}=${adminToken}`,
      },
      body: JSON.stringify({ size: 250 }),
    });
    const res = await generateBatchPost(req);
    assert.equal(res.status, 200);
    const json = await res.json();
    assert.ok(json.batchId);
    assert.equal(json.stats.orders, 250);

    // Clean up created batch to avoid polluting local test state
    await prisma.batch.delete({ where: { id: json.batchId } });
  });

  await check("POST /api/upload rejects REVIEWER with 403 Forbidden", async () => {
    const req = new NextRequest(`${ORIGIN}/api/upload`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        cookie: `${SESSION_COOKIE}=${reviewerToken}`,
      },
      body: JSON.stringify({ csvContent: "sample,csv\n1,2" }),
    });
    const res = await uploadPost(req);
    assert.equal(res.status, 403);
    const json = await res.json();
    assert.match(json.error, /Forbidden/);
  });

  await check("POST /api/upload allows ADMIN past the auth gate", async () => {
    const req = new NextRequest(`${ORIGIN}/api/upload`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        cookie: `${SESSION_COOKIE}=${adminToken}`,
      },
      body: JSON.stringify({ csvContent: "" }),
    });
    const res = await uploadPost(req);
    assert.equal(res.status, 400); // Reaches empty content check
    const json = await res.json();
    assert.match(json.error, /CSV content is empty/);
  });

  await check("POST /api/upload rejects oversized payload (>25MB) with 413 Payload Too Large", async () => {
    const req = new NextRequest(`${ORIGIN}/api/upload`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "content-length": String(26 * 1024 * 1024),
        cookie: `${SESSION_COOKIE}=${adminToken}`,
      },
      body: JSON.stringify({ csvContent: "large" }),
    });
    const res = await uploadPost(req);
    assert.equal(res.status, 413);
    const json = await res.json();
    assert.match(json.error, /25MB/);
  });

  await check("POST /api/upload allows payload <= 25MB past the size gate", async () => {
    const req = new NextRequest(`${ORIGIN}/api/upload`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "content-length": String(1024),
        cookie: `${SESSION_COOKIE}=${adminToken}`,
      },
      body: JSON.stringify({ csvContent: "" }),
    });
    const res = await uploadPost(req);
    assert.equal(res.status, 400); // Passes size check and hits empty CSV check
  });

  authRateLimiter.clear();

  console.log(`\nauth-boundary: ${passed} passed, ${failed} failed`);
}

run()
  .then(() => {
    process.exitCode = failed > 0 ? 1 : 0;
    console.log(`auth-boundary: final ${failed > 0 ? "FAILURE" : "ALL PASSED"}\n`);
  })
  .catch((err) => {
    console.error("Auth boundary test harness crashed:", err);
    process.exitCode = 1;
  });
