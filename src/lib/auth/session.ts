import { createHmac, timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";

// ── Lightweight demo auth boundary (no external framework) ──
//
// This is a deliberately small, self-contained session mechanism intended as a
// competition/demo security SHOWCASE, NOT a production-grade identity system.
// It demonstrates the boundary that matters for the HITL story:
//   1. A caller must present a valid signed session cookie to touch any
//      protected page or API route (authentication boundary).
//   2. The actor/role used for workflow transitions is DERIVED SERVER-SIDE from
//      the verified session — a client can never supply its own `actor`.
//   3. Mutations are gated on the authenticated role (authorization boundary).
//
// Sessions are stateless HMAC-signed tokens; there is no user table. Swap this
// module for a real IdP (Auth.js / NextAuth, OIDC) for production.

export const SESSION_COOKIE = "settlemate_session";
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 8; // 8 hours

export const ROLES = ["ADMIN", "REVIEWER"] as const;
export type Role = (typeof ROLES)[number];

export interface SessionUser {
  sub: string;
  name: string;
  role: Role;
  exp: number; // unix seconds
}

export function isRole(value: string): value is Role {
  return (ROLES as readonly string[]).includes(value);
}

// Demo users. Provide real credentials via env; the defaults exist ONLY so the
// demo runs out-of-the-box. They are clearly labelled demo-only in the README.
export interface DemoUser {
  username: string;
  password: string;
  role: Role;
  name: string;
}

export function getDemoUsers(): DemoUser[] {
  return [
    {
      username: process.env.DEMO_ADMIN_USER || "admin",
      password: process.env.DEMO_ADMIN_PASS || "admin123",
      role: "ADMIN",
      name: "Admin",
    },
    {
      username: process.env.DEMO_REVIEWER_USER || "reviewer",
      password: process.env.DEMO_REVIEWER_PASS || "review123",
      role: "REVIEWER",
      name: "Reviewer",
    },
  ];
}

export function authenticateUser(username: string, password: string): SessionUser | null {
  const match = getDemoUsers().find(
    (u) => u.username === username && u.password === password
  );
  if (!match) return null;
  return {
    sub: match.username,
    name: match.name,
    role: match.role,
    exp: Math.floor(Date.now() / 1000) + SESSION_MAX_AGE_SECONDS,
  };
}

// Dev-only secret so the demo runs out-of-the-box in a local `next dev`
// (NODE_ENV !== "production"). NEVER used as a fallback in production.
const DEV_FALLBACK_SECRET = "settlemate-dev-secret-change-me";

function getAuthSecret(): string {
  const secret = process.env.AUTH_SECRET;
  if (secret && secret.length > 0) return secret;

  // Fail closed: in production a missing AUTH_SECRET is a hard configuration
  // error, never a reason to sign sessions with a known default. A production
  // process without AUTH_SECRET cannot mint or verify any session.
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "AUTH_SECRET is not set. SettleMate refuses to run authentication in " +
        "production without AUTH_SECRET. Set AUTH_SECRET to a strong random " +
        "string before deploying."
    );
  }

  // Local demo convenience only (non-production). .env is gitignored; this is
  // never a safe secret and is never accepted in production.
  return DEV_FALLBACK_SECRET;
}

const b64urlEncode = (s: string) => Buffer.from(s, "utf8").toString("base64url");
const b64urlDecode = (s: string) => Buffer.from(s, "base64url").toString("utf8");

function sign(payload: string): string {
  return createHmac("sha256", getAuthSecret()).update(payload).digest("base64url");
}

/** Create a signed, expiring session token from a user record. */
export function createSessionToken(user: SessionUser): string {
  const payload = b64urlEncode(JSON.stringify(user));
  return `${payload}.${sign(payload)}`;
}

/** Verify signature + expiry. Returns the user or null. */
export function verifySessionToken(token: string): SessionUser | null {
  const parts = token.split(".");
  if (parts.length !== 2) return null;

  const [payload, sig] = parts;
  const expected = sign(payload);
  const actual = Buffer.from(sig, "base64url");
  const wanted = Buffer.from(expected, "base64url");

  if (actual.length !== wanted.length || !timingSafeEqual(actual, wanted)) {
    return null;
  }

  try {
    const parsed = JSON.parse(b64urlDecode(payload)) as Partial<SessionUser>;
    if (typeof parsed.sub !== "string") return null;
    if (typeof parsed.name !== "string" || !parsed.name) return null;
    if (typeof parsed.role !== "string" || !isRole(parsed.role)) return null;
    if (typeof parsed.exp !== "number") return null;
    if (parsed.exp < Math.floor(Date.now() / 1000)) return null;
    return parsed as SessionUser;
  } catch {
    return null;
  }
}

/** Read + verify the session from an incoming request (route handlers & proxy). */
export function getSession(req: NextRequest): SessionUser | null {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return verifySessionToken(token);
}
