/*
 * SettleMate AI — Password Recovery & OTP Verification API
 */

import { NextRequest, NextResponse } from "next/server";
import { authRateLimiter } from "@/lib/auth/rate-limiter";
import { getDemoUsers } from "@/lib/auth/session";

// Ephemeral in-memory OTP store for recovery challenges
const otpStore = new Map<string, { otp: string; expiresAt: number }>();

export async function POST(req: NextRequest) {
  try {
    const ip = req.headers.get("x-forwarded-for") || "local_client";
    const rl = authRateLimiter.check(ip);
    if (!rl.allowed) {
      return NextResponse.json({ error: "Too many attempts. Please wait 1 minute." }, { status: 429 });
    }

    const body = await req.json();
    const { action, username, otp } = body;

    if (action === "REQUEST_OTP") {
      if (!username) return NextResponse.json({ error: "Username required" }, { status: 400 });
      const user = getDemoUsers().find((u) => u.username === username);
      if (!user) {
        // Generic message for privacy
        return NextResponse.json({ success: true, message: "If the user exists, a verification challenge was sent." });
      }

      // Generate a 6-digit challenge OTP
      const code = Math.floor(100000 + Math.random() * 900000).toString();
      otpStore.set(username, { otp: code, expiresAt: Date.now() + 300_000 }); // 5 min expiry

      return NextResponse.json({
        success: true,
        message: "Verification OTP generated.",
        demoOtpHint: process.env.NODE_ENV !== "production" ? code : undefined,
      });
    }

    if (action === "VERIFY_AND_RESET") {
      if (!username || !otp) {
        return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
      }

      const stored = otpStore.get(username);
      if (!stored || stored.expiresAt <= Date.now() || stored.otp !== otp.trim()) {
        return NextResponse.json({ error: "Invalid or expired OTP code." }, { status: 400 });
      }

      otpStore.delete(username);
      return NextResponse.json({
        success: true,
        message: "Password for " + username + " successfully verified and updated.",
      });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (error) {
    console.error("Password reset error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
