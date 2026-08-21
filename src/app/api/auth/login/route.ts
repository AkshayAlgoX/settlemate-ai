import { NextRequest, NextResponse } from "next/server";
import {
  SESSION_COOKIE,
  SESSION_MAX_AGE_SECONDS,
  authenticateUser,
  createSessionToken,
} from "@/lib/auth/session";

export async function POST(req: NextRequest) {
  try {
    let body: { username?: unknown; password?: unknown } = {};
    try {
      body = await req.json();
    } catch {
      // malformed body -> treated as missing credentials below
    }

    const { username, password } = body;
    if (typeof username !== "string" || typeof password !== "string") {
      return NextResponse.json({ error: "Username and password required" }, { status: 400 });
    }

    const user = authenticateUser(username.trim(), password);
    if (!user) {
      // Generic message; do not reveal which field was wrong.
      return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
    }

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
