import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth/session";

// Next.js 16 renamed middleware -> proxy. See node_modules/next/dist/docs.
// This proxy enforces the authentication boundary:
//   - All /api/* routes require a valid session cookie (except the auth endpoints).
//   - All pages require a valid session cookie (redirect to /login).
//   - /login is public; authenticated users are redirected away from it.
//
// Authorization (role gating) is enforced inside each route handler from the
// server-verified session, NOT here — the proxy only establishes identity.
const PUBLIC_API_PREFIXES = ["/api/auth/login", "/api/auth/logout", "/api/auth/me"];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const session = token ? verifySessionToken(token) : null;

  // ── API routes ──
  if (pathname.startsWith("/api/")) {
    const isPublicAuth = PUBLIC_API_PREFIXES.some(
      (p) => pathname === p || pathname.startsWith(p + "/")
    );
    if (isPublicAuth) {
      return NextResponse.next();
    }
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.next();
  }

  // ── Pages ──
  if (pathname === "/login") {
    // Already authenticated: send them into the app rather than back to login.
    if (session) {
      return NextResponse.redirect(new URL("/", request.url));
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
