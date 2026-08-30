import { NextRequest, NextResponse } from "next/server";
import {
  SESSION_COOKIE,
  SESSION_MAX_AGE_SECONDS,
  authenticateUser,
  createSessionToken,
} from "@/lib/auth/session";
import { authRateLimiter } from "@/lib/auth/rate-limiter";
import { LoginRequestSchema } from "@/lib/api/v1-schemas";

/**
 * Brute-force bucket key for login attempts.
 *
 * Deliberately derived from the network address ONLY. Keying on anything the
 * caller supplies in the body or a header — a username, an API key — would let
 * an attacker mint a fresh bucket per request and walk straight past the limit,
 * which is worse than no limit because it looks protected.
 *
 * When no proxy headers are present (a direct local connection) all callers
 * share one bucket. That is the conservative direction to fail in: it throttles
 * a local brute-force attempt rather than exempting it.
 */
function loginClientKey(req: NextRequest): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return `login_${forwarded.split(",")[0].trim()}`;

  const realIp = req.headers.get("x-real-ip");
  if (realIp) return `login_${realIp.trim()}`;

  return "login_local";
}

export async function POST(req: NextRequest) {
  try {
    // Throttle before touching credentials at all: an unauthenticated endpoint
    // that verifies a password is the single most attractive brute-force target
    // in the app. 10 attempts/minute leaves real users unaffected.
    const limit = authRateLimiter.check(loginClientKey(req));
    if (!limit.allowed) {
      const retryAfterSeconds = Math.max(1, Math.ceil((limit.resetAt - Date.now()) / 1000));
      return NextResponse.json(
        {
          error: "Too many login attempts. Please wait before trying again.",
          retryAfterSeconds,
        },
        {
          status: 429,
          headers: {
            "Retry-After": String(retryAfterSeconds),
            "X-RateLimit-Remaining": "0",
            "X-RateLimit-Reset": String(Math.floor(limit.resetAt / 1000)),
          },
        }
      );
    }

    let rawBody: unknown = {};
    try {
      rawBody = await req.json();
    } catch {
      // malformed body -> treated as missing credentials below
    }

    const parsed = LoginRequestSchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json({ error: "Username and password required" }, { status: 400 });
    }
    const { username, password } = parsed.data;

    const user = authenticateUser(username.trim(), password);
    if (!user) {
      // Generic message; do not reveal which field was wrong.
      return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
    }

    // A successful login clears the bucket so a user who fat-fingered their
    // password several times is not still throttled once they get it right.
    authRateLimiter.reset(loginClientKey(req));

    const token = createSessionToken(user);
    const res = NextResponse.json({
      success: true,
      user: { sub: user.sub, name: user.name, role: user.role },
    });
    res.cookies.set(SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: SESSION_MAX_AGE_SECONDS,
    });
    return res;
  } catch (error) {
    console.error("Login error:", error);
    return NextResponse.json({ error: "Login failed" }, { status: 500 });
  }
}
